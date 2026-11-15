import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// worker 协议的站点侧存储：inbox JSONL 只追加（web 写），engine 60s 消费并写 state（engine 权威）。
// 共享卷 ENGINE_STATE_DIR；HOUSE 任务不进开放池。

export const HOUSE_POSTER = '0x50eb0935B4c3695f762763826db19ecd24b35bc1';

export interface WorkerRecord {
  at: string;
  model: string;
  payout: string;
  key: string;
}

export interface WorkerStatus {
  status: 'active' | 'pending' | 'waitlist';
  seat?: number;
  model?: string;
  payout?: string;
  activatedAt?: string;
  note?: string;
}

const dir = () => process.env.ENGINE_STATE_DIR || 'engine/state';
const inbox = (name: string) => path.join(dir(), name);
const state = (name: string) => path.join(dir(), name);

function readLines(p: string): Record<string, unknown>[] {
  try {
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as Record<string, unknown>[];
  } catch { return []; }
}
function readJson(p: string): Record<string, unknown> | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function appendLine(p: string, obj: unknown): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(obj) + '\n');
}

// ── 注册 ──
export function registerWorker(model: string, payout: string): { key: string; status: WorkerStatus['status'] } | { error: string } {
  const m = String(model || '').trim();
  const addr = String(payout || '').trim();
  if (!m || Buffer.byteLength(m, 'utf8') > 32) return { error: 'model name required (≤32 bytes)' };
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return { error: 'payout must be a 0x address' };
  const regState = readJson(state('worker-seats-state.json')) as { workers?: Record<string, WorkerStatus & { payout?: string }> } | null;
  const workers = regState?.workers ?? {};
  if (Object.values(workers).some((w) => (w.payout ?? '').toLowerCase() === addr.toLowerCase())) return { error: 'this payout already registered' };
  const key = 'wk_' + crypto.randomBytes(24).toString('base64url');
  appendLine(inbox('worker-registrations.inbox.jsonl'), { at: new Date().toISOString(), model: m, payout: addr, key });
  // engine state 未同步（≤60s）→ 先报 pending
  return { key, status: 'pending' };
}

export function workerByKey(key: string): { payout: string; model: string; status: WorkerStatus['status']; seat?: number } | null {
  const regState = readJson(state('worker-seats-state.json')) as { workers?: Record<string, WorkerStatus & { payout?: string; key?: string }> } | null;
  const workers = regState?.workers ?? {};
  for (const w of Object.values(workers)) {
    if (w.key === key) return { payout: String(w.payout ?? ''), model: String(w.model ?? ''), status: (w.status as WorkerStatus['status']) ?? 'pending', seat: w.seat };
  }
  // state 未同步 → 查 inbox（pending）
  const inInbox = readLines(inbox('worker-registrations.inbox.jsonl')).some((r) => r.key === key);
  return inInbox ? { payout: '', model: '', status: 'pending' } : null;
}

export function workerByPayout(payout: string): (WorkerStatus & { model?: string }) | null {
  const regState = readJson(state('worker-seats-state.json')) as { workers?: Record<string, WorkerStatus & { payout?: string }> } | null;
  const workers = regState?.workers ?? {};
  return Object.values(workers).find((w) => (w.payout ?? '').toLowerCase() === payout.toLowerCase()) ?? null;
}

// ── 开放池 ──
export interface OpenTask { id: number; bounty: string; brief: string; postedAt: string; claimed: boolean; }

export function claimedTaskIds(): Set<number> {
  const ids = new Set<number>();
  for (const c of readLines(inbox('task-claims.inbox.jsonl'))) ids.add(Number(c.taskId));
  return ids;
}

export function appendClaim(taskId: number, key: string): { ok: true } | { error: string } {
  const w = workerByKey(key);
  if (!w) return { error: 'unknown worker key' };
  if (w.status !== 'active') return { error: 'worker seat not active yet (engine assigns seats every minute)' };
  if (claimedTaskIds().has(taskId)) return { error: 'task already claimed' };
  appendLine(inbox('task-claims.inbox.jsonl'), { at: new Date().toISOString(), taskId, payout: w.payout, model: w.model });
  return { ok: true };
}

export function appendSubmission(taskId: number, key: string, submission: string): { ok: true } | { error: string } {
  const w = workerByKey(key);
  if (!w) return { error: 'unknown worker key' };
  if (w.status !== 'active') return { error: 'worker seat not active' };
  const text = String(submission || '').trim();
  if (!text) return { error: 'empty submission' };
  // 必须是该任务的已 hire claimant（claims inbox/state 校验）
  const hiredToMe = readLines(inbox('task-claims.inbox.jsonl')).some((c) => Number(c.taskId) === taskId && String(c.payout).toLowerCase() === w.payout.toLowerCase());
  if (!hiredToMe) return { error: 'your seat did not claim this task' };
  appendLine(inbox('task-submissions.inbox.jsonl'), { at: new Date().toISOString(), taskId, payout: w.payout, model: w.model, submission: text.slice(0, 4000) });
  return { ok: true };
}
