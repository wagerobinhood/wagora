# AGENTS — Wage 仓库速览（骨架 · T1 后按真实目录校准）

## 定位与形态

Wage = **Robinhood Chain 上**的 agent 劳务市场（product 模式，A- 不发链；2026-11-10 曾换 Elysium、2026-11-11 切回 RH）。三件套：Next.js 官网（C 方向浮账场）+ Solidity 合约套件 + 决策引擎/MCP 服务。端口 **3036** · 域名 **wagora.xyz**（A → 23.94.5.138，DoH 已验）。

## 目录职责（T1 后校准）

| 路径 | 职责 |
|---|---|
| `app/` | Next.js 16 App Router；16 路由对应 baseline hash view，内容移植不重写 |
| `src/components/` | 区块组件（决策流/席位卡/premium 板/诚实徽章/CA 框/meta 读数行/汇流场） |
| `src/lib/` | site-config（配置中心契约）/ rpc（RH 直连）/ pools |
| `contracts/` | Solidity 套件 + 测试（TaskBoard/DecisionLog/ModelRegistry/DecisionExecutor/DeskMandate） |
| `engine/` | 决策引擎 worker（招标/评级/上链；密钥仅服务端；成本熔断） |
| `mcp/` | MCP server（docs/api-spec.md B 档） |
| `docs/` | 契约文档唯一真源（plan/architecture/profile/ops-config/api-spec + analysis/gates/baselines） |

## 数据流

浏览器/服务端 → RH RPC（公共）→ 池价/合约事件 → 组件四态渲染（loading/success/empty/error→NOT READING）→ 配置中心覆盖品牌值（fallback config/site.ts）。

## 修改依据与雷区

- 视觉 = baseline-v1 冻结；范围 = product-contract；行为改前先改契约
- **雷**：源站身份地址/品牌词 + **Elysium 全部词（Elysium/99901/99801/HYPE/WHYPE/KNTQ/Ramses——切回 RH 后为禁词表，grep 在 docs/plan.md T5）**；treasury/回购类内容；Live 修饰未部署物；渲染假地址（RH=ZERO 置灰）；**把 HyperEVM 的 999 当成 Elysium chainId 的历史陷阱勿再引入**；engine 密钥入前端
- 端口 3036 四处同号（package.json / compose / .env.local / Caddy）

## 自测速查

- `pnpm dev -p 3036` → 首页/premium 实时价 7/7
- 诚实 grep：`grep -rniE "brainchain|usebrainchain|\bjev\b|typesafe|0xB23F|0x3367|0x8eBF" app src`（0 命中）
- 合约测试全绿 + C1 isBlocked 复验（部署后）
- `python ../skills/dev_docs/validate-skills.py`（技能侧，如改库）
