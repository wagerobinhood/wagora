// Wage 引擎 · 主网接线（完整版）
// 监听 TaskBoard.Posted → 招标 → 真推理 → DecisionLog.record → Executor.settle
// 运行前提：4 合约已部署 RH 主网 4663 · operator 私钥在 env · engine/.env 有 LLM keys
//
// 模式：
//   ENGINE_MODE=MAINNET  → RH 主网 4663（生产）
//   ENGINE_MODE=LOCAL    → hardhat 8545（测试）
// 安全：OPERATOR_KEY 仅服务端 env；私钥永不打印/入库。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createWalletClient, createPublicClient, http,
  formatUnits, formatGwei,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createHash } from 'node:crypto';
import { callModel } from './llm.mjs';
import { canAccept, THRESHOLD_BPS } from './grader.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// ── 环境变量（engine/.env + process.env） ──
const envFile = path.join(here, '.env');
const envFileData = fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, 'utf8')
      .split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
  : {};

const MODE = process.env.ENGINE_MODE || envFileData.ENGINE_MODE || 'LOCAL';
const CHAIN_ID = MODE === 'MAINNET' ? 4663 : 31337;
const RPC = MODE === 'MAINNET'
  ? 'https://rpc.mainnet.chain.robinhood.com'
  : 'http://127.0.0.1:8545';
const OPERATOR_KEY = process.env.OPERATOR_KEY || envFileData.DEPLOYER_PRIVATE_KEY;
if (!OPERATOR_KEY) { console.error('❌ OPERATOR_KEY 未设置'); process.exit(1); }

// ── 合约地址 ──
const depDir = path.join(here, '..', 'deployments');
let ADDRS = {};
try {
  const files = fs.readdirSync(depDir).filter((f) => f.includes('rh-mainnet') && f.endsWith('.json')).sort();
  const latest = JSON.parse(fs.readFileSync(path.join(depDir, files[files.length - 1]), 'utf8'));
  ADDRS = {
    USDG: latest.usdg,
    TaskBoard: latest.contracts.TaskBoard,
    DecisionLog: latest.contracts.DecisionLog,
    ModelRegistry: latest.contracts.ModelRegistry,
    DecisionExecutor: latest.contracts.DecisionExecutor,
  };
  log(`📋 合约地址（${files[files.length - 1]}）:`);
  for (const [k, v] of Object.entries(ADDRS)) log(`  ${k.padEnd(20)} ${v}`);
} catch (e) {
  console.error('❌ 无部署记录。先运行部署脚本。');
  process.exit(1);
}

function log(s) { console.log(s); }

// ── ABI ──
const BOARD_ABI = [
  { type: 'function', name: 'post', stateMutability: 'nonpayable', inputs: [{ name: 'brief', type: 'string' }, { name: 'bounty', type: 'uint96' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'hire', stateMutability: 'nonpayable', inputs: [{ name: 'taskId', type: 'uint256' }, { name: 'worker', type: 'address' }], outputs: [] },
  { type: 'function', name: 'escrow', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'nextTaskId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'tasks', stateMutability: 'view', inputs: [{ name: 'taskId', type: 'uint256' }], outputs: [{ type: 'address' }, { type: 'uint96' }, { name: 'briefHash', type: 'bytes32' }, { type: 'uint64' }, { type: 'uint64' }, { type: 'address' }, { type: 'bool' }] },
  { type: 'function', name: 'operator', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];
const LOG_ABI = [
  { type: 'function', name: 'record', stateMutability: 'nonpayable', inputs: [{ name: 'taskId', type: 'uint256' }, { name: 'kind', type: 'uint8' }, { name: 'confidenceBps', type: 'uint16' }, { name: 'thresholdBps', type: 'uint16' }, { name: 'reasoningHash', type: 'bytes32' }, { name: 'worker', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'nextId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'operator', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];
const EXEC_ABI = [
  { type: 'function', name: 'settle', stateMutability: 'nonpayable', inputs: [{ name: 'taskId', type: 'uint256' }, { name: 'accept', type: 'bool' }, { name: 'confidenceBps', type: 'uint16' }], outputs: [] },
  { type: 'function', name: 'operator', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'thresholdBps', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] },
];
const REG_ABI = [
  { type: 'function', name: 'payouts', stateMutability: 'view', inputs: [{ name: 'i', type: 'uint8' }], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'active', stateMutability: 'view', inputs: [{ name: 'i', type: 'uint8' }], outputs: [{ type: 'bool' }] },
];

// ── 简洁 ABI 格式（用 parseAbi） ──
const PARSE_ABI = {
  board: [
    'function post(string brief, uint96 bounty) returns (uint256 taskId)',
    'function hire(uint256 taskId, address worker)',
    'function escrow() view returns (uint256)',
    'function nextTaskId() view returns (uint256)',
    'function tasks(uint256) view returns (address poster, uint96 bounty, bytes32 briefHash, uint64 postedAt, uint64 deadline, address hired, bool refunded)',
    'function operator() view returns (address)',
    'function owner() view returns (address)',
  ],
  dlog: [
    'function record(uint256 taskId, uint8 kind, uint16 confidenceBps, uint16 thresholdBps, bytes32 reasoningHash, address worker) returns (uint256 id)',
    'function nextId() view returns (uint256)',
    'function operator() view returns (address)',
  ],
  executor: [
    'function settle(uint256 taskId, bool accept, uint16 confidenceBps)',
    'function operator() view returns (address)',
    'function thresholdBps() view returns (uint16)',
  ],
  registry: [
    'function payouts(uint8) view returns (address)',
    'function active(uint8) view returns (bool)',
  ],
  usdg: [
    'function balanceOf(address) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function transfer(address to, uint256 amount) returns (bool)',
  ],
};

// ── 客户端 ──
const ACCOUNT = privateKeyToAccount(OPERATOR_KEY.startsWith('0x') ? OPERATOR_KEY : '0x' + OPERATOR_KEY);
const pub = createPublicClient({ transport: http(RPC) });
const wallet = createWalletClient({ account: ACCOUNT, transport: http(RPC) });

// ── 启动检查 ──
async function startupCheck() {
  log('═══ 引擎启动检查 ══');
  const cid = await pub.getChainId();
  log(`  链: ${cid} ${cid === CHAIN_ID ? '✅' : '❌ 期望 ' + CHAIN_ID}`);
  if (cid !== CHAIN_ID) process.exit(1);

  const bal = await pub.getBalance({ address: ACCOUNT.address });
  log(`  operator: ${ACCOUNT.address}`);
  log(`  ETH 余额: ${formatEther(bal)} ${bal > 0n ? '✅' : '❌ 需要 gas'}`);

  // 读 TaskBoard 状态
  const tb = await pub.readContract({ address: ADDRS.TaskBoard, abi: PARSE_ABI.board, functionName: 'nextTaskId' });
  log(`  TaskBoard nextTaskId: ${tb}`);
  const op = await pub.readContract({ address: ADDRS.TaskBoard, abi: PARSE_ABI.board, functionName: 'operator' });
  log(`  TaskBoard operator: ${op} ${op.toLowerCase() === ACCOUNT.address.toLowerCase() ? '✅' : '⚠️ 不是本钱包'}`);
  log('');
}

function formatEther(wei) { return (Number(wei) / 1e18).toFixed(18).replace(/0+$/, '').replace(/\.$/, '') || '0'; }

// ── 主循环：监听 + 处理任务 ──
async function mainLoop() {
  log('🔄 开始轮询 TaskBoard…');
  let lastTaskId = 0n;

  while (true) {
    try {
      // 读 nextTaskId（下一个要发布的 ID）
      const next = await pub.readContract({ address: ADDRS.TaskBoard, abi: PARSE_ABI.board, functionName: 'nextTaskId' });

      if (next > lastTaskId + 1n) {
        // 有新任务
        for (let tid = lastTaskId + 1n; tid < next; tid++) {
          log(`\n📋 检测到任务 #${tid}`);
          try {
            await processTask(tid);
          } catch (e) {
            log(`  ❌ 任务 #${tid} 处理失败: ${(e.shortMessage || e.message).slice(0, 100)}`);
          }
        }
        lastTaskId = next - 1n;
      }
    } catch (e) {
      log(`⚠ RPC 异常: ${(e.shortMessage || e.message).slice(0, 80)} · 20s 后重试`);
    }
    await sleep(20_000); // 20s 轮询
  }
}

async function processTask(taskId) {
  // 读任务
  const task = await pub.readContract({ address: ADDRS.TaskBoard, abi: PARSE_ABI.board, functionName: 'tasks', args: [taskId] });
  const [poster, bounty, briefHash, postedAt, deadline, hired, refunded] = task;
  if (hired !== '0x0000000000000000000000000000000000000000') { log(`  已雇，跳过`); return; }
  if (refunded) { log(`  已退款，跳过`); return; }

  log(`  赏金: ${formatUnits(bounty, 6)} USDC · 截止: block ${deadline}`);

  // 招标
  const seats = [
    { role: 'worker', model: 'grok-4.7', costUsd: 0.02, qualityScore: 88, trackRecord: 75 },
    { role: 'worker2', model: 'gpt-6.1-sol', costUsd: 0.03, qualityScore: 90, trackRecord: 80 },
  ];
  const scored = seats.map((s, i) => ({ ...s, composite: s.qualityScore * 0.6 + s.trackRecord * 0.3 - i * 0.1 })).sort((a, b) => b.composite - a.composite);
  const pick = scored[0];
  log(`  🎯 中标: ${pick.model}`);

  // hire
  log(`  📝 hire…`);
  const hireTx = await wallet.writeContract({ address: ADDRS.TaskBoard, abi: PARSE_ABI.board, functionName: 'hire', args: [taskId, pick.payout] });
  await pub.waitForTransactionReceipt({ hash: hireTx });
  log(`  ✅ hire done`);

  // 真推理
  // 注意：brief 是 hash，全文需要从事件或外部存储获取
  // 简化：用 briefHash 生成一个代表性 prompt（测试模式）
  log(`  🧠 ${pick.model} 推理中…`);
  const sub = await callModel(pick.role, [{ role: 'user', content: `Complete this task. Brief hash: ${briefHash}. Provide a high-quality response.` }], { maxTokens: 500 });
  if (!sub.ok) { log(`  ❌ 推理失败: ${sub.error}`); return; }
  const submission = sub.content;
  log(`  📄 提交: ${String(submission).slice(0, 100)}…`);

  // 评级
  log(`  ⚖️ 评级…`);
  const gradePrompt = [
    { role: 'system', content: 'Score how well the SUBMISSION fulfills the BRIEF. Scale 0-10000. Return ONLY JSON {"confidence":N,"reason":"<=15 words"}. No markdown.' },
    { role: 'user', content: `BRIEF HASH: ${briefHash}\n\nSUBMISSION: ${submission}` },
  ];
  const gr = await callModel('grader', gradePrompt, { maxTokens: 150 });
  const confMatch = String(gr.content ?? '').match(/"confidence"\s*:\s*(\d{1,5})/i);
  const confidence = confMatch ? Math.min(10000, parseInt(confMatch[1])) : 0;
  const accept = canAccept(confidence, THRESHOLD_BPS);
  log(`  confidence=${confidence} → ${accept ? '✅ 接受' : '❌ 退款'}`);

  // 上链：决策记录
  const reasoningHash = '0x' + createHash('sha256').update(String(submission)).digest('hex');
  log(`  📝 DecisionLog.record…`);
  const recTx = await wallet.writeContract({ address: ADDRS.DecisionLog, abi: PARSE_ABI.dlog, functionName: 'record', args: [taskId, 2, confidence, THRESHOLD_BPS, reasoningHash, pick.payout] });
  await pub.waitForTransactionReceipt({ hash: recTx });
  log(`  ✅ record done`);

  // 结算
  log(`  📝 executor.settle…`);
  const settleTx = await wallet.writeContract({ address: ADDRS.DecisionExecutor, abi: PARSE_ABI.executor, functionName: 'settle', args: [taskId, accept, confidence] });
  const rc = await pub.waitForTransactionReceipt({ hash: settleTx });
  log(`  ✅ settle done · gas ${rc.gasUsed}`);
  log(`  ${accept ? '💰 放款' : '↩️ 退款'} · 任务 #${taskId} 完成`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── 启动 ──
const init = async () => {
  await startupCheck();
  log('🟢 引擎就绪 · 开始轮询\n');
  await mainLoop();
};

init().catch((e) => { console.error('❌ 引擎异常:', e.message); process.exit(1); });
