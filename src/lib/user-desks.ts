import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { RH_ASSETS, type PriceMap } from './rh-prices';

// 用户自建纸面交易台（Open Paper Desk）。
// 规则与 house 台一致：$100 虚拟 USDG 起步、30bps 手续费、单笔 ≤50%、仅 7 只 RH 股票代币。
// 存储：desk-state 共享卷 user-desks.json（web 进程独写；单进程串行写，够用）。
// 诚实边界：模拟执行、零资金；报告公开可读（凭 deskId），下单需 key。

const FEE_BPS = 30;
const START_CASH = 100;
const MAX_PCT = 50;
const MAX_DESKS = 200;
const MAX_ROUNDS_STORED = 200;

export interface DeskTrade {
  at: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  asset: string | null;
  pct: number | null;
  price: number | null;
  qty: number | null;
  amount: number | null;  // spend(BUY) / gross(SELL)
  fee: number | null;
  error?: string;
}

export interface DeskRound {
  at: string;
  prices: PriceMap;
  trade: DeskTrade;
  cash: number;
  holdings: Record<string, number>;
  equityAfter: number;
}

export interface Desk {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  cash: number;
  holdings: Record<string, number>;
  rounds: DeskRound[];
}

export interface DeskPublic {
  id: string;
  name: string;
  createdAt: string;
  cash: number;
  holdings: Record<string, number>;
  equity: number | null;
  rounds: number;
  recentRounds: DeskRound[];
  disclaimer: string;
}

const DISK_PATH = () => path.join(process.env.ENGINE_STATE_DIR || 'engine/state', 'user-desks.json');

function loadAll(): Desk[] {
  try {
    const raw = fs.readFileSync(DISK_PATH(), 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j.desks) ? (j.desks as Desk[]) : [];
  } catch {
    return [];
  }
}

function saveAll(desks: Desk[]): void {
  const dir = path.dirname(DISK_PATH());
  fs.mkdirSync(dir, { recursive: true });
  const tmp = DISK_PATH() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ kind: 'USER_DESKS', desks }, null, 1));
  fs.renameSync(tmp, DISK_PATH());
}

export function deskEquity(d: Desk, prices: PriceMap): number {
  let v = d.cash;
  for (const [sym, qty] of Object.entries(d.holdings)) {
    const p = prices[sym];
    if (typeof p === 'number') v += qty * p;
  }
  return v;
}

export function openDesk(name: string): { desk: Desk } | { error: string } {
  const clean = String(name || '').trim().slice(0, 40) || 'unnamed desk';
  const desks = loadAll();
  if (desks.length >= MAX_DESKS) return { error: 'desk capacity reached — try later' };
  const desk: Desk = {
    id: 'dk' + crypto.randomBytes(5).toString('hex'),
    key: 'wk_' + crypto.randomBytes(24).toString('base64url'),
    name: clean,
    createdAt: new Date().toISOString(),
    cash: START_CASH,
    holdings: {},
    rounds: [],
  };
  desks.push(desk);
  saveAll(desks);
  return { desk };
}

export function findDesk(id: string): Desk | null {
  return loadAll().find((d) => d.id === id) ?? null;
}

export function deskReport(d: Desk, prices: PriceMap | null): DeskPublic {
  const equity = prices ? deskEquity(d, prices) : null;
  return {
    id: d.id,
    name: d.name,
    createdAt: d.createdAt,
    cash: +d.cash.toFixed(4),
    holdings: Object.fromEntries(Object.entries(d.holdings).filter(([, q]) => q > 0).map(([k, q]) => [k, +q.toFixed(8)])),
    equity: equity !== null ? +equity.toFixed(4) : null,
    rounds: d.rounds.length,
    recentRounds: d.rounds.slice(-24),
    disclaimer: 'Simulated paper desk. No capital at risk. No real trades. Not investment advice.',
  };
}

export function applyDecision(d: Desk, prices: PriceMap, action: string, asset?: string, pct?: number): DeskTrade {
  const act = String(action || '').toUpperCase() as DeskTrade['action'];
  const mk = (t: DeskTrade): DeskTrade => {
    d.rounds.push({ at: t.at, prices, trade: t, cash: d.cash, holdings: { ...d.holdings }, equityAfter: deskEquity(d, prices) });
    if (d.rounds.length > MAX_ROUNDS_STORED) d.rounds = d.rounds.slice(-MAX_ROUNDS_STORED);
    return t;
  };
  const now = () => new Date().toISOString();

  if (!['BUY', 'SELL', 'HOLD'].includes(act)) return mk({ at: now(), action: 'HOLD', asset: null, pct: null, price: null, qty: null, amount: null, fee: null, error: `invalid action: ${String(action).slice(0, 20)}` });
  if (act === 'HOLD') return mk({ at: now(), action: 'HOLD', asset: null, pct: 0, price: null, qty: null, amount: null, fee: null });

  const sym = String(asset || '').toUpperCase();
  if (!RH_ASSETS.some((a) => a.sym === sym)) return mk({ at: now(), action: act, asset: sym || null, pct: pct ?? null, price: null, qty: null, amount: null, fee: null, error: 'unknown asset' });
  const price = prices[sym];
  if (typeof price !== 'number') return mk({ at: now(), action: act, asset: sym, pct: pct ?? null, price: null, qty: null, amount: null, fee: null, error: 'price unavailable for ' + sym });

  let p = Math.floor(Number(pct ?? 0));
  if (!Number.isFinite(p)) p = 0;
  p = Math.max(1, Math.min(MAX_PCT, p));

  if (act === 'BUY') {
    const spend = d.cash * (p / 100);
    if (spend < 0.01) return mk({ at: now(), action: act, asset: sym, pct: p, price, qty: 0, amount: 0, fee: 0, error: 'cash too low' });
    const fee = spend * (FEE_BPS / 10000);
    const qty = (spend - fee) / price;
    d.cash -= spend;
    d.holdings[sym] = (d.holdings[sym] || 0) + qty;
    return mk({ at: now(), action: act, asset: sym, pct: p, price, qty, amount: spend, fee });
  }
  // SELL
  const held = d.holdings[sym] || 0;
  if (held <= 0) return mk({ at: now(), action: act, asset: sym, pct: p, price, qty: 0, amount: 0, fee: 0, error: 'no position in ' + sym });
  const qty = held * (p / 100);
  const gross = qty * price;
  const fee = gross * (FEE_BPS / 10000);
  d.cash += gross - fee;
  const left = held - qty;
  if (left > 0) d.holdings[sym] = left; else delete d.holdings[sym];
  return mk({ at: now(), action: act, asset: sym, pct: p, price, qty, amount: gross, fee });
}

export function persistDesk(d: Desk): void {
  const desks = loadAll();
  const i = desks.findIndex((x) => x.id === d.id);
  if (i >= 0) desks[i] = d; else desks.push(d);
  saveAll(desks);
}
