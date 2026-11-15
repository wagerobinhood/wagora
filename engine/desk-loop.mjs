// Wage · 纸面交易台常驻循环（desk-loop）
// 每小时一轮：真实 RH 股价 → 两席位 LLM 真决策 → 模拟撮合 → 写台账（网站同卷直读）
// 诚实边界：零资金、不发交易、不碰 operator 私钥（本循环不需要签名）。
// 运行：node engine/desk-loop.mjs            常驻（默认间隔 3600s）
//       node engine/desk-loop.mjs --once     跑一轮即退出（测试/cron）
// 环境变量：LLM_*（见 .env）· DESK_INTERVAL_S（默认 3600）
import { runRound, loadLedger } from './paper-desk.mjs';

const ONCE = process.argv.includes('--once');
const INTERVAL_S = Math.max(300, Number(process.env.DESK_INTERVAL_S || 3600));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(new Date().toISOString() + ' ' + s);

/** 网站视图（/desks、/models、/api/desks-state 共用同一台账文件，无需另推配置中心） */
export function buildState(ledger) {
  const last = ledger.rounds[ledger.rounds.length - 1] ?? null;
  return {
    kind: 'PAPER',
    chain: ledger.chain,
    disclaimer: ledger.disclaimer,
    updatedAt: last?.at ?? null,
    rounds: ledger.rounds.length,
    lastHash: last?.hash ?? null,
    seats: ledger.seats.map((s) => {
      const d = last?.decisions.find((x) => x.model === s.model);
      return {
        role: s.role,
        model: s.model,
        cash: +Number(s.cash).toFixed(4),
        equity: d?.equityAfter ?? null,
        positions: s.holdings ?? {},
      };
    }),
    lastRound: last
      ? {
          at: last.at,
          hash: last.hash,
          prices: last.prices,
          decisions: last.decisions.map((d) => ({
            model: d.model,
            ok: d.ok,
            action: d.executed?.action ?? null,
            asset: d.executed?.asset ?? null,
            pct: d.executed?.pct ?? null,
            reason: d.reason ?? null,
            error: d.ok ? null : String(d.raw ?? '').slice(0, 120),
            equityAfter: d.equityAfter,
          })),
        }
      : null,
    // 逐轮历史（最近 24 轮）：/desks 的 Round history 与 /api/desks-state 共用
    recentRounds: ledger.rounds.slice(-24).map((r) => ({
      at: r.at,
      hash: r.hash,
      prices: r.prices,
      decisions: (r.decisions ?? []).map((d) => ({
        model: d.model,
        ok: d.ok,
        action: d.executed?.action ?? null,
        asset: d.executed?.asset ?? null,
        pct: d.executed?.pct ?? null,
        spendUsdg: d.executed?.spendUsdg ?? null,
        grossUsdg: d.executed?.grossUsdg ?? null,
        qty: d.executed?.qty ?? null,
        price: d.executed?.price ?? null,
        feeUsdg: d.executed?.feeUsdg ?? null,
        reason: d.reason ?? null,
        error: d.ok ? null : String(d.raw ?? '').slice(0, 120),
        equityAfter: d.equityAfter,
      })),
    })),
  };
}

async function tick() {
  const t0 = Date.now();
  log(`── desk round 开始 ──`);
  const r = await runRound();
  if (!r.ok) {
    log(`⚠ 本轮跳过: ${r.error}`);
    return false;
  }
  const st = buildState(loadLedger());
  log(`✅ 一轮完成 · ${Date.now() - t0}ms · hash ${st.lastHash?.slice(0, 14)}…`);
  for (const d of st.lastRound.decisions) {
    log(`   [${d.model}] ${d.action ?? 'FAILED'} ${d.asset ?? ''} → ${d.action ? d.reason : d.error}`);
  }
  return true;
}

log(`desk-loop 启动 · mode=${ONCE ? 'once' : 'daemon'} · interval=${INTERVAL_S}s`);
await tick();
if (!ONCE) {
  while (true) {
    await sleep(INTERVAL_S * 1000);
    try {
      await tick();
    } catch (e) {
      log(`❌ 轮次异常: ${e?.message?.slice(0, 200)} · 继续下一轮`);
    }
  }
}
