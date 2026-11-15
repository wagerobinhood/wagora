# Wage 合约套件 · 本地测试结论报告

- 日期：2026-11-09 · 运行环境：Hardhat 2.29.1（本地内存链 hardhat network）· solc 0.8.24 · OZ 5.6.1
- 范围：`contracts/contracts/` 四文件（WageTaskBoard / WageLoop 三合约 / WageDeskMandate）+ mocks
- 结果：**48 passing / 0 failing**（约 10s）· 命令：`npx hardhat test`

## 一、被测对象与参数对齐

| 合约 | 职责 | 关键参数（对齐源站已验证值） |
|---|---|---|
| WageTaskBoard | 任务发布 + USDG 托管 + 招聘 + 退款 | minBounty 1 USDG · deadlineWindow 2h（源站 8h 为治理可调值，本地默认收紧测试） |
| WageDecisionLog | 决策不可变记录（置信度+阈值+推理哈希） | confidence/threshold ≤ 10000 |
| WageModelRegistry | 五席位注册 + worker→desk 反查 + 在岗开关 | DESKS = 5 |
| WageDecisionExecutor | 验收放款/拒付退款 + 协议费 | thresholdBps 1500 · feeBps ≤ 2000 封顶 |
| WageDeskMandate | 五台股票交易 + mandate 强制 | interval 1h · premiumBps 200 · maxBuyBps 5000 · maxFeedAge 3d（**与源站逐项一致**） |

 payout 通道：赏金托管在 TaskBoard，Executor 经 `board.payout()`（executor 专属、paidOut 累计、满额封账）动账——职责分离，Board 之外无人能动托管金。

## 二、正向测试（Expect-success）24 例 · 全过

**TaskBoard（5）**：托管到账（escrow/balance 双查）· Posted 事件 · 过期未雇全额退款（余额+escrow 归零）· setOperator 换钥匙生效 · hire 事件
**DecisionLog（2）**：记录含置信度/阈值/推理哈希并可读回 · 换钥匙后旧钥匙失效新钥匙可写
**ModelRegistry（3）**：构造注册 5 席且在岗 · isActive 真/假判定（未知地址 false）· 换席位后旧 payout 失效新 payout 在岗（deskOf 重映射）
**Executor（4）**：验收放款分工正确（feeBps=300 → worker 97% + treasury 3%，escrow 归零）· 拒评 poster 全额退 · 阈值边界（confidence = threshold 恰好可接受，≥ 语义）· 阈值下拒评走安全默认退款
**DeskMandate（10）**：fund 均分五台（100/台）· 边界内买入（持仓 ≈ 0.495 token + Order 事件带推理哈希 + 台面扣款 + orders 计数）· 一小时后 time-travel 再下单 · 边界内卖出（USDG 回台面）· recall 清台归所有者 · equity = 台面 + 持仓按 feed 估值（≈ 99.5 ± 0.6 USDG）· setVenue 上架 · setBounds/setPaused/setOperator 所有权门

## 三、逆向测试（Expect-revert / 不变量）24 例 · 全过

**权限类（9）**：非操作员 hire/record/trade/settle 全部 revert · 非发布者退款 · 非所有者 setSeat/setFee/OwnableUnauthorizedAccount · 调用错池的 swap 回调 WrongPool（实现内置）
**状态机类（7）**：重复雇人 · 重复结算 · 重复退款 · 已雇后 poster 退款 · 未雇任务结算 · 席位停用后结算（InactiveWorker）· 未上架代币
**数值/条件类（8）**：低于最小赏金 · 空 brief · 无授权额度（SafeERC20）· 置信度 > 10000 · desk 越界 · **接受但低于阈值 → BadVerdict（63% < 70% 用例，"Unsure means no" 的合约级强制）** · fee 超上限（2001 > 2000）· 买入超 50% 台面（OverCap）· 卖出超持仓（Short）
**市场行为类（6）**：一小时内第二单（TooSoon）· 池滑点压到溢价带外（outBps 9000 → OffPrice **且台面/持仓零污染**）· feed 过期 4 天（StaleFeed）· feed 归零（BadFeed）· setVenue 池对不匹配（PoolMismatch）· paused 后交易（IsPaused）

## 四、不变量专项

1. **托管守恒**：任何失败路径后台面/持仓/escrow 逐字节不变（OffPrice 用例显式断言）
2. **单次 drained**：paidOut == bounty 时任务封账，poster.refund 与 executor.payout 互斥
3. **公平规则**：接受必须 ≥ 阈值——引擎不能绕过置信度规则放款（BadVerdict）
4. **职责分离**：owner（Safe）管 config/recall，operator（引擎钥匙）只动流程，executor 只能动已雇任务

## 五、发现并修复的实现缺陷（本地测试的价值证明）

| # | 缺陷 | 修复 |
|---|---|---|
| 1 | Executor 直接从自身余额放款——但托管金在 TaskBoard | 新增 `board.payout()` executor 专属通道（paidOut 累计封账） |
| 2 | DecisionLog.setOperator 用 operator 门——换钥匙需 owner 权限 | 改 Ownable2Step + onlyOwner |
| 3 | TaskBoard 缺 NotHired 错误定义（payout 引用未声明错误） | 补声明 |
| 4 | 一次性 payout 会卡住「费+工资」两笔动账 | paidOut 累计模型（多笔直至满额） |

## 六、边界与诚实声明

- **本地内存链测试**：验证逻辑正确性；**不等于** RH testnet/mainnet 实测，不等于审计
- 未覆盖（后续补）：fundWithEth 全路径（需 mock WETH 池报价，已备）、Reentrancy 攻击用例（有 nonReentrant 保险）、gas 快照
- Mocks（MockPool/Aggregator/Stock/WETH）仅测试用，**绝不上线**
- 主网部署 = 独立授权动作；部署后第一步 C1 复验（isBlocked）
- 源站身份零引用：本套件未复制源站任何地址/字节码（机制参照 DeskMandate 公开验证设计，实现原创）
