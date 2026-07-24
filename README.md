# Sound Palette / 声音调色盘

Sound Palette Web MVP v0.1 将环境声音的本地数值特征与用户选择的 Mood
转化为轻微动态的抽象声音画。项目以 `CODEX_HANDOFF.md` 作为唯一需求与工程约束主文档。

当前完成 M2 本地声音分析：用户点击后可在浏览器内分析 10 秒麦克风数值特征，并实时
驱动由固定 seed 生成的 PixiJS 抽象画。拒绝权限或使用非 HTTPS 地址时自动进入纯数值
示例模式。当前仍保留 M1 控制面板用于开发验证。

## 待人工验证

真实麦克风的安静、说话、低频声音、拍手、提前停止与重复聆听流程，因当前本机麦克风
硬件异常尚未完成验证。自动化测试、桌面与窄屏渲染检查和生产构建已通过；不得将上述
真实麦克风流程标记为已通过，后续需在麦克风正常的设备上补测。

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
