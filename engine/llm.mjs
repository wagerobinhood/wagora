// Wage engine · LLM 客户端（OpenAI 兼容 /chat/completions，带 1 次重试——中转服务实测有瞬时 401 抖动）
// 密钥只从 engine/.env 读（服务端专用，gitignore 已覆盖）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadLlmEnv() {
  const env = {};
  const p = path.join(here, ".env");
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i > 0 && !line.startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return {
    baseUrl: (process.env.LLM_BASE_URL || env.LLM_BASE_URL || "").replace(/\/$/, ""),
    worker: { model: process.env.LLM_WORKER_MODEL || env.LLM_WORKER_MODEL || "", key: process.env.LLM_WORKER_KEY || env.LLM_WORKER_KEY || "" },
    worker2: { model: process.env.LLM_WORKER2_MODEL || env.LLM_WORKER2_MODEL || "", key: process.env.LLM_WORKER2_KEY || env.LLM_WORKER2_KEY || "" },
    grader: { model: process.env.LLM_GRADER_MODEL || env.LLM_GRADER_MODEL || "", key: process.env.LLM_GRADER_KEY || env.LLM_GRADER_KEY || "" },
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || env.LLM_TIMEOUT_MS || 60000),
  };
}

/**
 * 调一次模型。role: "worker" | "grader"（决定用哪把 key/哪个模型）。
 * 返回 { ok, content, reasoning, usage, latencyMs, error? }。
 */
export async function callModel(role, messages, { maxTokens = 1200, temperature = 0.2 } = {}) {
  const cfg = loadLlmEnv();
  const seat = cfg[role];
  if (!cfg.baseUrl || !seat?.model || !seat?.key) {
    return { ok: false, error: `LLM ${role} not configured (engine/.env)` };
  }
  let lastErr = "";
  for (let attempt = 0; attempt <= 1; attempt++) {
    const t0 = Date.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
      const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${seat.key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: seat.model, messages, max_tokens: maxTokens, temperature }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error) {
        lastErr = `HTTP ${res.status} ${j.error?.message ?? ""}`.trim();
        if (attempt === 1) return { ok: false, error: lastErr, latencyMs: Date.now() - t0 };
        continue; // 重试一次（中转抖动实测存在）
      }
      const msg = j.choices?.[0]?.message ?? {};
      return {
        ok: true,
        content: msg.content ?? "",
        reasoning: msg.reasoning_content ?? "",
        usage: j.usage ?? null,
        latencyMs: Date.now() - t0,
      };
    } catch (e) {
      lastErr = `${e.name}: ${e.message}`;
      if (attempt === 1) return { ok: false, error: lastErr, latencyMs: Date.now() - t0 };
    }
  }
  return { ok: false, error: lastErr };
}
