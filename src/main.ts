import './styles.css'
import { AppController } from './app-controller'
import { createEmptyArtCanvas } from './art-engine'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Sound Palette app root was not found.')
}

const controller = new AppController()

root.dataset.appState = controller.state
root.innerHTML = `
  <main class="app-shell">
    <section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">声音调色盘</p>
      <h1 id="page-title">Sound Palette</h1>
      <p class="tagline">听见的，也可以被看见。</p>
      <p class="milestone">MVP v0.1 · 项目骨架</p>
    </section>
    <section class="art-frame" aria-label="声音画布预览">
      <div id="art-canvas" class="art-canvas"></div>
      <p class="canvas-summary">视觉画布已就绪，声音分析将在后续里程碑接入。</p>
    </section>
    <p class="privacy-note">当前版本不会请求麦克风，不录音、不上传任何音频。</p>
  </main>
`

const artCanvas = root.querySelector<HTMLDivElement>('#art-canvas')

if (!artCanvas) {
  throw new Error('Sound Palette canvas container was not found.')
}

await createEmptyArtCanvas(artCanvas)
