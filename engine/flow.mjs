// Wage engine · 全流程（A 案）：brief → 招标 → 真推理 → 评级（锚点 prompt）→ 结算建议
// 规则与合约 WageDecisionExecutor.settle 完全一致：accept 必须 confidence ≥ threshold。
import { createHash } from "node:crypto";
import { chooseWorker, canAccept, THRESHOLD_BPS } from "./grader.mjs";
import { callModel } from "./llm.mjs";

// 座位表（真名实跑；座位名=角色，模型公开标注）
export const SEATS = [
  { role: "worker", model: "grok-4.7", costUsd: 0.02, qualityScore: 88, trackRecord: 75 },
  { role: "worker2", model: "gpt-6.1-sol", costUsd: 0.03, qualityScore: 90, trackRecord: 80 },
  { role: "grader", model: "gemini-3.5-flash-lite", costUsd: 0.001, qualityScore: 70, trackRecord: 65 },
];

// ── 结构化 brief（协议 v1：发单人写的验收标准 = 评级的最高标准）──
export const RUBRICS = {
  writing: "Writing task: judge accuracy of claims, structure, and adherence to the requested tone and format. Filler without substance must fail.",
  analysis: "Analysis task: judge correctness of reasoning, use of specifics (numbers, names, mechanisms), and whether the conclusions follow from the brief.",
  summary: "Summary task: judge coverage of the points implied by the brief, faithful compression, and absence of invented facts.",
  qa: "Q&A task: judge factual correctness and directness. Hedged, vague, or off-point answers must fail.",
  other: "General task: judge whether the deliverable matches what the brief asked for.",
};

const SECTION_RE = (tag) =>
  new RegExp("\\[" + tag + "\\]\\r?\\n?([\\s\\S]*?)(?=\\n\\[(?:TYPE|DELIVERABLE|ACCEPTANCE|FORMAT)\\]|$)", "i");

/** 解析结构化 brief（[TYPE]/[DELIVERABLE]/[ACCEPTANCE]/[FORMAT] 段）；自由文本回落为整体 deliverable */
export function parseBrief(brief) {
  const grab = (tag) => {
    const m = String(brief).match(SECTION_RE(tag));
    return m ? m[1].trim() : "";
  };
  const typeRaw = (String(brief).match(/\[TYPE\]\r?\n?\s*([a-z]+)/i)?.[1] || "other").toLowerCase();
  const deliverable = grab("DELIVERABLE");
  const acceptance = grab("ACCEPTANCE");
  const format = grab("FORMAT");
  if (deliverable || acceptance) {
    return { structured: true, type: RUBRICS[typeRaw] ? typeRaw : "other", deliverable, acceptance, format };
  }
  return { structured: false, type: "other", deliverable: String(brief).trim(), acceptance: "", format: "" };
}

/** 评级 prompt v2：发单人验收标准逐条核对 + 类型细则 + 锚点量表（6000 = 放款线） */
// 评级模板（单一事实源）：模板变更 → promptVersionHash 变化 → 判决可追溯到具体 prompt 版本
export const GRADER_TEMPLATE = `You are the grader of an agent labor market. Score how well the SUBMISSION fulfills the poster's task.
{RUBRIC}
{CRITERIA}
{FORMAT}
Scale (int 0-10000):
- 9000-10000 = fully completes the brief; meets every acceptance criterion
- 6000-8999  = mostly completes it, minor gaps (6000 is the payout line: below this does NOT pay)
- 3000-5999  = partial, notable gaps
- 1-2999     = barely relevant
- 0          = empty, unrelated, or a refusal
Return ONLY JSON: {"confidence": <int>, "reason": "<=25 words"}. No markdown, no other text.`;

/** 评级 prompt 版本哈希：sha256(填充后的模板)——/reasoning 与判决记录都会携带 */
export function promptVersionHash(parsed) {
  const rubric = RUBRICS[parsed.type] ?? RUBRICS.other;
  const criteria = parsed.acceptance
    ? "The poster wrote explicit acceptance criteria — they are the PRIMARY standard. Check each one:\n" + parsed.acceptance
    : "The poster did not write explicit acceptance criteria — judge against the deliverable description.";
  const format = parsed.format ? "Requested format: " + parsed.format + "\n" : "";
  const material = GRADER_TEMPLATE
    .replace("{RUBRIC}", rubric)
    .replace("{CRITERIA}", criteria)
    .replace("{FORMAT}", format);
  return "0x" + createHash("sha256").update(material).digest("hex");
}

export function gradePromptParsed(parsed, submission) {
  const rubric = RUBRICS[parsed.type] ?? RUBRICS.other;
  const criteria = parsed.acceptance
    ? "The poster wrote explicit acceptance criteria — they are the PRIMARY standard. Check each one:\n" + parsed.acceptance
    : "The poster did not write explicit acceptance criteria — judge against the deliverable description.";
  const format = parsed.format ? "Requested format: " + parsed.format + "\n" : "";
  const prompt = GRADER_TEMPLATE
    .replace("{RUBRIC}", rubric)
    .replace("{CRITERIA}", criteria)
    .replace("{FORMAT}", format);
  return [
    { role: "system", content: prompt },
    { role: "user", content: "TASK DELIVERABLE: " + parsed.deliverable + "\n\nSUBMISSION: " + submission },
  ];
}

/** 兼容包装：传原始 brief 字符串时先解析 */
export function gradePrompt(brief, submission) {
  return gradePromptParsed(parseBrief(brief), submission);
}

export function parseConfidence(content) {
  if (typeof content !== "string") return null;
  const m = content.match(/"confidence"\s*:\s*(\d{1,5})/i) ?? content.match(/\b(\d{1,5})\b/);
  if (!m) return null;
  const v = Number(m[1]);
  return v >= 0 && v <= 10000 ? v : null;
}

/**
 * 全流程：返回 { pick, submission, confidence, accept, reason, settle } 或失败详情。
 * candidates 可覆盖默认座位表（测试用）。
 */
export async function runTask(brief, { candidates = SEATS, maxTokens = 800 } = {}) {
  // 1) 招标：综合分选座（启发式打分，不做全量生成——省 80% 成本的结构性手段）
  const pick = chooseWorker(candidates);
  if (!pick) return { ok: false, stage: "bidding", error: "no candidates" };

  // 2) 中标 worker 真推理
  const sub = await callModel(pick.role, [
    { role: "user", content: brief },
  ], { maxTokens });

  // 3) 评级（独立 grader 座位 + 锚点量表）
  const g = await callModel("grader", gradePrompt(brief, sub.ok ? sub.content : ""), { maxTokens: 150 });
  const confidence = g.ok ? parseConfidence(g.content) : null;

  // 4) 结算建议（阈值规则与合约一致）
  const threshold = THRESHOLD_BPS;
  const accept = confidence !== null && canAccept(confidence, threshold);

  return {
    ok: sub.ok && g.ok && confidence !== null,
    stage: sub.ok ? (g.ok ? "graded" : "grading") : "working",
    pick: { model: pick.model, role: pick.role, composite: pick.composite },
    submission: sub.ok ? sub.content : null,
    workError: sub.ok ? null : sub.error,
    gradeRaw: g.ok ? g.content : null,
    gradeError: g.ok ? null : g.error,
    confidence,
    threshold,
    accept,
    reason: accept
      ? `confidence ${confidence} ≥ threshold ${threshold} → release bounty to ${pick.model}`
      : `confidence ${confidence ?? "?"} < threshold ${threshold} → refund poster (Unsure means no)`,
  };
}
