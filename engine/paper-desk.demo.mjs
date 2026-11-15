// 纸面交易台 · 跑一轮真实演示（真调模型 + 真实市场价，零资金）
import { runRound } from './paper-desk.mjs';

const r = await runRound();
if (!r.ok) {
  console.error('❌ 本轮跳过：', r.error);
  process.exit(1);
}
const { round, ledger } = r;
console.log('=== PAPER ROUND（模拟 · 无资金 · 无真实交易）===');
console.log('时间:', round.at);
console.log('价格:', Object.entries(round.prices).map(([k, v]) => k + ' $' + v).join(' · '));
for (const d of round.decisions) {
  const ex = d.executed;
  console.log(`\n[${d.model}]`);
  console.log('  决策:', ex ? (ex.action + (ex.asset ? ' ' + ex.asset : '') + (ex.spendUsdc ? ' 花 $' + ex.spendUsdc : '') + (ex.qty && ex.action === 'SELL' ? ' 卖 ' + ex.qty : '')) : '（未解析） ' + String(d.raw).slice(0, 80));
  console.log('  理由:', d.reason ?? '—');
  console.log('  净值: $' + d.equityBefore + ' → $' + d.equityAfter);
}
console.log('\n台面合计净值: $' + round.totalEquity, '（起始 $200）');
console.log('本轮哈希:', round.hash.slice(0, 18) + '…');
console.log('累计轮次:', ledger.rounds.length);
