# Sound Palette / 声音调色盘

Sound Palette Web MVP v0.1 将环境声音的本地数值特征与用户选择的 Mood
转化为轻微动态的抽象声音画。项目以 `CODEX_HANDOFF.md` 作为唯一需求与工程约束主文档。

Sound Palette Web MVP v0.1 的 M0–M5 已完成工程实现：首页、10 秒聆听、Mood 选择和
结果页四个状态已串联，结果
显示固定构图、三层声景构成与三个稳定规则标签，并支持换 Mood 和再听一次。首页可以
直接进入三个纯数值示例声景之一；拒绝权限或使用非 HTTPS 地址时也会自动进入示例模式。
结果页可生成 1080 × 1440 PNG，优先调用系统文件分享，不支持或分享失败时提供下载与
长按保存预览。页面包含安全区、横竖屏与 reduced motion 适配。

## 验证状态

本机真实麦克风流程已由用户于 2026-07-26 确认测试通过。真实 iPhone、iPad、Android
和微信浏览器测试仍未由自动化替代，不得标记为已通过；补测步骤见 `MOBILE_QA.md`。

## Windows 本地运行

环境要求：Node.js 20.19+ 或 22.12+，以及 npm。

```powershell
npm install
npm run dev
```

终端会显示本地访问地址。生产构建与测试：

```powershell
npm run test
npm run build
```

构建产物位于 `dist/`。EdgeOne Pages 的 GitHub 和本地目录部署步骤见 `DEPLOY.md`；
当前未使用部署凭证，也未声称已经上线。第三方依赖许可见 `THIRD_PARTY_NOTICES.md`。

## 隐私边界

项目只在内存中读取 Web Audio API 的时域与频域帧并立即转为数值特征，不创建
`MediaRecorder`、音频 Blob 或音频文件，也不保存或上传原始声音。完整约束见
`PRIVACY.md` 与 `CODEX_HANDOFF.md`。
