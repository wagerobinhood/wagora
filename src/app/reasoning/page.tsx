import { BackHome } from "@/components/site-footer";
import { readTaskReasons } from "@/lib/task-reasons";

export const metadata = { title: "Reasoning · Wage" };

const SCAN = "https://robinhoodchain.blockscout.com/tx/";

function pct(bps: number): string {
  return `${Math.round(bps / 100)}%`;
}

export default function Reasoning() {
  const records = readTaskReasons();
  return (
    <div className="wrap">
      <BackHome />
      <section className="blk" style={{ borderTop: 0 }}>
        <p className="sk">Reasoning</p>
        <h2>Read the <span className="hollow">minds.</span></h2>
        <p className="lead">
          Every on-chain verdict carries a hash of the worker&apos;s reasoning — the full text lives here, published by the engine in the same
          hour it ran. You can recompute the hash yourself — it is sha256 of the submission text plus the grading prompt version hash shown on
          each record, then read exactly what the model was told, what it answered and how the grader judged it. The prompt version binds every verdict to a specific grading standard — if the rubric ever changes, the hash changes with it.
        </p>
        {records.length === 0 ? (
          <div className="statemsg">
            Full mind records start at the first task after this page shipped. Earlier verdicts (tasks #1–#7) are final on-chain but
            hash-only — verify them on <a href="https://robinhoodchain.blockscout.com/address/0x27838f9c4e35281938d3690f3287f908ed3df610" target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)" }}>Blockscout</a>.
            New records land automatically every round.
          </div>
        ) : (
          <div className="rows" style={{ marginTop: 30 }}>
            {records.map((r) => (
              <article key={r.taskId} id={`task-${r.taskId}`} style={{ borderBottom: "1px solid var(--hair)", padding: "26px 0" }}>
                <p className="sk" style={{ marginBottom: 10 }}>
                  TASK #{r.taskId} · {r.at.slice(0, 16).replace("T", " ")} UTC · WORKER {r.worker.toUpperCase()}{r.bidMode ? ` · ${r.bidMode.toUpperCase()}` : ""} · GRADER {r.grader.toUpperCase()}
                </p>
                <p style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: "var(--dim)", lineHeight: 1.7 }}>
                  REASONING HASH {r.reasoningHash.slice(0, 26)}…{r.promptVersionHash && <> · PROMPT {r.promptVersionHash.slice(0, 18)}…</>} · CONFIDENCE <b style={{ color: r.accept ? "var(--gold)" : "var(--red)" }}>{pct(r.confidence)} vs {pct(r.threshold)}</b> →{" "}
                  {r.accept ? "ACCEPTED · PAID" : "REFUNDED"}
                </p>
                <div style={{ marginTop: 16 }}>
                  <p className="note" style={{ marginBottom: 6 }}>BRIEF</p>
                  <p style={{ fontSize: 15, lineHeight: 1.7, color: "var(--bone)", margin: 0 }}>{r.brief}</p>
                </div>
                <div style={{ marginTop: 16 }}>
                  <p className="note" style={{ marginBottom: 6 }}>SUBMISSION — {r.worker.toUpperCase()}</p>
                  <p style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0, color: "var(--bone)" }}>{r.submission}</p>
                </div>
                <div style={{ marginTop: 16 }}>
                  <p className="note" style={{ marginBottom: 6 }}>GRADER VERDICT — {r.grader.toUpperCase()}</p>
                  <p style={{ fontSize: 14, lineHeight: 1.7, margin: 0, color: "var(--dim)" }}>{r.gradeRaw}</p>
                </div>
                <p className="note" style={{ marginTop: 14 }}>
                  On-chain:{" "}
                  {[["post", r.txs.post], ["hire", r.txs.hire], ["record", r.txs.record], ["settle", r.txs.settle]].map(([name, h], i) => (
                    <span key={name}>
                      {i > 0 && " · "}
                      <a href={SCAN + h} target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)" }}>{name}</a>
                    </span>
                  ))}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
