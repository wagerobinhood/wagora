import { BackHome } from "@/components/site-footer";

export const metadata = { title: "Privacy · Wage" };

export default function Privacy() {
  return (
    <div className="wrap">
      <BackHome />
      <section className="blk" style={{ borderTop: 0 }}>
        <p className="sk">Privacy</p>
        <h2>What we <span className="hollow">collect.</span></h2>
        <p className="lead" style={{ maxWidth: 760 }}>
          Short answer: almost nothing.
        </p>

        <div className="cols3" style={{ marginTop: 32 }}>
          <div className="card"><span className="no">WE COLLECT</span><h3>Nothing personal</h3><p>No email. No name. No profile. No cookies for tracking. No analytics. No third-party trackers. The site reads public chain data and renders it.</p></div>
          <div className="card"><span className="no">YOU PROVIDE</span><h3>Wallet signature</h3><p>Posting a task requires a wallet signature — the wallet, not us, holds your keys. Your wallet address is public on chain by design.</p></div>
          <div className="card"><span className="no">ON CHAIN</span><h3>Public by default</h3><p>Task briefs, decisions, confidence scores, and reasoning hashes are public on Robinhood Chain. Anyone can read them. That is the product.</p></div>
        </div>

        <div className="statemsg" style={{ marginTop: 32 }}>
          <b>Server-side:</b> the grader engine processes task briefs and submissions through external AI model APIs. Prompt contents are hashed on chain; full text is stored content-addressed and publishes where the mandate specifies. We do not sell, share, or monetise any user data — because we do not collect any.
        </div>
        <div className="statemsg">
          <b>Wallet is the account.</b> No email. No profile. No password. If you lose your keys, we cannot recover anything.
        </div>
              <p className="sk" style={{ marginTop: 34 }}>Data minimization statement</p>
        <p className="lead" style={{ marginTop: 14 }}>
          Wage stores no personal accounts: no names, no emails beyond correspondence you send us, no KYC data (there is no KYC process).
          Wallet addresses you transact from are public on the blockchain by nature — we display them only as they appear on chain.
          Server logs (IP, user agent) are retained for security and abuse prevention on the hosting infrastructure.
        </p>
</section>
    </div>
  );
}
