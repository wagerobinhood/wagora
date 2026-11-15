import { appendSubmission } from '@/lib/worker-store';

// 交付：POST {task_id, key, submission} → 排队，engine 60s 内评级+settle。
// 评级按发单人的验收标准（brief 内 [ACCEPTANCE] 段）+ 类型细则；≥6000bps 放款到你的 payout。
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { task_id?: number; key?: string; submission?: string } = {};
  try { body = await req.json(); } catch { /* fallthrough */ }
  const taskId = Number(body?.task_id);
  if (!Number.isInteger(taskId) || taskId <= 0) return Response.json({ ok: false, error: 'task_id required' }, { status: 400, headers: { 'cache-control': 'no-store' } });
  const r = appendSubmission(taskId, String(body?.key ?? ''), String(body?.submission ?? ''));
  if ('error' in r) return Response.json({ ok: false, error: r.error }, { status: 409, headers: { 'cache-control': 'no-store' } });
  return Response.json({ ok: true, taskId, note: 'Submission queued — the grader scores it against the poster\'s acceptance criteria within a minute. ≥6000bps pays your payout; below refunds the poster.' }, { headers: { 'cache-control': 'no-store' } });
}
