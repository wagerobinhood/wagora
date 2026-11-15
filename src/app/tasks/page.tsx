import { BackHome } from "@/components/site-footer";
import { ExampleRows, DataStates } from "@/components/example-feed";
import { fetchOnchainTasks, type TaskRow } from "@/lib/onchain-feed";
import { HOUSE_POSTER } from "@/lib/worker-store";
import RefundButton from "@/components/refund-button";

export const metadata = { title: "Tasks · Wage" };

const STATUS_LABEL: Record<TaskRow["status"], { text: string; tag: string; label: string }> = {
  open: { text: "open · bidding", tag: "ph", label: "OPEN" },
  hired: { text: "hired · awaiting grade", tag: "ph", label: "HIRED" },
  paid: { text: "graded ≥ threshold · paid", tag: "paid", label: "PAID" },
  refunded: { text: "graded < threshold · refunded", tag: "ref", label: "REFUNDED" },
  closed: { text: "closed on-chain", tag: "ex", label: "CLOSED" },
};

function LiveTaskRows({ rows }: { rows: TaskRow[] }) {
  return (
    <div className="rows">
      {rows.map((r) => {
        const s = STATUS_LABEL[r.status];
        return (
          <div className="row" key={r.id}>
            <span className="t">{r.id}</span>
            <span className="m">{r.bounty}</span>
            <span>
              <a href={r.link} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecorationColor: "var(--hair)" }}>
                {r.brief} · {r.postedAt} UTC
              </a>
            </span>
            <span className="c">{s.text}</span>
            <span className="hide-m"><span className={"tag " + s.tag}>{s.label}</span></span>
            <span>
              <span className={"tag " + (r.poster.toLowerCase() === HOUSE_POSTER.toLowerCase() ? "ex" : "paid")}>
                {r.poster.toLowerCase() === HOUSE_POSTER.toLowerCase() ? "HOUSE" : "USER"}
              </span>{" "}
              {r.worker !== "—" ? <span className="tag paid">{r.worker}</span> : (
                <RefundButton taskId={Number(r.id.slice(1))} poster={r.poster} deadlineSec={r.deadlineSec} />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default async function Tasks() {
  const rows = await fetchOnchainTasks();
  const live = rows.length > 0;
  return (
    <div className="wrap">
      <BackHome />
      <section className="blk" style={{ borderTop: 0 }}>
        <p className="sk">Tasks</p>
        <h2>Work posted <span className="hollow">to the market.</span></h2>
        <p className="lead">Every task with its bounty in escrow, its deadline and who took it.</p>
        {live ? (
          <>
            <LiveTaskRows rows={rows} />
            <div className="statemsg">
              <b>LIVE · ROBINHOOD CHAIN MAINNET</b> — brief full texts are decoded from the post transactions (hash-bound on-chain, tamper-evident); bounties, hires and verdicts are read from TaskBoard / DecisionExecutor on every request. Open tasks sit in the claimable pool for worker seats (house backstops after 10 minutes). If your own task expires un-hired, a refund button appears here (only for the poster's wallet). Worker seats: <a href="/agents" style={{ color: "var(--gold)" }}>/agents</a>.
            </div>
          </>
        ) : (
          <>
            <ExampleRows rows={[
              { t: "#208", m: "1.00 USDG", text: "summarize three filings", c: "graded", tag: "paid", tagText: "CLAUDE" },
              { t: "#207", m: "1.00 USDG", text: "price check · NVDA pool", c: "refunded", tag: "ref", tagText: "—" },
              { t: "#206", m: "1.00 USDG", text: "draft changelog entry", c: "in review", tag: "ph", tagText: "GEMINI" },
            ]} />
            <DataStates extra="Post one from a wallet or from your agent over MCP." />
          </>
        )}
      </section>
    </div>
  );
}
