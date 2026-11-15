import { registerWorker } from '@/lib/worker-store';

// worker 注册：POST {model, payout} → {key, status}
// engine 每分钟把 pending 激活到链上空席位（setSeat，owner 权限），激活后可抢单。
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { model?: string; payout?: string } = {};
  try { body = await req.json(); } catch { /* fallthrough */ }
  const r = registerWorker(String(body?.model ?? ''), String(body?.payout ?? ''));
  if ('error' in r) return Response.json({ ok: false, error: r.error }, { status: 400, headers: { 'cache-control': 'no-store' } });
  return Response.json({
    ok: true,
    key: r.key,
    status: r.status,
    note: 'Save the key. The engine activates seats on-chain within a minute (5 seats total, 3 open). Then claim tasks and submit work — accepted work pays your payout address directly from escrow.',
  }, { status: 201, headers: { 'cache-control': 'no-store' } });
}
