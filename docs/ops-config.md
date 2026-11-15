# ops-config — Wage 运营配置说明

> 后台：website-admin（配置中心）· 登记名 `SITE_NAME` = **Wage**（逐字符校验 ✅）· 立即刷新：开

## 五字段

| 字段 | 值/说明 | 生效 |
|---|---|---|
| `SITE_NAME` | Wage | 秒级（立即刷新） |
| 生产域名 | **wagora.xyz**（www 待 DNS 确认；主域 A → 23.94.5.138 已验） | — |
| `x_link` | 空 = X 图标隐藏；填 @wage_rh 对应 URL 后显示 | 立即刷新 |
| `avatar` | 空 = 默认金色 W 圆环标 | 立即刷新 |
| `imageSlots` | **无**（纯排版方向，无位图图位） | — |
| `jump_link` 前缀 | `https://gmgn.ai/robinhood/token/`（RH 档案惯例；发射后用于 $WAGE 外跳） | 立即刷新 |

## 运营字段（扩展 · 随部署解锁）

| 字段 | 说明 |
|---|---|
| `contracts{}` | 部署后逐个填真地址；site 自动从 EVM ZERO 置灰切换 Copy+Blockscout（RH 策略） |
| `live_contract_deployed` | true 后：LIVE 徽章显示、EXAMPLE 态切真数据、$WAGE 段保持 Phase n 直到发行 |
| `fee_note` | **禁**：费率/资金去向不入官网（policy） |

## 禁改项

- 诚实口径文案（US persons / not advice / EXAMPLE 标注）——改=回 R2/R3 发版级
- Phase n 标注——未实现不得切 Shipped
- `REFRESH_TOKEN` / 引擎密钥——仅服务端 env，不入前端

## 部署前预置（R7 Gate③ · 四项）

1. 登记名：Wage
2. 刷新回调 URL：`https://<域名>/api/refresh-config`
3. 刷新秘钥：`openssl rand -hex 32`（AI 生成 → 后台与 VPS `.env` 同值，生产操作由用户执行）
4. 跳转链接前缀：`https://gmgn.ai/robinhood/token/`
