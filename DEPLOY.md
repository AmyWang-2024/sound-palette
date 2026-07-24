# Sound Palette 静态部署说明

Sound Palette 是纯静态 Vite 应用，不需要服务器、数据库、环境变量或运行时密钥。部署
产物为 `dist/`；只有 HTTPS 部署地址才能在移动设备上请求麦克风。

本文件只描述部署准备。当前仓库没有 EdgeOne 凭证，本次工作未登录控制台、未创建项目，
也未声称已经上线。

## 部署前验证

建议使用 Node.js 22.12 或更高版本，在仓库根目录执行：

```powershell
npm ci
npm run test
npm run build
```

成功后应生成：

```text
dist/
├── index.html
└── assets/
```

本项目没有客户端路由，不需要重写规则，也不需要 `edgeone.json`。

## 方式一：连接 GitHub

1. 登录 EdgeOne Pages / Makers 控制台并选择从 GitHub 创建项目。
2. 授权后选择 `AmyWang-2024/sound-palette`。
3. 预览当前版本时选择分支 `feat/sound-palette-mvp-v0.1`。合并完成后，再由仓库维护者
   决定是否将生产分支改为 `main`；本项目不会自动修改 `main`。
4. 使用以下构建设置：

| 设置 | 值 |
|---|---|
| Root Directory | `./` |
| Installation Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment Variables | 无 |

5. 首次部署建议选择预览环境。完成下方 HTTPS 验收后，再在控制台提升为生产部署。
6. 如果开启自动部署，后续符合分支规则的 Git push 会触发新构建。

EdgeOne 官方说明：

- [构建设置](https://pages.edgeone.ai/document/build-guide)
- [EdgeOne Pages 产品说明](https://edgeone.cloud.tencent.com/pages/)

## 方式二：上传本地构建目录

1. 按“部署前验证”生成全新的 `dist/`。
2. 在 EdgeOne Pages / Makers 创建项目时选择 Direct Upload。
3. 直接拖入 `dist` 文件夹；也可以把 `dist` 内的内容压缩为 ZIP 后上传。ZIP 根目录应
   直接包含 `index.html` 和 `assets/`，不要再套一层源码目录。
4. 首次先选择预览环境，验证后再创建生产部署。

Windows 可选压缩命令：

```powershell
Compress-Archive -Path .\dist\* -DestinationPath .\sound-palette-dist.zip -Force
```

官方说明：[Direct Upload](https://pages.edgeone.ai/document/direct-upload)。

## 部署后验收

必须在实际 HTTPS 地址完成：

1. 首页、示例、Mood、结果页和再次聆听流程。
2. 麦克风仅在点击后请求；结束、停止或切后台后权限指示消失。
3. 导出 PNG 为 1080 × 1440，文字和标签无裁切。
4. 系统分享失败或不可用时仍能下载或长按保存。
5. 刷新首页和直接访问根路径均返回应用，不出现 404。
6. 按 `MOBILE_QA.md` 在 iPhone、iPad、Android 和微信浏览器补测。

在这些步骤实际完成前，不得把部署或真实设备兼容性标记为已通过。
