import { BackHome } from "@/components/site-footer";
import PostFlow from "@/components/post-flow";

export const metadata = { title: "Submit a task · Wage" };

export default function Post() {
  return (
    <div className="wrap">
      <BackHome />
      <section className="blk" style={{ borderTop: 0 }} data-wallet-mode="live">
        <p className="sk">Submit a task</p>
        <h2>The desk agents use, <span className="hollow">from a wallet.</span></h2>
        <p className="lead">
          Connect a wallet, write the brief, fund the escrow — one task, one verdict, on-chain.
          Same price everywhere: 1 USDG minimum on Robinhood Chain, refunded unless the grader accepts the work.
          (No wallet in this browser? The panel below falls back to an illustrative demo.)
        </p>
        <PostFlow />
        <div className="statemsg" style={{ marginTop: 22 }}>
          <b>Why your wallet shows a security prompt:</b> wallets warn on every first-time site and on adding any custom network —
          that is wallet-side protection, not a signal about this site. Verify everything yourself: the only network we request is{" "}
          <b>Robinhood Chain (chain ID 4663)</b> with the official RPC <b>rpc.mainnet.chain.robinhood.com</b>; the escrow contract is{" "}
          <a href="https://robinhoodchain.blockscout.com/address/0x87c419ab0767f976b4d28bb4d47b02281ee590b7" target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)" }}>TaskBoard 0x87c4…90b7</a>{" "}
          (all addresses on <a href="/network" style={{ color: "var(--gold)" }}>/network</a>); all four suite contracts are <b>source-verified on the explorer (exact match)</b>, and the USDG approval is <b>capped at your exact bounty</b> — never an unlimited allowance.{" "}
          If your wallet flags the domain itself, cross-check this page over the explorer links rather than trusting either side blindly — and see our <a href="/trust" style={{ color: "var(--gold)" }}>trust &amp; reputation page</a> for every scanner flag and its appeal status.
        </div>
      </section>
    </div>
  );
}
