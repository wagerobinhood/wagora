# plan — Wage

> **边界: 用户私钥自持 / 事实可核 / 费用与操作范围明确 | 基线: docs/baselines/baseline-v1.html（冻结 2026-11-09）| 能力范围: product-contract v1.0（F1–F15）| 模型: 5 家 LLM API（账号=用户待办，M3 前）| 项目模式: product | 钱包: 交易签名（post/desks），无托管**

## 目标

把 usebrainchain.com 的 agent 劳务市场复刻为 RH 链上的真实产品（A- 不发链）：劳务市场合约组 + DeskMandate + 决策引擎 + Wage 官网（C 方向浮账场设计语言）。**2026-11-10 曾换 Elysium，2026-11-11 已切回 RH（换链记录见 docs/changes/）——当前目标链 = Robinhood Chain（4663）· gas ETH · 结算 USDG · desks=RH 股票代币 · premium=RH 七池直读。**

## 背景与依据

- 参考站全解：`docs/analysis/brief.md`（取证 2026-11-08）
- H2 预检 PASS：股票代币负向封锁模型可被合约交易（`docs/analysis/h2-precheck.md`，DeskMandate 参考参数 1h/200bps/5000bps/3d）
- 设计冻结：`docs/baselines/baseline-v1.html`（G3 PASS，premium 板已实测 7/7 实时池价）

## 端口收据（PORTS.md 四处同号 = 3036）

| 项 | 值 |
|---|---|
| 取号前远程 SHA | 832555b |
| 登记提交 SHA | 13f66cb（仅 dev_docs/PORTS.md，1 file changed）|
| 回读远程 SHA | 13f66cb ✅ 一致 |
| 四处接线 | dev/start `-p 3036` · compose `3036:3000` · `.env.local` URL `http://localhost:3036` · VPS Caddy 反代 3036（R5/R7 实施）|

## 任务清单（T0–T6 · 稳定 ID · 依赖字段为准）

### T0 冻结（已完成 2026-11-09）
- [x] baseline-v1 冻结 + 确认单定稿（G3 PASS）· 预埋契约表进 architecture

### T1 工程化
- [ ] Next.js 16 App Router + Tailwind CSS 4 + pnpm 脚手架（端口 3036）
- [ ] baseline-v1 首页 8 段 → 组件；15 子页 hash view → page.tsx（**内容移植不重写**）
- [ ] 配置中心接入（Q11 默认接）：`site-config.ts` + globalThis 缓存 + revalidate 300 + fallback；env 四件套
- [ ] 数据层：RH RPC 直连封装（viem）——premium 池价（移植 baseline 实测实现）、decisions/tasks/models 事件读取（EXAMPLE→真数据切换开关）
- [ ] AGENTS.md 按真实目录校准；README 落盘

### T2 链上资产（合约工程）
- [ ] **纸面交易台（2026-11-10 定，换链后沿用）**：desks 不做真钱交易——模型对真实市场价（RH 股票池）做 BUY/SELL/HOLD 决策并公开理由，虚拟净值标记市价，每轮哈希留存（每日可锚上链 ≈$0.002/天）。零资金、零交易。见 `engine/paper-desk.mjs`（RH 池版）
- [ ] 合约套件 Solidity：TaskBoard / DecisionLog / ModelRegistry / DecisionExecutor / DeskMandate（自研，机制参照源站公开验证设计；参数 1h/200bps/5000bps/3d 对齐）。**部署目标：Robinhood Chain（4663），gas=ETH；赏金=USDG（0x5fc5…d168，Global Dollar 已验证）**
- [ ] 测试套件（Foundry/Hardhat）全分支覆盖：托管/评级/退款/边界拒绝/C1 isBlocked 复验
- [ ] RH testnet (46630) 部署 + 端到端（需 testnet ETH；水龙头待实测）
- [ ] 主网部署（4 件套，实测 gas 3,363,082 ≈ **$0.12**）= **独立授权动作（等用户显式指令）**；部署后第一步 = C1 复验（isBlocked(部署地址)——RH 股票代币负向封锁模型）
- [ ] **GitHub 两阶段开源（用户确认 2026-11-09）**：R7 建仓时 contracts 仓库 private → 主网部署验证后转 public → network 页填真链接。范围=contracts/+测试（engine/mcp 不开源——源站同款边界）；开源≠安全：主网前做隔离审计轮，未审计不得写 audited
- [ ] 决策引擎服务（Node worker）：监听 TaskBoard → 五模型招标 → 评级（置信度）→ DecisionExecutor 写入；house 任务暖场 + LLM 成本护栏（月度上限熔断）；密钥仅服务端
- [ ] MCP server（F9）：expose post-task / get-result；鉴权 + 限流

### T3 内容页
- [ ] how-it-works / roadmap / terms / privacy / testnet 正文（英文发版层；措辞过 public-content-policy）
- [ ] network 合约注册表接真地址（部署后）；operations/changes 事件时间轴接真事件

### T5 合规 SEO（提前建基线）
- [ ] 诚实 grep 清单：源站身份 + **Elysium 全部词（Elysium/99901/99801/HYPE/WHYPE/KNTQ/Ramses——2026-11-11 换回 RH 后为禁词表）** 0 命中；treasury/buyback/allocation 语义 0 命中；Live 仅修饰已部署（`Live on Robinhood Chain`）；EXAMPLE 标注全覆盖
- [ ] OG 图生成（og-card-draft → og/index.png）· sitemap 16 路由 · robots · JSON-LD
- [ ] `Live on Robinhood Chain` 徽章显隐随部署状态（契约 C3 行）

### T4 收敛
- [ ] 体验追认轮（产品契约表逐行对代码）
- [ ] Lighthouse ≥ 85（性能/SEO/无障碍建议值）
- [ ] 移动端全路由走查

### T6 上线
- [ ] 部署三问三 Gate（域名 / 资源 / 后台四项）→ **等用户「开始部署」**
- [ ] 共享 Caddy 接入（3036）· 上线 Gate（形态+复检+用户上线确认）
- [ ] 分析产物迁入核对（本仓 docs/analysis、docs/gates 已建，reports/ 保留 raw+指针）

## 验收三档

| 档 | 标准 |
|---|---|
| 功能 | F1–F15 契约逐行验收；测试网端到端全通；premium 7/7 实时；EXAMPLE→Live 切换正确 |
| 合规 | 诚实 grep 0 红线；公开内容边界 0 命中；US persons/免责声明全站可见；C1/C2/C3 条件落账 |
| 性能 | Lighthouse ≥85 · 首屏 JS ≤ 300KB gzip · RPC 读取 20s 轮询 + 降级兜底 |

## Out of Scope（每条一行理由）

- 自建 rollup/链 —— 卡 1-bis A- 拍板（小团队，砍运维重担）
- x402 支付轨 —— F15 Phase n（MCP 先行验证需求）
- $WAGE 质押/提案/治理 —— F3 Phase n（等 PONS 发射）
- 资金费率/treasury/回购类页面与数据模型 —— public-content-policy 红线
- 多语言站 —— 源站纯英文 + 铁律 narrative 对外 English
- 自有 docs 子域 —— how-it-works 承载（确认单 A4）

## 风险

| 风险 | 处置 |
|---|---|
| LLM API 成本失控 | 引擎月度上限熔断（T2）+ 按任务计费上限（R2 已确认） |
| Robinhood 侧 pause/升级 | 降级态设计（baseline 已画）+ desks recall 通道 + C3 监控 |
| RPC 限速 | 服务端聚合缓存 + 20s 轮询 + NOT READING 公开态 |
| 合约安全 | 测试全覆盖 + 参数对齐源站已验证值 + 主网前隔离审计轮 |
| 源站身份污染 | T5 诚实 grep 每轮必跑（地址/品牌/专有词三表） |
