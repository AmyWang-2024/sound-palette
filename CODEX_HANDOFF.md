# Sound Palette MVP — Codex 开发交接文件

**项目名称：** Sound Palette / 声音调色盘  
**版本目标：** Web MVP v0.1  
**交接日期：** 2026-07-24  
**开发环境：** Windows + GitHub + Codex  
**目标运行环境：** 手机浏览器，优先 iPhone/iPad Safari 与 Android Chrome  
**首版部署：** 静态 HTTPS 托管，优先腾讯 EdgeOne Pages  
**优先级：** 先完成可体验的核心闭环；节省 Token；避免过度工程化。

---

## 1. 项目目标

开发一个无需下载安装、无需登录、无需服务器的手机网页原型。

用户完成一次体验的流程：

1. 打开网页；
2. 点击“开始聆听”；
3. 网页在本机分析 10 秒环境声音；
4. 用户选择 Mood：**好 / 不好不坏 / 不好**；
5. 系统根据声音特征与 Mood 生成一幅轻微动态的抽象声音画；
6. 显示三层声景构成与三个标签；
7. 用户可以换一种 Mood、再听一次、保存 PNG 或调用系统分享。

核心验证命题：

> 用户是否愿意把“周围的声音 + 当下的心情”转化为一幅作品，并保存或分享。

---

## 2. 第一版必须坚持的范围

### 2.1 必须完成

- 手机麦克风授权与异常处理；
- 10 秒实时聆听；
- 相对响度、低频、中频、高频、变化程度的本地分析；
- 一种稳定的抽象画风格；
- 三种 Mood；
- 同一段声音切换 Mood 时保持同一构图骨架；
- 三层声音构成；
- 三个规则标签；
- 无麦克风权限时的示例模式；
- PNG 结果卡片导出；
- Web Share API 分享，失败时提供保存图片兜底；
- iPhone/iPad Safari 与 Android Chrome 的基本适配；
- 静态生产构建。

### 2.2 明确不做

- 不识别汽车、风、鸟鸣、人声等具体声源；
- 不使用 TensorFlow.js、YAMNet 或任何 AI 模型；
- 不显示未经校准的绝对分贝值；
- 不录制、保存或上传原始声音；
- 不做语音转文字；
- 不做账号、登录、数据库、云端历史；
- 不做点赞、评论、关注或社区；
- 不做地图和定位；
- 不做微信小程序；
- 不做原生 iOS 或 Windows App；
- 不做多种画风；
- 不加入大语言模型文案；
- 不复制或依赖 AURA 源代码。

任何不属于“必须完成”的功能，不得自行加入。

---

## 3. 技术栈

采用成熟且许可证宽松的现有技术，不重新发明底层通用能力。

### 3.1 核心技术

| 技术 | 用途 | 备注 |
|---|---|---|
| Vite | 开发服务器与生产构建 | 使用 Vanilla TypeScript 模板 |
| TypeScript | 类型约束与模块组织 | 不使用 React |
| Web Audio API | 麦克风、波形、FFT | 浏览器原生能力，不安装音频框架 |
| PixiJS | 2D GPU 动态绘制 | 主视觉引擎 |
| simplex-noise | 连续、有机的流动噪声 | 生成柔和形变和运动场 |
| seedrandom | 可重复的构图随机数 | 同一声音切换 Mood 时保持构图 |
| Culori | 色彩空间、插值与 Mood 调色 | 不手写大量零散十六进制色值 |
| Vitest | 核心规则单元测试 | 只测试纯函数和数据规则 |

### 3.2 暂不安装

- React；
- Three.js；
- Tone.js；
- Meyda；
- p5.js；
- TensorFlow.js；
- Essentia.js；
- 任意后端框架；
- 任意数据库；
- 任意状态管理框架。

只有在现有技术无法满足已经确定的验收标准时，才允许增加依赖，并在提交说明中解释原因。

### 3.3 初始化命令

在空目录中执行；若仓库已有文件，不得覆盖，先检查现状。

```powershell
npm create vite@latest . -- --template vanilla-ts
npm install pixi.js simplex-noise seedrandom culori
npm install -D @types/seedrandom vitest
```

规则：

- 只安装正式稳定版，不使用 `next`、`beta`、Git commit 或 CDN 版本；
- 生成并提交 `package-lock.json`；
- 后续以 lockfile 为准，不无故升级；
- 不运行会自动升级大版本的 `npm audit fix --force`；
- Vite 当前要求 Node.js 20.19+ 或 22.12+。若环境不满足，停止并报告，不擅自改装系统。

---

## 4. 产品页面与用户流程

MVP 只需要四个主状态，不必引入路由框架。

### 4.1 首页 `home`

文案：

- 标题：`Sound Palette`
- 中文名：`声音调色盘`
- 主文案：`听见的，也可以被看见。`
- 主按钮：`开始聆听`
- 次按钮：`先体验示例`
- 隐私提示：`声音只在你的设备上实时分析，不录音、不上传。`

点击主按钮后才请求麦克风权限，不得在页面加载时请求。

### 4.2 聆听页 `listening`

- 倒计时 10 秒；
- 动态画面从第一秒开始响应；
- 显示“正在聆听”，不显示复杂频谱仪；
- 提供“停止”按钮；
- 页面进入后台或失去可见性时暂停或安全结束；
- 录制期间不创建 `MediaRecorder`，不生成音频文件。

### 4.3 Mood 页 `mood`

问题：`此刻，你感觉怎么样？`

三个选项：

- `好`
- `不好不坏`
- `不好`

不要使用夸张笑脸或哭脸。使用简洁的文字与抽象色块，同时保证文字标签清晰，不能只靠颜色表达。

### 4.4 结果页 `result`

必须显示：

- 动态抽象作品；
- Mood；
- 三层声景构成；
- 三个标签；
- `换一种 Mood`；
- `再听一次`；
- `保存图片`；
- `分享`。

---

## 5. 音频分析方案

### 5.1 数据流

```text
getUserMedia({ audio: true })
  → AudioContext
  → MediaStreamAudioSourceNode
  → AnalyserNode
  → 时域数据 + 频域数据
  → 实时 AudioFrame
  → 10 秒 SoundSummary
```

### 5.2 `AnalyserNode` 初始参数

建议初值：

```ts
fftSize = 2048
smoothingTimeConstant = 0.75
minDecibels = -90
maxDecibels = -10
```

这些只是初值，可根据真实设备测试调整。调整必须记录原因。

### 5.3 数据类型

```ts
export interface AudioFrame {
  timestampMs: number;
  loudness: number;    // 0..1，相对值
  lowEnergy: number;   // 0..1
  midEnergy: number;   // 0..1
  highEnergy: number;  // 0..1
  changeRate: number;  // 0..1
}

export interface SoundSummary {
  durationMs: number;
  loudnessMean: number;
  loudnessPeak: number;
  lowEnergy: number;
  midEnergy: number;
  highEnergy: number;
  changeRate: number;
  quiet: boolean;
  composition: {
    base: number;
    flow: number;
    sparkle: number;
  };
  seed: string;
}
```

所有数值在进入视觉引擎前必须进行有限值检查与 0..1 限制，不能让 `NaN` 或 `Infinity` 进入绘制循环。

### 5.4 频段划分

初版：

- 低频：40–250 Hz；
- 中频：250–2,000 Hz；
- 高频：2,000–8,000 Hz；
- 高频上限不得超过 Nyquist 频率。

根据 `AudioContext.sampleRate` 和 FFT bin 数自动计算 bin 范围，禁止写死 bin 索引。

### 5.5 相对响度

从时域数组计算 RMS，再映射到 0..1。

重要：

- 这是相对响度，不是经过校准的 dB SPL；
- UI 不得显示“63 dB”之类的绝对声压值；
- 可以显示 `声音很轻 / 适中 / 较强`，但首版结果页不强制显示响度文字。

### 5.6 变化程度

基于连续帧的以下变化计算，并使用 EMA 平滑：

- loudness 差值；
- 三个频段能量差值；
- 突发峰值数量。

无需复杂音乐节拍检测。

### 5.7 十秒摘要

- 对所有有效帧取均值或稳健统计；
- 峰值单独保留；
- 低中高三段能量归一化为三层构成；
- 三层名称：
  - `基底声` = base = 低频；
  - `流动声` = flow = 中频；
  - `闪烁声` = sparkle = 高频。

如果有效总能量低于安静阈值：

- `quiet = true`；
- 不伪造 33/33/34；
- 三层构成可以全部为 0；
- 画面以留白、轻微呼吸和低密度纹理呈现；
- 标签使用“安静”“留白”等规则。

### 5.8 清理资源

每次结束或取消时必须：

- 停止 `MediaStreamTrack`；
- 断开 AudioNode；
- 取消动画帧；
- 释放或关闭不再使用的 AudioContext；
- 页面刷新后不得保存原始声音或音频缓冲。

---

## 6. 视觉引擎

### 6.1 唯一画风

首版只做：

> 流体色场 + 柔和曲线/色带 + 少量粒子。

不要做：

- 普通频谱柱；
- 三维地形；
- 数字雨；
- 赛博朋克霓虹；
- 多套主题选择；
- 复杂 Shader 编辑器。

### 6.2 PixiJS 图层

建议使用四层：

1. `BackgroundLayer`：背景渐变与缓慢色场；
2. `BaseLayer`：2–4 个大尺度、缓慢形变的低频形态；
3. `FlowLayer`：中频驱动的曲线、丝带或波纹；
4. `SparkleLayer`：高频驱动的少量粒子和短线。

初版可以都写在一个 `ArtEngine` 中，只有当文件明显过大时才拆层。不要为了架构美观提前拆出大量空模块。

### 6.3 声音到画面的映射

| 声音特征 | 视觉参数 |
|---|---|
| loudness | 整体尺度、呼吸幅度、透明度上限 |
| lowEnergy | 大色块面积、厚重度、慢速位移 |
| midEnergy | 色带宽度、曲率、流动速度 |
| highEnergy | 粒子数量、亮点尺寸、闪烁频率 |
| changeRate | 方向变化、扰动强度、运动活跃度 |
| quiet | 留白、低密度、极慢运动 |

### 6.4 固定构图

一次 10 秒会话结束时只生成一次 `seed`。

- `seedrandom` 必须创建局部 PRNG；
- 不得替换全局 `Math.random()`；
- 用户切换 Mood 时，seed、形态数量、初始位置和基本构图不变；
- Mood 只能改变色彩、明暗、速度、密度、扩张/收缩和运动倾向。

### 6.5 性能约束

- 移动端目标不低于约 30 FPS；
- `devicePixelRatio` 上限设为 2；
- 初始粒子数不超过 160；
- 不在每一帧创建大量新对象；
- 复用 Graphics、数组和粒子对象；
- 页面不可见时暂停 ticker；
- 监听 resize 与 orientation change；
- 对低性能设备自动降低粒子数量，而不是崩溃。

---

## 7. Mood Engine

### 7.1 原则

> Mood 给声音上色，但不篡改声音。

Mood 不得修改：

- 声音摘要；
- 三层比例；
- seed；
- 基础构图。

### 7.2 数据结构

```ts
export type Mood = 'good' | 'neutral' | 'low';

export interface MoodProfile {
  id: Mood;
  labelZh: string;
  brightness: number;
  chroma: number;
  warmth: number;
  expansion: number;
  motionSpeed: number;
  textureDensity: number;
  edgeSoftness: number;
  drift: 'outward' | 'balanced' | 'inward';
}
```

### 7.3 初始参数方向

参数可微调，但必须保留明显差异：

#### `good / 好`

- 更亮；
- 色彩稍丰富；
- 略偏暖；
- 形态舒展；
- 运动稍快但不躁；
- 纹理较疏；
- 漂移倾向向外或向上。

#### `neutral / 不好不坏`

- 中等亮度；
- 中性色温；
- 构图平衡；
- 运动稳定；
- 留白适中；
- 不做戏剧化处理。

#### `low / 不好`

- 降低亮度，但不能简单变黑；
- 略偏冷或偏钝；
- 构图收缩；
- 纹理稍密；
- 运动迟缓或有阻滞；
- 漂移倾向向内或向下。

### 7.4 色彩

使用 Culori 在感知更均匀的色彩空间中完成插值、明度和色度调整。

不要：

- 把“好”固定成黄色；
- 把“不好”固定成蓝色；
- 为每个状态复制三套完全无关的画面代码。

---

## 8. 标签规则

首版不用 AI。每幅作品固定生成三个标签：

1. 一个结构标签；
2. 一个运动标签；
3. 一个 Mood 标签。

### 8.1 结构标签

- quiet：`安静` 或 `留白`；
- base 明显占优：`厚重基底`；
- flow 明显占优：`持续流动`；
- sparkle 明显占优：`明亮细节`；
- 三者接近：`层次均衡`。

### 8.2 运动标签

- changeRate 低：`缓慢`；
- changeRate 中：`流动`；
- changeRate 高：`跳跃` 或 `起伏明显`。

### 8.3 Mood 标签

- good：`舒展` / `清亮` / `有生气` 中选一；
- neutral：`日常` / `平稳` / `观察中` 中选一；
- low：`下沉` / `收拢` / `沉静` 中选一。

同一 seed 下标签选择也要稳定，不能每次重绘随机变化。

---

## 9. 示例模式

不使用任何下载的录音、音乐或版权不明素材。

示例模式直接提供合成的声音特征数据，并让画面按预设曲线变化。

建议三个预设：

```ts
const samples = {
  parkMorning: {
    low: 0.20,
    mid: 0.35,
    high: 0.45,
    loudness: 0.35,
    changeRate: 0.45,
  },
  rainyStreet: {
    low: 0.45,
    mid: 0.45,
    high: 0.10,
    loudness: 0.60,
    changeRate: 0.28,
  },
  cafeAfternoon: {
    low: 0.25,
    mid: 0.60,
    high: 0.15,
    loudness: 0.45,
    changeRate: 0.22,
  },
};
```

首页“先体验示例”可先随机进入其中一个；结果页可注明“示例声景”。

---

## 10. 导出与分享

### 10.1 导出卡片

导出一张竖版 PNG，目标尺寸：

```text
1080 × 1440
```

卡片内容：

- `SOUND PALETTE`；
- 日期和时间；
- 静态抽象作品；
- Mood；
- 基底声 / 流动声 / 闪烁声；
- 三个标签；
- 小型品牌标识。

绘制方式：

- 先从 PixiJS 获取作品快照；
- 再使用离屏 Canvas 2D 合成文字和版式；
- 输出 PNG Blob；
- 不依赖 DOM 截图库。

PixiJS 的提取 API可能随版本变化，按项目实际安装版本的官方 API 实现，不要照抄旧版示例。

### 10.2 分享逻辑

优先级：

1. 浏览器支持 `navigator.share` 且支持文件分享：分享 PNG；
2. 否则下载或打开 PNG；
3. 若 iOS Safari 不允许自动下载，给出明确提示：长按图片保存或调用系统分享。

分享失败不得导致作品丢失。

---

## 11. 隐私与安全

### 11.1 强制要求

- 不使用 `MediaRecorder`；
- 不生成音频 Blob；
- 不上传麦克风数据；
- 不把原始时域或频域帧写入本地存储；
- 不做语音识别；
- 不收集定位；
- 不接入统计 SDK；
- 不加载第三方广告或追踪代码。

只允许在内存中保留：

- 10 秒期间的数值特征；
- 会话结束后的 `SoundSummary`；
- 当前 Mood；
- 视觉 seed；
- 导出图片。

### 11.2 权限异常

必须处理：

- 用户拒绝；
- 浏览器不支持；
- 非 HTTPS；
- 没有麦克风设备；
- 权限被系统关闭；
- 微信内置浏览器无法工作；
- AudioContext 处于 suspended；
- 页面切后台。

统一提供示例模式兜底，并提示：

> 当前浏览器无法使用麦克风，可以先体验示例；也可以在 Safari 或 Chrome 中重新打开。

### 11.3 无障碍

- 所有按钮提供可读文字和可访问名称；
- Mood 不能只用颜色区分；
- 文本与背景对比度足够；
- 支持键盘基本操作；
- 尊重 `prefers-reduced-motion`，降低动画速度和粒子数量；
- Canvas 旁提供文字版结果摘要。

---

## 12. 建议目录结构

保持小而清晰，不要提前做大型架构。

```text
sound-palette/
├── public/
│   └── icons/
├── src/
│   ├── main.ts
│   ├── styles.css
│   ├── app-controller.ts
│   ├── types.ts
│   ├── audio-engine.ts
│   ├── sound-summary.ts
│   ├── art-engine.ts
│   ├── mood-profiles.ts
│   ├── tag-engine.ts
│   ├── sample-scenes.ts
│   └── export-card.ts
├── tests/
│   ├── sound-summary.test.ts
│   ├── mood-profiles.test.ts
│   └── tag-engine.test.ts
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── README.md
├── PRIVACY.md
├── THIRD_PARTY_NOTICES.md
├── AGENTS.md
└── CODEX_HANDOFF.md
```

如果某文件超过约 400–500 行且职责明显混杂，再拆分；不要为了满足行数而机械拆分。

---

## 13. 开发里程碑

每个里程碑必须：

- 本地可运行；
- 通过相关测试；
- `npm run build` 成功；
- 提交一次清晰的 Git commit；
- 再进入下一里程碑。

### M0：项目骨架

目标：建立可运行的 Vite + TypeScript + PixiJS 项目。

完成：

- 初始化项目；
- 安装依赖；
- 建立基本页面状态；
- 创建空的 PixiJS 画布；
- 配置 Vitest；
- 添加 README、PRIVACY、THIRD_PARTY_NOTICES 和 AGENTS。

验收：

```powershell
npm run dev
npm run test
npm run build
```

均成功。

建议 commit：

```text
chore: scaffold Sound Palette web MVP
```

### M1：视觉沙盒，不接麦克风

目标：先验证声音参数与 Mood 的视觉语言。

临时提供开发控制面板：

- loudness；
- low；
- mid；
- high；
- changeRate；
- 三种 Mood。

完成一种流体色场视觉。

验收：

- 参数变化明显影响画面；
- 同一参数切换 Mood 时构图不跳变；
- 三种 Mood 不只是换背景色；
- 移动端和桌面浏览器不报错。

建议 commit：

```text
feat: add seeded sound-driven visual sandbox
```

### M2：麦克风与音频摘要

目标：接入 Web Audio API。

完成：

- 权限流程；
- 实时 AudioFrame；
- 低中高频计算；
- 相对响度；
- 变化程度；
- 10 秒 SoundSummary；
- 静音处理；
- 资源清理；
- 单元测试。

验收：

- 安静、说话、低沉声音、拍手能够产生明显不同数据；
- 拒绝权限时进入示例模式；
- 不生成音频文件；
- 多次重新聆听不重复占用麦克风。

建议 commit：

```text
feat: add local microphone analysis and sound summary
```

### M3：完整产品流程

目标：完成四个主状态。

完成：

- 首页；
- 10 秒聆听；
- Mood 选择；
- 结果页；
- 换 Mood；
- 再听一次；
- 示例模式；
- 标签和三层比例。

验收：

- 无人指导可完成完整流程；
- 切换 Mood 保留同一构图；
- 所有异常都有可理解提示。

建议 commit：

```text
feat: complete Sound Palette MVP interaction flow
```

### M4：导出、分享和移动端 QA

完成：

- 1080×1440 PNG；
- Web Share；
- 下载/保存兜底；
- iOS Safari 与 Android Chrome 样式适配；
- 横竖屏处理；
- reduced motion；
- 性能优化；
- 生产构建。

验收：

- 导出的卡片文字完整、无裁切；
- 分享失败仍可保存；
- 移动端平均视觉体验可接受；
- 页面切后台不会继续高负载运行。

建议 commit：

```text
feat: add artwork export sharing and mobile polish
```

### M5：部署准备

完成：

- `npm run build` 生成 `dist/`；
- 创建 `DEPLOY.md`；
- 写明 EdgeOne Pages 的 GitHub 部署或本地目录部署方式；
- 不在没有用户凭证时尝试登录或部署；
- 检查所有生产资源均为本地依赖，无未知 CDN。

建议 commit：

```text
chore: prepare static deployment documentation
```

---

## 14. 测试要求

### 14.1 单元测试

至少覆盖：

- 频段区间与 bin 换算；
- 三层比例正常归一化；
- 静音时不出现除零或假比例；
- 输入含 `NaN` 时安全降级；
- 同一 seed 生成同一布局参数；
- Mood 不修改 SoundSummary；
- 标签规则稳定；
- 数值被限制在合法范围。

### 14.2 手动测试矩阵

| 环境 | 必测内容 |
|---|---|
| Windows Chrome | 开发与基础流程 |
| Android Chrome | 麦克风、导出、性能 |
| iPad Safari | 权限、横竖屏、分享 |
| iPhone Safari | 权限、导出、后台恢复 |
| 微信内置浏览器 | 检测与外部浏览器提示 |

声音场景：

- 安静房间；
- 正常说话；
- 低沉持续声；
- 拍手或短促高频声；
- 环境背景声；
- 拒绝权限。

---

## 15. MVP 完成标准

只有全部满足，才算 v0.1 完成：

- 手机可打开；
- 用户点击后才请求麦克风；
- 10 秒内画面确实响应声音；
- 安静、说话、拍手的结果明显不同；
- 三个 Mood 的感觉明显不同；
- 切换 Mood 时仍然是同一幅作品；
- 显示基底声、流动声、闪烁声；
- 显示三个稳定标签；
- 可以完成示例体验；
- 可以导出完整 PNG；
- 分享有兜底；
- 不保存、不上传原始声音；
- `npm run test` 通过；
- `npm run build` 通过；
- 无高严重度、与生产依赖直接相关且未说明的安全问题；
- README 能让其他人在 Windows 上启动项目。

---

## 16. Token 与工程纪律

本项目必须以节省 Codex Token 和减少返工为优先。

### 16.1 Codex 工作规则

1. 每次只处理当前里程碑；
2. 初次阅读后，不反复扫描整个仓库；
3. 不启动 subagent；
4. 不生成长篇过程报告；
5. 不主动重构与当前任务无关的文件；
6. 不整项目重写；
7. 优先复用已经运行的代码；
8. 不自行添加依赖；
9. 不加入用户没有要求的功能；
10. 只运行与当前修改有关的检查，再运行一次总 build；
11. 不重复询问本文件已经明确的决策；
12. 遇到阻塞时，先做最小可行降级，不扩大范围；
13. 每个里程碑结束后提交 Git；
14. 最终汇报只包含：
    - 修改了哪些文件；
    - 已完成什么；
    - 如何测试；
    - 尚存什么问题。

### 16.2 禁止事项

- 禁止为了“更现代”改成 React；
- 禁止为了视觉效果引入 Three.js；
- 禁止接入 AI 声音识别；
- 禁止创建后端；
- 禁止把原始音频写入文件；
- 禁止使用版权不明的示例音频、字体、图片和图标；
- 禁止复制 AURA 代码；
- 禁止未经说明的大版本依赖升级。

---

## 17. Git 与许可证

### 17.1 Git 工作流

- 默认在新分支工作：`feat/sound-palette-mvp-v0.1`；
- 每个里程碑一个 commit；
- 不提交 `node_modules`、临时录音、构建缓存；
- `dist/` 是否提交由仓库现有策略决定，默认不提交；
- 不 force push 用户主分支；
- 用户未要求时，不自动发布公开仓库。

### 17.2 第三方许可证

主要依赖为 MIT 或 Apache-2.0 类宽松许可证，可用于商业项目，但必须保留相应许可信息。

创建 `THIRD_PARTY_NOTICES.md`，记录：

- 包名；
- 锁定版本；
- 官方仓库；
- 许可证；
- 用途。

不要在项目根目录自动添加 MIT License 给用户自有代码，除非用户明确决定将 Sound Palette 本身以 MIT 开源。

---

## 18. 给 Codex 的最终执行指令

请把本文件视为项目需求与工程约束的唯一主文档。

执行顺序：

1. 检查当前仓库，不能覆盖已有工作；
2. 创建或切换到 `feat/sound-palette-mvp-v0.1`；
3. 按 M0 → M5 顺序实施；
4. 每个里程碑先验证，再提交；
5. 保持依赖最少；
6. 遇到移动端无法在 Windows 本地复现的问题，记录清晰的设备验证步骤，不猜测已经通过；
7. 没有部署凭证时，只准备部署文档和 `dist/`，不要声称已经上线；
8. 所有隐私声明必须与实际实现一致；
9. 完成后输出一份简洁的 `FINAL_REPORT.md`，内容不超过 1,200 字。

最终产品应当是一段完整、克制、可理解的体验，而不是技术演示仪表盘。

> 听十秒此刻的声音，选择一种心情，留下这一刻的颜色。
