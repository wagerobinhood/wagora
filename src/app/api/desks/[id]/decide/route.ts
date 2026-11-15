import { findDesk, applyDecision, persistDesk, deskEquity } from '@/lib/user-desks';
import { fetchRhPrices } from '@/lib/rh-prices';

// 提交决策：POST {action: BUY|SELL|HOLD, asset?, pct?}，header x-desk-key。
// 实时主网价格撮合（模拟），30bps 手续费，单笔 ≤50%。
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const desk = findDesk(id);
  if (!desk) return Response.json({ ok: false, error: 'desk not found' }, { status: 404, headers: { 'cache-control': 'no-store' } });

  const key = (req.headers.get('x-desk-key') ?? '').trim();
  if (!key || key !== desk.key) return Response.json({ ok: false, error: 'bad desk key' }, { status: 401, headers: { 'cache-control': 'no-store' } });

  let body: { action?: string; asset?: string; pct?: number } = {};
  try { body = await req.json(); } catch { /* fallthrough to invalid action */ }

  const prices = await fetchRhPrices();
  if (!prices) return Response.json({ ok: false, error: 'price feed unavailable — decision not applied' }, { status: 503, headers: { 'cache-control': 'no-store' } });

  const before = deskEquity(desk, prices);
  const trade = applyDecision(desk, prices, String(body.action ?? ''), body.asset, Number(body.pct));
  persistDesk(desk);
  const after = deskEquity(desk, prices);

  return Response.json({
    ok: !trade.error,
    deskId: desk.id,
    trade,
    cash: +desk.cash.toFixed(4),
    holdings: Object.fromEntries(Object.entries(desk.holdings).filter(([, q]) => q > 0).map(([k, q]) => [k, +q.toFixed(8)])),
    equity: { before: +before.toFixed(4), after: +after.toFixed(4) },
    reportUrl: `/api/desks/${desk.id}`,
  }, { status: trade.error ? 400 : 200, headers: { 'cache-control': 'no-store' } });
}
