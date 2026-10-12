# 数据口径与本地文件

## 读取来源

- Codex：官方 app-server 的 `account/read`、`account/rateLimits/read`；每日数据接口可用时保留每日数据。小时级图表来自 `sessions` 中的本地 token 事件，不将每日总量硬分摊到小时。
- Codex token：累计 input/output/cached_input 差值；相同累计计数不会重复计算。累计归零或降低时按新的统计段处理。缓存命中是输入子集。
- DSH 钱包：复用本机 `.credentials.yaml` 中平台登录，仅发送到固定官方 HTTPS 平台接口；无可用登录时回退到 DeepSeek API key。
- DeepSeek API：`GET https://api.deepseek.com/user/balance`，Bearer key；不发推理请求，不产生模型 token 费用。
- DSH token：读取 JSONL 或连续 zstd 压缩帧的 `assistant/message` usage。DSH 的 `inputTokens` 是未缓存输入时，将 `cacheReadTokens` 加回输入；不把它遗漏或重复加入总量。压缩读取需要支持 zstd 的 Node（建议 24+）。

## 统计含义

- 所有范围是相对于当前时间的滚动 5h、24h、7day、30day。不是自然日或月账单。
- token 归属本地配置目录；共享目录中多供应商调用或期间换账号可能使旧记录无法准确分配到当前登录账号。不要把此口径当作官方跨设备账单。
- 费用仅统计两次连续有效采样间的净余额下降。余额增加标注为补入边界；间隔超过阈值留空。两次采样之间既消费又充值，赠款到期或退款的情况无法仅凭余额准确还原。
- 额度消耗按 bucket、窗口长度、相同 resetsAt 内的下降百分点计算。重置、额度回升和失效窗口不制造消费。
- 总额按账号去重；币种分开；订阅百分比合计不代表 token、金额、调用次数。自定义权重是用户假设，不能称为官方容量。
- 首次采集只能回填现有可读 token 日志；余额历史从采样开始记录。图表标明首个采样和缺口。token 日志无事件时不能认定账户没有消耗。
- 默认保留 30 天、最多 10,000 次采样和 100,000 条 token 事件，达到容量上限时较旧数据会裁剪。压缩文件超过 32MB 或单帧解压超过 8MB 暂不处理；目录不跟随符号链接。

## 私有文件

采集器数据默认在 `~/.quota-wallpaper/`（可通过 `--data-dir` 修改）：

- `config.json`：用户账号、key 或环境变量引用、独立登录目录、采样设置。
- `state.json`：汇总账户、采样历史、token 事件与日志偏移；不保存会话正文。
- `capability.json`：本地 HTTP 访问令牌。
- `collector.lock`：防止同一状态目录有两个采集器写入。

项目里的 `wallpaper/live.json` 是私有汇总数据，`connection.json` 是本地连接能力令牌。二者被 Git 忽略且发布脚本禁止加入。配置导出只包含可公开的外观和账号标签；统计导出包含账号名称与记录但不包含 key。

纯 Web 模式默认 key 只留在页面内存，重载后重新填写。选择“在此设备记住”后，key 保存在该网页宿主的本地存储中，不放在源码或 project.json。公开截图请使用演示模式。

HTTP 服务仅监听回环地址；API 必须携带随机连接令牌，拒绝外部网站来源请求；只提供明确列出的公开资源，没有任意文件读取接口。采集器不消费额度重置，不发送邮件，不更改现有 Codex 或 DSH 登录。

## 参考

- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/auth
- https://api-docs.deepseek.com/api/get-user-balance/
- 本机 DSH 桌面包的 dsh-deepseek-account-platform 与 session usage 实现。
