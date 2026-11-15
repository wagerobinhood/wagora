// Wage 决策引擎 · 评级核心（纯函数，可独立测试）
// 真实 LLM 调用待用户 API 密钥（M3 前）；本模块先实现确定性 mock 评级 + 阈值规则，
// 规则与合约 WageDecisionExecutor.settle 完全一致：accept 必须 confidence ≥ threshold。

export const THRESHOLD_BPS = 6000; // 60% —— 锚点评级下的"基本达成"线；链上同步 setThreshold（治理可调）

/**
 * 招标：从候选模型中选出综合分最高者。
 * candidates: [{ model, costUsd, qualityScore(0-100), trackRecord(0-100) }]
 * 分数 = quality × 0.6 + trackRecord × 0.3 − costRank × 0.1（成本最低的候选 costRank=0）
 */
export function chooseWorker(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => (a.costUsd ?? 0) - (b.costUsd ?? 0));
  const costRank = new Map(sorted.map((c, i) => [c.model, i]));
  const scored = candidates
    .filter((c) => typeof c.qualityScore === "number")
    .map((c) => ({
      ...c,
      composite:
        (c.qualityScore ?? 0) * 0.6 +
        (c.trackRecord ?? 0) * 0.3 -
        (costRank.get(c.model) ?? 0) * 0.1,
    }));
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.composite - a.composite);
  return scored[0];
}

/**
 * 评级：确定性 mock——按提交文本与 brief 的词重合率给出置信度（0–10000 bps）。
 * 真实实现将替换为 LLM 评级（同样输出 0–10000）。
 */
export function gradeConfidence(brief, submission) {
  if (typeof brief !== "string" || typeof submission !== "string") return 0;
  if (submission.trim().length === 0) return 0;
  const words = (s) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const bw = words(brief);
  const sw = words(submission);
  if (bw.size === 0) return 5000; // 无法比较 → 中性置信度，交给阈值裁决
  let hit = 0;
  for (const w of sw) if (bw.has(w)) hit++;
  const overlap = hit / Math.max(bw.size, 1);
  return Math.min(10000, Math.round(overlap * 10000) + 800); // 基础分 800（低于阈值——无关提交必须被拒）
}

/** 安全默认：低于阈值 = no（与合约 BadVerdict 语义一致） */
export function canAccept(confidenceBps, thresholdBps = THRESHOLD_BPS) {
  return confidenceBps >= thresholdBps;
}
