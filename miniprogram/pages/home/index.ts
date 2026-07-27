import {
  MOOD_PROFILES,
  SAMPLE_DURATION_MS,
  SAMPLE_SCENES,
  createArtworkTags,
  createSampleFrame,
  createSampleSummary,
  createVisualState,
  summaryToVisualInput,
  updateVisualInput,
  updateVisualMood,
  type AppState,
  type AudioFrame,
  type Mood,
  type SoundSummary,
  type VisualState,
} from '../../vendor/shared-core'
import { drawSoundPalette } from '../../lib/canvas-renderer'

const SAMPLE_SCENE_ID = 'parkMorning'
const FRAME_INTERVAL_MS = 100
const RENDER_INTERVAL_MS = 1000 / 30

const moodOptions = [
  { id: 'good' as Mood, label: MOOD_PROFILES.good.labelZh, detail: '更明亮、舒展' },
  {
    id: 'neutral' as Mood,
    label: MOOD_PROFILES.neutral.labelZh,
    detail: '平稳、均衡',
  },
  { id: 'low' as Mood, label: MOOD_PROFILES.low.labelZh, detail: '更冷静、收拢' },
]

let canvas: WechatMiniprogram.Canvas | null = null
let context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D | null =
  null
let canvasWidth = 0
let canvasHeight = 0
let renderFrameId: number | null = null
let sampleTimer: number | null = null
let sampleStartedAt = 0
let lastRenderAt = 0
let frames: AudioFrame[] = []
let summary: SoundSummary | null = null
let visualState: VisualState = createVisualState(
  SAMPLE_SCENES[SAMPLE_SCENE_ID].seed,
  createSampleFrame(0, SAMPLE_SCENE_ID),
  'neutral',
)
let pageVisible = true

function stateFlags(state: AppState) {
  return {
    state,
    isHome: state === 'home',
    isListening: state === 'listening',
    isMood: state === 'mood',
    isResult: state === 'result',
  }
}

function applyState(
  page: WechatMiniprogram.Page.TrivialInstance,
  state: AppState,
): void {
  page.setData(stateFlags(state))
}

function stopSampleTimer(): void {
  if (sampleTimer !== null) {
    clearInterval(sampleTimer)
    sampleTimer = null
  }
}

function stopRendering(): void {
  if (canvas && renderFrameId !== null) {
    canvas.cancelAnimationFrame(renderFrameId)
  }
  renderFrameId = null
}

function renderLoop(timestamp = 0): void {
  if (!canvas || !context || !pageVisible) {
    return
  }

  if (timestamp - lastRenderAt >= RENDER_INTERVAL_MS) {
    drawSoundPalette(
      context,
      { width: canvasWidth, height: canvasHeight },
      visualState,
      timestamp / 1000,
    )
    lastRenderAt = timestamp
  }

  renderFrameId = canvas.requestAnimationFrame(renderLoop)
}

function startRendering(): void {
  if (!canvas || renderFrameId !== null || !pageVisible) {
    return
  }
  lastRenderAt = -RENDER_INTERVAL_MS
  renderFrameId = canvas.requestAnimationFrame(renderLoop)
}

function initializeCanvas(): void {
  wx.createSelectorQuery()
    .select('#paletteCanvas')
    .fields({ node: true, size: true }, (result) => {
      const node = result.node as WechatMiniprogram.Canvas | undefined
      const width = Number(result.width)
      const height = Number(result.height)

      if (!node || !Number.isFinite(width) || !Number.isFinite(height)) {
        return
      }

      const dpr = Math.min(2, Math.max(1, wx.getSystemInfoSync().pixelRatio))
      canvas = node
      canvasWidth = width
      canvasHeight = height
      node.width = Math.round(width * dpr)
      node.height = Math.round(height * dpr)
      context = node.getContext('2d')
      context.scale(dpr, dpr)
      startRendering()
    })
    .exec()
}

function compositionRows(soundSummary: SoundSummary) {
  return [
    { label: '基底', value: Math.round(soundSummary.composition.base * 100) },
    { label: '流动', value: Math.round(soundSummary.composition.flow * 100) },
    { label: '闪烁', value: Math.round(soundSummary.composition.sparkle * 100) },
  ]
}

Page({
  data: {
    ...stateFlags('home'),
    sceneLabel: SAMPLE_SCENES[SAMPLE_SCENE_ID].labelZh,
    moodOptions,
    selectedMood: 'neutral' as Mood,
    progressPercent: 0,
    remainingSeconds: 10,
    tags: [] as string[],
    composition: [] as Array<{ label: string; value: number }>,
  },

  onReady() {
    initializeCanvas()
  },

  onShow() {
    pageVisible = true
    startRendering()
  },

  onHide() {
    pageVisible = false
    stopRendering()
    stopSampleTimer()
    if (this.data.isListening) {
      frames = []
      summary = null
      visualState = createVisualState(
        SAMPLE_SCENES[SAMPLE_SCENE_ID].seed,
        createSampleFrame(0, SAMPLE_SCENE_ID),
        'neutral',
      )
      this.setData({
        ...stateFlags('home'),
        progressPercent: 0,
        remainingSeconds: 10,
      })
    }
  },

  onUnload() {
    pageVisible = false
    stopRendering()
    stopSampleTimer()
    canvas = null
    context = null
  },

  startSample() {
    stopSampleTimer()
    frames = []
    summary = null
    sampleStartedAt = Date.now()
    visualState = createVisualState(
      SAMPLE_SCENES[SAMPLE_SCENE_ID].seed,
      createSampleFrame(0, SAMPLE_SCENE_ID),
      'neutral',
    )
    this.setData({
      ...stateFlags('listening'),
      selectedMood: 'neutral',
      progressPercent: 0,
      remainingSeconds: 10,
      tags: [],
      composition: [],
    })

    sampleTimer = setInterval(() => {
      const elapsedMs = Math.min(
        SAMPLE_DURATION_MS,
        Date.now() - sampleStartedAt,
      )
      const frame = createSampleFrame(elapsedMs, SAMPLE_SCENE_ID)
      frames.push(frame)
      visualState = updateVisualInput(visualState, frame)
      this.setData({
        progressPercent: Math.round((elapsedMs / SAMPLE_DURATION_MS) * 100),
        remainingSeconds: Math.max(
          0,
          Math.ceil((SAMPLE_DURATION_MS - elapsedMs) / 1000),
        ),
      })

      if (elapsedMs >= SAMPLE_DURATION_MS) {
        this.finishSample()
      }
    }, FRAME_INTERVAL_MS)
  },

  finishSample() {
    stopSampleTimer()
    if (frames.length === 0) {
      frames.push(createSampleFrame(SAMPLE_DURATION_MS, SAMPLE_SCENE_ID))
    }
    summary = createSampleSummary(
      frames,
      SAMPLE_DURATION_MS,
      SAMPLE_SCENE_ID,
    )
    visualState = createVisualState(
      summary.seed,
      summaryToVisualInput(summary),
      this.data.selectedMood as Mood,
    )
    applyState(this, 'mood')
  },

  selectMood(event: WechatMiniprogram.TouchEvent) {
    const mood = event.currentTarget.dataset.mood as Mood | undefined
    if (!mood || !MOOD_PROFILES[mood]) {
      return
    }
    visualState = updateVisualMood(visualState, mood)
    this.setData({ selectedMood: mood })
  },

  showResult() {
    if (!summary) {
      return
    }
    const mood = this.data.selectedMood as Mood
    const artworkTags = createArtworkTags(summary, mood)
    this.setData({
      ...stateFlags('result'),
      tags: [artworkTags.structure, artworkTags.movement, artworkTags.mood],
      composition: compositionRows(summary),
    })
  },

  restart() {
    stopSampleTimer()
    frames = []
    summary = null
    visualState = createVisualState(
      SAMPLE_SCENES[SAMPLE_SCENE_ID].seed,
      createSampleFrame(0, SAMPLE_SCENE_ID),
      'neutral',
    )
    this.setData({
      ...stateFlags('home'),
      selectedMood: 'neutral',
      progressPercent: 0,
      remainingSeconds: 10,
      tags: [],
      composition: [],
    })
  },
})
