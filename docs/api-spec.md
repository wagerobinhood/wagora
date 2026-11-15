# api-spec — Wage（B 档 v0.1 · 对外集成 API + 站内 API）

> 判定依据（architecture §2）：站内自建路由仅 refresh-config（A 档登记即可）；**MCP server = 对外集成面（B 档必出）**。规则：能不建接口就不建——官网数据面全部浏览器/服务端直连 RH RPC，无自建数据 API。

## 1. 站内 API（A 档）

| 路由 | 方法 | 鉴权 | 副作用 | 说明 |
|---|---|---|---|---|
| `/api/refresh-config` | POST | `x-refresh-token`（服务端同值） | 重拉配置缓存 | 配置中心标准端点；不承载任何其他写操作 |

## 2. MCP Server（B 档 v0.1 · 对 agent 的任务入口）

- Base：`https://mcp.<域名>`（部署时定；草案期占位并注明）
- 鉴权：API key（服务端签发、限流 per key）
- 版本头：`X-Api-Version: 2026-11-09`
- 错误格式：`{"error":{"code":"...","message":"..."}}`

### Tools

| Tool | 输入 | 输出 | 副作用 |
|---|---|---|---|
| `post_task` | brief(string ≤2000), asset(usdc), bounty(≥min), deadline | `{task_id, escrow_tx}` | **链上托管（付款由调用方签名或预授权金库，见 §4）** |
| `get_task` | task_id | `{status, hire, grade, confidence, block, refund_tx?}` | 无 |
| `list_decisions` | cursor, limit ≤50 | 分页决策记录 | 无 |
| `get_price` | symbol | `{pool_price_usdg, as_of}` | 无（直读池） |

### 边界

- 不做：代付 gas、托管用户私钥、任何资金池业务；任务赏金永远走用户自己签名或其自有金库合约
- 限流：写 10/min/key，读 120/min/key；429 带 Retry-After
- 数据源：RH RPC（公共）+ 自家合约事件；上游失败 → 503 + `{"error":{"code":"UPSTREAM"}}`，不伪造结果

## 3. 数据源与降级

| 数据 | 源 | 失败 |
|---|---|---|
| 池价 | eth_call slot0（7 池，浏览器/服务端直连） | 行级错误 + last-good |
| 决策/任务 | 合约事件 log | NOT READING 公开态（20s 重试） |
| 配置 | website-admin | `config/site.ts` 兜底 |

## 4. 安全

- 只读默认；写 = MCP（key）+ 钱包亲签 + refresh-config（token）三通道，各管各的
- 密钥仅服务端（引擎 LLM keys / REFRESH_TOKEN / MCP signing key）
- 上游必缓存；机密不入前端；MCP 不经手用户资产托管
