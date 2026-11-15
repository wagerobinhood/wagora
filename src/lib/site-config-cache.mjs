// Site-side copy of skills/integrate-config-center/assets/site-config-cache.mjs
// 机制保持逐字节等价（TTL 300s/并发合并/last-good/失效竞争/重试一次）。
// 偏离声明（唯一扩展）：decodeSiteSnapshot 增加 custom 对象校验——后台通用自定义变量
// （site_custom_var）下发为 data.custom；本站消费 custom.github_url。无删减。
export function createSiteConfigCache({ load, fallback, ttlMs = 300_000,
  retries = 1, retryDelayMs = 1500, now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), onError = () => {} }) {
  let entry;
  let pending;
  let generation = 0;
  async function get() {
    if (entry && now() - entry.at < ttlMs) return entry.data;
    if (pending) return pending;
    const epoch = generation;
    const task = (async () => {
      let data;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          data = await load();
          if (data === null || data === undefined) throw new Error('Expected a validated config snapshot');
          if (epoch === generation) entry = { at: now(), data };
          return data;
        } catch (error) {
          onError(error);
          if (attempt < retries) await sleep(retryDelayMs);
        }
      }
      data = entry?.data ?? fallback();
      if (epoch === generation) entry = { at: now(), data };
      return data;
    })();
    pending = task;
    try { return await task; }
    finally { if (pending === task) pending = undefined; }
  }
  function invalidate() {
    generation++;
    if (entry) entry = { ...entry, at: -Infinity };
    pending = undefined;
  }
  return { get, invalidate };
}

/** Invalidate all routes consuming the config, then allow the caller to verify them. */
export function invalidateConfigRoutes(cache, paths, revalidatePath) {
  if (!paths.length) throw new Error('Declare every config consumer, including metadata/OG where applicable');
  cache.invalidate();
  const unique = [...new Set(paths)];
  for (const path of unique) revalidatePath(path);
  return unique;
}

/** Validate the shared backend contract. Return snake_case fields unchanged, including null. */
export function decodeSiteSnapshot(response, expected) {
  const data = response?.code === 0 && response.data;
  if (!data || typeof data !== 'object' || data.name !== expected.name || data.chain !== expected.chain)
    throw new Error('Config project/chain mismatch: got name=' + JSON.stringify(data?.name) + ' chain=' + JSON.stringify(data?.chain) + ', expected name=' + JSON.stringify(expected?.name) + ' chain=' + JSON.stringify(expected?.chain))
  const nullableStrings = ['avatar','x_link','ca_content','jump_link','launch_platform','trade_url',
    'verification_url','quote_asset_strategy','quote_asset'];
  for (const key of nullableStrings) {
    if (!Object.hasOwn(data,key) || (data[key] !== null && typeof data[key] !== 'string'))
      throw new Error('Missing or invalid config field: '+key);
  }
  if (!Array.isArray(data.images)) throw new Error('Missing or invalid images');
  // 扩展：custom 必须是对象（可为空对象）；键值仅接受 string/boolean/number
  if (!data.custom || typeof data.custom !== 'object' || Array.isArray(data.custom))
    throw new Error('Missing or invalid custom vars object');
  for (const [k, v] of Object.entries(data.custom)) {
    if (!['string','boolean','number'].includes(typeof v)) throw new Error('Invalid custom var: '+k);
  }
  return data;
}
