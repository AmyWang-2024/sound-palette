import './styles.css'
import { AppController } from './app-controller'
import { ArtEngine } from './art-engine'
import {
  canvasToPngBlob,
  composeArtworkCard,
  createExportFilename,
} from './artwork-export'
import { AudioEngine } from './audio-engine'
import { MOOD_PROFILES } from './mood-profiles'
import {
  createSampleFrame,
  createSampleSummary,
  pickSampleScene,
  SAMPLE_DURATION_MS,
  SAMPLE_SCENES,
  type SampleSceneId,
} from './sample-scenes'
import { summaryToVisualInput } from './sound-summary'
import { createArtworkTags } from './tag-rules'
import { detectShareCapabilities, downloadBlob } from './share-export'
import type { AudioFrame, Mood, SoundSummary, SoundVisualInput } from './types'
import { DEFAULT_VISUAL_INPUT } from './visual-rules'

const HOME_SEED = 'sound-palette-home'
const MICROPHONE_FALLBACK_MESSAGE =
  '当前浏览器无法使用麦克风，可以先体验示例；也可以在 Safari 或 Chrome 中重新打开。'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Sound Palette app root was not found.')
}

const appRoot = root

appRoot.innerHTML = `
  <main class="product-shell">
    <header class="brand-bar">
      <button class="brand-button" id="brand-home" type="button" aria-label="返回 Sound Palette 首页">
        <span>Sound Palette</span>
        <small>声音调色盘</small>
      </button>
      <span class="local-badge">只在本地分析</span>
    </header>

    <div class="experience-frame">
      <section class="visual-card" id="visual-card" aria-labelledby="artwork-title">
        <div class="visual-heading">
          <div>
            <p class="section-kicker" id="stage-kicker">声音的另一种样子</p>
            <h2 id="artwork-title">听见，也看见</h2>
          </div>
          <span class="source-badge" id="source-badge">本地生成</span>
        </div>
        <div class="art-canvas" id="art-canvas"></div>
        <p class="canvas-caption" id="canvas-caption">
          画面由示意数值生成。开始聆听前不会请求麦克风权限。
        </p>
      </section>

      <div class="flow-panel" aria-live="polite">
        <section class="flow-screen home-screen" data-screen="home">
          <div>
            <p class="eyebrow">声音调色盘</p>
            <h1>Sound Palette</h1>
            <p class="chinese-name">声音调色盘</p>
          </div>
          <p class="hero-copy">听见的，也可以被看见。</p>
          <div class="primary-actions">
            <button class="primary-button" id="start-listening" type="button">
              开始聆听
            </button>
            <button class="secondary-button" id="start-sample" type="button">
              先体验示例
            </button>
          </div>
          <p class="privacy-callout">
            声音只在你的设备上实时分析，不录音、不上传。
          </p>
        </section>

        <section class="flow-screen listening-screen" data-screen="listening" hidden>
          <div>
            <p class="eyebrow">10 秒本地分析</p>
            <h1 class="step-title">正在聆听</h1>
            <p class="step-copy" id="listening-copy">
              让周围的声音自然发生，画面会从第一秒开始回应。
            </p>
          </div>
          <div class="listen-progress-card">
            <div class="progress-heading">
              <span id="listen-source">麦克风</span>
              <strong id="listen-countdown">10.0 秒</strong>
            </div>
            <progress id="listen-progress" max="100" value="0">0%</progress>
            <p id="listen-message">正在请求麦克风权限…</p>
          </div>
          <button class="secondary-button stop-button" id="stop-listening" type="button">
            停止
          </button>
        </section>

        <section class="flow-screen mood-screen" data-screen="mood" hidden>
          <div>
            <p class="eyebrow">为声音上色</p>
            <h1 class="step-title">此刻，你感觉怎么样？</h1>
            <p class="step-copy">
              Mood 只改变色彩与运动倾向，不会修改刚才的声音构成。
            </p>
          </div>
          <div class="mood-grid" role="group" aria-label="选择此刻的 Mood">
            ${Object.values(MOOD_PROFILES)
              .map(
                (profile) => `
                  <button
                    class="mood-option mood-option--${profile.id}"
                    type="button"
                    data-mood="${profile.id}"
                    aria-pressed="false"
                  >
                    <span class="mood-swatch" aria-hidden="true"></span>
                    <strong>${profile.labelZh}</strong>
                  </button>
                `,
              )
              .join('')}
          </div>
          <p class="choice-note">选择后立即生成你的声音画。</p>
        </section>

        <section class="flow-screen result-screen" data-screen="result" hidden>
          <div class="result-heading">
            <div>
              <p class="eyebrow" id="result-source">你的声音画</p>
              <h1 class="step-title">此刻的声景</h1>
            </div>
            <span class="mood-result" id="result-mood">不好不坏</span>
          </div>

          <section class="composition-card" aria-labelledby="composition-title">
            <h2 id="composition-title">三层声景构成</h2>
            <div id="composition-values"></div>
          </section>

          <section class="tags-card" aria-labelledby="tags-title">
            <h2 id="tags-title">这幅作品的三个标签</h2>
            <ul class="tag-list" id="tag-list"></ul>
          </section>

          <div class="result-actions">
            <button class="primary-button" id="change-mood" type="button">
              换一种 Mood
            </button>
            <button class="secondary-button" id="listen-again" type="button">
              再听一次
            </button>
          </div>
          <div class="future-actions" aria-label="导出与分享">
            <button id="save-artwork" type="button">保存图片</button>
            <button id="share-artwork" type="button">分享</button>
          </div>
          <p class="export-status" id="export-status" role="status">
            可生成 1080 × 1440 PNG；分享失败时仍可保存。
          </p>
        </section>
      </div>
    </div>

    <footer class="privacy-footer">
      不录音 · 不保存原始音频 · 不上传麦克风数据
    </footer>

    <section
      class="export-preview"
      id="export-preview"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-preview-title"
      hidden
    >
      <div class="export-preview-card">
        <div class="preview-heading">
          <div>
            <p class="eyebrow">PNG 预览</p>
            <h2 id="export-preview-title">保存你的声音画</h2>
          </div>
          <button id="close-preview" type="button" aria-label="关闭图片预览">关闭</button>
        </div>
        <img id="export-preview-image" alt="Sound Palette 导出卡片预览" />
        <p id="export-preview-message">
          长按图片保存，或使用系统分享。
        </p>
        <button class="primary-button" id="download-preview" type="button">
          下载 PNG
        </button>
      </div>
    </section>
  </main>
`

function requireElement<T extends Element>(selector: string): T {
  const element = appRoot.querySelector<T>(selector)

  if (!element) {
    throw new Error(`Sound Palette element was not found: ${selector}`)
  }

  return element
}

const visualCard = requireElement<HTMLElement>('#visual-card')
const artCanvas = requireElement<HTMLDivElement>('#art-canvas')
const artworkTitle = requireElement<HTMLHeadingElement>('#artwork-title')
const stageKicker = requireElement<HTMLParagraphElement>('#stage-kicker')
const sourceBadge = requireElement<HTMLSpanElement>('#source-badge')
const canvasCaption = requireElement<HTMLParagraphElement>('#canvas-caption')
const brandHomeButton = requireElement<HTMLButtonElement>('#brand-home')
const startListeningButton =
  requireElement<HTMLButtonElement>('#start-listening')
const startSampleButton = requireElement<HTMLButtonElement>('#start-sample')
const stopListeningButton =
  requireElement<HTMLButtonElement>('#stop-listening')
const listenProgress =
  requireElement<HTMLProgressElement>('#listen-progress')
const listenCountdown =
  requireElement<HTMLSpanElement>('#listen-countdown')
const listenSource = requireElement<HTMLSpanElement>('#listen-source')
const listenMessage = requireElement<HTMLParagraphElement>('#listen-message')
const compositionValues =
  requireElement<HTMLDivElement>('#composition-values')
const resultSource = requireElement<HTMLParagraphElement>('#result-source')
const resultMood = requireElement<HTMLSpanElement>('#result-mood')
const tagList = requireElement<HTMLUListElement>('#tag-list')
const changeMoodButton = requireElement<HTMLButtonElement>('#change-mood')
const listenAgainButton = requireElement<HTMLButtonElement>('#listen-again')
const saveArtworkButton =
  requireElement<HTMLButtonElement>('#save-artwork')
const shareArtworkButton =
  requireElement<HTMLButtonElement>('#share-artwork')
const exportStatus = requireElement<HTMLParagraphElement>('#export-status')
const exportPreview = requireElement<HTMLElement>('#export-preview')
const exportPreviewImage =
  requireElement<HTMLImageElement>('#export-preview-image')
const exportPreviewMessage =
  requireElement<HTMLParagraphElement>('#export-preview-message')
const closePreviewButton =
  requireElement<HTMLButtonElement>('#close-preview')
const downloadPreviewButton =
  requireElement<HTMLButtonElement>('#download-preview')
const moodButtons = Array.from(
  appRoot.querySelectorAll<HTMLButtonElement>('[data-mood]'),
)
const screens = Array.from(
  appRoot.querySelectorAll<HTMLElement>('[data-screen]'),
)

const controller = new AppController()
const audioEngine = new AudioEngine()
let engine = await ArtEngine.create(artCanvas, {
  seed: HOME_SEED,
  input: DEFAULT_VISUAL_INPUT,
  mood: 'neutral',
})
let sampleAnimationId: number | undefined
let sampleStartedAt = 0
let sampleFrames: AudioFrame[] = []
let sampleSceneId: SampleSceneId = 'parkMorning'
let sampleCompleting = false
let cachedExportBlob: Blob | undefined
let cachedExportFilename = ''
let previewUrl: string | undefined

function renderProgress(elapsedMs: number, durationMs: number): void {
  const safeDuration = Math.max(1, durationMs)
  const safeElapsed = Math.min(safeDuration, Math.max(0, elapsedMs))
  listenProgress.value = (safeElapsed / safeDuration) * 100
  listenCountdown.textContent = `${Math.max(
    0,
    (safeDuration - safeElapsed) / 1000,
  ).toFixed(1)} 秒`
}

function renderVisualInput(input: SoundVisualInput): void {
  engine.setInput(input)

  if (controller.state === 'listening') {
    canvasCaption.textContent = `相对响度 ${Math.round(
      input.loudness * 100,
    )}% · 变化程度 ${Math.round(input.changeRate * 100)}%。只保留数值特征。`
  }
}

function currentSourceLabel(): string {
  return controller.source === 'sample'
    ? `示例声景 · ${SAMPLE_SCENES[sampleSceneId].labelZh}`
    : '你的声音画'
}

function closeExportPreview(): void {
  exportPreview.hidden = true
  document.body.classList.remove('preview-open')

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl)
    previewUrl = undefined
  }

  exportPreviewImage.removeAttribute('src')
}

function invalidateExport(): void {
  cachedExportBlob = undefined
  cachedExportFilename = ''

  if (!exportPreview.hidden) {
    closeExportPreview()
  }
}

function showExportPreview(blob: Blob, message: string): void {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl)
  }

  previewUrl = URL.createObjectURL(blob)
  exportPreviewImage.src = previewUrl
  exportPreviewMessage.textContent = message
  exportPreview.hidden = false
  document.body.classList.add('preview-open')
  closePreviewButton.focus()
}

function setExportBusy(busy: boolean): void {
  saveArtworkButton.disabled = busy
  shareArtworkButton.disabled = busy
}

async function getArtworkExport(): Promise<{
  blob: Blob
  filename: string
}> {
  if (cachedExportBlob) {
    return {
      blob: cachedExportBlob,
      filename: cachedExportFilename,
    }
  }

  const summary = controller.summary
  const mood = controller.mood

  if (!summary || !mood) {
    throw new Error('声音画还没有准备好。')
  }

  setExportBusy(true)
  exportStatus.textContent = '正在生成 1080 × 1440 PNG…'

  try {
    const artwork = engine.snapshot()
    const card = composeArtworkCard({
      artwork,
      summary,
      mood,
      tags: createArtworkTags(summary, mood),
      sourceLabel: currentSourceLabel(),
    })
    cachedExportBlob = await canvasToPngBlob(card)
    cachedExportFilename = createExportFilename()

    return {
      blob: cachedExportBlob,
      filename: cachedExportFilename,
    }
  } finally {
    setExportBusy(false)
  }
}

async function saveCurrentArtwork(): Promise<void> {
  try {
    const { blob, filename } = await getArtworkExport()
    const capabilities = detectShareCapabilities(navigator)

    if (capabilities.iosLike || capabilities.weChat) {
      showExportPreview(
        blob,
        capabilities.weChat
          ? '微信内置浏览器可能限制下载。请长按图片保存，或在 Safari / Chrome 中重新打开。'
          : '请长按图片保存；也可以关闭预览后使用“分享”调用系统面板。',
      )
      exportStatus.textContent = 'PNG 已生成，可在预览中长按保存。'
      return
    }

    downloadBlob(blob, filename)
    exportStatus.textContent = `PNG 已生成并开始下载：${filename}`
  } catch (error) {
    exportStatus.textContent =
      error instanceof Error ? error.message : '图片生成失败，请稍后重试。'
  }
}

async function shareCurrentArtwork(): Promise<void> {
  try {
    const { blob, filename } = await getArtworkExport()
    const capabilities = detectShareCapabilities(navigator)
    const file =
      typeof File === 'function'
        ? new File([blob], filename, { type: 'image/png' })
        : undefined
    const canShareFile =
      file &&
      capabilities.canShareFiles &&
      navigator.canShare?.({ files: [file] })

    if (file && canShareFile) {
      try {
        await navigator.share({
          title: 'Sound Palette · 声音调色盘',
          text: '这是我此刻的声音画。',
          files: [file],
        })
        exportStatus.textContent = '系统分享面板已完成。'
        return
      } catch {
        showExportPreview(
          blob,
          '分享未完成，但作品仍然保留。可长按图片保存，或点击下方下载。',
        )
        exportStatus.textContent = '分享未完成，已打开保存预览。'
        return
      }
    }

    if (capabilities.iosLike || capabilities.weChat) {
      showExportPreview(
        blob,
        '当前浏览器不支持文件分享。请长按图片保存，或在 Safari / Chrome 中重新打开。',
      )
      exportStatus.textContent = '当前浏览器不支持文件分享，已打开保存预览。'
      return
    }

    downloadBlob(blob, filename)
    exportStatus.textContent = '当前浏览器不支持文件分享，已改为下载 PNG。'
  } catch (error) {
    exportStatus.textContent =
      error instanceof Error ? error.message : '分享准备失败，请稍后重试。'
  }
}

function compositionRow(
  label: string,
  value: number,
  className: string,
): string {
  const percentage = Math.round(value * 100)

  return `
    <div class="composition-row">
      <div class="composition-label">
        <span>${label}</span>
        <strong>${percentage}%</strong>
      </div>
      <div class="composition-track" aria-hidden="true">
        <span class="${className}" style="width: ${percentage}%"></span>
      </div>
    </div>
  `
}

function renderResult(): void {
  const summary = controller.summary
  const mood = controller.mood

  if (!summary || !mood) {
    return
  }

  const tags = createArtworkTags(summary, mood)
  resultSource.textContent = currentSourceLabel()
  resultMood.textContent = MOOD_PROFILES[mood].labelZh
  compositionValues.innerHTML = [
    compositionRow('基底声', summary.composition.base, 'base-fill'),
    compositionRow('流动声', summary.composition.flow, 'flow-fill'),
    compositionRow('闪烁声', summary.composition.sparkle, 'sparkle-fill'),
  ].join('')
  tagList.innerHTML = `
    <li><span>结构</span><strong>${tags.structure}</strong></li>
    <li><span>运动</span><strong>${tags.movement}</strong></li>
    <li><span>Mood</span><strong>${tags.mood}</strong></li>
  `
  exportStatus.textContent =
    '可生成 1080 × 1440 PNG；分享失败时仍可保存。'
  canvasCaption.textContent = summary.quiet
    ? `这是一段安静声景，三层构成保持为 0；Mood 为${MOOD_PROFILES[mood].labelZh}。`
    : `基底声 ${Math.round(
        summary.composition.base * 100,
      )}%，流动声 ${Math.round(
        summary.composition.flow * 100,
      )}%，闪烁声 ${Math.round(
        summary.composition.sparkle * 100,
      )}%；Mood 为${MOOD_PROFILES[mood].labelZh}。`
}

function renderState(): void {
  const state = controller.state
  appRoot.dataset.appState = state
  visualCard.dataset.state = state

  for (const screen of screens) {
    screen.hidden = screen.dataset.screen !== state
  }

  if (state === 'home') {
    stageKicker.textContent = '声音的另一种样子'
    artworkTitle.textContent = '听见，也看见'
    sourceBadge.textContent = '本地生成'
    canvasCaption.textContent =
      '画面由示意数值生成。开始聆听前不会请求麦克风权限。'
    return
  }

  if (state === 'listening') {
    stopListeningButton.disabled = false
    stageKicker.textContent = '实时回应'
    artworkTitle.textContent = '声音正在形成'
    sourceBadge.textContent =
      controller.source === 'sample' ? '示例声景' : '本地聆听'
    listenSource.textContent =
      controller.source === 'sample'
        ? SAMPLE_SCENES[sampleSceneId].labelZh
        : '麦克风'
    return
  }

  if (state === 'mood') {
    stageKicker.textContent = '构图已经固定'
    artworkTitle.textContent = '给它一种心情色彩'
    sourceBadge.textContent =
      controller.source === 'sample' ? '示例声景' : '本地生成'
    canvasCaption.textContent =
      '声音构成与布局已经固定；选择 Mood 只会改变色彩、明暗和运动倾向。'
    moodButtons.forEach((button) => button.setAttribute('aria-pressed', 'false'))
    return
  }

  stageKicker.textContent = '完成'
  artworkTitle.textContent = '此刻的声音画'
  sourceBadge.textContent =
    controller.source === 'sample' ? '示例声景' : '本地生成'
  renderResult()
}

async function resetArtwork(summary: SoundSummary): Promise<void> {
  engine.destroy()
  artCanvas.replaceChildren()
  engine = await ArtEngine.create(artCanvas, {
    seed: summary.seed,
    input: summaryToVisualInput(summary),
    mood: 'neutral',
  })
}

async function finishSession(summary: SoundSummary): Promise<void> {
  invalidateExport()
  await resetArtwork(summary)
  controller.completeListening(summary)
  renderProgress(summary.durationMs, SAMPLE_DURATION_MS)
  renderState()
}

async function finishSampleSession(): Promise<void> {
  if (sampleCompleting) {
    return
  }

  sampleCompleting = true

  if (sampleAnimationId !== undefined) {
    cancelAnimationFrame(sampleAnimationId)
    sampleAnimationId = undefined
  }

  const elapsedMs = Math.min(
    SAMPLE_DURATION_MS,
    Math.max(0, performance.now() - sampleStartedAt),
  )
  const summary = createSampleSummary(
    sampleFrames,
    elapsedMs,
    sampleSceneId,
  )
  await finishSession(summary)
  sampleCompleting = false
}

function startSampleSession(sceneId: SampleSceneId, message: string): void {
  controller.startListening('sample')
  sampleSceneId = sceneId
  sampleFrames = []
  sampleStartedAt = performance.now()
  sampleCompleting = false
  renderProgress(0, SAMPLE_DURATION_MS)
  listenMessage.textContent = message
  renderState()

  const sampleFrame = (now: number): void => {
    const elapsedMs = Math.min(SAMPLE_DURATION_MS, now - sampleStartedAt)
    const frame = createSampleFrame(elapsedMs, sampleSceneId)
    sampleFrames.push(frame)
    renderVisualInput(frame)
    renderProgress(elapsedMs, SAMPLE_DURATION_MS)

    if (elapsedMs >= SAMPLE_DURATION_MS) {
      sampleAnimationId = undefined
      void finishSampleSession()
      return
    }

    sampleAnimationId = requestAnimationFrame(sampleFrame)
  }

  sampleAnimationId = requestAnimationFrame(sampleFrame)
}

async function startMicrophoneSession(): Promise<void> {
  if (sampleAnimationId !== undefined) {
    await finishSampleSession()
  }

  controller.startListening('microphone')
  renderProgress(0, SAMPLE_DURATION_MS)
  listenMessage.textContent = '正在请求麦克风权限…'
  renderState()

  try {
    const summary = await audioEngine.listen({
      durationMs: SAMPLE_DURATION_MS,
      onFrame: renderVisualInput,
      onProgress: renderProgress,
    })
    await finishSession(summary)
  } catch {
    const sceneId = pickSampleScene()
    startSampleSession(sceneId, MICROPHONE_FALLBACK_MESSAGE)
  }
}

startListeningButton.addEventListener('click', () => {
  void startMicrophoneSession()
})

startSampleButton.addEventListener('click', () => {
  const sceneId = pickSampleScene()
  startSampleSession(
    sceneId,
    `正在体验「${SAMPLE_SCENES[sceneId].labelZh}」示例声景；不播放或下载音频。`,
  )
})

stopListeningButton.addEventListener('click', () => {
  stopListeningButton.disabled = true
  listenMessage.textContent = '正在安全结束并释放资源…'

  if (sampleAnimationId !== undefined) {
    void finishSampleSession()
    return
  }

  void audioEngine.stop()
})

moodButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const mood = button.dataset.mood as Mood

    if (!controller.selectMood(mood)) {
      return
    }

    invalidateExport()
    engine.setMood(mood)
    moodButtons.forEach((option) =>
      option.setAttribute(
        'aria-pressed',
        option.dataset.mood === mood ? 'true' : 'false',
      ),
    )
    renderState()
  })
})

changeMoodButton.addEventListener('click', () => {
  if (controller.changeMood()) {
    renderState()
  }
})

listenAgainButton.addEventListener('click', () => {
  void startMicrophoneSession()
})

saveArtworkButton.addEventListener('click', () => {
  void saveCurrentArtwork()
})

shareArtworkButton.addEventListener('click', () => {
  void shareCurrentArtwork()
})

closePreviewButton.addEventListener('click', () => {
  closeExportPreview()
  saveArtworkButton.focus()
})

downloadPreviewButton.addEventListener('click', () => {
  if (cachedExportBlob) {
    downloadBlob(cachedExportBlob, cachedExportFilename)
    exportPreviewMessage.textContent =
      '下载已开始。如果浏览器没有响应，请长按上方图片保存。'
  }
})

exportPreview.addEventListener('click', (event) => {
  if (event.target === exportPreview) {
    closeExportPreview()
    saveArtworkButton.focus()
  }
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !exportPreview.hidden) {
    closeExportPreview()
    saveArtworkButton.focus()
  }
})

brandHomeButton.addEventListener('click', () => {
  if (controller.state === 'listening') {
    return
  }

  controller.returnHome()
  invalidateExport()
  engine.setInput(DEFAULT_VISUAL_INPUT)
  engine.setMood('neutral')
  renderState()
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden && sampleAnimationId !== undefined) {
    void finishSampleSession()
  }
})

window.addEventListener(
  'beforeunload',
  () => {
    if (sampleAnimationId !== undefined) {
      cancelAnimationFrame(sampleAnimationId)
    }
    closeExportPreview()
    void audioEngine.stop()
    engine.destroy()
  },
  { once: true },
)

renderState()
