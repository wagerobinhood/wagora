import 'server-only';
import { createSiteConfigCache } from './site-config-cache.mjs';
import { fetchOnceAndValidate, emptyConfig } from './site-config-adapter';
import { site } from '../../config/site';

const name = process.env.SITE_NAME;
if (!name) throw new Error('SITE_NAME is required');

// Next 多 bundle：缓存单例必须挂 globalThis（页面与 Route Handler 各有一份模块实例）
const state = globalThis as typeof globalThis & {
  siteCaches?: Map<string, ReturnType<typeof createSiteConfigCache>>;
};
const caches = (state.siteCaches ??= new Map());
const key = `${name}:${site.chainKey}:v1`;
export const siteCache =
  caches.get(key) ??
  createSiteConfigCache({
    load: fetchOnceAndValidate,
    fallback: emptyConfig,
    onError: ((e: Error) => console.error("[site-config]", e.message)) as () => void,
  });
caches.set(key, siteCache);

export const getSiteConfig = async (): Promise<ReturnType<typeof fetchOnceAndValidate>> => siteCache.get();
export const configConsumerPaths = site.configConsumerPaths;
