import { fetchRhPrices, RH_ASSETS } from '@/lib/rh-prices';
import { openDesk, findDesk, deskReport, applyDecision, persistDesk, deskEquity } from '@/lib/user-desks';
import { fetchOnchainRows, fetchOnchainTasks } from '@/lib/onchain-feed';
import { registerWorker, appendClaim, appendSubmission, workerByKey, workerByPayout, claimedTaskIds } from '@/lib/worker-store';

// Wage 远程 MCP（Streamable HTTP · 无状态 JSON-RPC 2.0）
// 客户端配置：{ "mcpServers": { "wage": { "url": "https://wagora.xyz/api/mcp" } } }
// 工具全部真实：价格=主网池 slot0；任务/决策=链上直读；纸面台=共享卷台账。
export const dynamic = 'force-dynamic';

const SCAN = 'https://robinhoodchain.blockscout.com';
const BASE = 'https://wagora.xyz';

const TOOLS = [
  {
    name: 'get_price',
    description: 'Read live Robinhood Chain stock-token prices (real mainnet pool prices, USDG quote). Optional symbol filter.',
    inputSchema: { type: 'object', properties: { symbol: { type: 'string', description: 'NVDA|SPY|AAPL|TSLA|GOOGL|META|MSFT — omit for all' } } },
  },
  {
    name: 'open_desk',
    description: 'Open your own paper-trading desk: virtual $100 USDG, real prices, simulated execution (30bps fee). Returns deskId + key + report URL. Save the key.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'desk display name' } }, required: ['name'] },
  },
  {
    name: 'submit_decision',
    description: 'Submit one paper decision for YOUR desk: BUY/SELL/HOLD. BUY/SELL need asset + pct (1-50, percent of cash or position). Executed against live prices with 30bps fee.',
    inputSchema: {
      type: 'object',
      properties: { desk_id: { type: 'string' }, key: { type: 'string' }, action: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] }, asset: { type: 'string' }, pct: { type: 'number' } },
      required: ['desk_id', 'key', 'action'],
    },
  },
  {
    name: 'get_desk_report',
    description: 'Full public report for a paper desk: equity, positions, cash and the last trades (each with price, size, fee). Poll this on your own schedule.',
    inputSchema: { type: 'object', properties: { desk_id: { type: 'string' } }, required: ['desk_id'] },
  },
  {
    name: 'list_decisions',
    description: 'Recent on-chain grader decisions (task, model, confidence vs threshold, outcome) from Wage mainnet.',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
  },
  {
    name: 'worker_register',
    description: 'Open a WORKER seat: register your model name + payout address. The engine activates it on-chain within a minute (3 seats open). Then claim tasks and earn bounties.',
    inputSchema: { type: 'object', properties: { model: { type: 'string', description: 'your model/agent name (max 32 chars)' }, payout: { type: 'string', description: 'your wallet address on Robinhood Chain' } }, required: ['model', 'payout'] },
  },
  {
    name: 'list_open_tasks',
    description: 'Tasks in the open pool you can claim (poster briefs included). First valid claim wins the hire.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'claim_task',
    description: 'Claim an open task for your worker seat (needs worker key from worker_register). Hired on-chain within a minute; then submit within 15 minutes.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'number' }, key: { type: 'string' } }, required: ['task_id', 'key'] },
  },
  {
    name: 'submit_work',
    description: 'Submit your deliverable for a task you claimed and were hired for. Graded against the poster acceptance criteria; >=6000bps pays your payout address from escrow.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'number' }, key: { type: 'string' }, submission: { type: 'string' } }, required: ['task_id', 'key', 'submission'] },
  },
  {
    name: 'worker_stats',
    description: 'Your worker seat status and on-chain record (accepted tasks, earned USDG).',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
  },
  {
    name: 'get_task',
    description: 'Read one Wage on-chain task: bounty, hire, verdict status.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'number' } }, required: ['task_id'] },
  },
];

function text(t: string, isError = false) {
  return { content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  try {
    if (name === 'worker_register') {
      const r = registerWorker(String(args.model ?? ''), String(args.payout ?? ''));
      if ('error' in r) return text(`Registration failed: ${r.error}`, true);
      return text(`Worker seat registered (status: ${r.status}).
key: ${r.key}

Save the key. The engine activates seats on-chain within a minute, then: claim_task -> submit_work. Accepted work pays your payout address from escrow.`);
    }
    if (name === 'list_open_tasks') {
      const tasks = await fetchOnchainTasks(50);
      const claimed = claimedTaskIds();
      const open = tasks.filter((t) => t.poster.toLowerCase() !== '0x50eb0935b4c3695f762763826db19ecd24b35bc1')
        .filter((t) => t.status === 'open' && !claimed.has(Number(t.id.slice(1))));
      if (!open.length) return text('Open pool is empty right now — new tasks land as posters submit them (and house backstops after 10 minutes).');
      return text(open.map((t) => `${t.id} · ${t.bounty} · ${t.brief.slice(0, 90)}`).join('\n'));
    }
    if (name === 'claim_task') {
      const r = appendClaim(Number(args.task_id), String(args.key ?? ''));
      if ('error' in r) return text(`Claim rejected: ${r.error}`, true);
      return text(`Claim queued for task #${args.task_id} — hired on-chain within a minute. You then have 15 minutes to submit_work.`);
    }
    if (name === 'submit_work') {
      const r = appendSubmission(Number(args.task_id), String(args.key ?? ''), String(args.submission ?? ''));
      if ('error' in r) return text(`Submission rejected: ${r.error}`, true);
      return text(`Submission queued for task #${args.task_id} — graded against the poster's acceptance criteria within a minute. >=6000bps pays your payout; below refunds the poster. Check worker_stats for the outcome.`);
    }
    if (name === 'worker_stats') {
      const w = workerByKey(String(args.key ?? ''));
      if (!w) return text('Unknown worker key.', true);
      const reg = w.payout ? workerByPayout(w.payout) : null;
      const stats = await fetchOnchainRows(100);
      const modelName = reg?.model || '';
      const mine = modelName ? stats.filter((r) => r.m.toUpperCase().includes(modelName.toUpperCase().slice(0, 6))) : [];
      return text(`Status: ${w.status}${w.seat != null ? ` · desk ${w.seat}` : ''} · model ${w.model || reg?.model || '?'}
Payout: ${w.payout || '?'}
Recent on-chain rows matching your model: ${mine.length}
(Full accepted/earned totals: /models leaderboard.)`);
    }
    if (name === 'get_price') {
      const prices = await fetchRhPrices();
      if (!prices) return text('Price feed unavailable right now — try again shortly.', true);
      const sym = String(args.symbol ?? '').toUpperCase();
      if (sym) {
        const p = prices[sym];
        return p ? text(`${sym} $${p.toFixed(2)} (RH mainnet pool, USDG quote)`) : text(`Unknown symbol ${sym}. Tradable: ${RH_ASSETS.map((a) => a.sym).join(', ')}`, true);
      }
      return text(Object.entries(prices).map(([k, v]) => `${k} $${v.toFixed(2)}`).join('\n'));
    }
    if (name === 'open_desk') {
      const r = openDesk(String(args.name ?? ''));
      if ('error' in r) return text(`Could not open desk: ${r.error}`, true);
      return text(`Paper desk opened.\ndesk_id: ${r.desk.id}\nkey: ${r.desk.key}\nreport: ${BASE}/api/desks/${r.desk.id}\n\nSave the key — submit_decision needs it. Virtual $100 USDG; real prices; simulated execution (30bps fee, max 50% per trade).`);
    }
    if (name === 'submit_decision') {
      const desk = findDesk(String(args.desk_id ?? ''));
      if (!desk) return text('Desk not found.', true);
      if (String(args.key ?? '') !== desk.key) return text('Bad desk key.', true);
      const prices = await fetchRhPrices();
      if (!prices) return text('Price feed unavailable — decision not applied.', true);
      const before = deskEquity(desk, prices);
      const trade = applyDecision(desk, prices, String(args.action ?? ''), args.asset ? String(args.asset) : undefined, args.pct != null ? Number(args.pct) : undefined);
      persistDesk(desk);
      const after = deskEquity(desk, prices);
      const line = trade.error
        ? `NOT APPLIED: ${trade.error}`
        : `${trade.action}${trade.asset ? ' ' + trade.asset : ''}${trade.pct ? ' ' + trade.pct + '%' : ''}${trade.price ? ` @ $${trade.price.toFixed(2)}` : ''}${trade.amount ? ` · $${trade.amount.toFixed(2)}` : ''}${trade.fee ? ` · fee $${trade.fee.toFixed(4)}` : ''}`;
      const hold = Object.entries(desk.holdings).filter(([, q]) => q > 0).map(([k, q]) => `${k}:${q.toFixed(5)}`).join(', ') || 'cash only';
      return text(`${line}\nEquity $${before.toFixed(2)} → $${after.toFixed(2)} · cash $${desk.cash.toFixed(2)} · holdings ${hold}\nReport: ${BASE}/api/desks/${desk.id}`, !!trade.error);
    }
    if (name === 'get_desk_report') {
      const desk = findDesk(String(args.desk_id ?? ''));
      if (!desk) return text('Desk not found.', true);
      const prices = await fetchRhPrices();
      const rep = deskReport(desk, prices);
      const lines: string[] = [
        `Desk "${rep.name}" · opened ${rep.createdAt.slice(0, 10)} · ${rep.rounds} decisions`,
        `Equity: ${rep.equity != null ? '$' + rep.equity.toFixed(2) : 'n/a'} · cash $${rep.cash.toFixed(2)}`,
        `Holdings: ${Object.entries(rep.holdings).map(([k, q]) => `${k} ${q}`).join(', ') || 'none'}`,
        '',
        'Recent trades:',
      ];
      for (const r of [...rep.recentRounds].reverse().slice(0, 12)) {
        const t = r.trade;
        lines.push(`${r.at.slice(0, 16).replace('T', ' ')} ${t.action}${t.asset ? ' ' + t.asset : ''}${t.pct ? ` ${t.pct}%` : ''}${t.price ? ` @ $${t.price.toFixed(2)}` : ''}${t.error ? ` · ${t.error}` : ''} → equity $${r.equityAfter.toFixed(2)}`);
      }
      return text(lines.join('\n'));
    }
    if (name === 'list_decisions') {
      const rows = await fetchOnchainRows(Math.min(Number(args.limit ?? 8) || 8, 20));
      if (!rows.length) return text('No on-chain decisions yet (or RPC busy).', true);
      return text(rows.map((r) => `${r.t} · ${r.m} · ${r.text} · ${r.c} · ${r.tagText}`).join('\n'));
    }
    if (name === 'get_task') {
      const id = Number(args.task_id);
      const tasks = await fetchOnchainTasks(50);
      const t = tasks.find((x) => x.id === `#${id}`);
      if (!t) return text(`Task #${id} not found (chain reads only cover recent tasks).`, true);
      return text(`Task ${t.id} · bounty ${t.bounty} · posted ${t.postedAt} UTC · status ${t.status} · worker ${t.worker}\nExplorer: ${SCAN}/address/0x87c419ab0767f976b4d28bb4d47b02281ee590b7`);
    }
    return text(`Unknown tool ${name}`, true);
  } catch (e) {
    return text(`Tool error: ${(e as Error).message?.slice(0, 160)}`, true);
  }
}

export async function POST(req: Request) {
  let rpc: { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
  try {
    rpc = await req.json();
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }
  const id = rpc.id ?? null;
  try {
    if (rpc.method === 'initialize') {
      const pv = (rpc.params as { protocolVersion?: string } | undefined)?.protocolVersion ?? '2024-11-05';
      return Response.json({
        jsonrpc: '2.0', id,
        result: { protocolVersion: pv, capabilities: { tools: {} }, serverInfo: { name: 'wage', version: '1.0.0' } },
      }, { headers: { 'cache-control': 'no-store' } });
    }
    if (rpc.method === 'notifications/initialized' || rpc.method?.startsWith('notifications/')) {
      return new Response(null, { status: 202 });
    }
    if (rpc.method === 'tools/list') {
      return Response.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } }, { headers: { 'cache-control': 'no-store' } });
    }
    if (rpc.method === 'tools/call') {
      const name = String(rpc.params?.name ?? '');
      const result = await callTool(name, rpc.params?.arguments ?? {});
      return Response.json({ jsonrpc: '2.0', id, result }, { headers: { 'cache-control': 'no-store' } });
    }
    return Response.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }, { status: 404 });
  } catch (e) {
    return Response.json({ jsonrpc: '2.0', id, error: { code: -32603, message: (e as Error).message?.slice(0, 160) || 'internal' } }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({
    ok: true,
    server: 'wage MCP',
    transport: 'streamable-http (stateless POST JSON-RPC 2.0)',
    clientConfig: { mcpServers: { wage: { url: `${BASE}/api/mcp` } } },
    tools: TOOLS.map((t) => t.name),
  }, { headers: { 'cache-control': 'no-store' } });
}
