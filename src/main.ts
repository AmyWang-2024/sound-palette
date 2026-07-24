import './styles.css'
import { AppController } from './app-controller'
import { ArtEngine } from './art-engine'
import { MOOD_PROFILES } from './mood-profiles'
import type { Mood, SoundVisualInput } from './types'
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
        <p class="eyebrow">声音调色盘 · M1</p>
        <h1>Sound Palette</h1>
      </div>
      <p class="sandbox-intro">
        调整声音特征，观察同一幅构图如何变化；切换心情时，画面的骨架保持不变。
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
          抽象画面由五项模拟声音参数和当前 Mood 生成。M1 不访问麦克风。
        </p>
      </section>

      <form class="control-panel" id="visual-controls">
        <div class="panel-heading">
          <p class="section-kicker">开发控制面板</p>
          <h2>声音参数</h2>
          <p>这些数值仅用于验证视觉语言，不代表绝对分贝。</p>
        </div>

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
          当前版本不会请求麦克风，不录音、不保存或上传任何音频。
        </p>
      </form>
    </div>
  </main>
`

const artCanvas = root.querySelector<HTMLDivElement>('#art-canvas')
const form = root.querySelector<HTMLFormElement>('#visual-controls')

if (!artCanvas || !form) {
  throw new Error('Sound Palette sandbox elements were not found.')
}

const visualControls = form

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

window.addEventListener('beforeunload', () => engine.destroy(), { once: true })
