import { calculateAudioFrame, createSoundSummary } from './sound-summary'
import type { AudioFrame, SoundSummary } from './types'

export type AudioEngineFailureReason =
  | 'unsupported'
  | 'insecure-context'
  | 'permission-denied'
  | 'no-device'
  | 'system-denied'
  | 'audio-context-suspended'
  | 'unknown'

export class AudioEngineError extends Error {
  readonly reason: AudioEngineFailureReason

  constructor(reason: AudioEngineFailureReason, message: string) {
    super(message)
    this.name = 'AudioEngineError'
    this.reason = reason
  }
}

export interface ListenOptions {
  durationMs?: number
  onFrame?: (frame: AudioFrame) => void
  onProgress?: (elapsedMs: number, durationMs: number) => void
}

const DEFAULT_DURATION_MS = 10_000
const FFT_SIZE = 2048
const MIN_DECIBELS = -90
const MAX_DECIBELS = -10

function seedForSession(): string {
  if (typeof crypto.randomUUID === 'function') {
    return `audio-${crypto.randomUUID()}`
  }

  const values = new Uint32Array(2)
  crypto.getRandomValues(values)
  return `audio-${values[0].toString(36)}-${values[1].toString(36)}`
}

function mapMediaError(error: unknown): AudioEngineError {
  if (error instanceof AudioEngineError) {
    return error
  }

  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return new AudioEngineError(
        'permission-denied',
        '麦克风权限未开启，可以先体验示例。',
      )
    }

    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return new AudioEngineError(
        'no-device',
        '没有检测到可用麦克风，可以先体验示例。',
      )
    }

    if (
      error.name === 'NotReadableError' ||
      error.name === 'TrackStartError' ||
      error.name === 'AbortError'
    ) {
      return new AudioEngineError(
        'system-denied',
        '麦克风可能被系统关闭或被其他应用占用，可以先体验示例。',
      )
    }
  }

  return new AudioEngineError(
    'unknown',
    '当前浏览器无法使用麦克风，可以先体验示例。',
  )
}

export class AudioEngine {
  #stream?: MediaStream
  #context?: AudioContext
  #source?: MediaStreamAudioSourceNode
  #analyser?: AnalyserNode
  #animationFrameId?: number
  #timeDomain?: Float32Array<ArrayBuffer>
  #frequencyDomain?: Float32Array<ArrayBuffer>
  #frames: AudioFrame[] = []
  #previousFrame?: AudioFrame
  #previousChangeRate = 0
  #startedAt = 0
  #durationMs = DEFAULT_DURATION_MS
  #active = false
  #finishing = false
  #resolve?: (summary: SoundSummary) => void
  #onFrame?: (frame: AudioFrame) => void
  #onProgress?: (elapsedMs: number, durationMs: number) => void
  #sessionSeed = ''

  get active(): boolean {
    return this.#active
  }

  async listen(options: ListenOptions = {}): Promise<SoundSummary> {
    await this.stop()

    if (!window.isSecureContext) {
      throw new AudioEngineError(
        'insecure-context',
        '麦克风需要 HTTPS；当前地址可以先体验示例。',
      )
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      throw new AudioEngineError(
        'unsupported',
        '当前浏览器不支持本地麦克风分析，可以先体验示例。',
      )
    }

    this.#durationMs =
      Number.isFinite(options.durationMs) && (options.durationMs ?? 0) > 0
        ? Math.round(options.durationMs ?? DEFAULT_DURATION_MS)
        : DEFAULT_DURATION_MS
    this.#onFrame = options.onFrame
    this.#onProgress = options.onProgress
    this.#frames = []
    this.#previousFrame = undefined
    this.#previousChangeRate = 0
    this.#sessionSeed = seedForSession()

    try {
      this.#context = new AudioContext()
      this.#stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.#source = this.#context.createMediaStreamSource(this.#stream)
      this.#analyser = this.#context.createAnalyser()
      this.#analyser.fftSize = FFT_SIZE
      this.#analyser.smoothingTimeConstant = 0.75
      this.#analyser.minDecibels = MIN_DECIBELS
      this.#analyser.maxDecibels = MAX_DECIBELS
      this.#source.connect(this.#analyser)

      if (this.#context.state === 'suspended') {
        await this.#context.resume()
      }

      if (this.#context.state !== 'running') {
        throw new AudioEngineError(
          'audio-context-suspended',
          '浏览器暂停了声音分析，可以先体验示例后再重试。',
        )
      }

      this.#timeDomain = new Float32Array(this.#analyser.fftSize)
      this.#frequencyDomain = new Float32Array(
        this.#analyser.frequencyBinCount,
      )
    } catch (error) {
      await this.#cleanup()
      throw mapMediaError(error)
    }

    this.#active = true
    this.#finishing = false
    this.#startedAt = performance.now()
    document.addEventListener('visibilitychange', this.#handleVisibility)
    this.#stream
      .getAudioTracks()
      .forEach((track) => track.addEventListener('ended', this.#handleTrackEnded))

    return new Promise<SoundSummary>((resolve) => {
      this.#resolve = resolve
      this.#onProgress?.(0, this.#durationMs)
      this.#animationFrameId = requestAnimationFrame(this.#sampleFrame)
    })
  }

  async stop(): Promise<void> {
    if (!this.#active) {
      await this.#cleanup()
      return
    }

    await this.#finish(performance.now() - this.#startedAt)
  }

  readonly #sampleFrame = (now: number): void => {
    if (
      !this.#active ||
      !this.#context ||
      !this.#analyser ||
      !this.#timeDomain ||
      !this.#frequencyDomain
    ) {
      return
    }

    const elapsedMs = Math.min(now - this.#startedAt, this.#durationMs)
    this.#analyser.getFloatTimeDomainData(this.#timeDomain)
    this.#analyser.getFloatFrequencyData(this.#frequencyDomain)

    const frame = calculateAudioFrame({
      timestampMs: elapsedMs,
      timeDomain: this.#timeDomain,
      frequencyDomain: this.#frequencyDomain,
      sampleRate: this.#context.sampleRate,
      fftSize: this.#analyser.fftSize,
      minDecibels: this.#analyser.minDecibels,
      maxDecibels: this.#analyser.maxDecibels,
      previousFrame: this.#previousFrame,
      previousChangeRate: this.#previousChangeRate,
    })

    this.#frames.push(frame)
    this.#previousFrame = frame
    this.#previousChangeRate = frame.changeRate
    this.#onFrame?.(frame)
    this.#onProgress?.(elapsedMs, this.#durationMs)

    if (elapsedMs >= this.#durationMs) {
      void this.#finish(this.#durationMs)
      return
    }

    this.#animationFrameId = requestAnimationFrame(this.#sampleFrame)
  }

  async #finish(durationMs: number): Promise<void> {
    if (this.#finishing) {
      return
    }

    this.#finishing = true
    this.#active = false
    const summary = createSoundSummary(
      this.#frames,
      Math.min(this.#durationMs, Math.max(0, durationMs)),
      this.#sessionSeed,
    )
    const resolve = this.#resolve

    this.#onProgress?.(summary.durationMs, this.#durationMs)
    await this.#cleanup()
    this.#resolve = undefined
    this.#onFrame = undefined
    this.#onProgress = undefined
    this.#finishing = false
    resolve?.(summary)
  }

  async #cleanup(): Promise<void> {
    if (this.#animationFrameId !== undefined) {
      cancelAnimationFrame(this.#animationFrameId)
      this.#animationFrameId = undefined
    }

    document.removeEventListener('visibilitychange', this.#handleVisibility)
    this.#stream
      ?.getAudioTracks()
      .forEach((track) =>
        track.removeEventListener('ended', this.#handleTrackEnded),
      )

    try {
      this.#source?.disconnect()
      this.#analyser?.disconnect()
    } catch {
      // The nodes may already be disconnected by the browser.
    }

    this.#stream?.getTracks().forEach((track) => track.stop())

    if (this.#context && this.#context.state !== 'closed') {
      try {
        await this.#context.close()
      } catch {
        // Closing an interrupted context can reject on some browsers.
      }
    }

    this.#stream = undefined
    this.#context = undefined
    this.#source = undefined
    this.#analyser = undefined
    this.#timeDomain = undefined
    this.#frequencyDomain = undefined
  }

  readonly #handleVisibility = (): void => {
    if (document.hidden) {
      void this.stop()
    }
  }

  readonly #handleTrackEnded = (): void => {
    if (this.#active) {
      void this.#finish(performance.now() - this.#startedAt)
    }
  }
}
