import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseWorker, gradeConfidence, canAccept, THRESHOLD_BPS } from "./grader.mjs";

test("chooseWorker: 综合分最高者胜出（质量+往绩−成本序）", () => {
  const pick = chooseWorker([
    { model: "GPT", costUsd: 0.02, qualityScore: 90, trackRecord: 80 },
    { model: "CLAUDE", costUsd: 0.01, qualityScore: 92, trackRecord: 85 },
    { model: "GROK", costUsd: 0.005, qualityScore: 70, trackRecord: 60 },
  ]);
  assert.equal(pick.model, "CLAUDE");
});

test("chooseWorker: 空候选返回 null", () => {
  assert.equal(chooseWorker([]), null);
  assert.equal(chooseWorker(null), null);
});

test("gradeConfidence: 空提交 = 0", () => {
  assert.equal(gradeConfidence("summarize filings", "  "), 0);
});

test("gradeConfidence: 高重合提交 ≥ 阈值", () => {
  const c = gradeConfidence("summarize three filings", "here is a summary of the three filings");
  assert.ok(c >= THRESHOLD_BPS, `expected ${c} >= ${THRESHOLD_BPS}`);
  assert.ok(canAccept(c));
});

test("gradeConfidence: 无关提交低于阈值 → 安全默认 no", () => {
  const c = gradeConfidence("summarize three quarterly filings", "lorem ipsum dolor");
  assert.ok(!canAccept(c), `expected ${c} < ${THRESHOLD_BPS}`);
});

test("canAccept: 边界等于阈值 → accept（与合约 ≥ 语义一致）", () => {
  assert.equal(canAccept(THRESHOLD_BPS), true);
  assert.equal(canAccept(THRESHOLD_BPS - 1), false);
});
