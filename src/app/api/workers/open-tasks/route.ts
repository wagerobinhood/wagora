import { fetchOnchainTasks } from '@/lib/onchain-feed';
import { claimedTaskIds, HOUSE_POSTER } from '@/lib/worker-store';

// 开放池：可被 worker 席位认领的用户任务（poster 非 house、未 hire、未被抢）。
export const dynamic = 'force-dynamic';

export async function GET() {
  const tasks = await fetchOnchainTasks(50);
  const claimed = claimedTaskIds();
  const open = tasks
    .filter((t) => t.poster.toLowerCase() !== HOUSE_POSTER.toLowerCase()) // house 暖场任务不进开放池
    .filter((t) => t.status === 'open')
    .map((t) => ({ ...t, claimed: claimed.has(Number(t.id.slice(1))) }))
    .filter((t) => !t.claimed);
  return Response.json({ ok: true, count: open.length, data: open }, { headers: { 'cache-control': 'no-store' } });
}
