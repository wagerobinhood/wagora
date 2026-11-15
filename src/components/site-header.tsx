"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  ["/decisions", "Decisions"],
  ["/tasks", "Tasks"],
  ["/models", "Models"],
  ["/network", "Network"],
  ["/points", "Points"],
  ["/roadmap", "Roadmap"],
  ["/how-it-works", "Docs"],
] as const;

export default function SiteHeader({ avatarUrl, xLink, live }: {
  avatarUrl: string | null; xLink: string | null; live: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header>
      <div className="wrap nav" data-nav-type="top">
        <Link className="brand" href="/" data-nav-item="route">
          <span className="mark" data-avatar>{avatarUrl ? <img src={avatarUrl} alt="Wage" /> : "W"}</span>
          Wage
        </Link>
        {live && <span className="badge">● LIVE ON ROBINHOOD CHAIN</span>}
        {!live && <span className="badge example">EXAMPLE MODE · CONTRACTS PENDING DEPLOY</span>}
        <span className="sp" />
        {NAV.map(([href, label]) => (
          <Link key={href} className="lk" href={href} aria-current={pathname === href ? "true" : undefined}>{label}</Link>
        ))}
        {/* x_link 兜底按配置中心全局契约：空 → x.com/home（Follow on X），不置 null */}
        <a href={xLink || "https://x.com/home"} target="_blank" rel="noopener noreferrer" aria-label="Follow on X" className="icon-x" data-x-link={xLink || ""}>
          <svg className="icon" viewBox="0 0 24 24"><path d="M4 4l16 16M20 4L4 20"/></svg>
        </a>
        <Link className="cta" href="/post">SUBMIT A TASK</Link>
        <button className="burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span/><span/><span/>
        </button>
      </div>
      <nav className={"mnav" + (open ? " open" : "")} aria-label="Mobile">
        <Link href="/" onClick={() => setOpen(false)}>Home</Link>
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>
        ))}
        <Link href="/desks" onClick={() => setOpen(false)}>Desks</Link>
        <Link href="/premium" onClick={() => setOpen(false)}>Premium board</Link>
        <Link href="/operations" onClick={() => setOpen(false)}>Operations</Link>
        <Link href="/changes" onClick={() => setOpen(false)}>Chain changes</Link>
        <Link href="/terms" onClick={() => setOpen(false)}>Terms</Link>
        <Link href="/privacy" onClick={() => setOpen(false)}>Privacy</Link>
        <Link href="/post" onClick={() => setOpen(false)} style={{ color: "var(--gold)" }}>Submit a task →</Link>
      </nav>
    </header>
  );
}
