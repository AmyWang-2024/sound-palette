# Sound Palette / 声音调色盘

Sound Palette Web MVP v0.1 将环境声音的本地数值特征与用户选择的 Mood
转化为轻微动态的抽象声音画。项目以 `CODEX_HANDOFF.md` 作为唯一需求与工程约束主文档。

当前完成 M4：首页、10 秒聆听、Mood 选择和结果页四个状态已串联，结果
显示固定构图、三层声景构成与三个稳定规则标签，并支持换 Mood 和再听一次。首页可以
直接进入三个纯数值示例声景之一；拒绝权限或使用非 HTTPS 地址时也会自动进入示例模式。
结果页可生成 1080 × 1440 PNG，优先调用系统文件分享，不支持或分享失败时提供下载与
长按保存预览。页面包含安全区、横竖屏与 reduced motion 适配。

## 待人工验证

真实麦克风的安静、说话、低频声音、拍手、提前停止与重复聆听流程，因当前本机麦克风
硬件异常尚未完成验证。不得将上述真实麦克风流程标记为已通过，后续需在麦克风正常的
设备上补测。真实 iPhone、iPad、Android 和微信浏览器测试也尚未由自动化替代，步骤见
`MOBILE_QA.md`。

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

## 隐私边界

项目只在内存中读取 Web Audio API 的时域与频域帧并立即转为数值特征，不创建
`MediaRecorder`、音频 Blob 或音频文件，也不保存或上传原始声音。完整约束见
`PRIVACY.md` 与 `CODEX_HANDOFF.md`。
