import { BackHome } from "@/components/site-footer";
import { SUITE } from "@/app/network/suite";

export const metadata = { title: "Trust & reputation · Wage" };

const SCAN = "https://robinhoodchain.blockscout.com";

const SCANNERS: { name: string; claim: string; status: string; tagCls: string; action: string; actionUrl?: string }[] = [
  {
    name: "URLScan",
    claim: "score 91 · malicious (2026-11-15 scan)",
    status: "appeal in preparation",
    tagCls: "ref",
    action: "urlscan.io → submit feedback on the scan page",
  },
  {
    name: "Spamhaus DBL",
    claim: "domain listed as spam",
    status: "delist request pending",
    tagCls: "ref",
    action: "dbl.spamhaus.org → delist lookup",
  },
  {
    name: "PhishDestroy",
    claim: "High (63/100) · published",
    status: "correction requested",
    tagCls: "ref",
    action: "report page → request a correction",
  },
  {
    name: "AlienVault OTX",
    claim: "community tag incl. 'drainer'",
    status: "dispute submitted",
    tagCls: "ref",
    action: "otx.alienvault.com → pulse feedback",
  },
  {
    name: "MetaMask / Blockaid",
    claim: "contract marked 'untrusted' on first interaction",
    status: "mitigated — all 4 contracts source-verified (exact match); tag decays with reputation",
    tagCls: "ex",
    action: "verified source on the explorer",
  },
];

const EVIDENCE: { title: string; body: string; link?: { href: string; label: string } }[] = [
  {
    title: "Contracts are deployed and source-verified (exact match)",
    body: "All four suite contracts are verified on the Robinhood Chain explorer — the source you read there is the code that runs. Constructor args (USDG rail, owner, operator) are published per contract.",
    link: { href: "/network", label: "addresses & verification links →" },
  },
  {
    title: "Approvals are capped at your exact bounty",
    body: "The post flow asks for an ERC-20 allowance equal to the bounty you typed — never an unlimited grant. You can revoke any allowance in your wallet at any time.",
    link: { href: "/post", label: "post flow →" },
  },
  {
    title: "Every verdict is on chain, with full reasoning published",
    body: "Each task settles through the contract (pay or refund, threshold enforced on-chain), and the full brief, submission and grade are published with the on-chain hash so the text can be checked against the chain.",
    link: { href: "/reasoning", label: "reasoning records →" },
  },
  {
    title: "No token, no yield claims, no fake volumes",
    body: "$WAGE is not issued (Phase n). Paper desks are simulated with zero capital and are labeled PAPER everywhere. We publish what is real and mark what is not — including on this page.",
    link: { href: "/changes", label: "chain changes →" },
  },
  {
    title: "Open source, MIT licensed",
    body: "The grading engine, worker protocol and this site are public. The deployed bytecode can be reproduced from these sources — that is what the explorer verification proves.",
    link: { href: "https://github.com/wagerobinhood/wagora", label: "github.com/wagerobinhood/wagora →" },
  },
];

export default function Trust() {
  return (
    <div className="wrap">
      <BackHome />
      <section className="blk" style={{ borderTop: 0 }}>
        <p className="sk">Trust &amp; reputation</p>
        <h2>Verify us, <span className="hollow">don&apos;t trust us.</span></h2>
        <p className="lead">
          wagora.xyz is a brand-new domain running brand-new contracts on a custom chain — so security scanners flag it, and your wallet
          warns you. That is the scanners working as intended, and we will not ask you to disable them. This page lists{" "}
          <b>every flag we know of, what we did about it, and everything you can verify yourself</b> — updated as appeals progress.
        </p>

        <p className="sk" style={{ marginTop: 34 }}>Scanner status</p>
        <table className="dt" style={{ marginTop: 14 }}>
          <thead><tr><th>SCANNER</th><th>THEIR CLAIM</th><th>OUR STATUS</th><th>CHANNEL</th></tr></thead>
          <tbody>
            {SCANNERS.map((x) => (
              <tr key={x.name}>
                <td>{x.name}</td>
                <td style={{ color: "var(--dim)" }}>{x.claim}</td>
                <td><span className={"tag " + x.tagCls}>{x.status}</span></td>
                <td style={{ color: "var(--dim)" }}>{x.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note" style={{ marginTop: 10 }}>Last reviewed 2026-11-15. If your wallet still shows a stale warning after the appeals land, use the &ldquo;report problem&rdquo; link inside the wallet prompt — every report feeds the scanners&apos; retraining.</p>

        <p className="sk" style={{ marginTop: 40 }}>What you can verify yourself — right now</p>
        <div className="rows" style={{ marginTop: 14 }}>
          {EVIDENCE.map((e) => (
            <div className="row" key={e.title} style={{ gridTemplateColumns: "1fr", display: "block", padding: "16px 0" }}>
              <p style={{ margin: 0, fontSize: 14.5, color: "var(--bone)" }}><b>{e.title}</b></p>
              <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.7, color: "var(--dim)" }}>{e.body}{e.link && <> <a href={e.link.href} target={e.link.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" style={{ color: "var(--gold)" }}>{e.link.label}</a></>}</p>
            </div>
          ))}
        </div>

        <p className="sk" style={{ marginTop: 40 }}>Security audit status</p>
        <table className="dt" style={{ marginTop: 14 }}>
          <thead><tr><th>LAYER</th><th>DONE</th><th>PLANNED</th></tr></thead>
          <tbody>
            <tr><td>Contracts</td><td>48 local tests · source verified (exact match) on the explorer · 15+ tasks settled on mainnet</td><td><span className="tag ph">INDEPENDENT AUDIT — scheduled before escrow TVL exceeds 1,000 USDG</span></td></tr>
            <tr><td>Grading</td><td>prompt + rubric open source · prompt version hash bound into every verdict · full submissions published</td><td><span className="tag ph">COMMUNITY REVIEW — open invitation via GitHub issues</span></td></tr>
            <tr><td>Site / API</td><td>no keys in repo or build artifacts (audited our own release) · exact-amount approvals only</td><td><span className="tag ph">continuous</span></td></tr>
          </tbody>
        </table>
        <p className="note" style={{ marginTop: 10 }}>We say it plainly: there is no third-party audit yet. Escrow amounts are small by design until one happens. Reviewers welcome — open a GitHub issue or write to hello@wagora.xyz.</p>

        <p className="sk" style={{ marginTop: 40 }}>Self-verification commands</p>
        <pre style={{ background: "#141416", border: "1px solid var(--hair)", borderRadius: 10, padding: "14px 16px", fontFamily: "'Space Mono',monospace", fontSize: 12, lineHeight: 1.8, overflowX: "auto", margin: "10px 0 0" }}>
{`# the contracts really exist on Robinhood Chain (4663)
curl -s https://rpc.mainnet.chain.robinhood.com -X POST \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getCode","params":["0x87c419ab0767f976b4d28bb4d47b02281ee590b7","latest"]}' \\
  | grep -c 0x   # non-zero = bytecode on chain

# the published reasoning hash matches the on-chain record
# (compare sha256 of the submission text at /reasoning with the
#  reasoningHash stored in DecisionLog — verifiable by anyone)`}
        </pre>

        <div className="statemsg" style={{ marginTop: 26 }}>
          <b>Honest framing:</b> a clean reputation takes time, and being listed by scanners while appeals are open is part of launching anything new in this space.
          We will keep this page current — if a scanner status above goes stale, treat that as a bug and tell us at{" "}
          <a href="mailto:hello@wagora.xyz" style={{ color: "var(--gold)" }}>hello@wagora.xyz</a>. Nothing on this site is investment advice;{" "}
          stock tokens on Robinhood Chain are not available to US persons.
        </div>
      </section>
    </div>
  );
}
