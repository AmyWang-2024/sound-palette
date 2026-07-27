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
import {
  MINI_EXPORT_HEIGHT,
  MINI_EXPORT_WIDTH,
  releaseMiniExportCanvas,
  renderMiniArtworkCard,
} from '../../lib/artwork-export'
import {
  isRecorderSessionActive,
  startRecorderSession,
  stopRecorderSession,
  type RecorderDiagnostics,
} from '../../lib/recorder-session'
import { cleanupTempFile } from '../../lib/temp-file-cleanup'

const SAMPLE_SCENE_ID = 'parkMorning'
const UI_INTERVAL_MS = 100
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
let exportCanvas: WechatMiniprogram.Canvas | null = null
let context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D | null =
  null
let canvasWidth = 0
let canvasHeight = 0
let renderFrameId: number | null = null
let uiTimer: number | null = null
let listeningStartedAt = 0
let lastRenderAt = 0
let sampleFrames: AudioFrame[] = []
let summary: SoundSummary | null = null
let visualState: VisualState = initialVisualState()
let pageVisible = true
let pageAlive = true
let pageEpoch = 0
let lastLiveLevelPercent = -1
let artworkCreatedAt: Date | null = null

function initialVisualState(): VisualState {
  return createVisualState(
    SAMPLE_SCENES[SAMPLE_SCENE_ID].seed,
    createSampleFrame(0, SAMPLE_SCENE_ID),
    'neutral',
  )
}

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

function stopUiTimer(): void {
  if (uiTimer !== null) {
    clearInterval(uiTimer)
    uiTimer = null
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

function ensureExportCanvas(): Promise<WechatMiniprogram.Canvas> {
  if (exportCanvas) {
    return Promise.resolve(exportCanvas)
  }

  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .select('#exportCanvas')
      .fields({ node: true }, (result) => {
        const node = result.node as WechatMiniprogram.Canvas | undefined
        if (!node) {
          reject(new Error('无法创建导出画布，请稍后重试。'))
          return
        }
        exportCanvas = node
        resolve(node)
      })
      .exec()
  })
}

function canvasToTempPng(
  targetCanvas: WechatMiniprogram.Canvas,
): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas: targetCanvas,
      fileType: 'png',
      quality: 1,
      destWidth: MINI_EXPORT_WIDTH,
      destHeight: MINI_EXPORT_HEIGHT,
      success: (result) => resolve(result.tempFilePath),
      fail: () => reject(new Error('PNG 生成失败，请稍后重试。')),
    })
  })
}

function saveImageToAlbum(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve(),
      fail: (error) => reject(new Error(error.errMsg)),
    })
  })
}

function previewImage(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.previewImage({
      current: filePath,
      urls: [filePath],
      success: () => resolve(),
      fail: () => reject(new Error('图片预览失败，请先尝试保存到相册。')),
    })
  })
}

function showShareImageMenu(
  filePath: string,
): Promise<'shared' | 'canceled' | 'previewed'> {
  if (typeof wx.showShareImageMenu !== 'function') {
    return previewImage(filePath).then(() => 'previewed')
  }

  return new Promise((resolve, reject) => {
    wx.showShareImageMenu({
      path: filePath,
      success: () => resolve('shared'),
      fail: (error) => {
        if (error.errMsg.toLowerCase().includes('cancel')) {
          resolve('canceled')
          return
        }
        previewImage(filePath)
          .then(() => resolve('previewed'))
          .catch(reject)
      },
    })
  })
}

function isAlbumPermissionError(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('auth deny') ||
    normalized.includes('auth denied') ||
    normalized.includes('authorize:fail')
  )
}

async function withArtworkPng(
  page: WechatMiniprogram.Page.TrivialInstance,
  action: (filePath: string) => Promise<string>,
): Promise<void> {
  if (!summary || page.data.isExporting) {
    return
  }

  page.setData({ isExporting: true, exportStatus: '' })
  let filePath = ''

  try {
    const targetCanvas = await ensureExportCanvas()
    const mood = page.data.selectedMood as Mood
    renderMiniArtworkCard(targetCanvas, {
      state: visualState,
      summary,
      mood,
      tags: createArtworkTags(summary, mood),
      createdAt: artworkCreatedAt ?? new Date(),
    })
    filePath = await canvasToTempPng(targetCanvas)
    releaseMiniExportCanvas(targetCanvas)
    page.setData({ exportStatus: await action(filePath) })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '图片处理失败，请稍后重试。'
    page.setData({ exportStatus: message })
  } finally {
    if (exportCanvas && exportCanvas.width > 1) {
      releaseMiniExportCanvas(exportCanvas)
    }
    if (filePath) {
      const cleanup = await cleanupTempFile(
        wx.getFileSystemManager(),
        filePath,
      )
      if (
        cleanup.status === 'failed' ||
        cleanup.status === 'unconfirmed'
      ) {
        page.setData({
          exportStatus: '图片操作已结束，但临时图片清理状态无法确认。',
        })
      }
    }
    page.setData({ isExporting: false })
  }
}

function compositionRows(soundSummary: SoundSummary) {
  return [
    { label: '基底', value: Math.round(soundSummary.composition.base * 100) },
    { label: '流动', value: Math.round(soundSummary.composition.flow * 100) },
    { label: '闪烁', value: Math.round(soundSummary.composition.sparkle * 100) },
  ]
}

function diagnosticsRows(diagnostics: RecorderDiagnostics) {
  const cleanupLabels: Record<RecorderDiagnostics['cleanupStatus'], string> = {
    'not-created': '未生成临时文件',
    deleted: '已立即删除',
    'already-missing': '文件已不存在',
    unconfirmed: '状态无法确认',
    failed: '删除失败',
  }

  const rows = [
    {
      label: 'PCM 配置',
      value: `${diagnostics.configuredSampleRate} Hz · 单声道`,
    },
    {
      label: '首帧字节',
      value: `${diagnostics.firstChunkBytes}`,
    },
    {
      label: '分析窗口',
      value: `${diagnostics.analyzedFrames} × 2048`,
    },
    {
      label: '临时文件',
      value:
        diagnostics.cleanupAttempts > 0
          ? `${cleanupLabels[diagnostics.cleanupStatus]} · ${diagnostics.cleanupAttempts} 次`
          : cleanupLabels[diagnostics.cleanupStatus],
    },
  ]

  if (diagnostics.cleanupError) {
    rows.push({
      label: '清理诊断',
      value: diagnostics.cleanupError,
    })
  }

  return rows
}

function listeningUi(mode: 'microphone' | 'sample') {
  return {
    ...stateFlags('listening'),
    listeningMode: mode,
    listeningKicker:
      mode === 'microphone' ? '正在感受周围的声音' : '正在感受清晨公园',
    listeningNote:
      mode === 'microphone'
        ? '只在本机分析实时数值，不识别语音、不上传音频'
        : '这是内置示例，不会使用麦克风',
    listeningTitle:
      mode === 'microphone' ? '让此刻慢慢浮现' : '让画面慢慢浮现',
  }
}

Page({
  data: {
    ...stateFlags('home'),
    sceneLabel: SAMPLE_SCENES[SAMPLE_SCENE_ID].labelZh,
    moodOptions,
    selectedMood: 'neutral' as Mood,
    listeningMode: 'sample' as 'microphone' | 'sample',
    listeningKicker: '',
    listeningNote: '',
    listeningTitle: '',
    progressPercent: 0,
    remainingSeconds: 10,
    isPreparing: false,
    showPrivacy: false,
    privacyContractName: '《我的声音相册隐私保护指引》',
    showPermissionHelp: false,
    statusMessage: '',
    tags: [] as string[],
    composition: [] as Array<{ label: string; value: number }>,
    recordingDiagnostics: [] as Array<{ label: string; value: string }>,
    hasRecordingDiagnostics: false,
    liveLevelPercent: 0,
    isExporting: false,
    exportStatus: '',
  },

  onLoad() {
    pageEpoch += 1
    pageAlive = true
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
    stopUiTimer()
    if (this.data.isListening) {
      if (this.data.listeningMode === 'microphone') {
        stopRecorderSession('hidden')
      }
      sampleFrames = []
      summary = null
      visualState = initialVisualState()
      this.setData({
        ...stateFlags('home'),
        isPreparing: false,
        progressPercent: 0,
        remainingSeconds: 10,
        statusMessage: '切到后台后已停止聆听，并清理本次临时数据。',
      })
    }
  },

  onUnload() {
    pageAlive = false
    pageEpoch += 1
    pageVisible = false
    stopRendering()
    stopUiTimer()
    stopRecorderSession('unload')
    if (exportCanvas) {
      releaseMiniExportCanvas(exportCanvas)
    }
    canvas = null
    exportCanvas = null
    context = null
  },

  startMicrophone() {
    if (this.data.isPreparing || isRecorderSessionActive()) {
      return
    }
    this.setData({
      isPreparing: true,
      statusMessage: '',
      showPermissionHelp: false,
      recordingDiagnostics: [],
      hasRecordingDiagnostics: false,
      liveLevelPercent: 0,
    })

    if (
      typeof wx.getPrivacySetting !== 'function' ||
      typeof wx.getRecorderManager !== 'function'
    ) {
      this.setData({
        isPreparing: false,
        statusMessage: '当前微信版本不支持隐私授权或实时录音，可以先体验示例。',
      })
      return
    }

    wx.getPrivacySetting({
      success: (result) => {
        if (result.needAuthorization) {
          this.setData({
            isPreparing: false,
            showPrivacy: true,
            privacyContractName:
              result.privacyContractName ||
              '《我的声音相册隐私保护指引》',
          })
          return
        }
        this.requestRecordPermission()
      },
      fail: () => {
        this.setData({
          isPreparing: false,
          statusMessage: '无法读取隐私授权状态，可以先体验示例。',
        })
      },
    })
  },

  handleAgreePrivacyAuthorization() {
    this.setData({ showPrivacy: false, isPreparing: true })
    this.requestRecordPermission()
  },

  declinePrivacyAuthorization() {
    this.setData({
      showPrivacy: false,
      isPreparing: false,
      statusMessage: '未同意隐私保护指引，麦克风不会启动；仍可体验内置示例。',
    })
  },

  requestRecordPermission() {
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.beginMicrophoneListening()
      },
      fail: () => {
        this.setData({
          isPreparing: false,
          showPermissionHelp: true,
          statusMessage: '未获得麦克风权限，可以去设置开启，或先体验示例。',
        })
      },
    })
  },

  handleOpenSetting() {
    wx.getSetting({
      success: (result) => {
        if (result.authSetting['scope.record']) {
          this.setData({ showPermissionHelp: false, isPreparing: true })
          this.beginMicrophoneListening()
          return
        }
        this.setData({
          isPreparing: false,
          statusMessage: '麦克风权限仍未开启，可以继续使用示例模式。',
        })
      },
      fail: () => {
        this.setData({
          isPreparing: false,
          statusMessage: '无法读取麦克风设置，可以继续使用示例模式。',
        })
      },
    })
  },

  beginMicrophoneListening() {
    stopUiTimer()
    sampleFrames = []
    summary = null
    artworkCreatedAt = null
    const recorderSeed = `wechat-audio-${Date.now().toString(36)}`
    const recorderPageEpoch = pageEpoch
    lastLiveLevelPercent = -1
    visualState = createVisualState(
      recorderSeed,
      createSampleFrame(0, SAMPLE_SCENE_ID),
      'neutral',
    )
    this.setData({
      isPreparing: true,
      selectedMood: 'neutral',
      progressPercent: 0,
      remainingSeconds: 10,
      statusMessage: '',
      tags: [],
      composition: [],
      recordingDiagnostics: [],
      hasRecordingDiagnostics: false,
      liveLevelPercent: 0,
    })

    void startRecorderSession({
      seed: recorderSeed,
      onStart: () => {
        if (!pageAlive || pageEpoch !== recorderPageEpoch) {
          return
        }
        listeningStartedAt = Date.now()
        this.setData({
          ...listeningUi('microphone'),
          isPreparing: false,
        })
        uiTimer = setInterval(() => {
          const elapsedMs = Math.min(
            SAMPLE_DURATION_MS,
            Date.now() - listeningStartedAt,
          )
          this.setData({
            progressPercent: Math.round(
              (elapsedMs / SAMPLE_DURATION_MS) * 100,
            ),
            remainingSeconds: Math.max(
              0,
              Math.ceil((SAMPLE_DURATION_MS - elapsedMs) / 1000),
            ),
          })
        }, UI_INTERVAL_MS)
      },
      onFrame: (frame) => {
        if (!pageAlive || pageEpoch !== recorderPageEpoch) {
          return
        }
        visualState = updateVisualInput(visualState, frame)
        const liveLevelPercent = Math.round(
          Math.max(
            frame.loudness,
            frame.lowEnergy * 0.78,
            frame.midEnergy * 0.78,
            frame.highEnergy * 0.78,
          ) * 100,
        )
        if (Math.abs(liveLevelPercent - lastLiveLevelPercent) >= 2) {
          lastLiveLevelPercent = liveLevelPercent
          this.setData({ liveLevelPercent })
        }
      },
    }).then((result) => {
      stopUiTimer()
      if (!pageAlive || pageEpoch !== recorderPageEpoch) {
        return
      }

      const rows = diagnosticsRows(result.diagnostics)
      if (result.kind !== 'complete' || !result.summary) {
        visualState = initialVisualState()
        this.setData({
          ...stateFlags('home'),
          isPreparing: false,
          progressPercent: 0,
          remainingSeconds: 10,
          liveLevelPercent: 0,
          statusMessage: result.message ?? '本次聆听未完成，可以重新开始。',
          recordingDiagnostics: rows,
          hasRecordingDiagnostics: true,
        })
        return
      }

      summary = result.summary
      visualState = createVisualState(
        summary.seed,
        summaryToVisualInput(summary),
        this.data.selectedMood as Mood,
      )
      this.setData({
        ...stateFlags('mood'),
        isPreparing: false,
        progressPercent: 100,
        remainingSeconds: 0,
        liveLevelPercent: 0,
        recordingDiagnostics: rows,
        hasRecordingDiagnostics: true,
      })
    })
  },

  startSample() {
    if (this.data.isPreparing || isRecorderSessionActive()) {
      return
    }
    stopUiTimer()
    sampleFrames = []
    summary = null
    artworkCreatedAt = null
    listeningStartedAt = Date.now()
    visualState = initialVisualState()
    this.setData({
      ...listeningUi('sample'),
      selectedMood: 'neutral',
      progressPercent: 0,
      remainingSeconds: 10,
      statusMessage: '',
      tags: [],
      composition: [],
      recordingDiagnostics: [],
      hasRecordingDiagnostics: false,
      liveLevelPercent: 0,
    })

    uiTimer = setInterval(() => {
      const elapsedMs = Math.min(
        SAMPLE_DURATION_MS,
        Date.now() - listeningStartedAt,
      )
      const frame = createSampleFrame(elapsedMs, SAMPLE_SCENE_ID)
      sampleFrames.push(frame)
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
    }, UI_INTERVAL_MS)
  },

  finishSample() {
    stopUiTimer()
    if (sampleFrames.length === 0) {
      sampleFrames.push(createSampleFrame(SAMPLE_DURATION_MS, SAMPLE_SCENE_ID))
    }
    summary = createSampleSummary(
      sampleFrames,
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

  stopListening() {
    stopUiTimer()
    if (this.data.listeningMode === 'microphone') {
      stopRecorderSession('user')
      return
    }
    sampleFrames = []
    summary = null
    visualState = initialVisualState()
    this.setData({
      ...stateFlags('home'),
      progressPercent: 0,
      remainingSeconds: 10,
      liveLevelPercent: 0,
      statusMessage: '示例已停止，可以随时重新开始。',
    })
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
    artworkCreatedAt = new Date()
    this.setData({
      ...stateFlags('result'),
      tags: [artworkTags.structure, artworkTags.movement, artworkTags.mood],
      composition: compositionRows(summary),
      exportStatus: '',
    })
  },

  saveArtwork() {
    void withArtworkPng(this, async (filePath) => {
      try {
        await saveImageToAlbum(filePath)
        return '图片已保存到系统相册。'
      } catch (error) {
        const message =
          error instanceof Error ? error.message : ''
        if (isAlbumPermissionError(message)) {
          wx.showModal({
            title: '需要相册权限',
            content:
              '只有你主动保存作品时才使用相册权限。请在设置中允许后再次点击保存。',
            confirmText: '去设置',
            success: (result) => {
              if (result.confirm) {
                wx.openSetting({})
              }
            },
          })
          return '未获得相册权限，图片没有保存。'
        }
        if (message.toLowerCase().includes('cancel')) {
          return '已取消保存。'
        }
        throw new Error('保存失败，可以先使用图片预览。')
      }
    })
  },

  shareArtwork() {
    void withArtworkPng(this, async (filePath) => {
      const result = await showShareImageMenu(filePath)
      if (result === 'canceled') {
        return '已取消分享。'
      }
      if (result === 'previewed') {
        return '当前微信未打开图片分享菜单，已改为预览；可长按图片保存或分享。'
      }
      return '图片分享操作已完成。'
    })
  },

  restart() {
    stopUiTimer()
    sampleFrames = []
    summary = null
    artworkCreatedAt = null
    visualState = initialVisualState()
    this.setData({
      ...stateFlags('home'),
      selectedMood: 'neutral',
      progressPercent: 0,
      remainingSeconds: 10,
      statusMessage: '',
      tags: [],
      composition: [],
      recordingDiagnostics: [],
      hasRecordingDiagnostics: false,
      liveLevelPercent: 0,
      isExporting: false,
      exportStatus: '',
    })
  },
})
