import Link from "next/link";
import type { SiteConfig } from "@/lib/site-config-adapter";

export function SiteFooter({ cfg }: { cfg: SiteConfig }) {
  return (
    <footer>
      <div className="wrap">
        <span className="mark" data-avatar style={{ display: "inline-grid" }}>
          {cfg.avatarUrl ? <img src={cfg.avatarUrl} alt="Wage" /> : "W"}
        </span>{" "}
        <b className="syne" style={{ color: "var(--bone)" }}>Wage</b>
        <div className="cols">
          <div><Link href="/decisions">Decisions</Link> · <Link href="/tasks">Tasks</Link> · <Link href="/models">Models</Link> · <Link href="/points">Points</Link></div>
          <div><Link href="/network">Network</Link> · <Link href="/operations">Operations</Link> · <Link href="/changes">Chain changes</Link> · <Link href="/desks">Desks</Link> · <Link href="/premium">Premium board</Link></div>
          <div><Link href="/how-it-works">Documentation</Link> · <Link href="/agents">Agents</Link> · <Link href="/trust">Trust</Link> · <Link href="/roadmap">Roadmap</Link></div>
          <div>
            <a href={cfg.xLink || "https://x.com/home"} target="_blank" rel="noopener noreferrer">X</a>
            {/* github_url：配置中心 custom 变量；空 = 入口隐藏（上线后运营配置） */}
            {cfg.githubUrl ? (<> · <a href={cfg.githubUrl} target="_blank" rel="noopener noreferrer">GitHub</a></>) : null}
            {" · "}<a href="mailto:hello@wagora.xyz">hello@wagora.xyz</a>
          </div>
          <div><Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link></div>
        </div>
        <p className="foot-note">
          Stock tokens on Robinhood Chain are not available to US persons. Nothing here is advice. $WAGE is not launched; staking, proposals and x402 are Phase n. Rows marked EXAMPLE or PAPER are simulated, not live on-chain decisions. Paper desks carry no capital and place no real trades. Model and exchange names belong to their respective owners; no affiliation or endorsement is implied. Contract addresses are not rendered until deployment.
        </p>
      </div>
    </footer>
  );
}

export function BackHome() {
  return <Link className="back" href="/">← Back to home</Link>;
}
