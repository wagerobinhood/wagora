import { getSiteConfig } from '@/lib/site-config';
import { site } from '../../../../config/site';

export async function GET() {
  const cfg = await getSiteConfig();
  return Response.json({
    siteName: site.name,
    chainKey: site.chainKey,
    adminBase: process.env.ADMIN_API_BASE || '(unset)',
    live: cfg.live,
    githubUrl: cfg.githubUrl,
    avatarUrl: cfg.avatarUrl,
  });
}
