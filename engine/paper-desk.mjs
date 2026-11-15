// Wage · 纸面交易台（RH 版）—— 模型真决策 + 真实 RH 股票池价标记 + 零资金
// 诚实边界：不发真实交易、不持有资产、不产生任何收益承诺。
// 价格源：RH 链公共池 slot0 直读（与 premium 板同一实现，已验证 7/7）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callModel } from './llm.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(here, 'state');
const LEDGER = path.join(STATE_DIR, 'paper-desks.json');

const RPC = 'https://rpc.mainnet.chain.robinhood.com';

// RH 股票代币池（h2-precheck 实测；token0 是否为 USDG 决定换算方向）
export const ASSETS = [
  { sym: 'NVDA',  addr: '0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3', zeroIsUsdg: true },
  { sym: 'SPY',   addr: '0xa7Bb1AC63BBaB0C44316E6c8C455213441689167', zeroIsUsdg: false },
  { sym: 'AAPL',  addr: '0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D', zeroIsUsdg: true },
  { sym: 'TSLA',  addr: '0xf4ACdAEEB7022862A763C9B1B885e11191c889E3', zeroIsUsdg: false },
  { sym: 'GOOGL', addr: '0x34D0dC122CF9A8Eb296fC5e0D3A233625D7d19b7', zeroIsUsdg: false },
  { sym: 'META',  addr: '0x107a7Cb40d8665360ba10E59471Af06150A50922', zeroIsUsdg: true },
  { sym: 'MSFT',  addr: '0xeb60bCD1D920ad6E102690CCFC6fB488899E1510', zeroIsUsdg: true },
];

async function slot0(addr) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: addr, data: '0x3850c7bd' }, 'latest'] }) });
  const j = await r.json();
  if (!j.result) throw new Error('rpc');
  return BigInt(j.result.slice(0, 66));
}

/** 真实市场价（RH 池 slot0 直读，USDG 计价 → USD）。失败返回 null —— 绝不编价。 */
export async function fetchPrices() {
  const out = {};
  for (const p of ASSETS) {
    try {
      const sq = await slot0(p.addr);
      const ratio = Number(sq) / 2 ** 96;
      const raw = ratio * ratio;
      const usdg = p.zeroIsUsdg ? 1e12 / raw : raw * 1e12; // USDG(6) per whole token
      out[p.sym] = { price: usdg, ts: Math.floor(Date.now() / 1000) };
    } catch { /* 单池失败跳过，不让一个池拖垮整轮 */ }
  }
  return Object.keys(out).length ? out : null;
}

const DECISION_SYSTEM =
  'You are a paper-trading desk in a demonstration market. You manage a SIMULATED portfolio; no real money and no real trades exist.\n' +
  'Tradables: NVDA, SPY, AAPL, TSLA, GOOGL, META, MSFT (Robinhood stock tokens).\n' +
  'Allowed actions: BUY, SELL, HOLD.\n' +
  'Reply with ONLY JSON: {"action":"BUY|SELL|HOLD","asset":"<symbol>","pct":<1-50>,"reason":"<=20 words"}\n' +
  'pct = percent of that desk\'s cash to spend (BUY) or of that holding to sell (SELL). HOLD: pct=0.';

export function parseDecision(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const action = String(j.action || '').toUpperCase();
    if (!['BUY', 'SELL', 'HOLD'].includes(action)) return null;
    const asset = String(j.asset || '').toUpperCase();
    if (action !== 'HOLD' && !ASSETS.some((a) => a.sym === asset)) return null;
    let pct = Number(j.pct);
    if (!Number.isFinite(pct)) pct = 0;
    pct = Math.max(0, Math.min(50, Math.floor(pct)));
    return { action, asset: action === 'HOLD' ? null : asset, pct, reason: String(j.reason || '').slice(0, 120) };
  } catch { return null; }
}

export function loadLedger() {
  if (!fs.existsSync(LEDGER)) {
    return {
      kind: 'PAPER',
      chain: 'Robinhood Chain',
      disclaimer: 'Simulated desk. No capital at risk. No real trades. Not investment advice.',
      seats: [
        { role: 'worker', model: 'grok-4.7', cash: 100, holdings: {} },
        { role: 'worker2', model: 'gpt-6.1-sol', cash: 100, holdings: {} },
      ],
      rounds: [],
    };
  }
  return JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
}

export function saveLedger(l) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(l, null, 2));
}

const FEE_BPS = 30;

export function equity(seat, prices) {
  let v = seat.cash;
  for (const [sym, qty] of Object.entries(seat.holdings)) {
    const p = prices[sym]?.price;
    if (typeof p === 'number') v += qty * p;
  }
  return v;
}

export async function runRound({ prices } = {}) {
  const p = prices ?? (await fetchPrices());
  if (!p) return { ok: false, error: 'price feed unavailable — round skipped (never invent prices)' };

  const ledger = loadLedger();
  const round = { at: new Date().toISOString(), chain: 'Robinhood Chain', prices: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.price])), decisions: [] };

  for (const seat of ledger.seats) {
    const before = equity(seat, p);
    const brief =
      `Prices (USDG): ${Object.entries(p).map(([k, v]) => k + ' $' + v.price.toFixed(2)).join(', ')}.\n` +
      `Your desk: cash $${seat.cash.toFixed(2)} USDG; holdings ${JSON.stringify(seat.holdings)}; equity $${before.toFixed(2)}.\n` +
      `Decide one action now.`;

    const res = await callModel(seat.role, [
      { role: 'system', content: DECISION_SYSTEM },
      { role: 'user', content: brief },
    ], { maxTokens: 220, temperature: 0.3 });

    const d = res.ok ? parseDecision(res.content) : null;
    const rec = { model: seat.model, ok: !!d, raw: res.ok ? String(res.content).slice(0, 200) : res.error, equityBefore: +before.toFixed(4) };

    if (d) {
      const price = d.asset ? p[d.asset]?.price : null;
      if (d.action === 'BUY' && price) {
        const spend = seat.cash * (d.pct / 100);
        const fee = spend * (FEE_BPS / 10000);
        const got = (spend - fee) / price;
        seat.cash -= spend;
        seat.holdings[d.asset] = (seat.holdings[d.asset] || 0) + got;
        rec.executed = { action: 'BUY', asset: d.asset, spendUsdg: +spend.toFixed(4), feeUsdg: +fee.toFixed(4), qty: +got.toFixed(8), price };
      } else if (d.action === 'SELL' && price) {
        const held = seat.holdings[d.asset] || 0;
        const qty = held * (d.pct / 100);
        const gross = qty * price;
        const fee = gross * (FEE_BPS / 10000);
        seat.cash += gross - fee;
        seat.holdings[d.asset] = +(held - qty).toFixed(10);
        if (seat.holdings[d.asset] <= 0) delete seat.holdings[d.asset];
        rec.executed = { action: 'SELL', asset: d.asset, qty: +qty.toFixed(8), grossUsdg: +gross.toFixed(4), feeUsdg: +fee.toFixed(4), price };
      } else {
        rec.executed = { action: 'HOLD' };
      }
      rec.reason = d.reason;
    }
    rec.equityAfter = +equity(seat, p).toFixed(4);
    round.decisions.push(rec);
  }

  round.hash = '0x' + (await import('node:crypto')).createHash('sha256').update(JSON.stringify(round.decisions)).digest('hex');
  round.totalEquity = +ledger.seats.reduce((s, x) => s + equity(x, p), 0).toFixed(4);
  ledger.totalRounds = (ledger.totalRounds || 0) + 1;
  ledger.rounds.push(round);
  const MAX_STORED_ROUNDS = 500; // 存储封顶：真实总数在 totalRounds，文件不无限膨胀
  if (ledger.rounds.length > MAX_STORED_ROUNDS) ledger.rounds = ledger.rounds.slice(-MAX_STORED_ROUNDS);
  saveLedger(ledger);
  return { ok: true, round, ledger };
}
