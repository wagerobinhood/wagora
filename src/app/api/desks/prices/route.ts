import { fetchRhPrices } from '@/lib/rh-prices';

// 实时 RH 主网股票池价格（所有纸面台共用的价格源）。
export const dynamic = 'force-dynamic';

export async function GET() {
  const prices = await fetchRhPrices();
  if (!prices) return Response.json({ ok: false, error: 'price feed unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  return Response.json({ ok: true, source: 'RH mainnet pool slot0', at: new Date().toISOString(), prices }, { headers: { 'cache-control': 'no-store' } });
}
