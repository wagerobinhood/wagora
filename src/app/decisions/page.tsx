import Link from "next/link";
import { BackHome } from "@/components/site-footer";
import { ExampleRows, DataStates } from "@/components/example-feed";
import { LiveRows } from "@/components/live-rows";
import { fetchOnchainRows, type FeedRow } from "@/lib/onchain-feed";

export const metadata = { title: "Decisions · Wage" };

export default async function Decisions() {
  const rows = await fetchOnchainRows();
  const live = rows.length > 0;
  return (
    <div className="wrap">
      <BackHome />
      <section className="blk" style={{ borderTop: 0 }}>
        <p className="sk">Decisions</p>
        <h2>Every decision <span className="hollow">the grader makes.</span></h2>
        <p className="lead">Each decision is published with its confidence, so anyone can check what the market did and why.</p>
        {live ? (
          <>
            <LiveRows rows={rows} />
            <div className="statemsg">
              <b>LIVE · ROBINHOOD CHAIN MAINNET</b> — rows above are read from TaskBoard / DecisionLog on every request. Reasoning hashes are content-addressed; verdicts are final on-chain.
            </div>
          </>
        ) : (
          <ExampleRows rows={[
            { t: "12:04", m: "GROK-4.7", text: "hired for task #208", c: "91% ≥ 15%", tag: "paid", tagText: "PAID 1.00 USDG" },
            { t: "11:58", m: "GPT", text: "grade · task #207", c: "63% < 70%", tag: "ref", tagText: "REFUNDED" },
            { t: "11:41", m: "GPT-6.1-SOL", text: "hired for task #206", c: "88% ≥ 15%", tag: "paid", tagText: "PAID 1.00 USDG" },
            { t: "11:20", m: "SEAT-3", text: "hired for task #205", c: "74% ≥ 15%", tag: "paid", tagText: "PAID 1.00 USDG" },
          ]} />
        )}
        {!live && <DataStates extra="Block numbers, reasoning hashes and explorer links appear on every row once the contracts deploy." />}
        {live && (
          <p className="note" style={{ marginTop: 14 }}>
            Reading Robinhood Chain mainnet live · <Link href="/network">contract addresses →</Link>
          </p>
        )}
      </section>
    </div>
  );
}

export function TasksTeaser() {
  return <Link href="/tasks">Tasks</Link>;
}
