# project-profile — Wage（对外物料唯一事实源）

> 品牌事实变更先改本档案再同步各处。X 物料/TG/DexScreener/投放一律从这里取事实。

## 1. 品牌卡

| 项 | 值 |
|---|---|
| 品牌名 | Wage |
| Ticker | $WAGE（PONS 发射 · 1,000,000,000 固定 · **未发射**） |
| 定位句 | The agent labor market on the chain where stocks trade. |
| Hero H1 | Work pays. |
| 叙事主张 | It doesn't promise work. It escrows it. |
| 复读句 | a blockchain that escrows the work, grades it, and shows you the receipt |
| 收束句 | You don't have to trust the agents. You can read them. |
| 域名 | **wagora.xyz**（用户确认 2026-11-11 · DoH 双源验证 A → 23.94.5.138） |
| X handle | @wage_rh（RH 惯例后缀恢复；待注册核验——用户待办，R8 前） |
| 联系邮箱 | hello@wagora.xyz（邮箱服务搭建为待办，域名已定） |
| GitHub | 待建（主网部署时公开） |

## 2. 故事内核

- **隐喻体系**：劳务市场（打工领工资）· 决策者坐镇中心（工头/仲裁员）· 托管担保交易 · 每笔留收据
- **产品机制**：post task（1 USDC on Base 或 1 USDG 托管）→ 五模型竞标 → 决策引擎评级（置信度阈值，低于即安全默认）→ 放款/退款 → 全部上链；desks：五模型各 ~$100 交易 RH 股票代币，mandate 合约强制（1h/±2%/50%/3d），每单带推理哈希
- **价值路径**：访客读决策流（可验证）→ 开发者接 MCP（用起来）→ 客户发任务（付费闭环）
- **卖点**：不承诺智能，只承诺机制——钱进托管、验收放款、公开可查

## 3. 链上事实

| 项 | 值 | 状态 |
|---|---|---|
| 网络 | **Robinhood Chain**（chainId 4663 / testnet 46630）· gas **ETH** · 结算 **USDG**（0x5fc5…d168，Global Dollar 已验证） | 档案 profiles/robinhood-chain.md + h2-precheck 实测 |
| 部署形态 | 合约套件直署 RH（不发链——卡 1-bis A-） | **未部署** |
| 合约 | TaskBoard / DecisionLog / ModelRegistry / DecisionExecutor / DeskMandate | 部署前 EVM ZERO，不渲染假地址 |
| $WAGE | PONS · 1B 固定 | **未发行**（Phase n） |
| 股票代币 | 7 只 {公司} • Robinhood Token（NVDA/SPY/AAPL/TSLA/GOOGL/META/MSFT） | 第三方公共生态；**not available to US persons** |
| 部署 / 正式宣布 / 发行 | 三态独立记录：全部未发生 | §3.1 |

## 4. 诚实口径

- `Live on Robinhood Chain` 仅在合约部署核验后使用（徽章显隐随状态，契约 C3）
- $WAGE / 质押 / 提案 / x402 = Phase n；已实现 = Shipped
- 模拟数据一律 EXAMPLE 角标；读链失败 = NOT READING 公开态
- 无收益承诺/价格预期措辞；无 treasury/buyback/allocation 内容（policy 红线）
- 页脚固定：US persons 声明 + not advice + 三口径说明

## 5. 视觉识别（C 方向 · The Float）

- 色：墨 #0C0C0E / 骨白 #EAE6DC / 电金 #E3B34C（信号红绿仅数据色）
- 字：Syne（display）/ Inter（正文）/ Space Mono（读数）
- 锚点：meta 读数行 + 决策流场金环 + Work/pays. 实心描边对
- 头像 master：金色 W 圆环标（baseline header 标位 = 定稿底稿）
- OG 卡：og-card-draft.html（1200×630）

## 6. 文案语气

工程备忘录体：短句、机制数字、克制零 hype；禁词：revolutionary / moon / 100x / AI 将改变一切；数字必须带机制解释（如 7 天 = challenge period）。

## 7. X 物料输入区（R8 用 · 只登记不生成）

- 范围已登记（Q12）：bio / 头像 / 横幅 + 预热 10 / 宣布 2-3 + 置顶 / 加热 30
- 事实源：本档案 §1–§6；生成时机 = 用户显式指令（建议 R4 档案产出后）

## 8. 受众共情节（Q14 定稿）

可验证>承诺 · 机制数字 · 公平叙事 · 克制反 shill · 审美即能力 · 透明降级 · 一句话故事 · builder 身份感——按此配比出稿。
