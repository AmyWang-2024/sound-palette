# Sound Palette / 声音调色盘

Sound Palette Web MVP v0.1 将环境声音的本地数值特征与用户选择的 Mood
转化为轻微动态的抽象声音画。项目以 `CODEX_HANDOFF.md` 作为唯一需求与工程约束主文档。

当前完成 M0 项目骨架：Vanilla TypeScript、Vite、PixiJS 空画布、四个基础页面状态和
Vitest 配置。麦克风与声音分析尚未在 M0 接入。

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

项目不得录制、保存或上传原始声音。完整约束见 `PRIVACY.md` 与
`CODEX_HANDOFF.md`。
