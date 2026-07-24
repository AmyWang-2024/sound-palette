import './styles.css'
import { AppController } from './app-controller'
import { ArtEngine } from './art-engine'
import { AudioEngine, AudioEngineError } from './audio-engine'
import { MOOD_PROFILES } from './mood-profiles'
import {
  createSampleFrame,
  createSampleSummary,
  SAMPLE_DURATION_MS,
} from './sample-scenes'
import type {
  AudioFrame,
  Mood,
  SoundSummary,
  SoundVisualInput,
} from './types'
import { DEFAULT_VISUAL_INPUT } from './visual-rules'

const SANDBOX_SEED = 'sound-palette-m1-sandbox'

const controls = [
  { key: 'loudness', label: '相对响度' },
  { key: 'lowEnergy', label: '低频 / 基底' },
  { key: 'midEnergy', label: '中频 / 流动' },
  { key: 'highEnergy', label: '高频 / 闪烁' },
  { key: 'changeRate', label: '变化程度' },
] as const

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Sound Palette app root was not found.')
}

const controller = new AppController()
root.dataset.appState = controller.state
root.innerHTML = `
  <main class="sandbox-shell">
    <header class="sandbox-header">
      <div>
        <p class="eyebrow">声音调色盘 · M2</p>
        <h1>Sound Palette</h1>
      </div>
      <p class="sandbox-intro">
        在设备本地聆听十秒，让实时声音特征驱动同一幅抽象构图。
      </p>
    </header>

    <div class="sandbox-grid">
      <section class="art-card" aria-labelledby="art-title">
        <div class="art-heading">
          <div>
            <p class="section-kicker">实时视觉沙盒</p>
            <h2 id="art-title">此刻的声音形状</h2>
          </div>
          <span class="live-badge">本地生成</span>
        </div>
        <div id="art-canvas" class="art-canvas"></div>
        <p class="canvas-summary">
          画面只接收本地计算后的数值特征；不录音，不生成或上传音频文件。
        </p>
      </section>

      <form class="control-panel" id="visual-controls">
        <div class="panel-heading">
          <p class="section-kicker">开发控制面板</p>
          <h2>声音参数</h2>
          <p>点击后才请求麦克风；这里显示的是相对特征，不代表绝对分贝。</p>
        </div>

        <section class="listen-card" aria-labelledby="listen-title">
          <div class="listen-status-row">
            <strong id="listen-title">十秒本地分析</strong>
            <span id="listen-countdown">10.0 秒</span>
          </div>
          <progress id="listen-progress" max="100" value="0">0%</progress>
          <div class="session-actions">
            <button class="primary-button" id="start-listening" type="button">
              开始麦克风分析
            </button>
            <button class="secondary-button" id="stop-listening" type="button" disabled>
              停止
            </button>
          </div>
          <p class="listen-message" id="listen-message">
            准备就绪。无权限或非 HTTPS 时会自动进入示例模式。
          </p>
          <div class="summary-card" id="summary-card" hidden></div>
        </section>

        <div class="sliders">
          ${controls
            .map(
              ({ key, label }) => `
                <label class="slider-control" for="${key}">
                  <span>${label}</span>
                  <output for="${key}" data-output="${key}">
                    ${DEFAULT_VISUAL_INPUT[key].toFixed(2)}
                  </output>
                  <input
                    id="${key}"
                    name="${key}"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value="${DEFAULT_VISUAL_INPUT[key]}"
                  />
                </label>
              `,
            )
            .join('')}
        </div>

        <fieldset class="mood-fieldset">
          <legend>Mood</legend>
          <div class="mood-options">
            ${Object.values(MOOD_PROFILES)
              .map(
                (profile) => `
                  <label class="mood-choice">
                    <input
                      type="radio"
                      name="mood"
                      value="${profile.id}"
                      ${profile.id === 'neutral' ? 'checked' : ''}
                    />
                    <span>${profile.labelZh}</span>
                  </label>
                `,
              )
              .join('')}
          </div>
        </fieldset>

        <p class="privacy-note">
          声音仅在内存中实时分析；不录音、不保存或上传原始音频。
        </p>
      </form>
    </div>
  </main>
`

const artCanvas = root.querySelector<HTMLDivElement>('#art-canvas')
const form = root.querySelector<HTMLFormElement>('#visual-controls')
const startButton = root.querySelector<HTMLButtonElement>('#start-listening')
const stopButton = root.querySelector<HTMLButtonElement>('#stop-listening')
const progress = root.querySelector<HTMLProgressElement>('#listen-progress')
const countdown = root.querySelector<HTMLSpanElement>('#listen-countdown')
const message = root.querySelector<HTMLParagraphElement>('#listen-message')
const summaryCard = root.querySelector<HTMLDivElement>('#summary-card')

if (
  !artCanvas ||
  !form ||
  !startButton ||
  !stopButton ||
  !progress ||
  !countdown ||
  !message ||
  !summaryCard
) {
  throw new Error('Sound Palette sandbox elements were not found.')
}

const visualControls = form
const listenStartButton = startButton
const listenStopButton = stopButton
const listenProgress = progress
const listenCountdown = countdown
const listenMessage = message
const resultSummary = summaryCard

function readVisualInput(): SoundVisualInput {
  const formData = new FormData(visualControls)

  return {
    loudness: Number(formData.get('loudness')),
    lowEnergy: Number(formData.get('lowEnergy')),
    midEnergy: Number(formData.get('midEnergy')),
    highEnergy: Number(formData.get('highEnergy')),
    changeRate: Number(formData.get('changeRate')),
  }
}

function readMood(): Mood {
  const value = new FormData(visualControls).get('mood')

  if (value === 'good' || value === 'low') {
    return value
  }

  return 'neutral'
}

const engine = await ArtEngine.create(artCanvas, {
  seed: SANDBOX_SEED,
  input: DEFAULT_VISUAL_INPUT,
  mood: 'neutral',
})
const audioEngine = new AudioEngine()
let sampleAnimationId: number | undefined
let sampleStartedAt = 0
let sampleFrames: AudioFrame[] = []

function renderVisualInput(input: SoundVisualInput): void {
  for (const control of controls) {
    const slider = visualControls.elements.namedItem(control.key)
    const output = visualControls.querySelector<HTMLOutputElement>(
      `[data-output="${control.key}"]`,
    )
    const value = input[control.key]

    if (slider instanceof HTMLInputElement) {
      slider.value = value.toFixed(2)
    }

    if (output) {
      output.value = value.toFixed(2)
    }
  }

  engine.setInput(input)
}

function setSlidersDisabled(disabled: boolean): void {
  visualControls
    .querySelectorAll<HTMLInputElement>('input[type="range"]')
    .forEach((slider) => {
      slider.disabled = disabled
    })
}

function renderProgress(elapsedMs: number, durationMs: number): void {
  const safeDuration = Math.max(1, durationMs)
  const safeElapsed = Math.min(safeDuration, Math.max(0, elapsedMs))
  listenProgress.value = (safeElapsed / safeDuration) * 100
  listenCountdown.textContent = `${Math.max(0, (safeDuration - safeElapsed) / 1000).toFixed(1)} 秒`
}

function setSessionRunning(running: boolean): void {
  listenStartButton.disabled = running
  listenStopButton.disabled = !running
  setSlidersDisabled(running)
}

function showSummary(summary: SoundSummary, sample: boolean): void {
  const percentage = (value: number): string => `${Math.round(value * 100)}%`
  const sourceLabel = sample ? '示例声景' : '麦克风分析'
  const quietLabel = summary.quiet ? ' · 安静' : ''

  resultSummary.hidden = false
  resultSummary.innerHTML = `
    <strong>${sourceLabel}${quietLabel}</strong>
    <div class="summary-values">
      <span>基底 ${percentage(summary.composition.base)}</span>
      <span>流动 ${percentage(summary.composition.flow)}</span>
      <span>闪烁 ${percentage(summary.composition.sparkle)}</span>
    </div>
  `
}

function finishSession(summary: SoundSummary, sample: boolean): void {
  setSessionRunning(false)
  renderProgress(summary.durationMs, SAMPLE_DURATION_MS)
  renderVisualInput({
    loudness: summary.loudnessMean,
    lowEnergy: summary.lowEnergy,
    midEnergy: summary.midEnergy,
    highEnergy: summary.highEnergy,
    changeRate: summary.changeRate,
  })
  showSummary(summary, sample)
  listenMessage.textContent = sample
    ? '示例分析完成。可以调整参数，或重新尝试麦克风。'
    : '本地分析完成，麦克风资源已释放。'
}

function finishSampleSession(): void {
  if (sampleAnimationId !== undefined) {
    cancelAnimationFrame(sampleAnimationId)
    sampleAnimationId = undefined
  }

  const elapsedMs = Math.min(
    SAMPLE_DURATION_MS,
    Math.max(0, performance.now() - sampleStartedAt),
  )
  const summary = createSampleSummary(sampleFrames, elapsedMs)
  finishSession(summary, true)
}

function startSampleSession(reason: string): void {
  sampleFrames = []
  sampleStartedAt = performance.now()
  resultSummary.hidden = true
  listenMessage.textContent = `${reason} 当前使用本地合成特征演示，不播放或下载音频。`
  setSessionRunning(true)

  const sampleFrame = (now: number): void => {
    const elapsedMs = Math.min(SAMPLE_DURATION_MS, now - sampleStartedAt)
    const frame = createSampleFrame(elapsedMs)
    sampleFrames.push(frame)
    renderVisualInput(frame)
    renderProgress(elapsedMs, SAMPLE_DURATION_MS)

    if (elapsedMs >= SAMPLE_DURATION_MS) {
      sampleAnimationId = undefined
      finishSession(createSampleSummary(sampleFrames), true)
      return
    }

    sampleAnimationId = requestAnimationFrame(sampleFrame)
  }

  sampleAnimationId = requestAnimationFrame(sampleFrame)
}

async function startMicrophoneSession(): Promise<void> {
  if (sampleAnimationId !== undefined) {
    finishSampleSession()
  }

  resultSummary.hidden = true
  listenMessage.textContent = '正在请求麦克风权限…'
  renderProgress(0, SAMPLE_DURATION_MS)
  setSessionRunning(true)

  try {
    const summary = await audioEngine.listen({
      durationMs: SAMPLE_DURATION_MS,
      onFrame: renderVisualInput,
      onProgress: renderProgress,
    })
    finishSession(summary, false)
  } catch (error) {
    const reason =
      error instanceof AudioEngineError
        ? error.message
        : '当前浏览器无法使用麦克风，可以先体验示例。'
    startSampleSession(reason)
  }
}

visualControls.addEventListener('input', (event) => {
  const target = event.target

  if (!(target instanceof HTMLInputElement)) {
    return
  }

  if (target.type === 'range') {
    const output = visualControls.querySelector<HTMLOutputElement>(
      `[data-output="${target.name}"]`,
    )

    if (output) {
      output.value = target.valueAsNumber.toFixed(2)
    }

    engine.setInput(readVisualInput())
    return
  }

  if (target.name === 'mood') {
    engine.setMood(readMood())
  }
})

listenStartButton.addEventListener('click', () => {
  void startMicrophoneSession()
})

listenStopButton.addEventListener('click', () => {
  if (sampleAnimationId !== undefined) {
    finishSampleSession()
    return
  }

  void audioEngine.stop()
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden && sampleAnimationId !== undefined) {
    finishSampleSession()
  }
})

window.addEventListener(
  'beforeunload',
  () => {
    if (sampleAnimationId !== undefined) {
      cancelAnimationFrame(sampleAnimationId)
    }
    void audioEngine.stop()
    engine.destroy()
  },
  { once: true },
)
