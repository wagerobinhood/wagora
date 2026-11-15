# architecture — Wage

> 依据：baseline-v1（冻结）+ product-contract v1.0 + 确认单定稿 · 端口 3036 · 栈：Next.js 16 App Router + Tailwind CSS 4 + pnpm（编排器规定，无偏离）

## 1. 现状与目标目录

```
wage/
├─ AGENTS.md                    # 仓库速览（T1 校准）
├─ docs/                        # plan/architecture/profile/ops-config/api-spec + analysis/ gates/ baselines/
├─ app/                         # Next.js App Router（T1 建）
│  ├─ page.tsx                  # 首页 8 段
│  ├─ decisions|tasks|models|desks|premium|network|points|operations|changes|roadmap|how-it-works|post|testnet|terms|privacy/page.tsx
│  ├─ layout.tsx / sitemap.ts / robots.ts / opengraph-image.tsx
├─ src/components/              # 区块组件（首页面板/席位卡/数据表/状态条/诚实徽章/CA 框/Phase 章）
├─ src/lib/                     # site-config.ts（配置中心契约）/ rpc.ts（RH 直连）/ pools.ts（premium 数据源）
├─ contracts/                   # Solidity 套件 + 测试（T2）
├─ engine/                      # 决策引擎 worker（T2）
├─ mcp/                         # MCP server（T2）
└─ config/site.ts               # 兜底配置
```

## 2. 路由表（× baseline hash view 一一对应）

| 路由 | 基线 view | 类型 | 数据 | 缓存策略 |
|---|---|---|---|---|
| / | home | 品牌页 | 决策流（RPC 轮询 20s / EXAMPLE 态） | 静态壳 + 客户端数据 |
| /decisions /tasks /models /points | 同名 | 数据页 | F7/F11 事件读取 | 客户端 20s 轮询 |
| /desks | 同名 | 数据页 | F4 mandate 读取 | 同上 |
| /premium | 同名 | 数据页 | **F5 直读池 slot0——RH 七池（已实测 7/7；GOOGL 方向修正保留）** | 客户端按需 + 手动刷新 |
| /network | 同名 | 品牌+数据 | 合约注册表（部署后填值） | 构建时 + revalidate 300 |
| /operations /changes | 同名 | 数据页 | F12 house/治理事件 | 客户端轮询 |
| /post | 同名 | 操作页 | F8 钱包签名（mock→live） | no-store |
| /how-it-works /roadmap /testnet /terms /privacy | 同名 | 内容页 | 静态 | ISR |
| /api/refresh-config | — | 站内 API | 配置中心刷新（鉴权 POST） | no-store |

**api-spec 判定：产出（B 档）**——除 refresh-config 外还有对外集成面：MCP server（独立服务）→ `docs/api-spec.md` 必出。

## 3. 产品契约表（元素 → 行为 → 槽位 → 状态）

| 元素 | 访客点击后看到 | 没数据 | 后台没配 | 槽位 | 确认状态 |
|---|---|---|---|---|---|
| HIRE THE MARKET / SUBMIT A TASK | /post 三态卡 | — | — | — | 已确认 |
| 决策流行 | 表行 + 置信度 + 区块 | 空态引导 /post | NOT READING 公开态 | — | 已确认 |
| premium 行 | 实时池价（金色）+ as-of | 错误行保留 last-good | — | — | 已确认（实测） |
| 合约地址框 | 真地址 + Copy + Blockscout ↗ | — | EVM ZERO + PHASE 章，不渲染假地址 | — | 已确认 |
| LIVE 徽章 | 合约部署事实 | — | 未部署 → 徽章隐藏（切 EXAMPLE 态） | — | 已确认（契约 C3） |
| X 图标 | x.com/wage_rh 外跳 | — | x_link 空 → 图标隐藏 | `x_link` | 已确认 |
| 头像标位 | 定稿标/配置图 | — | 默认几何标 | `avatar` | 已确认 |
| $WAGE 段 | 机制说明 | — | PHASE N 章 | — | 已确认 |
| 席位卡 | 模型排行 + desk 权益 | EXAMPLE 态 | — | — | 已确认 |

## 4. 配置映射表（与产品契约表分开——两层契约）

| 配置字段 | 消费组件 | 兜底 |
|---|---|---|
| `SITE_NAME` | header/footer/OG | `config/site.ts` |
| `x_link` | header/footer X 图标显隐 | 空 = 隐藏 |
| `avatar` | data-avatar 标位 | 设计定稿标 |
| `imageSlots` | **N/A**（纯排版方向，无位图图位——design-brief §0.7 记录） | — |
| `contracts{}` | network 注册表 / 全站 CA 框 | ZERO 态 |
| `live_contract_deployed` | LIVE 徽章显隐 / EXAMPLE 态切换 | false |
| env 四件套 | `NEXT_PUBLIC_SITE_URL / ADMIN_API_BASE / SITE_NAME / REFRESH_TOKEN` | .env.local `http://localhost:3036` |

## 5. 消费矩阵（预埋契约表 → 工程义务【组件:文件】）

| 预埋项 | 组件 : 文件 |
|---|---|
| data-nav-type="top" + data-nav-item | `SiteHeader : src/components/site-header.tsx` |
| data-avatar 两态 | `BrandMark : src/components/brand-mark.tsx` |
| data-x-link 显隐 | `SiteHeader/Footer : src/components/site-header.tsx` |
| 诚实徽章（LIVE/EXAMPLE/PHASE N） | `HonestBadge : src/components/honest-badge.tsx` |
| CA 二态框 | `CaBox : src/components/ca-box.tsx` |
| 决策流表 + 四态 | `DecisionFeed : src/components/decision-feed.tsx` |
| premium 实时板 | `PremiumBoard : src/components/premium-board.tsx`（移植 baseline slot0 实现 + GOOGL 方向修正） |
| post 三态卡 | `PostFlow : app/post/page.tsx`（mock→live 按 `live_contract_deployed`） |
| meta 读数行 | `MetaRail : src/components/meta-rail.tsx` |
| 汇流场 | `DecisionField : src/components/decision-field.tsx`（SVG 首版；Three.js 迭代项——保真要求见 §7） |
| sitemap/robots/OG | `app/sitemap.ts / robots.ts / opengraph-image.tsx` |

## 6. 修改指南

- 冻结基线是唯一视觉真源：改视觉 → 回 R3 单变量循环 + Gate 复核
- 范围变更 → product-contract 加行 → architecture 消费矩阵加格 → plan T 清单加任务
- 数据口径变更 → 数据卡（product-contract §5）先行
- 公开内容边界：任何新模块先过 policy（treasury/buyback/allocation 禁区）

## 7. 工程化保真要求（不可降级 · design-brief §0.6）

1. 汇流场：桌面完整呈现（SVG→Three.js 允许，构图/层级不变；reduced-motion 静态）
2. Work/pays. 实心+描边对（-webkit-text-stroke）
3. meta 读数行全站常驻
4. 金色只用于可核数据与决策者元素

## 8. 允许偏差清单

| 偏差 | 依据 |
|---|---|
| Three.js 替换 SVG 场（迭代期） | 保真 §7.1 允许，构图不变 |
| premium 无 Chainlink 列（部署前） | 数据卡 A：feed 接线挂合约 price view |
| decisions/tasks 等EXAMPLE 态存续至主网部署 | 契约 C1–C3 |

## 9. 合约套件接口（T2 · 机制参照源站公开验证设计）

> **2026-11-11 换回 RH**：部署目标 Robinhood Chain 4663（testnet 46630）· gas=ETH · 结算=USDG（0x5fc5…d168，已验证）· desks 标的=RH 股票代币七只（h2-precheck 实测）· oracle=Chainlink feed + uiMultiplier（h2-precheck §3 已验证）

- `TaskBoard.post(brief, bounty, deadline)` — 托管 USDG；事件 `Posted`
- `DecisionLog.record(taskId, kind, confidence, reasoningHash)` — 事件 `Decision`
- `ModelRegistry.register/seats` — 五席位
- `DecisionExecutor.execute(verdict)` — 放款/退款（timelock 管）
- `DeskMandate.trade(desk, token, buy, amountIn, minOut, reasoning)` — interval 1h / premiumBps 200 / maxBuyBps 5000 / maxFeedAge 3d；operator/owner(Safe) 分权；C1 `isBlocked` 部署后复验
- 费用参数：链上可设；官网不展示（policy）
