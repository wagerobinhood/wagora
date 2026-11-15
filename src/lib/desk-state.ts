import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

// 引擎台账直读：desk-loop（与 web 同卷）每小时写 engine/state/paper-desks.json。
// 读不到/不合法 → null，页面走示例回落 —— 绝不编造数据。

export interface DeskSeat {
  role: string;
  model: string;
  cash: number;
  equity: number | null;
  positions: Record<string, number>;
}

export interface DeskDecision {
  model: string;
  ok: boolean;
  action: string | null;
  asset: string | null;
  pct: number | null;
  reason: string | null;
  error: string | null;
  equityAfter: number | null;
  // 成交明细（BUY: spend/qty；SELL: gross/qty；HOLD 为空）
  spendUsdg?: number | null;
  grossUsdg?: number | null;
  qty?: number | null;
  price?: number | null;
  feeUsdg?: number | null;
}

export interface DeskRound {
  at: string;
  hash: string | null;
  prices: Record<string, number>;
  decisions: DeskDecision[];
}

export interface DeskState {
  chain: string;
  disclaimer: string;
  updatedAt: string | null;
  openedAt: string | null;
  rounds: number;
  lastHash: string | null;
  seats: DeskSeat[];
  lastRound: DeskRound | null;
  recentRounds: DeskRound[]; // 最近 24 轮（最新在后）
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toState(l: Record<string, unknown>): DeskState | null {
  const seatsRaw = Array.isArray(l.seats) ? l.seats : [];
  const roundsRaw = Array.isArray(l.rounds) ? l.rounds : [];
  if (l.kind !== 'PAPER' || seatsRaw.length === 0) return null;

  const last = roundsRaw.length ? (roundsRaw[roundsRaw.length - 1] as Record<string, unknown>) : null;
  const first = roundsRaw.length ? (roundsRaw[0] as Record<string, unknown>) : null;
  const lastDecisions = Array.isArray(last?.decisions) ? (last!.decisions as Record<string, unknown>[]) : [];

  return {
    chain: typeof l.chain === 'string' ? l.chain : '',
    disclaimer: typeof l.disclaimer === 'string' ? l.disclaimer : '',
    updatedAt: typeof last?.at === 'string' ? last.at : null,
    openedAt: typeof first?.at === 'string' ? first.at : null,
    rounds: num(l.totalRounds) ?? roundsRaw.length,
    lastHash: typeof last?.hash === 'string' ? last.hash : null,
    seats: seatsRaw.map((s) => {
      const seat = s as Record<string, unknown>;
      const model = typeof seat.model === 'string' ? seat.model : 'unknown';
      const dec = lastDecisions.find((d) => d.model === model);
      const positions: Record<string, number> = {};
      const holdings = (seat.holdings ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(holdings)) {
        const q = num(v);
        if (q !== null && q > 0) positions[k] = q;
      }
      return {
        role: typeof seat.role === 'string' ? seat.role : '',
        model,
        cash: num(seat.cash) ?? 0,
        equity: num(dec?.equityAfter),
        positions,
      };
    }),
    lastRound:
      last && typeof last.at === 'string'
        ? {
            at: last.at,
            hash: typeof last.hash === 'string' ? last.hash : '',
            prices: Object.fromEntries(
              Object.entries((last.prices ?? {}) as Record<string, unknown>)
                .map(([k, v]) => [k, num(v)])
                .filter((x): x is [string, number] => x[1] !== null),
            ),
            decisions: lastDecisions.map(parseDecision),
          }
        : null,
    recentRounds: roundsRaw
      .slice(-120)
      .filter((r) => r && typeof (r as Record<string, unknown>).at === 'string')
      .map((r) => {
        const round = r as Record<string, unknown>;
        const decs = Array.isArray(round.decisions) ? (round.decisions as Record<string, unknown>[]) : [];
        return {
          at: String(round.at),
          hash: typeof round.hash === 'string' ? round.hash : null,
          prices: Object.fromEntries(
            Object.entries((round.prices ?? {}) as Record<string, unknown>)
              .map(([k, v]) => [k, num(v)])
              .filter((x): x is [string, number] => x[1] !== null),
          ),
          decisions: decs.map(parseDecision),
        };
      }),
  };
}

function parseDecision(d: Record<string, unknown>): DeskDecision {
  const ex = (d.executed ?? {}) as Record<string, unknown>;
  return {
    model: typeof d.model === 'string' ? d.model : 'unknown',
    ok: d.ok === true,
    action: typeof ex.action === 'string' ? ex.action : null,
    asset: typeof ex.asset === 'string' ? ex.asset : null,
    pct: num(ex.pct),
    reason: typeof d.reason === 'string' ? d.reason : null,
    error: d.ok ? null : String(d.raw ?? '').slice(0, 120),
    equityAfter: num(d.equityAfter),
    spendUsdg: num(ex.spendUsdg),
    grossUsdg: num(ex.grossUsdg),
    qty: num(ex.qty),
    price: num(ex.price),
    feeUsdg: num(ex.feeUsdg),
  };
}

export function readDeskState(): DeskState | null {
  const dir = process.env.ENGINE_STATE_DIR || 'engine/state';
  try {
    const raw = fs.readFileSync(path.join(dir, 'paper-desks.json'), 'utf8');
    return toState(JSON.parse(raw));
  } catch {
    return null; // 文件缺失/损坏 → 示例回落
  }
}
