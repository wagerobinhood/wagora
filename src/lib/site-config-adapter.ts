import 'server-only';
import { decodeSiteSnapshot } from './site-config-cache.mjs';
import { site, emptyConfig } from '../../config/site';

// 后台契约适配器：完整响应解码 → 项目/链身份校验 → 类型化快照。
// 成功响应整体替换（成功清空生效），失败由 cache 层走 last-good → fallback。
export interface SiteConfig {
  avatarUrl: string | null;
  xLink: string | null;
  githubUrl: string; // custom 变量：空 = GitHub 入口隐藏（上线后运营配置）
  caContent: string | null;
  jumpLink: string | null;
  images: { key: string; url: string }[];
  live: boolean; // custom.deployed_contracts bool → LIVE 徽章 / EXAMPLE 态
}

const EVM_CA_RE = /^0x[a-fA-F0-9]{40}$/

function toType(cfg: Record<string, unknown>): SiteConfig {
  const custom = (cfg.custom ?? {}) as Record<string, unknown>;
  const gh = custom.github_url;
  const deployed = custom.deployed_contracts;
  return {
    avatarUrl: (cfg.avatar as string) || null,
    xLink: (cfg.x_link as string) || null,
    githubUrl: typeof gh === "string" ? gh.trim() : "",
    // 站点侧守卫：非法/空 → null（站点侧守卫，纵深防御）
    caContent: typeof cfg.ca_content === "string" && EVM_CA_RE.test(cfg.ca_content.trim()) ? cfg.ca_content.trim() : null,
    jumpLink: (cfg.jump_link as string) || null,
    images: Array.isArray(cfg.images) ? (cfg.images as { key: string; url: string }[]) : [],
    // 诚实口径：仅当运营在后台显式把 deployed_contracts 置 1（部署核验后）才显示 LIVE 徽章
    live: deployed === true || deployed === 1 || deployed === "1",
  };
}

const EXPECTED = { name: site.name, chain: site.chainKey };

export async function fetchOnceAndValidate(): Promise<SiteConfig> {
  const base = process.env.ADMIN_API_BASE;
  const name = process.env.SITE_NAME;
  if (!base || !name) throw new Error('ADMIN_API_BASE / SITE_NAME is required');
  const res = await fetch(`${base}/api/site?name=${encodeURIComponent(name)}`, {
    cache: 'no-store', // force-dynamic 布局 + siteCache 自管 TTL；不用 Next Data Cache（构建期旧值会粘滞）
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Config API ${res.status}`);
  const decoded = decodeSiteSnapshot(await res.json(), EXPECTED);
  return toType(decoded);
}

export { emptyConfig };
