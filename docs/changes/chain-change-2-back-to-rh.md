# 影响卡 · Wage 换回 Robinhood Chain（Elysium → RH · 第 2 次换链）

- 日期：2026-11-11 · 用户决定：「切回 RH 链」
- 流程：宣布前换链（preannouncement-chain-change.md）· 未部署/未宣布/未发行——三态不变，仅目标链二次变更

## 三态

| 项 | 状态 |
|---|---|
| 部署 | 未部署（本地链全流程验证过；主网/测试网零合约） |
| 宣布 | 未宣布 |
| 发行 | 未发行（$WAGE 无 CA） |

## 影响级别判定

**A 级 · 内容与配置调整**（不是 B/C）——理由：
- 核心玩法（发任务→托管→招标→评级→放款）、路由、访客行为**不变**
- 设计冻结（C 方向浮账场）**不变**——设计语言与链无关
- 差异集中在：链定位文案、chainId/RPC/Explorer、结算币、desks 标的、premium 数据源、词表方向
- 品牌名 Wage / $WAGE / Hero "Work pays." **保留**（语义在新链上仍成立）

## 影响清单（Elysium → RH，全部可预判——就是上一次的反向操作）

### 恢复（RH 本来就有的东西）
1. 定位句 → "The agent labor market on the chain where stocks trade."（RH 专属身份回来了）
2. 结算币 USDC(Elysium) → **USDG**（RH 结算币，档案值）
3. Gas HYPE → ETH
4. chainId 99901/99801 → **4663/46630**
5. Explorer → robinhoodchain.blockscout.com
6. RPC → rpc.mainnet.chain.robinhood.com（premium 板有实测代码，之前 7/7 验证过）
7. **desks 标的恢复**：RH 股票代币 7 只（NVDA/SPY/AAPL/TSLA/GOOGL/META/MSFT），Chainlink feed + uiMultiplier 接口恢复——**h2-precheck.md 的实测数据全部有效**
8. **premium 板恢复真数据**：7 池 slot0 直读代码还在 git 历史里（baseline 实测过）
9. Hero 副文："the Hyperliquid ecosystem's high-performance EVM" → RH 表述
10. 发射台 → PONS（$WAGE 1B 固定）
11. jump_link 前缀 → gmgn.ai/robinhood/token/
12. X handle 惯例 → @wage_rh
13. CaBox → RH ZERO 策略（未部署渲染 0x000…0 置灰，非空态）
14. US persons 声明 → **恢复**（RH 股票代币专属）
15. 词表倒转：Elysium/HYPE/WHYPE/KNTQ/Ramses/99901 变禁词；RH 词恢复合法

### 需要用户决定的
- **纸面交易台 vs 真钱 desk**：上次因经费改纸面。回 RH 后 desks 标的回到股票代币——**纸面模式可以保留**（真价格、真决策、零资金），这笔账跟链无关
- **$WAGE**：PONS 1B 固定（RH 惯例恢复）

### 保留不动的
设计冻结、16 路由、合约逻辑 + 52 例测试（合约本身 EVM 标准，换部署目标而已）、引擎三座位、配置中心机制、端口 3036、诚实模式（EXAMPLE/PHASE N/paper P&L）

## Gate 影响

- G0 重登记：目标链 Elysium → **Robinhood Chain**（alignment Q2 回写）
- A 级：复用 G1–G4 未变内容，R2/R3 受影响文案确认，R4 链事实更新，R5 数据层换源，R6 词表复检（新方向：Elysium 词为禁词）
- R7 部署照旧走用户授权

## 顺序

1. G0 回写（本卡落盘即登记）
2. 站点文案反向替换（脚本化，同上次方法）
3. premium 板换回 RH 池直读（git 历史里有已验证实现）
4. 配置中心 upsert --chain rh（老白名单，直接支持）
5. 重建 + T5 全套（RH 词清零检查）+ R6 复检
6. 文档同步


## 执行回执（2026-11-10）

- 站点文案反向替换：37+9 处 ✅ · src/config Elysium 词 0 残留 ✅
- premium 板恢复 RH 7 池 slot0 直读（浏览器实测 7/7：NVDA 168.14 / SPY 748.17 / AAPL 347.97 / TSLA 376.49 / GOOGL 286.10 / META 638.36 / MSFT 532.19）✅
- 纸面台价格源换 RH 池（NVDA 168.30 / SPY 748.48 等）+ 真跑一轮（两模型 BUY SPY）✅
- 配置中心 upsert --chain rh（USDG 结算 / PONS / gmgn 前缀恢复）✅
- CaBox 恢复 RH ZERO 策略 ✅ · US persons 声明恢复 ✅
- 16/16 路由 200 · Elysium 词 SSR 0 命中 ✅
- OG 图待重制（下次 T5 顺带）· 文档同步见各文件头
