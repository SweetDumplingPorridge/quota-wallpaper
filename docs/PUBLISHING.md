# GitHub 与 Wallpaper Engine 创意工坊发布

源码项目与可直接导入的网页壁纸均可发布。用户自定义背景不随公共版本分发。

## 生成发布包

```powershell
npm ci
npm test
npm run build
npm run package
```

生成：

- `dist/quota-wallpaper-web.zip`：仅公开的 HTML/CSS/JS、project.json、演示预览图、MIT 许可证和网页使用说明。
- `dist/quota-wallpaper-source.zip`：完整可复现源码、依赖锁文件、测试、脚本、文档；保留打包后的网页文件方便开箱导入。
- `dist/release-manifest.json`：文件清单和 SHA-256 校验。

打包明确列出文件，不会打包整个工作目录。不包括 node_modules、artifacts、本机 live.json、connection.json、凭据、截图中的真实数据或本机私有配置。发布器还检查 key/token 模式。

## GitHub

1. 修改项目名称、描述、版权持有人和 README 中你想保留的文字。
2. 在 GitHub 新建仓库，按网站给出的步骤关联本地仓库并推送。
3. 创建 Release，上传两个 zip 和 release-manifest.json。源码提交中保留 package-lock.json。
4. 运行 CI，检查源码能重新构建；自动测试不连接个人账户。

项目内已有 `.gitignore` 与 GitHub Actions。此交付只建立本地源码，不会替你创建远程仓库或推送。

## 创意工坊

1. 解压 **web 发布包** 到干净目录。不要直接上传日常使用且含 `live.json` / `connection.json` 的目录。
2. Wallpaper Engine → 创建壁纸 → 从干净目录导入 `index.html`。
3. 使用其自带属性面板测试背景图片、低资源模式、布局、位置、指标和时间范围。
4. 使用演示模式制作截图；确认图中没有个人余额或账号名称。
5. 在编辑器项目说明中填写 GitHub 仓库地址、采集器安装说明与版本。先以私有可见性测试，再根据你的选择发布。
6. 通过编辑器 Workshop → Share wallpaper 发布。后续编辑器会写入 Workshop ID，保留它以更新同一条目。

创意工坊网页包不安装或启动采集器。只想查 DeepSeek 余额的用户可手填 key；要自动读取 Codex/DSH 的用户从 GitHub 获取采集器，并配置输出路径到该壁纸目录。

默认 `project.json` 可见性为 private，没有预填 workshopid。发布包不包含任何其他创意工坊壁纸素材，背景为本项目 CSS 渐变，预览图为纯演示账号。
