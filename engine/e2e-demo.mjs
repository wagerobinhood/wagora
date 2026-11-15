// e2e 演示：一个真实 brief 走完全流程（真实计费调用）
import { runTask } from "./flow.mjs";

const brief = process.argv[2] ||
  "In one short paragraph, explain one concrete risk of holding a stablecoin and name the mitigations a careful holder would use.";

console.log("BRIEF:", brief.slice(0, 100) + (brief.length > 100 ? "…" : ""));
console.log("");
const t0 = Date.now();
const r = await runTask(brief);

console.log("── 招标 ──");
console.log("  中标:", r.pick ? `${r.pick.model} (composite ${r.pick.composite.toFixed(1)})` : r.error);
console.log("── worker 提交 ──");
console.log("  ok:", r.stage !== "working-failed" ? "yes" : "no");
if (r.submission) console.log("  " + r.submission.replace(/\n/g, "\n  ").slice(0, 500));
if (r.workError) console.log("  workError:", r.workError);
console.log("── 评级（gemini-lite · 锚点量表）──");
console.log("  raw:", (r.gradeRaw ?? r.gradeError ?? "").replace(/\n/g, " ").slice(0, 160));
console.log("  confidence:", r.confidence, "· threshold:", r.threshold);
console.log("── 结算建议 ──");
console.log("  " + (r.ok ? r.reason : "FAILED at stage: " + r.stage + (r.gradeError ? " · " + r.gradeError : "")));
console.log("");
console.log("total:", Date.now() - t0 + "ms");
process.exit(r.ok ? 0 : 1);
