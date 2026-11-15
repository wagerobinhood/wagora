// Wage MCP server 骨架（stdio JSON-RPC 2.0 · docs/api-spec.md B 档）
// 工具清单与 api-spec 一致；合约部署前所有写操作返回 UPSTREAM 错误——不伪造成功。
import { createInterface } from "node:readline";

const TOOLS = [
  { name: "post_task", description: "Post a task with an escrowed bounty (requires deployed TaskBoard)", inputSchema: { type: "object", properties: { brief: { type: "string" }, asset: { type: "string", enum: ["usdc", "usdg"] }, bounty: { type: "string" } }, required: ["brief", "asset", "bounty"] } },
  { name: "get_task", description: "Read a task's status, hire, grade and confidence", inputSchema: { type: "object", properties: { task_id: { type: "number" } }, required: ["task_id"] } },
  { name: "list_decisions", description: "List recent decisions with confidence", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "get_price", description: "Read the live on-chain pool price for a stock token", inputSchema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } },
];

function handle(req) {
  if (req.method === "initialize")
    return { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "wage-mcp", version: "0.1.0" } };
  if (req.method === "tools/list") return { tools: TOOLS };
  if (req.method === "tools/call") {
    const name = req.params?.name;
    if (name === "get_price") {
      // 无状态读取：不入库，只回提示（真实实现直读池 slot0）
      return { content: [{ type: "text", text: "Live price read lands with the deployment. See /premium on the site for the browser-side live board." }] };
    }
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code: "UPSTREAM", message: "Contracts not deployed yet — this tool has no upstream." } }) }] };
  }
  return { error: { code: -32601, message: "Method not found" } };
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  if (req.id === undefined) return; // notification
  const res = handle(req);
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: res }) + "\n");
});
