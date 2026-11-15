// Wage · 主网首任务（单次全流程，可控逐步验收）
// 链上循环完整走一遍：approve → post(1 USDG) → 招标 → hire → LLM 真推理
//   → gemini 锚点评级 → DecisionLog.record → Executor.settle → 链上回读
// 前提：operator 钱包有 gas + ≥1 USDG；合约已部署；密钥只在 engine/.env。
// 用法：node engine/first-task.mjs [--dry]   （--dry 只做预检，不发交易）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWalletClient, createPublicClient, http, formatEther, formatUnits, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createHash } from 'node:crypto';
import { chooseWorker, canAccept, THRESHOLD_BPS } from './grader.mjs';
import { gradePrompt } from './flow.mjs';
import { callModel } from './llm.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry');
const RPC = 'https://rpc.mainnet.chain.robinhood.com';
const log = (s) => console.log(s);

// ── env + 合约地址 ──
const env = Object.fromEntries(fs.readFileSync(path.join(here, '.env'), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const depFiles = fs.readdirSync(path.join(here, '..', 'deployments')).filter((f) => f.includes('rh-mainnet') && f.endsWith('.json')).sort();
const dep = JSON.parse(fs.readFileSync(path.join(here, '..', 'deployments', depFiles[depFiles.length - 1]), 'utf8'));
const ADDRS = { USDG: dep.usdg, ...Object.fromEntries(Object.entries(dep.contracts).map(([k, v]) => [k, v])) };

const ABI = {
  usdg: parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
  ]),
  board: parseAbi([
    'function post(string brief, uint96 bounty) returns (uint256 taskId)',
    'function hire(uint256 taskId, address worker)',
    'function escrow() view returns (uint256)',
    'function nextTaskId() view returns (uint256)',
    'function tasks(uint256) view returns (address poster, uint96 bounty, bytes32 briefHash, uint64 postedAt, uint64 deadline, address hired, bool refunded)',
    'function operator() view returns (address)',
    'function settled(uint256) view returns (bool)',
  ]),
  reg: parseAbi([
    'function payouts(uint256) view returns (address)',
    'function active(uint256) view returns (bool)',
    'function seats(uint256) view returns (bytes32)',
  ]),
  dlog: parseAbi([
    'function record(uint256 taskId, uint8 kind, uint16 confidenceBps, uint16 thresholdBps, bytes32 reasoningHash, address worker) returns (uint256 id)',
    'function nextId() view returns (uint256)',
  ]),
  exec: parseAbi([
    'function settle(uint256 taskId, bool accept, uint16 confidenceBps)',
    'function thresholdBps() view returns (uint16)',
    'function feeBps() view returns (uint16)',
  ]),
};

const ACCOUNT = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY.startsWith('0x') ? env.DEPLOYER_PRIVATE_KEY : '0x' + env.DEPLOYER_PRIVATE_KEY);
const pub = createPublicClient({ transport: http(RPC) });
const wallet = createWalletClient({ account: ACCOUNT, transport: http(RPC) });
const read = (addr, abi, fn, args = []) => pub.readContract({ address: addr, abi, functionName: fn, args });
const write = async (addr, abi, fn, args) => {
  const hash = await wallet.writeContract({ address: addr, abi, functionName: fn, args, chain: null });
  const rc = await pub.waitForTransactionReceipt({ hash });
  return { hash, gasUsed: Number(rc.gasUsed), status: rc.status };
};
const scan = (h) => `https://robinhoodchain.blockscout.com/tx/${h}`;

// ── 招标候选（与 paper 台账同表；winer 的 role 映射 LLM 座位键）──
const CANDIDATES = [
  { model: 'grok-4.7', role: 'worker', seat: 0, costUsd: 0.02, qualityScore: 88, trackRecord: 75 },
  { model: 'gpt-6.1-sol', role: 'worker2', seat: 1, costUsd: 0.03, qualityScore: 90, trackRecord: 80 },
];
const BRIEF = 'In two sentences, explain what a stablecoin depeg event is and name one real example.';

// ═══════════ 0 · 预检 ═══════════
log('═══ Wage 主网首任务 ═══');
const cid = await pub.getChainId();
if (cid !== 4663) { log(`❌ chainId ${cid} ≠ 4663`); process.exit(1); }
const [ethBal, usdgBal, op, nextId, thr, feeBps] = await Promise.all([
  pub.getBalance({ address: ACCOUNT.address }),
  read(ADDRS.USDG, ABI.usdg, 'balanceOf', [ACCOUNT.address]),
  read(ADDRS.TaskBoard, ABI.board, 'operator'),
  read(ADDRS.TaskBoard, ABI.board, 'nextTaskId'),
  read(ADDRS.DecisionExecutor, ABI.exec, 'thresholdBps'),
  read(ADDRS.DecisionExecutor, ABI.exec, 'feeBps'),
]);
log(`operator:  ${ACCOUNT.address}`);
log(`ETH gas:   ${formatEther(ethBal)}（约可付 ${Math.floor(Number(ethBal) / 3e12)} 笔）`);
log(`USDG:      ${formatUnits(usdgBal, 6)}`);
log(`TaskBoard.operator 匹配: ${op.toLowerCase() === ACCOUNT.address.toLowerCase() ? '✅' : '❌ ' + op}`);
log(`nextTaskId: ${nextId} · executor 阈值 ${thr}bps · 手续费 ${feeBps}bps`);
if (nextId !== 1n) log(`⚠ 已有 ${nextId - 1n} 个历史任务，本次继续追加 #${nextId}`);
if (usdgBal < 1_000_000n) { log('❌ USDG 不足 1'); process.exit(1); }
if (DRY) { log('—— DRY 模式结束，未发交易 ——'); process.exit(0); }

// ═══════════ 1 · approve + post ═══════════
const bounty = 1_000_000n; // 1 USDG
const allowance = await read(ADDRS.USDG, ABI.usdg, 'allowance', [ACCOUNT.address, ADDRS.TaskBoard]);
if (allowance < bounty) {
  log('\n[1/6] approve 1 USDG → TaskBoard');
  const a = await write(ADDRS.USDG, ABI.usdg, 'approve', [ADDRS.TaskBoard, bounty]);
  log(`  ✅ ${a.status === 'success' ? '成功' : '失败'} · gas ${a.gasUsed} · ${scan(a.hash)}`);
} else log('\n[1/6] allowance 已足够，跳过 approve');

log('[2/6] post 任务（1 USDG 托管）');
const p = await write(ADDRS.TaskBoard, ABI.board, 'post', [BRIEF, bounty]);
log(`  ✅ gas ${p.gasUsed} · ${scan(p.hash)}`);
const taskId = nextId;
const t = await read(ADDRS.TaskBoard, ABI.board, 'tasks', [taskId]);
log(`  任务 #${taskId} · escrow=${formatUnits(await read(ADDRS.TaskBoard, ABI.board, 'escrow'), 6)} USDG · deadline block ${t[4]}`);

// ═══════════ 2 · 招标 + hire ═══════════
log('[3/6] 招标（composite = quality×0.6 + trackRecord×0.3 − costRank×0.1）');
const pick = chooseWorker(CANDIDATES);
log(`  🎯 中标: ${pick.model}（composite ${pick.composite.toFixed(1)}）`);
const payout = await read(ADDRS.ModelRegistry, ABI.reg, 'payouts', [BigInt(pick.seat)]);
log(`  席位 payout: ${payout}`);
const h = await write(ADDRS.TaskBoard, ABI.board, 'hire', [taskId, payout]);
log(`  ✅ hire · gas ${h.gasUsed} · ${scan(h.hash)}`);

// ═══════════ 3 · 真推理 ═══════════
log(`[4/6] ${pick.model} 真推理…`);
const sub = await callModel(pick.role, [{ role: 'user', content: BRIEF }], { maxTokens: 400, temperature: 0.2 });
if (!sub.ok) { log(`  ❌ 推理失败: ${sub.error}`); process.exit(1); }
log(`  📄 ${String(sub.content).slice(0, 220).replace(/\n/g, ' ')}…`);
log(`  （${sub.latencyMs}ms · tokens ${sub.usage?.total_tokens ?? '?'}）`);

// ═══════════ 4 · 锚点评级 ═══════════
log('[5/6] gemini-3.5-flash-lite 锚点评级…');
const gr = await callModel('grader', gradePrompt(BRIEF, String(sub.content)), { maxTokens: 200, temperature: 0 });
if (!gr.ok) { log(`  ❌ 评级失败: ${gr.error}`); process.exit(1); }
const m = String(gr.content ?? '').match(/"confidence"\s*:\s*(\d{1,5})/i);
const confidence = m ? Math.min(10000, parseInt(m[1])) : 0;
const accept = canAccept(confidence, THRESHOLD_BPS);
log(`  ⚖️ confidence=${confidence}bps vs 阈值 ${THRESHOLD_BPS}bps → ${accept ? '✅ 接受' : '❌ 退款'}`);
log(`  评级原文: ${String(gr.content).slice(0, 140).replace(/\n/g, ' ')}`);

// ═══════════ 5 · 链上记录 + 结算 ═══════════
const reasoningHash = '0x' + createHash('sha256').update(String(sub.content)).digest('hex');
log('[6/6] DecisionLog.record → Executor.settle');
const r = await write(ADDRS.DecisionLog, ABI.dlog, 'record', [taskId, 2, confidence, THRESHOLD_BPS, reasoningHash, payout]);
log(`  ✅ record · gas ${r.gasUsed} · ${scan(r.hash)}`);
const s = await write(ADDRS.DecisionExecutor, ABI.exec, 'settle', [taskId, accept, confidence]);
log(`  ✅ settle · gas ${s.gasUsed} · ${scan(s.hash)}`);

// ═══════════ 6 · 回读验收 ═══════════
log('\n═══ 回读验收 ═══');
const [t2, escrow, settled, nextId2, usdgAfter] = await Promise.all([
  read(ADDRS.TaskBoard, ABI.board, 'tasks', [taskId]),
  read(ADDRS.TaskBoard, ABI.board, 'escrow'),
  read(ADDRS.TaskBoard, ABI.board, 'settled', [taskId]),
  read(ADDRS.TaskBoard, ABI.board, 'nextTaskId'),
  read(ADDRS.USDG, ABI.usdg, 'balanceOf', [ACCOUNT.address]),
]);
log(`任务 #${taskId}: hired=${t2[5]} refunded=${t2[6]} · settled=${settled}`);
log(`escrow 余量: ${formatUnits(escrow, 6)} USDG（应 ${accept ? '= 手续费部分' : '归零'}）`);
log(`operator USDG: ${formatUnits(usdgAfter, 6)}（${accept ? '赏金回流本钱包（席位 payout=operator）' : '退款回流'}）`);
log(`decision nextId: ${await read(ADDRS.DecisionLog, ABI.dlog, 'nextId')}`);
log(`\n🏁 首任务完成 · 提交哈希 ${reasoningHash.slice(0, 18)}…`);
