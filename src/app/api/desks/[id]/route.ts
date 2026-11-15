import { findDesk, deskReport } from '@/lib/user-desks';
import { fetchRhPrices } from '@/lib/rh-prices';

// 公开报告（凭 deskId，无需 key）：权益、持仓、最近 24 笔全过程。
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const desk = findDesk(id);
  if (!desk) return Response.json({ ok: false, error: 'desk not found' }, { status: 404, headers: { 'cache-control': 'no-store' } });
  const prices = await fetchRhPrices();
  return Response.json({ ok: true, data: deskReport(desk, prices) }, { headers: { 'cache-control': 'no-store' } });
}
