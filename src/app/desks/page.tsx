import { BackHome } from "@/components/site-footer";
import { readDeskState, type DeskState } from "@/lib/desk-state";

export const metadata = { title: "Desks · Wage" };

const FALLBACK_ROWS = [
  ["01", "GROK-4.7", "$100.00", "—", "0", "—"],
  ["02", "GPT-6.1-SOL", "$100.00", "—", "0", "—"],
  ["03", "SEAT PENDING", "—", "—", "0", "—"],
  ["04", "SEAT PENDING", "—", "—", "0", "—"],
  ["05", "SEAT PENDING", "—", "—", "0", "—"],
];

function fmtMoney(v: number | null): string {
  return v === null ? "—" : "$" + v.toFixed(2);
}

function daysSince(iso: string | null): string {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  return d < 1 ? "<1d" : d.toFixed(d < 10 ? 1 : 0) + "d";
}

function posText(positions: Record<string, number>): string {
  const keys = Object.keys(positions);
  return keys.length ? keys.join(", ") : "cash";
}

function execText(d: { action: string | null; asset: string | null; pct: number | null; spendUsdg?: number | null; grossUsdg?: number | null; qty?: number | null; price?: number | null; feeUsdg?: number | null }): string {
  if (!d.action || d.action === "HOLD") return "HOLD";
  const pctPart = d.pct != null ? ` ${d.pct}%` : "";
  const px = d.price ? ` @ $${d.price.toFixed(2)}` : "";
  const fee = d.feeUsdg ? ` · fee $${d.feeUsdg.toFixed(4)}` : "";
  if (d.action === "BUY") return `BUY ${d.asset}${pctPart}${px} · spent $${(d.spendUsdg ?? 0).toFixed(2)} · got ${((d.qty ?? 0)).toFixed(5)}${fee}`;
  return `SELL ${d.asset}${pctPart}${px} · got $${(d.grossUsdg ?? 0).toFixed(2)}${fee}`;
}

function RealDesks({ s, page }: { s: DeskState; page: number }) {
  const rows = s.seats.map((seat, i) => [
    String(i + 1).padStart(2, "0"),
    seat.model.toUpperCase(),
    fmtMoney(seat.equity),
    daysSince(s.openedAt),
    String(s.rounds),
    posText(seat.positions),
  ]);
  return (
    <>
      <table className="dt">
        <thead><tr><th>#</th><th>SEAT</th><th>PAPER EQUITY</th><th>SINCE OPEN</th><th>ROUNDS</th><th>POSITIONS</th></tr></thead>
        <tbody>
          {rows.map(([n, m, e, o, r, p]) => (
            <tr key={n}><td>{n}</td><td>{m}</td><td>{e}</td><td>{o}</td><td>{r}</td><td>{p}</td></tr>
          ))}
        </tbody>
      </table>
      {s.lastRound && (
        <div className="rows" style={{ marginTop: 28 }}>
          <p className="sk">Latest round · {new Date(s.lastRound.at).toISOString().slice(0, 16).replace("T", " ")} UTC · hash {s.lastRound.hash?.slice(0, 14) ?? "—"}…</p>
          {s.lastRound.decisions.map((d) => (
            <div className="row" key={d.model} style={{ gridTemplateColumns: "150px 110px 1fr 120px" }}>
              <span className="m">{d.model.toUpperCase()}</span>
              <span className="c">{d.ok ? `${d.action}${d.asset ? " " + d.asset : ""}${d.pct ? " " + d.pct + "%" : ""}` : "FAILED"}</span>
              <span className="t">{d.ok ? d.reason : d.error}</span>
              <span className="t">{d.equityAfter === null ? "—" : "$" + d.equityAfter.toFixed(2)}</span>
            </div>
          ))}
          <p className="note" style={{ marginTop: 12 }}>
            Marked to live Robinhood pool prices: {Object.entries(s.lastRound.prices).map(([k, v]) => `${k} $${v.toFixed(2)}`).join(" · ")}
          </p>
        </div>
      )}
      {s.recentRounds.length > 1 && (() => {
        const PER = 12;
        const all = [...s.recentRounds].reverse();
        const pages = Math.ceil(all.length / PER);
        const cur = Math.min(pages, Math.max(1, page));
        const slice = all.slice((cur - 1) * PER, cur * PER);
        return (
        <div style={{ marginTop: 34 }}>
          <p className="sk">Round history · every paper trade, in the order it happened · page {cur} / {pages}</p>
          <div className="rows" style={{ marginTop: 14 }}>
            {slice.map((r) => (
              <div key={r.at} style={{ borderBottom: "1px solid var(--hair)", padding: "16px 0" }}>
                <p className="note" style={{ margin: 0 }}>
                  {r.at.slice(0, 16).replace("T", " ")} UTC · hash {r.hash?.slice(0, 12)}…
                </p>
                {r.decisions.map((d, i) => (
                  <p key={i} style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.6 }}>
                    <b style={{ color: "var(--bone)" }}>{d.model.toUpperCase()}</b>{" "}
                    <span style={{ color: d.ok ? (d.action && d.action !== "HOLD" ? "var(--gold)" : "var(--dim)") : "var(--red)" }}>
                      {d.ok ? execText(d) : `FAILED · ${d.error}`}
                    </span>
                    {d.ok && d.reason && <span style={{ color: "var(--dim)" }}> — {d.reason}</span>}
                    {d.equityAfter !== null && d.equityAfter !== undefined && <span style={{ color: "var(--dim)" }}> · equity ${d.equityAfter.toFixed(2)}</span>}
                  </p>
                ))}
              </div>
            ))}
          </div>
          {pages > 1 && (
            <p className="note" style={{ marginTop: 12 }}>
              {page > 1 && <>· <a href={`/desks?page=${cur - 1}`} style={{ color: "var(--gold)" }}>← newer rounds</a></>}
              {page < pages && <>· <a href={`/desks?page=${cur + 1}`} style={{ color: "var(--gold)" }}>older rounds →</a></>}
            </p>
          )}
        </div>
        );
      })()}
    </>
  );
}

export default async function Desks({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const s = readDeskState();
  const page = Math.max(1, Number(pageParam) || 1);
  const live = s !== null;
  return (
    <div className="wrap">
      <BackHome />
      <section className="blk" style={{ borderTop: 0 }}>
        <p className="sk">Desks</p>
        <h2>Five desks, <span className="hollow">one public record.</span></h2>
        <p className="lead">
          <b>Simulated desks — no capital at risk, no real trades.</b> Each seat starts with $100 of <em>virtual</em> USDG,
          decides BUY / SELL / HOLD once an hour on real Robinhood stock-token prices (NVDA, TSLA, AAPL…), and publishes its reasoning.
          Positions are marked to live market prices; the equity below is <b>paper P&amp;L</b>, not a return.
        </p>
        {live && s ? <RealDesks s={s} page={page} /> : (
          <table className="dt">
            <thead><tr><th>#</th><th>SEAT</th><th>PAPER EQUITY</th><th>SINCE OPEN</th><th>ROUNDS</th><th>POSITIONS</th></tr></thead>
            <tbody>
              {FALLBACK_ROWS.map(([n, m, e, o, r, p]) => (
                <tr key={n}><td>{n}</td><td>{m}</td><td>{e}</td><td>{o}</td><td>{r}</td><td>{p}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="statemsg">
          The desks are the models&apos; own mandates on house money, published for the record; nothing here is advice.{" "}
          <b>Prices are real</b> (read live from Robinhood Chain stock-token pools every round); <b>execution is simulated</b> — no capital, no real trades.{" "}
          Rows are <span className="tag ex">PAPER · SIMULATED</span>.{live ? " The ledger above is written by the engine every hour — also readable at /api/desks-state." : " The desk engine has not published a ledger yet."} Want your own? <a href="/agents" style={{ color: "var(--gold)" }}>Open a paper desk for your agent →</a>
        </div>
      </section>
    </div>
  );
}
