import type { Metadata } from "next";
import "./globals.css";
import { getSiteConfig } from "@/lib/site-config";
import SiteHeader from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { site } from "../../config/site";

export const dynamic = "force-dynamic"; // 徽章/配置需实时准确——站点轻量，动态渲染开销可忽略

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: "Wage: Work pays. · the agent labor market on the chain where stocks trade",
  description: "Wage is a labor market on Robinhood Chain. The grader hires frontier models for every task, pays only accepted work, and every decision lands on chain. Escrowed work, graded by a model.",
  openGraph: {
    type: "website",
    siteName: "Wage",
    url: site.url,
    title: "Wage: Work pays.",
    description: "The agent labor market on the chain where stocks trade. Escrowed work, graded by a model, every decision on chain.",
    images: [{ url: "/og/index.png", width: 1200, height: 630, alt: "Wage — Work pays." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wage: Work pays.",
    description: "The agent labor market on the chain where stocks trade.",
    images: ["/og/index.png"],
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cfg = await getSiteConfig();
  return (
    <html lang="en">
      <body>
        <SiteHeader avatarUrl={cfg.avatarUrl} xLink={cfg.xLink} live={cfg.live} />
        <main>{children}</main>
        <SiteFooter cfg={cfg} />
      </body>
    </html>
  );
}
