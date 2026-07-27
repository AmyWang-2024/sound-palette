import {
  PCM_FFT_SIZE,
  PCM_FRAME_SIZE_KB,
  PCM_SAMPLE_RATE,
  PcmFrameAnalyzer,
  createSoundSummary,
  type AudioFrame,
  type PcmAnalyzerDiagnostics,
  type SoundSummary,
} from '../vendor/shared-core'
import {
  cleanupTempFile,
  type TempFileCleanupStatus,
} from './temp-file-cleanup'

export type RecorderStopReason =
  | 'complete'
  | 'user'
  | 'hidden'
  | 'unload'
  | 'interrupted'
  | 'error'

export interface RecorderDiagnostics extends PcmAnalyzerDiagnostics {
  configuredSampleRate: number
  configuredChannels: 1
  configuredFormat: 'PCM'
  configuredFrameSizeKb: number
  chunkCount: number
  firstChunkBytes: number
  recorderDurationMs: number
  recorderFileBytes: number
  cleanupStatus: TempFileCleanupStatus
  cleanupAttempts: number
  cleanupError: string
}

export interface RecorderSessionResult {
  kind: 'complete' | 'canceled' | 'error'
  summary?: SoundSummary
  diagnostics: RecorderDiagnostics
  message?: string
}

export interface RecorderSessionCallbacks {
  seed?: string
  onStart?: () => void
  onFrame?: (frame: AudioFrame) => void
}

interface ActiveSession {
  analyzer: PcmFrameAnalyzer
  callbacks: RecorderSessionCallbacks
  frames: AudioFrame[]
  chunkCount: number
  firstChunkBytes: number
  recorderDurationMs: number
  recorderFileBytes: number
  seed: string
  stopReason: RecorderStopReason
  started: boolean
  stopRequested: boolean
  settled: boolean
  errorMessage?: string
  watchdog?: number
  errorFallback?: number
  resolve: (result: RecorderSessionResult) => void
}

const recorderManager = wx.getRecorderManager()
const fileSystemManager = wx.getFileSystemManager()
let activeSession: ActiveSession | null = null
let listenersRegistered = false
const MIN_COMPLETE_AUDIO_MS = 7_500

function emptyDiagnostics(
  cleanupStatus: TempFileCleanupStatus = 'not-created',
): RecorderDiagnostics {
  return {
    configuredSampleRate: PCM_SAMPLE_RATE,
    configuredChannels: 1,
    configuredFormat: 'PCM',
    configuredFrameSizeKb: PCM_FRAME_SIZE_KB,
    receivedBytes: 0,
    decodedSamples: 0,
    analyzedFrames: 0,
    trailingBytes: 0,
    bufferedSamples: 0,
    chunkCount: 0,
    firstChunkBytes: 0,
    recorderDurationMs: 0,
    recorderFileBytes: 0,
    cleanupStatus,
    cleanupAttempts: 0,
    cleanupError: '',
  }
}

function stopTimers(session: ActiveSession): void {
  if (session.watchdog !== undefined) {
    clearTimeout(session.watchdog)
    session.watchdog = undefined
  }
  if (session.errorFallback !== undefined) {
    clearTimeout(session.errorFallback)
    session.errorFallback = undefined
  }
}

async function settleSession(
  session: ActiveSession,
  stopResult?: WechatMiniprogram.OnStopListenerResult,
): Promise<void> {
  if (session.settled || activeSession !== session) {
    return
  }
  session.settled = true
  stopTimers(session)
  session.recorderDurationMs = Math.max(0, stopResult?.duration ?? 0)
  session.recorderFileBytes = Math.max(0, stopResult?.fileSize ?? 0)

  const analyzerDiagnostics = session.analyzer.diagnostics()
  const cleanup = stopResult
    ? await cleanupTempFile(fileSystemManager, stopResult.tempFilePath)
    : session.started
      ? {
          status: 'unconfirmed' as const,
          attempts: 0,
          error: '录音已启动，但微信未返回可核验的临时文件状态',
        }
      : await cleanupTempFile(fileSystemManager, undefined)
  const diagnostics: RecorderDiagnostics = {
    configuredSampleRate: PCM_SAMPLE_RATE,
    configuredChannels: 1,
    configuredFormat: 'PCM',
    configuredFrameSizeKb: PCM_FRAME_SIZE_KB,
    ...analyzerDiagnostics,
    chunkCount: session.chunkCount,
    firstChunkBytes: session.firstChunkBytes,
    recorderDurationMs: session.recorderDurationMs,
    recorderFileBytes: session.recorderFileBytes,
    cleanupStatus: cleanup.status,
    cleanupAttempts: cleanup.attempts,
    cleanupError: cleanup.error,
  }

  const hadFrames = session.frames.length > 0
  const analyzedDurationMs =
    (analyzerDiagnostics.analyzedFrames * PCM_FFT_SIZE * 1_000) /
    PCM_SAMPLE_RATE
  const hasCompleteCapture = analyzedDurationMs >= MIN_COMPLETE_AUDIO_MS
  const cleanupConfirmed =
    cleanup.status !== 'failed' && cleanup.status !== 'unconfirmed'
  const canComplete =
    session.stopReason === 'complete' &&
    hadFrames &&
    hasCompleteCapture &&
    cleanupConfirmed
  const summary = canComplete
    ? createSoundSummary(
        session.frames,
        Math.min(
          10_000,
          Math.max(
            0,
            session.recorderDurationMs > 0
              ? session.recorderDurationMs
              : analyzedDurationMs,
          ),
        ),
        session.seed,
      )
    : undefined

  session.analyzer.reset()
  session.frames.length = 0
  activeSession = null

  if (!cleanupConfirmed) {
    session.resolve({
      kind: 'error',
      diagnostics,
      message:
        cleanup.status === 'unconfirmed'
          ? '无法确认微信临时录音文件已经删除，本次结果已丢弃，请关闭小程序后重试。'
          : '微信临时录音文件删除失败，本次结果已丢弃，请关闭小程序后重试。',
    })
    return
  }

  if (summary) {
    session.resolve({ kind: 'complete', summary, diagnostics })
    return
  }

  if (session.stopReason === 'error' || session.stopReason === 'interrupted') {
    session.resolve({
      kind: 'error',
      diagnostics,
      message:
        session.errorMessage ??
        '麦克风被系统中断或暂时不可用，可以先体验内置示例。',
    })
    return
  }

  if (session.stopReason === 'complete' && !hadFrames) {
    session.resolve({
      kind: 'error',
      diagnostics,
      message:
        '十秒内没有收到可解析的实时 PCM 帧，本次结果已丢弃，可以先体验内置示例。',
    })
    return
  }

  if (session.stopReason === 'complete' && !hasCompleteCapture) {
    session.resolve({
      kind: 'error',
      diagnostics,
      message: `实时 PCM 数据不完整（仅分析 ${analyzerDiagnostics.analyzedFrames} 个窗口），本次结果已丢弃，请重新开始。`,
    })
    return
  }

  session.resolve({
    kind: 'canceled',
    diagnostics,
    message: '本次聆听已停止，临时录音文件已清理。',
  })
}

function requestManagerStop(session: ActiveSession): void {
  if (session.stopRequested || session.settled) {
    return
  }
  session.stopRequested = true

  try {
    recorderManager.stop()
  } catch {
    void settleSession(session)
  }
}

function handleRecorderFailure(message: string): void {
  const session = activeSession
  if (!session || session.settled) {
    return
  }
  session.stopReason = 'error'
  session.errorMessage = message
  requestManagerStop(session)
  session.errorFallback = setTimeout(() => {
    void settleSession(session)
  }, 600)
}

function registerListeners(): void {
  if (listenersRegistered) {
    return
  }
  listenersRegistered = true

  // RecorderManager exposes no off* methods. Register once and route events only
  // to the current session so repeated listens never accumulate callbacks.
  recorderManager.onStart(() => {
    const session = activeSession
    if (!session || session.settled) {
      return
    }
    session.started = true
    session.callbacks.onStart?.()
    session.watchdog = setTimeout(() => {
      if (activeSession === session && !session.stopRequested) {
        session.stopReason = 'complete'
        requestManagerStop(session)
      }
    }, 10_500)
  })

  recorderManager.onFrameRecorded((result) => {
    const session = activeSession
    if (!session || session.settled || session.stopRequested) {
      return
    }

    try {
      session.chunkCount += 1
      if (session.firstChunkBytes === 0) {
        session.firstChunkBytes = result.frameBuffer.byteLength
      }
      const analyzedFrames = session.analyzer.push(result.frameBuffer)
      for (const frame of analyzedFrames) {
        session.frames.push(frame)
        session.callbacks.onFrame?.(frame)
      }
    } catch {
      handleRecorderFailure(
        '实时 PCM 数据无法解析，本次结果已丢弃，可以先体验内置示例。',
      )
    }
  })

  recorderManager.onStop((result) => {
    const session = activeSession
    if (session && !session.settled) {
      void settleSession(session, result)
    } else if (result.tempFilePath) {
      void cleanupTempFile(fileSystemManager, result.tempFilePath)
    }
  })

  recorderManager.onError(() => {
    handleRecorderFailure(
      '麦克风启动失败或被其他应用占用，可以先体验内置示例。',
    )
  })

  recorderManager.onInterruptionBegin(() => {
    const session = activeSession
    if (!session || session.settled) {
      return
    }
    session.stopReason = 'interrupted'
    session.errorMessage =
      '录音被通话或其他系统音频中断，本次结果已丢弃，可以重新开始。'
    requestManagerStop(session)
  })
}

export function isRecorderSessionActive(): boolean {
  return activeSession !== null
}

export function startRecorderSession(
  callbacks: RecorderSessionCallbacks = {},
): Promise<RecorderSessionResult> {
  registerListeners()

  if (activeSession) {
    return Promise.resolve({
      kind: 'error',
      diagnostics: emptyDiagnostics(),
      message: '麦克风仍在结束上一段聆听，请稍后再试。',
    })
  }

  return new Promise((resolve) => {
    const session: ActiveSession = {
      analyzer: new PcmFrameAnalyzer(),
      callbacks,
      frames: [],
      chunkCount: 0,
      firstChunkBytes: 0,
      recorderDurationMs: 0,
      recorderFileBytes: 0,
      seed: callbacks.seed ?? `wechat-audio-${Date.now().toString(36)}`,
      stopReason: 'complete',
      started: false,
      stopRequested: false,
      settled: false,
      resolve,
    }
    activeSession = session

    try {
      recorderManager.start({
        duration: 10_000,
        sampleRate: PCM_SAMPLE_RATE,
        numberOfChannels: 1,
        encodeBitRate: 48_000,
        format: 'PCM',
        frameSize: PCM_FRAME_SIZE_KB,
        audioSource: 'auto',
      })
    } catch {
      session.stopReason = 'error'
      session.errorMessage =
        '当前微信版本无法启动麦克风分析，可以先体验内置示例。'
      void settleSession(session)
    }
  })
}

export function stopRecorderSession(reason: RecorderStopReason): void {
  const session = activeSession
  if (!session || session.settled) {
    return
  }
  session.stopReason = reason
  requestManagerStop(session)
}
