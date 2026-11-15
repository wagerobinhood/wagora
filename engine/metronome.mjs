// Wage · 链上任务节拍器（metronome）· 生产版
// bounty_open=1 时循环发暖场任务：post → hire → LLM 推理 → gemini 评级 → record → settle
// bounty_open=0 或链不可达 → 等待（不退出，读配置 60s 一次）
// 资金模型：席位 payout = operator 本人 → 赏金 settle 后原路回流，净成本只有 gas。
// 间隔：warmup_interval_h（配置中心，默认 4h）
// 用法：node engine/metronome.mjs --once   跑一轮即退出（验收用）
//       node engine/metronome.mjs          常驻
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWalletClient, createPublicClient, http, formatUnits, parseAbi, decodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createHash } from 'node:crypto';
import { chooseWorker, canAccept, THRESHOLD_BPS } from './grader.mjs';
import { gradePrompt, gradePromptParsed, parseBrief, promptVersionHash } from './flow.mjs';
import { callModel } from './llm.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ONCE = process.argv.includes('--once');
const RPC = 'https://rpc.mainnet.chain.robinhood.com';
const log = (s) => console.log(new Date().toISOString() + ' ' + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── env ──
const env = fs.existsSync(path.join(here, '.env'))
  ? Object.fromEntries(fs.readFileSync(path.join(here, '.env'), 'utf8')
      .split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
  : {};
const KEY = process.env.OPERATOR_KEY || process.env.DEPLOYER_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY;
if (!KEY) { console.error('❌ OPERATOR_KEY / DEPLOYER_PRIVATE_KEY 未设置'); process.exit(1); }

// ── 部署记录 ──
const depDir = path.join(here, '..', 'deployments');
const depFiles = fs.readdirSync(depDir).filter((f) => f.includes('rh-mainnet') && f.endsWith('.json')).sort();
const dep = JSON.parse(fs.readFileSync(path.join(depDir, depFiles[depFiles.length - 1]), 'utf8'));
const ADDRS = { USDG: dep.usdg, ...dep.contracts };

const ABI = {
  usdg: parseAbi(['function balanceOf(address) view returns (uint256)', 'function approve(address spender, uint256 amount) returns (bool)', 'function allowance(address owner, address spender) view returns (uint256)']),
  board: parseAbi(['function post(string brief, uint96 bounty) returns (uint256 taskId)', 'function hire(uint256 taskId, address worker)', 'function nextTaskId() view returns (uint256)', 'function tasks(uint256) view returns (address,uint96,bytes32,uint64,uint64,address,bool)']),
  reg: parseAbi(['function payouts(uint256) view returns (address)', 'function active(uint256) view returns (bool)']),
  regSet: parseAbi(['function setSeat(uint8 desk, bytes32 model, address payout, bool active)']),
  dlog: parseAbi(['function record(uint256 taskId, uint8 kind, uint16 confidenceBps, uint16 thresholdBps, bytes32 reasoningHash, address worker) returns (uint256 id)']),
  exec: parseAbi(['function settle(uint256 taskId, bool accept, uint16 confidenceBps)']),
};

const ACCOUNT = privateKeyToAccount(KEY.startsWith('0x') ? KEY : '0x' + KEY);
const pub = createPublicClient({ transport: http(RPC) });
const wallet = createWalletClient({ account: ACCOUNT, transport: http(RPC) });
const read = (a, abi, fn, args = []) => pub.readContract({ address: a, abi, functionName: fn, args });
const write = async (a, abi, fn, args) => {
  const hash = await wallet.writeContract({ address: a, abi, functionName: fn, args, chain: null });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success') throw new Error(`${fn} reverted (${hash})`);
  return { hash, gasUsed: Number(rc.gasUsed) };
};
const scan = (h) => `https://robinhoodchain.blockscout.com/tx/${h}`;

// ── 座位与 brief 池 ──
const CANDIDATES = [
  { model: 'grok-4.7', role: 'worker', seat: 0, costUsd: 0.02, qualityScore: 88, trackRecord: 75 },
  { model: 'gpt-6.1-sol', role: 'worker2', seat: 1, costUsd: 0.03, qualityScore: 90, trackRecord: 80 },
];
// 结构化 brief（协议 v1：验收标准进评级 prompt）；序号 = taskId % 池长度，重启不重置
const B = (type, deliverable, acceptance, format) =>
  `[TYPE]
${type}
[DELIVERABLE]
${deliverable}
[ACCEPTANCE]
${acceptance}${format ? `
[FORMAT]
${format}` : ''}`;
const BRIEF_POOL = [
  B("qa", "In two sentences, explain what a stablecoin depeg event is and name one real example.", "exactly two sentences\nmentions one real historical depeg event by name", "plain text"),
  B("qa", "What is a blockchain oracle and why do DeFi protocols need one? Answer in two sentences and name one oracle network.", "exactly two sentences\nnames one real oracle network", "plain text"),
  B("writing", "Explain the difference between a CEX and a DEX for a non-technical audience.", "plain language, no jargon without explanation\ncovers custody and how trades are matched\nunder 120 words", "one paragraph"),
  B("qa", "What does a smart contract audit cover, and what does it not cover? Answer in two sentences.", "exactly two sentences\nstated scope and at least one stated limitation", "plain text"),
  B("summary", "Summarize what impermanent loss means for a liquidity provider.", "one paragraph\ngives one concrete numeric example with a price move\nstates realized vs unrealized", "one paragraph"),
  B("qa", "Explain the difference between a market order and a limit order in two sentences, and say when slippage matters most.", "exactly two sentences\ndefines both order types\nmentions when slippage applies", "plain text"),
  B("analysis", "Give one advantage and one disadvantage of using a governance token for protocol decisions.", "names exactly one advantage and one disadvantage\nboth are specific, not generic\nunder 80 words", "plain text"),
  B("qa", "What is MEV in crypto and give one concrete example of it. Answer in two sentences.", "exactly two sentences\ndefines MEV correctly\ngives one concrete example", "plain text"),
  B("writing", "Explain what an L2 rollup is and why blockchains use them, for a developer who only knows Ethereum L1.", "mentions batching or settling to L1\nexplains the cost or throughput benefit\nunder 120 words", "one paragraph"),
  B("analysis", "What happens to a lending protocol when collateral price crashes faster than liquidations can run? Answer in two sentences.", "exactly two sentences\nmentions bad debt or undercollateralization", "plain text"),
  B("qa", "Name two mechanisms stablecoin issuers use to keep the peg, in two sentences.", "exactly two sentences\nnames two distinct mechanisms (e.g. collateral, redemption, arbitrage)", "plain text"),
  B("summary", "Explain what on-chain verification means and why it matters for DeFi users.", "one paragraph\nmentions hashes or signatures as the mechanism\nunder 100 words", "one paragraph"),
  B("writing", "Describe the main risks of leaving funds in a smart contract vault.", "names at least two distinct risks (e.g. bugs, admin keys, oracle failure)\nunder 100 words", "one paragraph"),
  B("qa", "What is slippage and why does it get worse with larger trade sizes? Answer in two sentences.", "exactly two sentences\nexplains the pool-price or orderbook mechanism", "plain text"),
  B("analysis", "Explain why stablecoin issuers publish attestations or audits, in two sentences.", "exactly two sentences\nconnects transparency to trust", "plain text"),
  B("qa", "What does trustless mean in crypto, and name one way it is still limited in practice. Answer in two sentences.", "exactly two sentences\ndefines the term\nnames one practical limitation", "plain text"),
];

// ── 配置中心 ──
const ADMIN_BASE = (process.env.ADMIN_API_BASE || env.ADMIN_API_BASE || 'https://admin.nulltraces.top').replace(/\/$/, '');
async function readConfig() {
  try {
    const r = await fetch(`${ADMIN_BASE}/api/site?name=wage`, { cache: 'no-store' });
    const j = await r.json();
    const c = j.data?.custom ?? {};
    return {
      open: c.bounty_open === true || c.bounty_open === '1',
      intervalH: Number(c.warmup_interval_h) > 0 ? Number(c.warmup_interval_h) : 4,
    };
  } catch { return { open: false, intervalH: 4 }; }
}

// ── 单轮 ──
let round = 0;
async function tick() {
  const bal = await read(ADDRS.USDG, ABI.usdg, 'balanceOf', [ACCOUNT.address]);
  if (bal < 1_000_000n) { log(`⚠ USDG 不足 1（当前 ${formatUnits(bal, 6)}）· 等待充值`); return false; }

  round++;
  const taskId = await read(ADDRS.TaskBoard, ABI.board, 'nextTaskId');
  const brief = BRIEF_POOL[Number(taskId) % BRIEF_POOL.length];
  log(`── 第 ${round} 轮 · 任务 #${taskId} · ${brief.slice(0, 60).replace(/\n/g, ' ')}…`);

  // approve（不足才发）
  const allowance = await read(ADDRS.USDG, ABI.usdg, 'allowance', [ACCOUNT.address, ADDRS.TaskBoard]);
  if (allowance < 1_000_000n) {
    const a = await write(ADDRS.USDG, ABI.usdg, 'approve', [ADDRS.TaskBoard, 1_000_000n]);
    log(`  approve · gas ${a.gasUsed}`);
  }

  // post
  const p = await write(ADDRS.TaskBoard, ABI.board, 'post', [brief, 1_000_000n]);
  log(`  post · gas ${p.gasUsed} · ${scan(p.hash)}`);

  return await fulfillTask(taskId, brief, 'house warmup', p.hash);
}

/**
 * 完整履约一个已 post 的任务（house 暖场或用户任务共用）：
 * 招标（含轮换探测）→ hire → LLM 推理 → gemini 评级 → record → settle。
 * 铁律：hire 之后无论如何都要 settle —— LLM 失败也走 settle(false) 退款，
 * 绝不让 escrow 卡死（合约的 refund() 只对未 hire 的任务开放）。
 */
async function fulfillTask(taskId, brief, source, postHash) {
  // 招标：复合分是静态的（gpt 恒赢）→ 市场会退化成独苗。加轮换探测：
  // 每第 4 个任务强制让非中标的活跃席位接单一次（规律 = taskId % 4 === 0，链上可自证）。
  const winner = chooseWorker(CANDIDATES);
  let pick, bidMode;
  if (source === 'house warmup') {
    // 严格轮换：偶数任务 → grok（seat 0），奇数 → gpt（seat 1）——链上 taskId 可自证
    pick = CANDIDATES[Number(taskId) % CANDIDATES.length];
    bidMode = `house rotation (task #${Number(taskId)} → ${pick.model})`;
  } else {
    const probe = CANDIDATES.length > 1 && Number(taskId) % 4 === 0
      ? CANDIDATES.find((c) => c.seat !== winner.seat)
      : null;
    pick = probe ?? winner;
    bidMode = probe ? 'rotation probe' : `bid won (composite ${winner.composite.toFixed(1)})`;
  }
  const payout = await read(ADDRS.ModelRegistry, ABI.reg, 'payouts', [BigInt(pick.seat)]);
  const h = await write(ADDRS.TaskBoard, ABI.board, 'hire', [taskId, payout]);
  log(`  hire ${pick.model} · ${bidMode} · gas ${h.gasUsed}`);

  // 推理 + 评级（失败也要 settle 退款）
  let subOk = false;
  let submission = '';
  let confidence = 0;
  let gradeRaw = '';
  const parsed = parseBrief(brief);
  const promptHash = promptVersionHash(parsed);
  let reasoningHash = '0x' + createHash('sha256').update(brief + '|NOT-FULFILLED').digest('hex');
  try {
    const sub = await callModel(pick.role, [{ role: 'user', content: brief }], { maxTokens: 400, temperature: 0.2 });
    if (!sub.ok) throw new Error('worker failed: ' + sub.error);
    subOk = true;
    submission = String(sub.content).slice(0, 4000);
    log(`  🧠 ${pick.model} ${sub.latencyMs}ms · ${String(sub.content).slice(0, 90).replace(/\n/g, ' ')}…`);

    const gr = await callModel('grader', gradePrompt(brief, submission), { maxTokens: 200, temperature: 0 });
    const m = String(gr.content ?? '').match(/"confidence"\s*:\s*(\d{1,5})/i);
    confidence = m ? Math.min(10000, parseInt(m[1])) : 0;
    gradeRaw = String(gr.content ?? '').slice(0, 400);
    if (!gr.ok) gradeRaw = `grader failed: ${gr.error}`;
    // reasoningHash 绑定评级 prompt 版本：sha256(提交 + prompt 版本哈希) —— 评级标准可追溯
    reasoningHash = '0x' + createHash('sha256').update(submission + '\n' + promptHash).digest('hex');
    log(`  ⚖️ ${confidence}bps vs ${THRESHOLD_BPS} → ${canAccept(confidence, THRESHOLD_BPS) ? '接受' : '退款'} · prompt ${promptHash.slice(0, 10)}…`);
  } catch (e) {
    log(`  ❌ ${(e.message || e).slice(0, 120)} · 记退款 + settle(false)`);
    gradeRaw = `not fulfilled: ${(e.message || e).slice(0, 200)}`;
  }

  const accept = subOk && canAccept(confidence, THRESHOLD_BPS);
  const r = await write(ADDRS.DecisionLog, ABI.dlog, 'record', [taskId, subOk ? 2 : 3, confidence, THRESHOLD_BPS, reasoningHash, payout]);
  const s = await write(ADDRS.DecisionExecutor, ABI.exec, 'settle', [taskId, accept, confidence]);
  log(`  ✅ record ${scan(r.hash)}`);
  log(`  ✅ settle ${scan(s.hash)} · ${accept ? 'PAID' : 'REFUNDED'}`);

  // 思考全文落盘（共享卷 → 网站 /reasoning 直读；链上只有哈希，全文在这里）
  saveReason({
    taskId: Number(taskId),
    at: new Date().toISOString(),
    source,
    brief,
    worker: pick.model,
    bidMode,
    promptVersionHash: promptHash,
    submission,
    grader: env.LLM_GRADER_MODEL || 'gemini-3.5-flash-lite',
    gradeRaw,
    confidence,
    threshold: THRESHOLD_BPS,
    accept,
    reasoningHash,
    txs: { post: postHash ?? '', hire: h.hash, record: r.hash, settle: s.hash },
  });
  log(`  📝 思考记录已存 (#${taskId})`);
  return accept;
}

// ── 思考记录存储（保留最近 50 条） ──
const REASONS_PATH = path.join(here, 'state', 'task-reasons.json');
function saveReason(rec) {
  try {
    fs.mkdirSync(path.join(here, 'state'), { recursive: true });
    const arr = fs.existsSync(REASONS_PATH) ? JSON.parse(fs.readFileSync(REASONS_PATH, 'utf8')) : [];
    arr.push(rec);
    while (arr.length > 50) arr.shift();
    fs.writeFileSync(REASONS_PATH, JSON.stringify(arr, null, 1));
  } catch (e) {
    log(`⚠ 思考记录写入失败: ${e?.message?.slice(0, 100)}`);
  }
}

// ═══════════ 用户任务 intake（ Posted 事件 → 解码 brief → 履约） ═══════════
// brief 全文在 post 交易的 calldata 里（结构体只存哈希）；解码后先验哈希再 hire。
const ZERO = '0x0000000000000000000000000000000000000000';
const CURSOR_PATH = path.join(here, 'state', 'intake-cursor.json');
const POST_ABI = parseAbi(['function post(string brief, uint96 bounty)']);
const POSTED_EVENT = parseAbi(['event Posted(uint256 indexed taskId, address indexed poster, uint96 bounty, bytes32 briefHash, uint64 deadline)'])[0];

function readCursor() {
  try { return Number(JSON.parse(fs.readFileSync(CURSOR_PATH, 'utf8')).block); } catch { return null; }
}
function writeCursor(b) {
  try {
    fs.mkdirSync(path.join(here, 'state'), { recursive: true });
    fs.writeFileSync(CURSOR_PATH, JSON.stringify({ block: b }));
  } catch { /* 光标写失败 → 下轮重扫，intake 幂等 */ }
}

async function intakeOnce() {
  const cursor = readCursor();
  if (cursor === null) {
    // 首次运行：从当前块起扫（历史全是 house 任务，无需回放）
    writeCursor(Number(await pub.getBlockNumber()));
    return;
  }
  const logs = await pub.getLogs({
    address: ADDRS.TaskBoard,
    event: POSTED_EVENT,
    fromBlock: BigInt(cursor + 1),
    toBlock: 'latest',
  });
  let last = cursor;
  for (const ev of logs) {
    last = Number(ev.blockNumber);
    const taskId = Number(ev.args.taskId);
    const poster = String(ev.args.poster);
    if (poster.toLowerCase() === ACCOUNT.address.toLowerCase()) continue; // house 自己的任务（tick 直接履约）
    log(`📨 用户任务 #${taskId} · poster ${poster.slice(0, 10)}…`);
    try {
      const t = await read(ADDRS.TaskBoard, ABI.board, 'tasks', [BigInt(taskId)]);
      if (String(t[5]) !== ZERO) { log('  已 hire，跳过'); continue; }
      // 解码 brief 全文并校验哈希（不符 → 进不了开放池，2h 后 poster 自行退款）
      const tx = await pub.getTransaction({ hash: ev.transactionHash });
      const dec = decodeFunctionData({ abi: POST_ABI, data: tx.input });
      const brief = String(dec.args[0] ?? '');
      const { keccak256, stringToHex } = await import('viem');
      if (keccak256(stringToHex(brief)) !== String(t[2])) {
        log('  ⚠ brief 哈希不符 · 不进开放池（拒绝路径：到期 poster 退款）');
        continue;
      }
      // 协议 v1：用户任务进开放池（外部 worker 抢单；10 分钟无人认领 → house 兜底履约）
      const seen = readJson(USER_TASKS_PATH, { seen: {} });
      if (!seen.seen[taskId]) {
        seen.seen[taskId] = {
          poster,
          brief: brief.slice(0, 4000),
          postedAt: Number(t[3]),
          deadline: Number(t[4]),
          addedAt: new Date().toISOString(),
        };
        writeJson(USER_TASKS_PATH, seen);
        log(`  🟢 进开放池（外部席位可抢单；10 分钟无认领由 house 兜底）`);
      }
    } catch (e) {
      log(`  ❌ intake 异常: ${(e.shortMessage || e.message || e).toString().slice(0, 140)}`);
    }
  }
  if (last !== cursor) writeCursor(last);
}

// ═══════════ worker 协议处理（注册激活 / 抢单兑现 / 交付评级 / 兜底与超时） ═══════════
const USER_TASKS_PATH = path.join(here, 'state', 'user-tasks.json');
const WORKERS_INBOX_PATH = path.join(here, 'state', 'worker-registrations.inbox.jsonl');
const WORKERS_STATE_PATH = path.join(here, 'state', 'worker-seats-state.json');
const CLAIMS_INBOX_PATH = path.join(here, 'state', 'task-claims.inbox.jsonl');
const CLAIMS_STATE_PATH = path.join(here, 'state', 'task-claims-state.json');
const SUBS_INBOX_PATH = path.join(here, 'state', 'task-submissions.inbox.jsonl');
const SUBS_STATE_PATH = path.join(here, 'state', 'task-submissions-state.json');
const BACKSTOP_MIN = 10;    // 开放池无人认领 → house 兜底
const SUBMIT_WINDOW_MIN = 15; // 接单后未交付 → 全额退发单人

const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 1)); };
const appendLine = (p, obj) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.appendFileSync(p, JSON.stringify(obj) + '\n'); };
const readLines = (p) => { try { return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
const hexPad32 = (str) => '0x' + Buffer.from(String(str), 'utf8').toString('hex').padEnd(64, '0').slice(0, 64);

async function findFreeSeat() {
  for (const desk of [2, 3, 4]) { // 0/1 是 house 席位，永不外放
    const active = await read(ADDRS.ModelRegistry, ABI.reg, 'active', [BigInt(desk)]);
    if (!active) return desk;
  }
  return null;
}

/** 每分钟与 intake 同拍运行：四个子步骤，全部幂等 */
async function processWorkers() {
  const now = Date.now();

  // a) 注册激活：pending + 有空位 → setSeat 上链
  const regInbox = readLines(WORKERS_INBOX_PATH);
  const regState = readJson(WORKERS_STATE_PATH, { workers: {} });
  for (const reg of regInbox) {
    if (regState.workers[reg.payout]?.status) continue; // 已处理过该 payout
    // 幂等：payout 已在链上激活（如手动 Safe setSeat 过）→ 标记完成
    const already = await read(ADDRS.ModelRegistry, ABI.reg, 'active', [BigInt(0)]).then(() => true).catch(() => false);
    let activeSomewhere = false;
    for (let d = 0; d < 5; d++) {
      const pa = await read(ADDRS.ModelRegistry, ABI.reg, 'payouts', [BigInt(d)]);
      const ac = await read(ADDRS.ModelRegistry, ABI.reg, 'active', [BigInt(d)]);
      if (String(pa).toLowerCase() === String(reg.payout).toLowerCase() && String(ac) === 'true') { activeSomewhere = true; regState.workers[reg.payout] = { ...reg, status: 'active', seat: d, activatedAt: 'pre-existing' }; break; }
    }
    if (activeSomewhere) { writeJson(WORKERS_STATE_PATH, regState); log(`🪑 ${reg.model} 已在链上激活，标记完成`); continue; }
    const desk = await findFreeSeat();
    if (desk === null) { regState.workers[reg.payout] = { ...reg, status: 'waitlist', note: 'no free seat' }; continue; }
    try {
      await write(ADDRS.ModelRegistry, ABI.regSet, 'setSeat', [desk, hexPad32(reg.model), reg.payout, true]);
      regState.workers[reg.payout] = { ...reg, status: 'active', seat: desk, activatedAt: new Date().toISOString() };
      log(`🪑 worker 席位激活: ${reg.model} → desk ${desk} · payout ${reg.payout.slice(0, 10)}…`);
    } catch (e) {
      log(`⚠ setSeat 失败 (${reg.model}): ${(e.shortMessage || e.message || e).toString().slice(0, 100)} · 下轮重试`);
    }
  }
  writeJson(WORKERS_STATE_PATH, regState);

  // b) 抢单兑现：claim → 链上 hire（先到先得；house 兜底与 claim 竞争时 claim 优先，因为它先写）
  const claimInbox = readLines(CLAIMS_INBOX_PATH);
  const claimState = readJson(CLAIMS_STATE_PATH, { done: {} });
  for (const c of claimInbox) {
    if (claimState.done[c.taskId]) continue;
    const t = await read(ADDRS.TaskBoard, ABI.board, 'tasks', [BigInt(c.taskId)]);
    if (String(t[5]) !== ZERO) { claimState.done[c.taskId] = 'task already hired'; continue; }
    if (String(t[6]) === 'true' || String(t[0]).toLowerCase() === ACCOUNT.address.toLowerCase()) { claimState.done[c.taskId] = 'unavailable'; continue; }
    try {
      const h = await write(ADDRS.TaskBoard, ABI.board, 'hire', [BigInt(c.taskId), c.payout]);
      claimState.done[c.taskId] = { status: 'hired', worker: c.payout, model: c.model, hireTx: h.hash, claimedAt: c.at };
      log(`🤝 外部 worker 接单: 任务 #${c.taskId} → ${c.model} · ${scan(h.hash)}`);
    } catch (e) {
      claimState.done[c.taskId] = `hire failed: ${(e.shortMessage || e.message || e).toString().slice(0, 80)}`;
    }
  }
  writeJson(CLAIMS_STATE_PATH, claimState);

  // c) 交付评级：外部 worker 的提交 → 按 brief 验收标准评级 → record + settle（钱直接进 worker payout）
  const subInbox = readLines(SUBS_INBOX_PATH);
  const subState = readJson(SUBS_STATE_PATH, { done: {} });
  for (const sub of subInbox) {
    if (subState.done[sub.taskId]) continue;
    const t = await read(ADDRS.TaskBoard, ABI.board, 'tasks', [BigInt(sub.taskId)]);
    const hired = String(t[5]);
    if (hired.toLowerCase() !== String(sub.payout).toLowerCase()) {
      subState.done[sub.taskId] = 'submitter is not the hired worker';
      continue;
    }
    const parsed = parseBrief(sub.brief || '');
    const promptHash = promptVersionHash(parsed);
    const gr = await callModel('grader', gradePromptParsed(parsed, String(sub.submission ?? '').slice(0, 4000)), { maxTokens: 200, temperature: 0 });
    const m = String(gr.content ?? '').match(/"confidence"\s*:\s*(\d{1,5})/i);
    const confidence = m ? Math.min(10000, parseInt(m[1])) : 0;
    const accept = gr.ok && canAccept(confidence, THRESHOLD_BPS);
    const reasoningHash = '0x' + createHash('sha256').update(String(sub.submission ?? '') + '\n' + promptHash).digest('hex');
    const r = await write(ADDRS.DecisionLog, ABI.dlog, 'record', [BigInt(sub.taskId), 2, confidence, THRESHOLD_BPS, reasoningHash, hired]);
    const s = await write(ADDRS.DecisionExecutor, ABI.exec, 'settle', [BigInt(sub.taskId), accept, confidence]);
    subState.done[sub.taskId] = { confidence, accept, at: new Date().toISOString() };
    log(`⚖️ 外部交付评级 #${sub.taskId}: ${confidence}bps → ${accept ? 'PAID 到 worker payout' : 'REFUNDED'} · ${scan(s.hash)}`);
    saveReason({
      taskId: sub.taskId, at: new Date().toISOString(), source: 'user task · external worker',
      brief: sub.brief, worker: sub.model, bidMode: 'external claim', submission: String(sub.submission ?? '').slice(0, 4000),
      grader: env.LLM_GRADER_MODEL || 'gemini-3.5-flash-lite', gradeRaw: String(gr.content ?? '').slice(0, 400),
      promptVersionHash: promptHash,
      confidence, threshold: THRESHOLD_BPS, accept, reasoningHash,
      txs: { post: '', hire: claimState.done[sub.taskId]?.hireTx ?? '', record: r.hash, settle: s.hash },
    });
  }
  writeJson(SUBS_STATE_PATH, subState);

  // c2) inbox 滚动清理：处理完的旧行不无限堆积（state.done 已幂等挡重处理）
  for (const [inboxP, stateP] of [[CLAIMS_INBOX_PATH, CLAIMS_STATE_PATH], [SUBS_INBOX_PATH, SUBS_STATE_PATH]]) {
    try {
      const lines = readLines(inboxP);
      if (lines.length > 500) {
        fs.writeFileSync(inboxP, lines.slice(-500).map((l) => JSON.stringify(l)).join('\n') + '\n');
      }
    } catch { /* 清理失败不影响主流程 */ }
  }
  try {
    const seen2 = readJson(USER_TASKS_PATH, { seen: {} });
    const cutoff = Date.now() - 7 * 86400000;
    let pruned = false;
    for (const [tid, info] of Object.entries(seen2.seen)) {
      const t = await read(ADDRS.TaskBoard, ABI.board, 'tasks', [BigInt(tid)]);
      const done = String(t[6]) === 'true'; // 全额派发完成 = 终态
      if (done && new Date(info.addedAt).getTime() < cutoff) { delete seen2.seen[tid]; pruned = true; }
    }
    if (pruned) writeJson(USER_TASKS_PATH, seen2);
  } catch { /* 清理失败不影响主流程 */ }

  // d) 兜底与超时（基于 user-tasks.json 的开放池）
  const seen = readJson(USER_TASKS_PATH, { seen: {} });
  for (const [tidStr, info] of Object.entries(seen.seen)) {
    const taskId = BigInt(tidStr);
    const t = await read(ADDRS.TaskBoard, ABI.board, 'tasks', [taskId]);
    const hired = String(t[5]);
    const refunded = String(t[6]) === 'true';
    if (hired !== ZERO && refunded) { continue; } // 已终结
    const ageMin = (now - Number(info.addedAt || info.postedAt * 1000 || now)) / 60000;

    if (hired === ZERO) {
      const hasActiveClaim = claimInbox.some((c) => Number(c.taskId) === Number(tidStr)) && !claimState.done[tidStr];
      if (hasActiveClaim) continue; // 有人抢了，等下一拍 hire
      if (ageMin >= BACKSTOP_MIN) {
        log(`🛟 兜底: 任务 #${tidStr} 开放 ${BACKSTOP_MIN} 分钟无人认领 → house 履约`);
        try { await fulfillTask(taskId, info.brief, 'user task · house backstop'); } catch (e) { log(`  兜底失败: ${(e.message || e).toString().slice(0, 100)}`); }
      }
      continue;
    }

    // 已 hire：接单者是外部 worker 且 15 分钟无交付 → 退款
    const isExternal = hired.toLowerCase() !== ACCOUNT.address.toLowerCase();
    const claimRec = claimState.done[tidStr];
    const hiredViaClaim = claimRec && typeof claimRec === 'object' && claimRec.status === 'hired';
    if (isExternal && hiredViaClaim) {
      const hasSub = subInbox.some((x) => Number(x.taskId) === Number(tidStr)) || subState.done[tidStr];
      const sinceHire = (now - new Date(claimRec.claimedAt || claimRec.at || info.addedAt).getTime()) / 60000;
      if (!hasSub && sinceHire >= SUBMIT_WINDOW_MIN) {
        log(`⏱ 任务 #${tidStr} 接单 ${SUBMIT_WINDOW_MIN} 分钟未交付 → 全额退发单人`);
        const rh = '0x' + createHash('sha256').update('NOT-DELIVERED#' + tidStr).digest('hex');
        const r = await write(ADDRS.DecisionLog, ABI.dlog, 'record', [taskId, 3, 0, THRESHOLD_BPS, rh, hired]);
        const s = await write(ADDRS.DecisionExecutor, ABI.exec, 'settle', [taskId, false, 0]);
        subState.done[tidStr] = 'expired without delivery → refunded';
        writeJson(SUBS_STATE_PATH, subState);
        log(`  ✅ 退款 ${scan(s.hash)} (record ${scan(r.hash)})`);
      }
    }
  }
}

// ── 启动 ──
const cid = await pub.getChainId();
if (cid !== 4663) { log(`❌ chainId ${cid} ≠ 4663`); process.exit(1); }
log(`metronome 启动 · ${ONCE ? 'once' : 'daemon'} · operator ${ACCOUNT.address}`);
if (ONCE) { await tick(); process.exit(0); }

// 用户任务 intake + worker 协议：独立 60s 轮询（不受 house 4h 节拍影响）
async function workerTick() {
  await intakeOnce();
  await processWorkers();
  await recoverOrphans();
}
workerTick().catch((e) => log(`❌ intake: ${(e.message || e).slice(0, 140)}`));
setInterval(() => {
  workerTick().catch((e) => log(`❌ intake: ${(e.shortMessage || e.message || e).slice(0, 140)}`));
}, 60_000);
log('📨 用户任务 intake + worker 协议已启动（60s 轮询）');

// 孤儿任务恢复：进程重启可能丢掉进行中的履约——hired 且未 settle 的任务一律退款，escrow 永不永久锁死
async function recoverOrphans() {
  const next = Number(await read(ADDRS.TaskBoard, ABI.board, 'nextTaskId'));
  for (let id = Math.max(1, next - 3); id < next; id++) {
    try {
      const t = await read(ADDRS.TaskBoard, ABI.board, 'tasks', [BigInt(id)]);
      if (String(t[5]).toLowerCase() !== ACCOUNT.address.toLowerCase()) continue; // 只管 house 自己 hire 的
      const refunded = String(t[6]) === 'true';
      if (refunded) continue;
      const settled = await read(ADDRS.DecisionExecutor, ABI.exec, 'settled', [BigInt(id)]).catch(() => false);
      if (settled) continue;
      log(`🩹 孤儿任务 #${id}（hired 未 settle）→ 退款`);
      const rh = '0x' + createHash('sha256').update('ORPHAN#' + id).digest('hex');
      await write(ADDRS.DecisionLog, ABI.dlog, 'record', [BigInt(id), 3, 0, THRESHOLD_BPS, rh, ACCOUNT.address]);
      await write(ADDRS.DecisionExecutor, ABI.exec, 'settle', [BigInt(id), false, 0]);
    } catch { /* 单个失败不影响其余 */ }
  }
}
// 孤儿恢复已并入 workerTick 周期执行（60s），不再只跑启动一次

while (true) {
  try {
    const cfg = await readConfig();
    if (!cfg.open) { log('⏸ bounty_open=0 · 60s 后重试'); await sleep(60_000); continue; }
    const ok = await tick();
    const waitMs = (ok ? cfg.intervalH * 3600 : 600) * 1000;
    log(`⏱ 下一轮 ${(waitMs / 3600000).toFixed(1)}h 后`);
    await sleep(waitMs);
  } catch (e) {
    log(`❌ 轮次异常: ${(e.shortMessage || e.message)?.slice(0, 140)} · 60s 后重试`);
    await sleep(60_000);
  }
}
