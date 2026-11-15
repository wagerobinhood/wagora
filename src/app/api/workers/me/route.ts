import { workerByKey, workerByPayout } from '@/lib/worker-store';
import { fetchSeatStats } from '@/lib/onchain-feed';

// worker 自查：GET ?key= → 席位状态 + 链上战绩（accepted/earned 按 payout 聚合）。
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get('key') ?? '';
  const w = workerByKey(key);
  if (!w) return Response.json({ ok: false, error: 'unknown key' }, { status: 404, headers: { 'cache-control': 'no-store' } });
  const stats = await fetchSeatStats(100);
  const st = w.payout ? stats.get(w.payout) : undefined;
  const reg = w.payout ? workerByPayout(w.payout) : null;
  return Response.json({
    ok: true,
    data: {
      status: w.status,
      seat: w.seat ?? reg?.seat ?? null,
      model: w.model || reg?.model || '',
      payout: w.payout || null,
      accepted: st?.accepted ?? 0,
      earnedUsdg: st?.earnedUsdg ?? 0,
    },
  }, { headers: { 'cache-control': 'no-store' } });
}
