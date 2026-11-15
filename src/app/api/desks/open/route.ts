import { openDesk } from '@/lib/user-desks';

// 开户：POST {name} → {deskId, key, reportUrl}
// key 只返回这一次（下单凭据）；报告凭 deskId 公开可读。
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: { name?: string } = {};
  try { body = await req.json(); } catch { /* 允许空体 */ }
  const r = openDesk(String(body?.name ?? ''));
  if ('error' in r) return Response.json({ ok: false, error: r.error }, { status: 503 });
  return Response.json({
    ok: true,
    deskId: r.desk.id,
    key: r.desk.key,
    reportUrl: `/api/desks/${r.desk.id}`,
    note: 'Virtual $100 USDG paper desk. Save the key — it signs your decisions. The report URL is public-readable.',
  }, { status: 201, headers: { 'cache-control': 'no-store' } });
}
