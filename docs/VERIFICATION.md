# 0.1.0 验证记录

验证日期：2026-10-12。主要环境：Windows、Node 24、Chrome、已安装的 Wallpaper Engine。

- `npm test`：25 项通过；包括币种隔离、账号关联去重、跨分组重复 key、额度过期、重置、充值、历史缺口、累积 token 去重、UTF-8 不完整尾行、连续 zstd 帧、缓存 token、DSH 登录失效回退、导入校验、日志归属变更、HTTP 认证和发布文件白名单。
- `npm run test:browser`：四个浏览器验证套件通过。分辨率：1920×1080、2560×1440、3840×2160、3440×1440、1080×1920、800×600；检查横向边界、账号显示、设置保存、指标选择、低资源模式和自定义选择菜单。
- 本地管理界面：添加多个 DeepSeek key、同账号分组、独立 Codex 登录目录、密钥掩码、公开配置导出经过实际界面流程验证；测试数据为纯 fixture，不调用模型。
- Wallpaper Engine 属性监听：初次载入不覆盖已保存的网页设置，后续显式修改生效。
- Windows 脚本全部通过语法解析。后台启动与重复启动实际运行过；重复启动保留原始进程记录，没有创建第二个实例。
- 真实只读采集：本机 Codex app-server 额度和 DSH 钱包成功返回；两类本地 token 日志成功解析。没有发送推理请求或更改登录。
- 普通浏览器中的实际采集器界面成功显示两类账号。Wallpaper Engine 独立窗口实际截图验证时钟、真实 Codex 两个额度窗口、DSH 余额、token 图表、设置面板和主题选择菜单；本轮未更换桌面壁纸。
- 发布 zip 已解包检查，未含 live.json、connection.json、state.json、auth.json 或 credentials.json；文本文件扫描了常见 key/JWT/连接令牌模式。

预览图全部为纯演示账号。未在其他人的账户、所有 Wallpaper Engine 版本或其他操作系统中验证；未提供 CPU/GPU 使用率数值保证。低资源模式减少持续绘制和刷新，实际占用取决于背景、分辨率与宿主。

源码内有对应测试，可继续扩展供应商适配器。未发布到 GitHub 或 Steam 创意工坊；发布步骤见 PUBLISHING.md。

## Wallpaper Engine 本机崩溃修复

初版在普通 Chrome 通过，但本机 Wallpaper Engine 出现 `STATUS_ILLEGAL_INSTRUCTION` / `Crashpad_NotConnectedToHandler`。隔离测试保留完整 CSS、移除原生 select 后可绘制；只隐藏 select 或设置 appearance:none 仍不能解决完整页面崩溃。现用不创建原生 select 的 `qw-choice` 数据模型与网页按钮菜单，保留键盘方向键、Escape、选择状态和现有配置事件。

真实宿主 1000×750 空数据启动、1200×900 实际账号启动与设置菜单均完成截图检查；25 项数据测试、四个浏览器套件通过。没有修改宿主全局硬件加速、安全设置或显卡驱动。尚未完成长时间运行验证。

网络调查找到其他作者的[同类下拉框崩溃记录](https://github.com/LBEILC/RhineLabUI/blob/main/docs/WALLPAPER-ENGINE.md#本机-cef-的下拉框崩溃)，它提供了隔离方向；本项目的结论以上述本机复现为依据，不断言所有 CEF 版本都存在该问题。

## 2026-10-14 · Codex 额度读取兼容修复

Codex CLI 0.160.1 的 account/read 在本机返回 workspace routing discovery timed out，但同次隔离测试的 account/rateLimits/read 仍能返回有效额度。采集器改为直接调用认证后的额度接口，从额度快照读取订阅类型，避免无关的账号路由发现失败阻止采集。接口拒绝认证时仍报错，不生成虚构额度。

新增两项回归检查，npm test 共 27 项通过；真实只读调用返回有效 5h 和每周窗口。未把实际额度数值、账号标识或诊断输出加入发布内容。
