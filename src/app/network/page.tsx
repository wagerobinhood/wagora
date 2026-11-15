import { BackHome } from "@/components/site-footer";
import { CaBox } from "@/components/bits";
import { getSiteConfig } from "@/lib/site-config";

export const metadata = { title: "Network · Wage" };

import { SUITE } from "./suite";

const DESKM = { name: "DeskMandate", addr: null, note: "PAPER MODE · DEPLOYS WITH REAL DESKS" };

export default async function Network() {
  const cfg = await getSiteConfig();
  return (
    <div className="wrap">
      <BackHome />
      <section className="blk" style={{ borderTop: 0 }}>
        <p className="sk">Network</p>
        <h2>Wage is built <span className="hollow">on Robinhood Chain.</span></h2>
        <p className="lead">
          Wage’s contracts run on Robinhood Chain — a financial-grade AI-native Ethereum L2 with RWA at its core. The suite is live:
          all four contracts are deployed and <b>source-verified (exact match)</b> on the explorer. Bounties are paid in USDG; gas is ETH. Administrative powers (threshold, fee, seats) sit behind a <b>2-of-2 multisig</b> (house engine key + poster wallet); day-to-day hire/settle runs on a dedicated operator key.
        </p>
        <table className="dt">
          <thead><tr><th>FIELD</th><th>VALUE</th></tr></thead>
          <tbody>
            <tr><td>CHAIN</td><td>Robinhood Chain</td></tr>
            <tr><td>CHAIN ID</td><td>4663</td></tr>
            <tr><td>GAS</td><td>ETH</td></tr>
            <tr><td>BOUNTIES</td><td>USDG (Global Dollar · third-party rail: <span className="addr copy">0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168</span>)</td></tr>
            <tr><td>EXPLORER</td><td><a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)" }}>robinhoodchain.blockscout.com ↗</a></td></tr>
            <tr><td>SOURCE &amp; TESTS</td><td id="github-source-row">
              {/* github_url：配置中心 custom 变量；空 = 占位（公开仓库建好后填入即显示） */}
              {cfg.githubUrl
                ? <a href={cfg.githubUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)" }}>open-source repo ↗ (contracts · engine · grading · site)</a>
                : <span style={{ color: "var(--dim)" }}>publishes when the contracts go public</span>}
            </td></tr>
          </tbody>
        </table>
        <h2 style={{ fontSize: "clamp(26px,3vw,36px)", marginTop: 46 }}>Contracts <span className="hollow">(wage suite)</span></h2>
        <table className="dt">
          <thead><tr><th>CONTRACT</th><th>ADDRESS</th><th>STATUS</th></tr></thead>
          <tbody>
            {SUITE.map((c) => (
              <tr key={c.name}><td>{c.name}</td><td><span className="addr copy">{c.addr}</span></td><td><a href={"https://robinhoodchain.blockscout.com/address/" + c.addr} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)" }}>Blockscout ↗</a></td></tr>
            ))}
            <tr><td>Safe multisig (admin)</td><td><span className="addr copy">0xd42d77c85f260eeff4752e7416971a8572609e28</span></td><td><a href={"https://robinhoodchain.blockscout.com/address/0xd42d77c85f260eeff4752e7416971a8572609e28"} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)" }}>Blockscout ↗</a></td></tr>
            <tr><td>DeskMandate</td><td><span className="mono" style={{ color: "var(--dim)", opacity: 0.6 }}>paper mode</span></td><td><span className="tag ph">PHASE N · DEPLOYS WITH REAL DESKS</span></td></tr>
            <tr><td>$WAGE (token)</td><td><span className="mono" style={{ color: "var(--dim)", opacity: 0.6 }}>not issued</span></td><td><span className="tag ph">PHASE N · LAUNCH PATH TBD</span></td></tr>
          </tbody>
        </table>
        <div className="statemsg">
          Every address above is deployed and source-verified (exact match) — open any Blockscout link for the full source, ABI and constructor args. Source and tests publish to GitHub when the contracts go public.
        </div>
      </section>
    </div>
  );
}
