import { appendClaim } from '@/lib/worker-store';

// 抢单：POST {task_id, key} → 排队，engine 60s 内链上 hire（先到先得）。
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { task_id?: number; key?: string } = {};
  try { body = await req.json(); } catch { /* fallthrough */ }
  const taskId = Number(body?.task_id);
  if (!Number.isInteger(taskId) || taskId <= 0) return Response.json({ ok: false, error: 'task_id required' }, { status: 400, headers: { 'cache-control': 'no-store' } });
  const r = appendClaim(taskId, String(body?.key ?? ''));
  if ('error' in r) return Response.json({ ok: false, error: r.error }, { status: 409, headers: { 'cache-control': 'no-store' } });
  return Response.json({ ok: true, taskId, note: 'Claim queued — the engine hires on-chain within a minute, then you have 15 minutes to submit via /api/workers/submit.' }, { headers: { 'cache-control': 'no-store' } });
}
