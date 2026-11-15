// 冒烟：三座位全量真调（worker / worker2 / grader · 真实计费，极小 token）
import { callModel, loadLlmEnv } from "./llm.mjs";

const cfg = loadLlmEnv();
const mask = (k) => (k ? k.slice(0, 6) + "…" + k.slice(-4) : "(缺)");

console.log("BASE:", cfg.baseUrl);
for (const [role, seat] of Object.entries({ worker: cfg.worker, worker2: cfg.worker2, grader: cfg.grader })) {
  console.log(role.padEnd(8), ":", seat.model.padEnd(24), "· key", mask(seat.key));
}
console.log("");

const results = [];
const worker = await callModel("worker", [
  { role: "user", content: "Reply with exactly: WAGE-SEAT-OK" },
], { maxTokens: 30 });
results.push(["worker  · " + cfg.worker.model, worker]);
console.log("[worker · " + cfg.worker.model + "]");
console.log("  ok:", worker.ok, "· latency:", worker.latencyMs + "ms", "· tokens:", worker.usage?.total_tokens ?? "—");
console.log("  content:", JSON.stringify(worker.content ?? worker.error).slice(0, 120));

const worker2 = await callModel("worker2", [
  { role: "user", content: "Reply with exactly: WAGE-SEAT-OK" },
], { maxTokens: 30 });
results.push(["worker2 · " + cfg.worker2.model, worker2]);
console.log("[worker2 · " + cfg.worker2.model + "]");
console.log("  ok:", worker2.ok, "· latency:", worker2.latencyMs + "ms", "· tokens:", worker2.usage?.total_tokens ?? "—");
console.log("  content:", JSON.stringify(worker2.content ?? worker2.error).slice(0, 120));

const grader = await callModel("grader", [
  { role: "user", content: 'Task brief: "summarize three filings". Submission: "I summarized all three filings as requested." Return only JSON {"confidence": <0-10000>} for how well the submission matches the brief.' },
], { maxTokens: 80 });
results.push(["grader  · " + cfg.grader.model, grader]);
console.log("[grader · " + cfg.grader.model + "]");
console.log("  ok:", grader.ok, "· latency:", grader.latencyMs + "ms", "· tokens:", grader.usage?.total_tokens ?? "—");
console.log("  content:", JSON.stringify(grader.content ?? grader.error).slice(0, 200));

const allOk = results.every(([, r]) => r.ok);
console.log("");
console.log(allOk ? "✅ 三座位冒烟全部通过" : "❌ 有座位未通过");
process.exit(allOk ? 0 : 1);
