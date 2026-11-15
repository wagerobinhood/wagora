import 'server-only';
import { createPublicClient, http, parseAbi, formatUnits, decodeFunctionData, type AbiEvent } from 'viem';
import { SUITE } from '@/app/network/suite';
import { readTaskReasons } from '@/lib/task-reasons';

// 链上真实数据源：TaskBoard + DecisionLog + ModelRegistry（RH 主网公共 RPC 直读，无密钥）。
// 任何失败 → 返回空数组，页面走示例回落 —— 绝不编造链上数据。

const RPC = 'https://rpc.mainnet.chain.robinhood.com';
const SCAN = 'https://robinhoodchain.blockscout.com';
const HOUSE_PAYOUT = '0x50eb0935b4c3695f762763826db19ecd24b35bc1';

// house 两个席位 payout 相同 → 链上事件无法区分；引擎思考记录里有每任务的真实模型
function modelForTask(taskId: number, worker: string, seats: Map<string, string>): string {
  const base = seats.get(worker.toLowerCase()) ?? 'UNKNOWN SEAT';
  if (worker.toLowerCase() !== HOUSE_PAYOUT) return base;
  const rec = readTaskReasons().find((r) => r.taskId === taskId);
  return rec?.worker ?? base;
}

export interface FeedRow {
  t: string;          // 时间（UTC 短格式或块高）
  block?: number;     // record 交易块号（可自查）
  recordTx?: string;  // DecisionLog.record 交易哈希（Blockscout 直链）
  m: string;          // 模型名
  text: string;       // 决策描述
  c: string;          // 置信度 vs 阈值
  tag: 'paid' | 'ref';
  tagText: string;    // PAID x.xx USDG / REFUNDED / OPEN
  link?: string;      // Blockscout 链接
  live: true;
}

const pub = createPublicClient({ transport: http(RPC) });

const ABI = {
  board: parseAbi([
    'function nextTaskId() view returns (uint256)',
    'function tasks(uint256) view returns (address poster, uint96 bounty, bytes32 briefHash, uint64 postedAt, uint64 deadline, address hired, bool refunded)',
    'function escrow() view returns (uint256)',
  ]),
  exec: parseAbi(['function settled(uint256) view returns (bool)']),
  dlog: parseAbi([
    'function nextId() view returns (uint256)',
    'function decisions(uint256) view returns (uint256 id, uint256 taskId, uint8 kind, uint16 confidenceBps, uint16 thresholdBps, bytes32 reasoningHash, address worker)',
  ]),
  reg: parseAbi([
    'function seats(uint256) view returns (bytes32)',
    'function payouts(uint256) view returns (address)',
    'function active(uint256) view returns (bool)',
  ]),
};

// getLogs 的 event 参数要求单个 AbiEvent；parseAbi 数组返回元组 → 显式收窄
const DECIDED_EVENT = parseAbi(['event DecisionRecorded(uint256 indexed id, uint256 indexed taskId, uint8 kind, uint16 confidenceBps, uint16 thresholdBps, bytes32 reasoningHash, address worker)'])[0] as AbiEvent & {
  type: 'event'; name: 'DecisionRecorded';
};
const POSTED_EVENT = parseAbi(['event Posted(uint256 indexed taskId, address indexed poster, uint96 bounty, bytes32 briefHash, uint64 deadline)'])[0] as AbiEvent & {
  type: 'event'; name: 'Posted';
};

function seatName(bytes: string): string {
  return bytes.replace(/\x00+$/, '').trim() || 'SEAT';
}

async function seatByWorker(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < 5; i++) {
    try {
      const [model, payout, active] = await Promise.all([
        pub.readContract({ address: SUITE[2].addr as `0x${string}`, abi: ABI.reg, functionName: 'seats', args: [BigInt(i)] }),
        pub.readContract({ address: SUITE[2].addr as `0x${string}`, abi: ABI.reg, functionName: 'payouts', args: [BigInt(i)] }),
        pub.readContract({ address: SUITE[2].addr as `0x${string}`, abi: ABI.reg, functionName: 'active', args: [BigInt(i)] }),
      ]);
      if (active) map.set(payout.toLowerCase(), seatName(Buffer.from(model.slice(2), 'hex').toString('utf8')));
    } catch { /* 单席位读取失败忽略 */ }
  }
  return map;
}

export async function fetchOnchainRows(limit = 20): Promise<FeedRow[]> {
  try {
    const board = SUITE[0].addr as `0x${string}`;
    const dlog = SUITE[1].addr as `0x${string}`;
    const exec = SUITE[3].addr as `0x${string}`;
    const ZERO = '0x0000000000000000000000000000000000000000';

    const [nextTaskId, nextDecisionId, seats] = await Promise.all([
      pub.readContract({ address: board, abi: ABI.board, functionName: 'nextTaskId' }),
      pub.readContract({ address: dlog, abi: ABI.dlog, functionName: 'nextId' }),
      seatByWorker(),
    ]);

    // 决策（最新在前，最多 limit）；viem 返回只读元组 → 用下标访问
    const decisions: { taskId: bigint; kind: number; confidenceBps: number; thresholdBps: number; reasoningHash: string; worker: string }[] = [];
    const dEnd = Number(nextDecisionId) - 1;
    for (let i = dEnd; i >= 1 && decisions.length < limit; i--) {
      const d = await pub.readContract({ address: dlog, abi: ABI.dlog, functionName: 'decisions', args: [BigInt(i)] });
      decisions.push({
        taskId: d[1],
        kind: d[2],
        confidenceBps: d[3],
        thresholdBps: d[4],
        reasoningHash: d[5],
        worker: d[6],
      });
    }

    // 任务状态缓存（显式类型，避免自引用推断）
    interface TaskView {
      poster: string;
      bounty: bigint;
      postedAt: bigint;
      hired: string;
      settled: boolean;
    }
    const taskCache = new Map<number, TaskView>();
    async function getTask(id: number): Promise<TaskView> {
      const hit = taskCache.get(id);
      if (hit) return hit;
      const t = await pub.readContract({ address: board, abi: ABI.board, functionName: 'tasks', args: [BigInt(id)] });
      const hiredAddr = t[5];
      const settled = hiredAddr !== ZERO
        ? await pub.readContract({ address: exec, abi: ABI.exec, functionName: 'settled', args: [BigInt(id)] }).catch(() => false)
        : false;
      const v: TaskView = { poster: t[0], bounty: t[1], postedAt: t[3], hired: hiredAddr, settled };
      taskCache.set(id, v);
      return v;
    }

    const rows: FeedRow[] = [];
    const verdicts = await fetchVerdictTxs();
    for (const d of decisions) {
      const taskId = Number(d.taskId);
      const t = await getTask(taskId);
      const bounty = Number(formatUnits(t.bounty, 6));
      const model = modelForTask(taskId, d.worker, seats);
      const when = Number(t.postedAt) > 0
        ? new Date(Number(t.postedAt) * 1000).toISOString().slice(5, 16).replace('T', ' ')
        : `task #${taskId}`;
      const conf = `${Math.round(d.confidenceBps / 100)}% ≥ ${Math.round(d.thresholdBps / 100)}%`;
      const accepted = t.settled && d.confidenceBps >= d.thresholdBps;
      const kindText = d.kind === 2 ? 'grade · task' : d.kind === 1 ? 'hire · task' : 'refund · task';

      rows.push({
        t: when,
        m: model.toUpperCase(),
        text: `${kindText} #${taskId} · reasoning ${'0x' + d.reasoningHash.slice(2, 12)}…`,
        c: conf,
        tag: accepted ? 'paid' : 'ref',
        tagText: t.settled ? (accepted ? `PAID ${bounty.toFixed(2)} USDG` : 'REFUNDED') : 'OPEN · HIRED',
        link: `/reasoning#task-${taskId}`, // 思考全文 + 全部交易链接
        recordTx: verdicts.get(taskId)?.tx,
        block: verdicts.get(taskId)?.block,
        live: true,
      });
    }

    // 尚无决策的进行中任务（最新在前）
    const tEnd = Number(nextTaskId) - 1;
    const decisionTasks = new Set(decisions.map((d) => Number(d.taskId)));
    for (let i = tEnd; i >= 1 && rows.length < limit; i--) {
      if (decisionTasks.has(i)) continue;
      const t = await getTask(i);
      if (t.settled) continue;
      const bounty = Number(formatUnits(t.bounty, 6));
      const model = t.hired !== ZERO ? modelForTask(i, t.hired, seats) : '—';
      const when = Number(t.postedAt) > 0 ? new Date(Number(t.postedAt) * 1000).toISOString().slice(5, 16).replace('T', ' ') : '';
      rows.push({
        t: when,
        m: model.toUpperCase(),
        text: `posted task #${i} · bounty ${bounty.toFixed(2)} USDG${t.hired !== ZERO ? ' · hired, awaiting grade' : ' · bidding'}`,
        c: '—',
        tag: 'ref',
        tagText: t.hired !== ZERO ? 'OPEN · HIRED' : 'OPEN',
        link: `${SCAN}/address/${board}`,
        live: true,
      });
    }
    return rows;
  } catch (e) {
    console.error('[onchain-feed] rows fail:', (e as Error)?.message?.slice(0, 140) ?? e);
    return []; // RPC 异常 → 页面示例回落
  }
}

// ── 任务列表（/tasks）：链上任务 + 对应判决 ──
export interface TaskRow {
  id: string;
  bounty: string;      // "1.00 USDG"
  brief: string;       // 全文（来自 post 交易 calldata，哈希校验后展示）
  poster: string;
  deadlineSec: number | null;
  postedAt: string;    // UTC 短时间
  status: 'open' | 'hired' | 'paid' | 'refunded' | 'closed';
  worker: string;      // 席位名或 —
  link: string;
}

export async function fetchOnchainTasks(limit = 20): Promise<TaskRow[]> {
  try {
    const board = SUITE[0].addr as `0x${string}`;
    const dlog = SUITE[1].addr as `0x${string}`;
    const exec = SUITE[3].addr as `0x${string}`;
    const ZERO = '0x0000000000000000000000000000000000000000';
    const briefs = await fetchBriefs();

    const [nextTaskId, nextDecisionId, seats] = await Promise.all([
      pub.readContract({ address: board, abi: ABI.board, functionName: 'nextTaskId' }),
      pub.readContract({ address: dlog, abi: ABI.dlog, functionName: 'nextId' }),
      seatByWorker(),
    ]);

    // 判决按 taskId 归集（同一任务可能多条记录，取最后一条 kind=2 评级）
    const verdict = new Map<number, { confidenceBps: number; thresholdBps: number }>();
    for (let i = Number(nextDecisionId) - 1; i >= 1; i--) {
      const d = await pub.readContract({ address: dlog, abi: ABI.dlog, functionName: 'decisions', args: [BigInt(i)] });
      const tid = Number(d[1]);
      if (!verdict.has(tid) && d[2] === 2) verdict.set(tid, { confidenceBps: d[3], thresholdBps: d[4] });
    }

    const rows: TaskRow[] = [];
    const end = Number(nextTaskId) - 1;
    for (let i = end; i >= 1 && rows.length < limit; i--) {
      const t = await pub.readContract({ address: board, abi: ABI.board, functionName: 'tasks', args: [BigInt(i)] });
      const hired = t[5] as string;
      const closed = t[6] as boolean; // 全额派发完成（退款或付清）
      const settled = hired !== ZERO
        ? await pub.readContract({ address: exec, abi: ABI.exec, functionName: 'settled', args: [BigInt(i)] }).catch(() => false)
        : false;
      const v = verdict.get(i);
      let status: TaskRow['status'] = 'open';
      if (v) status = settled && closed ? (v.confidenceBps >= v.thresholdBps ? 'paid' : 'refunded') : 'closed';
      else if (settled || closed) status = 'closed';
      else if (hired !== ZERO) status = 'hired';

      rows.push({
        id: `#${i}`,
        bounty: `${Number(formatUnits(t[1] as bigint, 6)).toFixed(2)} USDG`,
        brief: briefs.get(i)?.brief ?? `hash 0x${(t[2] as string).slice(2, 8)}…`,
        poster: String(t[0]),
        deadlineSec: Number(t[4]) > 0 ? Number(t[4]) : null,
        postedAt: Number(t[3]) > 0 ? new Date(Number(t[3]) * 1000).toISOString().slice(5, 16).replace('T', ' ') : '—',
        status,
        worker: hired !== ZERO ? modelForTask(i, hired, seats) : '—',
        link: `${SCAN}/address/${board}`,
      });
    }
    return rows;
  } catch (e) {
    console.error('[onchain-feed] tasks fail:', (e as Error)?.message?.slice(0, 140) ?? e);
    return [];
  }
}

// ── 链上元信息（首页 MetaRail）：最新块高 + 最近一次评级置信度 ──
export interface ChainMeta {
  block: string;       // "1,234,567"
  confidence: string;  // "100%"
  lastAt: string | null;
}

export async function fetchChainMeta(): Promise<ChainMeta | null> {
  try {
    const dlog = SUITE[1].addr as `0x${string}`;
    const [block, nextDecisionId] = await Promise.all([
      pub.getBlockNumber(),
      pub.readContract({ address: dlog, abi: ABI.dlog, functionName: 'nextId' }),
    ]);
    let confidence = '—';
    let lastAt: string | null = null;
    if (Number(nextDecisionId) > 1) {
      const d = await pub.readContract({ address: dlog, abi: ABI.dlog, functionName: 'decisions', args: [BigInt(Number(nextDecisionId) - 1)] });
      confidence = `${Math.round(d[3] / 100)}%`;
      // postedAt 由调用方页面另取；这里只带决策侧信息
    }
    return { block: Number(block).toLocaleString('en-US'), confidence, lastAt };
  } catch {
    return null;
  }
}

// ── 席位战绩（/models）：已接受任务数 + 累计赏金（链上真实） ──
export interface SeatStat {
  model: string;
  accepted: number;
  earnedUsdg: number;
}

export async function fetchSeatStats(limit = 100): Promise<Map<string, SeatStat>> {
  const out = new Map<string, SeatStat>();
  try {
    const board = SUITE[0].addr as `0x${string}`;
    const dlog = SUITE[1].addr as `0x${string}`;
    const exec = SUITE[3].addr as `0x${string}`;

    const [nextDecisionId, seats] = await Promise.all([
      pub.readContract({ address: dlog, abi: ABI.dlog, functionName: 'nextId' }),
      seatByWorker(),
    ]);
    const taskBounty = new Map<number, bigint>();
    const end = Number(nextDecisionId) - 1;
    for (let i = end; i >= 1 && end - i < limit; i--) {
      const d = await pub.readContract({ address: dlog, abi: ABI.dlog, functionName: 'decisions', args: [BigInt(i)] });
      if (d[2] !== 2) continue;
      const taskId = Number(d[1]);
      const settled = await pub.readContract({ address: exec, abi: ABI.exec, functionName: 'settled', args: [BigInt(taskId)] }).catch(() => false);
      if (!settled || d[3] < d[4]) continue;
      const model = seats.get(String(d[6]).toLowerCase());
      if (!model) continue;
      let bounty = taskBounty.get(taskId);
      if (bounty === undefined) {
        const t = await pub.readContract({ address: board, abi: ABI.board, functionName: 'tasks', args: [BigInt(taskId)] });
        bounty = t[1] as bigint;
        taskBounty.set(taskId, bounty);
      }
      const cur = out.get(model) ?? { model, accepted: 0, earnedUsdg: 0 };
      cur.accepted += 1;
      cur.earnedUsdg += Number(formatUnits(bounty, 6));
      out.set(model, cur);
    }
  } catch { /* RPC 失败 → 空统计，页面显示 0 */ }
  return out;
}


// ── brief 全文（post 交易 calldata 解码，60s 缓存）──
export interface BriefEntry { brief: string; tx: string; }

let briefCache: { at: number; map: Map<number, BriefEntry> } | null = null;

export async function fetchBriefs(): Promise<Map<number, BriefEntry>> {
  if (briefCache && Date.now() - briefCache.at < 60_000) return briefCache.map;
  const map = new Map<number, BriefEntry>();
  try {
    const board = SUITE[0].addr as `0x${string}`;
    const latest = await pub.getBlockNumber();
    const from = latest > 5_000_000n ? latest - 5_000_000n : 0n; // 全量范围会被公共 RPC 拒
    const logs = await pub.getLogs({ address: board, event: POSTED_EVENT, fromBlock: from, toBlock: 'latest' });
    for (const ev of logs.slice(-50)) {
      try {
        const tx = await pub.getTransaction({ hash: ev.transactionHash });
        const dec = decodeFunctionData({ abi: parseAbi(['function post(string brief, uint96 bounty)']), data: tx.input });
        const args = ev.args as unknown as { taskId: bigint; poster: string };
        map.set(Number(args.taskId), { brief: String(dec.args[0] ?? '').slice(0, 300), tx: ev.transactionHash });
      } catch { /* 单条解码失败忽略 */ }
    }
    briefCache = { at: Date.now(), map };
  } catch (e) {
    console.error('[onchain-feed] briefs getLogs fail:', (e as Error)?.message?.slice(0, 160) ?? e);
  }
  return map;
}


// ── 判决交易定位（DecisionRecorded getLogs，60s 缓存）──
export interface VerdictTx { tx: string; block: number; }

let verdictCache: { at: number; map: Map<number, VerdictTx> } | null = null;

export async function fetchVerdictTxs(): Promise<Map<number, VerdictTx>> {
  if (verdictCache && Date.now() - verdictCache.at < 60_000) return verdictCache.map;
  const map = new Map<number, VerdictTx>();
  try {
    const dlog = SUITE[1].addr as `0x${string}`;
    const latest = await pub.getBlockNumber();
    const from = latest > 5_000_000n ? latest - 5_000_000n : 0n;
    const logs = await pub.getLogs({ address: dlog, event: DECIDED_EVENT, fromBlock: from, toBlock: 'latest' });
    for (const ev of logs.slice(-100)) {
      try {
        const args = ev.args as unknown as { id: bigint; taskId: bigint };
        map.set(Number(args.taskId), { tx: ev.transactionHash, block: Number(ev.blockNumber) });
      } catch { /* 单条失败忽略 */ }
    }
    verdictCache = { at: Date.now(), map };
  } catch (e) {
    console.error('[onchain-feed] verdict getLogs fail:', (e as Error)?.message?.slice(0, 160) ?? e);
  }
  return map;
}
