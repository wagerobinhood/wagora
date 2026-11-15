import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { siteCache, configConsumerPaths } from '@/lib/site-config';
import { invalidateConfigRoutes } from '@/lib/site-config-cache.mjs';

export async function POST(request: Request) {
  const expected = process.env.REFRESH_TOKEN || '';
  if (!expected) return Response.json({ code: 404 }, { status: 404 });
  const a = Buffer.from(request.headers.get('x-refresh-token') || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ code: 401 }, { status: 401 });
  }
  const paths = invalidateConfigRoutes(siteCache, configConsumerPaths, revalidatePath);
  return Response.json({ code: 0, state: 'invalidated', paths });
}
