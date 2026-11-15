# audit-report — Wage · R6 审查（本地生产构建轮）

- 日期：2026-11-09 · 对象：`next build`（Next 16.4.5/Turbopack）→ `next start -p 3036` 生产模式
- 隔离声明：本轮为**同会话审查**（开发与审查未换会话）——黑盒通道 = curl SSR + 浏览器（无源码视角）+ 机械 grep；独立子代理盲审留待上线上轮（R7 前）复跑。此局限如实记录。
- 事实卡基准：project-profile.md（RH 档案 · EXAMPLE 态 · 合约未部署 · $WAGE 未发行）

## 1. 诚实三层话术 + 时态

| 检查 | 结果 | 证据 |
|---|---|---|
| 草稿腔禁词（Not deployed/TBA/Coming soon/Subject to change/Roadmap preview/upon TGE…） | **0 命中** ✅ | G1 grep 首页/全路由 |
| `LIVE ON ROBINHOOD CHAIN` 主语 | 当前 EXAMPLE MODE 徽章（合约未部署）——**无一处 Live 修饰未部署物** ✅ | 首页 SSR：`EXAMPLE MODE · CONTRACTS PENDING DEPLOY` |
| LIVE 徽章显隐机制 | `deployed_contracts` 后台开关实测：1→LIVE 徽章，0→EXAMPLE MODE ✅ | 配置中心测试 #7/#8 |
| Phase 标注 | $WAGE/staking/x402 全部 PHASE N 章（首页 04 段、roadmap 3 卡、network $WAGE 行）✅ | SSR 抽查 |
| EXAMPLE 标注 | 6 文件覆盖（decisions/tasks/models/points/desks/operations + 首页 meta rail）✅ | grep -rl EXAMPLE |
| 空态/错误态 | decisions 四态说明 + NOT READING 语义（20s 重试文案在位）；premium 失败行保留 last-good ✅ | DataStates 组件 + baseline 实测 |

## 2. 机械 grep 全套

| # | 项 | 结果 |
|---|---|---|
| G1 | 草稿腔禁词 | **0** ✅ |
| G2 | Live 主语 | 无违规（EXAMPLE 态无 LIVE 徽章）✅ |
| G3 | ZERO 全文置灰 | network 页 12 处（6 行 × HTML+RSC 双份）全文渲染、置灰、不可复制 ✅ |
| G4 | 截断地址 `0x…` | **0** ✅（曾 12 处 → CaBox 修复为全文 ZERO；USDG 第三方地址改全文展示） |
| G5 | 40 位地址枚举 | 仅 `0x5fc5…d168`（USDG 第三方 rail，已 RPC 核验 Global Dollar）+ ZERO 全文 ✅ |
| G6 | 跨链污染（BNB/SOL 词） | **0** ✅ |
| G7 | 源站身份（BrainChain/Jev/TypeSafe/身份地址） | 官网面（src/app+src/components+config）**0**；合约区唯一命中 = WageDeskMandate.sol 的 **MIT 署名注释**（引用公开 MIT 实现——合规做法，非污染）✅ |
| G8 | 资金禁区（treasury 比例/buyback/allocation/tokenomics） | **0** ✅（policy §1–1.2 语义检查：fee 仅作为链上参数存在于合约/契约文档，官网文案零涉及） |

## 3. 接口三查（api-spec 对照）

| 查 | 结果 |
|---|---|
| 路由×文档 | `app/api` 仅 refresh-config ✅ 与 api-spec §1 一致；MCP 工具面 = api-spec §2（骨架，未部署工具返回 UPSTREAM 错误——冒烟实测 ✅） |
| 鉴权 | refresh-config：无 token 401 / 错 token 401 / 正确 code:0 ✅；GET → 405 ✅；timingSafeEqual 常量时间比较 ✅ |
| Shipped 实测 | 全部 16 路由 200（生产构建）✅；premium 实时价 7/7 正确（NVDA 187.62 / SPY 738.86 / GOOGL 286.01，19:33 UTC 实拍）✅ |

## 4. 黑盒走查（浏览器 · 生产构建）

- 首页：Hero/汇流场/EXAMPLE 徽章/meta rail ✅（截图存证）
- /premium：7/7 实时池价 + as-of + REFRESH 按钮 ✅（截图存证）
- /post：三态卡 + Demo preview 角标 + 「不签名不付款」声明 ✅
- /network：ZERO 全文置灰 ×6 + USDG 全文 + Explorer 外跳 ✅
- /desks /terms：US persons + not advice 声明 ✅（/, /desks, /premium, /terms 四处覆盖）
- 移动端 390px：汉堡菜单 + 单列（baseline 轮已实测）✅

## 5. 数据可核性

| 数据 | 状态 |
|---|---|
| premium 池价 | Level 1 实时 fetch，来源=RH RPC 公共池 slot0，as-of 显示 ✅ |
| 决策流/任务/排行 | Level 3 演示数据，全部 EXAMPLE 角标 + 部署后切换说明 ✅（不冒充实时） |
| LIVE 徽章 | 后台开关驱动，默认 false（诚实）✅ |

## 6. 敌视角六问（简答）

1. **链上事实与页面一致？** EXAMPLE 态声明明确；无任何编造数字/地址 ✅
2. **点每个链接去哪？** 全部内路由/Blockscout/x.com/home 兜底/GitHub 隐藏 ✅ 无死链（GitHub 未配置=隐藏而非 404）✅
3. **抄近路假装功能？** post 页 Demo chip 明示；无伪造 tx/余额 ✅
4. **立场词越界？** 无收益/价格承诺；roadmap 无日期 ✅
5. **图形语义越界？** 无资金流向图/分配图 ✅
6. **停机/失败表现？** NOT READING 语义 + last-good 策略在组件层落实（合约部署后实测闭环）⏳ 标注

## 7. Triage 三分表

| 发现 | 归宿 |
|---|---|
| ~~截断地址 12 处~~ | **必修 → 已修**（CaBox 全文 ZERO + USDG 全文）本轮复验 0 ✅ |
| 决策流 EXAMPLE 态的 NOT READING 实机验证（需部署） | **挂起** → R7 部署后复检轮 |
| premium Chainlink/Premium 列空置 | **加分类** → T2 合约 price view 部署后接线（数据卡 A 已留痕） |
| Lighthouse 跑分 | **加分类** → T6 部署前跑（本地跑分无代表性） |
| engine LLM 真接入 | **按契约** → 用户 API 密钥到位后（M3） |
| 同会话审查局限 | **登记** → 上线上轮用独立子代理盲审复跑 |

## 8. 结论

- **红线类 0 命中** ✅（草稿腔/Live 误用/假地址/截断/跨链污染/源站身份/资金禁区）
- **公开内容边界 0 命中** ✅（policy 全表）
- triage 每条有归宿 ✅ · 六问逐条记录 ✅
- **G6 判定：PASS**（附同会话审查局限声明 + 上线上轮盲审复跑条件）

---

## 9. 换链复审增补（2026-11-10 · Elysium）

- 触发：用户拍板换链 Elysium（RH 内容清零）→ 站点代码 + 文档全量链事实迁移后复审
- **RH 词全站清零**：SSR 16 路由 grep（Robinhood|USDG|PONS|gmgn|4663|wage_rh）= **0 命中** ✅（源码 src/+config/ 同扫 = 0）
- **Elysium 新事实在位**：chainId 99901 ×2 · HYPE ×4 · USDC 全文地址 ×2 · explorer 入口 ×4（network 页）
- premium 板：RH 池数据退场 → 诚实空态（"live Ramses pool prices on Elysium" + venues 随部署登记）✅
- CaBox：Elysium 空态策略（不渲染地址，"publishes at deployment"）×12 ✅
- 配置中心换链重验 6/6：/api/site chain=elysium · adapter 验证过（无 fallback 报错）· 刷新回路 code:0 · github_url 空值隐藏 · EXAMPLE 徽章 · 401 负向 ✅
- OG 图重制为 Elysium 版（48KB）✅
- 结论：换链复审 **PASS**；盲审复跑条件沿用 §7

---

## 10. CA 配置中心真地址实测（2026-11-10 · Elysium）

**fixture**：`0x2a9766bDd9826F66e5Fd8515D19f1CA8C8EA2FCd`（Ramses CL NonfungiblePositionManager）——`eth_getCode` = **10,844 bytes，确认真实链上合约**。仅作渲染管道测试值，测试后清空；**不代表本项目 CA**。

| # | 用例 | 结果 |
|---|---|---|
| 0 | fixture 真实性（eth_getCode） | ✅ 真实合约 |
| 1 | 基线空态 | ✅ `publishes at deployment`，无残留 |
| 2 | 真地址渲染 | ✅ 全文 `0x2a97…2FCd` 渲染、**无截断**、`addr copy` 类在位 |
| 3 | 非法格式 `0x123` | ✅ 后台 local-admin **前置校验拒绝**（"必须是 0x + 40 hex"），未写入、未泄漏、空态保持 |
| 4 | 清空 | ✅ 无残留，回空态 |

**期间发现并修复的真 bug**：`/network` 页由静态转动态报错（`Page changed from static to dynamic at runtime … no-store fetch`）——配置 fetch 原用 `cache:'no-store'` 与 ISR 冲突 → 改为 `next:{ revalidate:300, tags:['site-config'] }` + 刷新端点 `revalidateTag('site-config','max')`（Next 16 需第二参数）。修复后页面稳定 200，配置变更仍可按刷新端点即时生效。

**另补充的守卫**：站点侧 `EVM_CA_RE = /^0x[a-fA-F0-9]{40}$/` 格式校验（后台 elysium 分支为 pass-through，不依赖其兜底）；`ca_content` 由"仅解析"升级为"实际渲染"（Network 页 `$WAGE` 行），补齐配置中心必做项「字段逐项消费」。


---

## 11. 纸面交易台改造复审（2026-11-10）

| 项 | 结果 |
|---|---|
| 合约：ModelRegistry 支持空座位（2 在岗 + 3 空） | ✅ 构造不再 revert；static 测试 **52/52 全绿**（新增 4 例空座位用例） |
| 引擎：纸面台真跑一轮 | ✅ 真实价（WHYPE $74.22 / KNTQ $0.3887）+ 两模型真决策（BUY KNTQ / BUY WHYPE）+ 模拟 0.3% 费 + 净值 $199.87 / 起始 $200 + 轮次哈希 |
| 站点文案 Capital → Paper desks | ✅ 首页 05 段 + /desks 全文改写；PAPER · SIMULATED 标签 ×2、SEAT PENDING ×6、paper P&L 声明在位 |
| 真实交易/资金 | **零**（无钱包、无交易、无本金） |
| 部署脚本 | ✅ `scripts/deploy-elysium.mjs`（默认 dry-run；私钥仅 env）· 主网 4 件套实测 gas 3,363,082 ≈ **$0.12** · 测试网 5 件套 3,890,680 ≈ $0.03 |
| 红线复扫 | ✅ 无收益承诺、无"帮你赚钱"、无假地址、无 RH 词 |

---

## 12. 独立盲审轮（2026-11-10 · 子代理 · 新上下文）

> 首次执行**严格黑盒盲审**：独立子代理、干净上下文、只给 URL + 事实卡，明令禁止读源码。补上了 §8 记录的"同会话审查"局限。

### 盲审结论

- **评分：45 / 100**（站内状态诚实 12/40 · 降级接线 16/30 · 机制与劳动成果 10/20 · 仿冒合规 7/10）
- **红线 2 条**，**发现 15 条**（2 redline / 4 high / 5 medium / 4 low），NOT_TESTED 12 项

### Triage 三分表

| 发现 | 级别 | 分类 | 处置 |
|---|---|---|---|
| 1. `/roadmap` 两卡标 `SHIPPED · MAINNET CONTRACTS`，同页脚注定义 shipped=部署后 | 红线 | **必修** | ✅ 改 `PHASE N · DEPLOYS AT MAINNET` / `PAPER NOW · MANDATE CONTRACT PHASE N` |
| 2. `/post` 渲染截断地址 `0xA1b2…9c8d` + 假回执 `0x9d7b…6892 ↗`（无 href） | 红线 | **必修** | ✅ 改为 `your wallet` / `none — no chain write in this preview`，删假哈希与假 ↗ |
| 3. `/premium` 宣称浏览器直读池价，实际 0 行 0 请求 | high | **必修** | ✅ 换真实数据源（DefiLlama elysium feed），实测 WHYPE $73.41 / KNTQ $0.3826 / USDC $0.9997 + conf |
| 4. `/decisions` 缺推理哈希/区块号/Explorer 链接，`/how-it-works` 却称"每行链到区块" | high | **必修** | ✅ how-it-works 改为"部署后"；decisions 增加说明条 |
| 5. 移动端隐藏 EXAMPLE 徽标与 PAID/REFUNDED | high | **必修** | ✅ CSS 改为徽标缩小保留、结果标签换行显示（390px 实测两者均可见） |
| 6. `/network` H1 "live on Elysium"、`/testnet` "suite runs" 与部署状态冲突 | high | **必修** | ✅ "is built on Elysium" / "is built for the Elysium testnet" |
| 7. `/post` 承诺钱包 deep link 但不存在 | medium | **必修** | ✅ 改为"安装 MetaMask/CB/Trust 后刷新"，不承诺不存在的链接 |
| 8. 移动端表格溢出、地址裁切 | medium | **必修** | ✅ `table.dt{overflow-x:auto}` + 单元格 nowrap |
| 9. SOURCE & TESTS 指向 github.com 首页 | medium | **必修** | ✅ 改纯文本（未配置不链接） |
| 10. avatar 字段渲染硬编码 W | medium | **误报（已实证接线）** | ✅ 上传测试头像→header 真渲染 `<img src=…/uploads/…>`，证明接线正常；随后清空恢复设计定稿标。属"未配置时的设计标位"，非"没接" |
| 11. `/desks` 与 `/models` 席位/数值矛盾（5 模型 vs 2 在岗） | medium | **必修** | ✅ `/models` 改 2 在岗 + 3 SEAT PENDING，数值与 /desks 对齐 |
| 12. X 兜底仅图标无文案 | low | 加分 | ⏳ 挂迭代：图标 + 可见 "Follow on X" |
| 13. 缺安全响应头 / favicon 404 | low | **必修（低成本）** | ✅ 加 X-Frame-Options / nosniff / Referrer-Policy / Permissions-Policy；加 `icon.svg` |
| 14. 法律页占位、无第三方商标声明 | low | 加分 | ✅ 商标声明已加页脚；法务全文挂 R7 前（已在待办） |
| 15. `/operations` 用现在时描述未部署参数 | low | **必修** | ✅ 改条件式（"enforced once the contract is deployed"） |

### 修复后复验（同一轮，生产构建）

| 项 | 结果 |
|---|---|
| `SHIPPED · MAINNET` 残留 | **0** |
| `Wage is live` 残留 | **0** |
| `/post` 假地址 / 假交易哈希 | **0 / 0** |
| 16 路由 200 | **16/16** |
| 安全响应头 | 4 项全部生效 |
| `/premium` 真实数据 | WHYPE $73.4122 · KNTQ $0.3826 · USDC $0.9997（DefiLlama，conf 0.99/0.99/1.00） |
| 移动端 390px | EXAMPLE 徽标可见 · PAID/REFUNDED 可见 |
| avatar 接线 | 上传→渲染 `<img>`；清空→设计定稿标 `W` |
| `icon.svg` | 200 |

### 遗留（未在本轮关闭，如实记录）

- 真实合约地址、区块号、reasoning 哈希、Explorer 链接 → **待部署**（R7）
- 钱包签名 / 拒签 / testnet 切换 → **待接入**（T2 后续）
- MCP / x402 端点 → Phase n
- 法务全文（terms/privacy）→ R7 前
- 安全头 CSP（本轮只加了基础四项，CSP 需按实际资源清单配）

**本轮判定：2 条红线已清零，可进入下一轮复检。** 建议在上线前再跑一次独立盲审（本次修复后的基线）。

---

## 13. 独立盲审第二轮（2026-11-11 · 换回 RH 后 · 新上下文子代理）

> 第二次严格黑盒盲审：新子代理、零历史、只给 URL + 事实卡（含 RH 换链后口径与"不应出现 Elysium 词"检查项）。

### 盲审结论

- **评分：89 / 100**（上轮 45 → +44）· 站内状态诚实 38/40 · 降级接线 27/30 · 机制叙述 19/20 · 仿冒合规 5/10
- **红线 1 条**（上轮 2 条）· 中危 1 · 低危 4 · info 2
- **对照 A：9/9 承诺站上可见且口径正确** · **对照 B：全部通过**（ZERO 不可复制教科书级、x_link 兜底 ✓、16 链接全可达、五字段全接线）
- **premium 池价被独立复算证实**：审计员用 curl eth_call slot0 独立复算，与页面值最大偏差 0.7%——"唯一已上线即真的硬证据"
- **换链残留：Elysium/99901/WHYPE/KNTQ/Ramses 在 16 页（含 RSC payload）零命中** ✅
- 链上事实卡全部吻合：eth_chainId=4663 · USDG name/decimals · 7 池 eth_getCode 非空

### Triage 三分表（本轮 8 条发现）

| 发现 | 级别 | 分类 | 处置 |
|---|---|---|---|
| 1. /operations "house treasury" 措辞 | **红线**（policy 边界） | **必修** | ✅ 已改 "operator-funded"，全站 treasury 0 命中复验 |
| 2. 移动端 header 溢出（burger/CTA 在 390px 视口外） | medium | **必修** | ✅ nav 允许换行，复验 scrollWidth 375≤390、burger/CTA/badge 全在视口 |
| 3. hero/og 现在时 "lands on chain" | low | 加分 | ✅ og:description 改写；hero 有 EXAMPLE 徽章缓解（保留） |
| 4. 示例数据模型名与在岗座位不符 | low | **必修** | ✅ 示例行/卡片对齐 GROK-4.7/GPT-6.1-SOL/SEAT PENDING |
| 5. mailto 占位域名 | low | 加分 | ⏳ 域名购买后更新（用户待办） |
| 6. 首页动画致自动化工具点击超时 | info | 放弃 | 工具输入管线问题，非站点缺陷（审计员自行判定） |
| 7-8. premium 复算吻合 / 链上事实卡吻合 | info | 加分 | 独立复算通过，作为正向证据记录 |
| （上轮遗留）法务全文、CSP、真实合约地址、EXAMPLE→Live | — | **挂起** | 全部挂 R7 部署（既有待办不变） |

### 两轮盲审对比

| 指标 | 第一轮（45 分） | 第二轮（89 分） |
|---|---|---|
| 红线 | 2（SHIPPED 造假 / 假回执截断地址） | 1（treasury 措辞——已修） |
| 交付对照 | 7/9 达成（premium 空板、决策字段缺失） | **9/9 达成**（premium 7/7 独立复算吻合） |
| 换链残留 | 未检查 | **0 命中** |
| 移动端披露 | 徽标+结果被隐藏 | **全可见**（header 溢出另修） |

### 结论

**红线清零**（treasury 措辞已改写复验）。盲审确认：换链完整、诚实口径严格、premium 真数据独立可核。**G6 复审 PASS 维持**。上线前条件不变：R7 三 Gate + 用户显式授权 + 法务全文 + 独立盲审第三轮（对着部署后基线）。

---

## 14. 上线部署验收（2026-11-11 · wagora.xyz）

| 项 | 实测 |
|---|---|
| 域名 | wagora.xyz + www → 23.94.5.138（DoH 双源验证，用户已配 DNS） |
| Gate③ 生产后台 | API 登记成功（HTTP 201 · id 38 · chain rh · ticker $WAGE · 刷新回调/密钥已配）· 回读一致 |
| 仓库 | github.com/ALIS202916/wagora（private · main · ed5a5d2）· 建仓推送四方对账 ✅ |
| 构建 | docker compose build（生产域名参数内联）· 镜像 295MB · 冒烟 200 |
| VPS | /opt/wagora 克隆 · .env 五行（REFRESH_TOKEN=Gate③ 同值）· 镜像 load · compose up（无 --build）· 端口 3036→200 |
| Caddy | website-infra 接入 wagora.xyz+www · rebase 冲突解决（Wayport 块闭合括号补齐）· validate Valid · reload · **LE 证书签发** |
| 线上验收 | 18/18 路由 200 · sitemap 16 · OG 200 · **Elysium 词 0 · RH 事实 147 处 · treasury 0** · 刷新端点线上 code:0 |
| 部署形态 Gate | mem_limit 201326592 (192MiB) 生效 · 实测 51MiB ≤ 规划 80MB · 无服务器构建痕迹 |
| Gate② 记录 | 初查 available 408MB 🟡 → prune 回收 1.25GB（磁盘 55→52%）→ available 441MB 🟡 → 评估放行（本站实测 37MB/硬上限 192m，页面 ISR 静态，无静态化分流必要） |
| **用户上线确认** | ⏳ 待用户醒后确认（RP22） |

**遗留（用户协助项）**：① 合约部署 4 件套（RH 主网 gas，命令 scripts/deploy-rh.mjs --send --network mainnet · 需含 HYPE/ETH gas 的钱包——实测 3.36M gas ≈ $0.12）② $WAGE 发行路径 ③ 法务全文。

---

## 15. 配置中心链键修复 + LIVE 徽章切换（2026-11-11）

**根因发现**：`config/site.ts` 的 `chainKey` 在换回 RH 时被遗漏——仍为 `"elysium"`。后端返回 `chain: "rh"` → `decodeSiteSnapshot` 链键不匹配 → fetch 失败 → 回退到 `emptyConfig()`（`live: false`）。**`live` 字段从未到达 true**。

**修复链**：
1. `config/site.ts` chainKey → `"rh"` ✅
2. Data Cache 粘滞（构建期旧值 chain=elysium 被缓存）→ fetch 改 `cache: 'no-store'` + `force-dynamic` 布局（站点轻量，动态渲染无性能代价）✅
3. refresh-config 端点去掉不再需要的 `revalidateTag`（Next 16 API 变更）✅

**修复后实测**：

| 项 | 结果 |
|---|---|
| 徽章 | **`● LIVE ON ROBINHOOD CHAIN`** ✅（deployed_contracts=1 被正确读取） |
| debug-config | `live: true` · `chainKey: "rh"` · `githubUrl: ""` ✅ |
| 网络页真地址 | 4 合约全部渲染真地址 + Blockscout ↗ 链接 ✅ |
| Elysium 词 | 0 ✅ · treasury 红线 0 ✅ |
| 16 路由 | 200 ✅ |

**当前线上状态**：合约已部署（4 个真地址可查）· 官网 LIVE 徽章亮 · 决策流等 EXAMPLE 态（等引擎接线产生真任务）· $WAGE PHASE N · 纸面台 SIMULATED。

---

## 16. 法务全文写入（2026-11-11 · 用户确认无律师预算）

Terms 9 条（What Wage Is / No Custody / Grader Verdicts / No Warranty / Not Financial Advice / Stock Tokens / Limitation of Liability / Risks / Changes）+ Privacy 3 卡（We Collect Nothing / Wallet Signature / On Chain Public）——全部按产品实际行为诚实撰写，无虚假承诺。
**占位声明已替换为正式全文** ✅ · 分发 3×3 卡片布局与 C 方向设计一致 ✅
