import FFT from 'fft.js'
import { calculateAudioFrame } from './sound-summary'
import type { AudioFrame } from './types'

export const PCM_SAMPLE_RATE = 16_000
export const PCM_FFT_SIZE = 2_048
export const PCM_FRAME_SIZE_KB = 4

const PCM_MIN_DECIBELS = -100
const PCM_MAX_DECIBELS = -20

export interface PcmAnalyzerDiagnostics {
  receivedBytes: number
  decodedSamples: number
  analyzedFrames: number
  trailingBytes: number
  bufferedSamples: number
}

export function decodePcm16Le(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer)
  const samples = new Float32Array(Math.floor(buffer.byteLength / 2))

  for (let index = 0; index < samples.length; index += 1) {
    const value = view.getInt16(index * 2, true)
    samples[index] = value < 0 ? value / 32_768 : value / 32_767
  }

  return samples
}

function appendFloat32(
  existing: Float32Array,
  addition: Float32Array,
): Float32Array {
  if (existing.length === 0) {
    return addition
  }

  const combined = new Float32Array(existing.length + addition.length)
  combined.set(existing)
  combined.set(addition, existing.length)
  return combined
}

export class PcmFrameAnalyzer {
  readonly sampleRate: number
  readonly fftSize: number

  #fft: FFT
  #spectrum: number[]
  #windowed: number[]
  #bufferedSamples: Float32Array<ArrayBufferLike> = new Float32Array(0)
  #trailingByte: number | undefined
  #previousFrame: AudioFrame | undefined
  #previousChangeRate = 0
  #processedSamples = 0
  #receivedBytes = 0
  #decodedSamples = 0
  #analyzedFrames = 0

  constructor(sampleRate = PCM_SAMPLE_RATE, fftSize = PCM_FFT_SIZE) {
    this.sampleRate = sampleRate
    this.fftSize = fftSize
    this.#fft = new FFT(fftSize)
    this.#spectrum = this.#fft.createComplexArray()
    this.#windowed = new Array<number>(fftSize).fill(0)
  }

  push(buffer: ArrayBuffer): AudioFrame[] {
    this.#receivedBytes += buffer.byteLength
    const bytes = new Uint8Array(buffer)
    const sampleCount = Math.floor(
      (bytes.length + (this.#trailingByte === undefined ? 0 : 1)) / 2,
    )
    const decoded = new Float32Array(sampleCount)
    let byteIndex = 0
    let sampleIndex = 0

    if (this.#trailingByte !== undefined && bytes.length > 0) {
      decoded[sampleIndex] = this.#int16ToUnit(
        this.#trailingByte | (bytes[0] << 8),
      )
      this.#trailingByte = undefined
      byteIndex = 1
      sampleIndex += 1
    }

    while (byteIndex + 1 < bytes.length) {
      decoded[sampleIndex] = this.#int16ToUnit(
        bytes[byteIndex] | (bytes[byteIndex + 1] << 8),
      )
      byteIndex += 2
      sampleIndex += 1
    }

    if (byteIndex < bytes.length) {
      this.#trailingByte = bytes[byteIndex]
    }

    this.#decodedSamples += decoded.length
    this.#bufferedSamples = appendFloat32(this.#bufferedSamples, decoded)

    const frames: AudioFrame[] = []
    let offset = 0

    while (this.#bufferedSamples.length - offset >= this.fftSize) {
      const timeDomain = this.#bufferedSamples.slice(
        offset,
        offset + this.fftSize,
      )
      const frame = this.#analyzeWindow(timeDomain)
      frames.push(frame)
      offset += this.fftSize
    }

    if (offset > 0) {
      this.#bufferedSamples = this.#bufferedSamples.slice(offset)
    }

    return frames
  }

  diagnostics(): PcmAnalyzerDiagnostics {
    return {
      receivedBytes: this.#receivedBytes,
      decodedSamples: this.#decodedSamples,
      analyzedFrames: this.#analyzedFrames,
      trailingBytes: this.#trailingByte === undefined ? 0 : 1,
      bufferedSamples: this.#bufferedSamples.length,
    }
  }

  reset(): void {
    this.#bufferedSamples = new Float32Array(0)
    this.#trailingByte = undefined
    this.#previousFrame = undefined
    this.#previousChangeRate = 0
    this.#processedSamples = 0
    this.#receivedBytes = 0
    this.#decodedSamples = 0
    this.#analyzedFrames = 0
  }

  #int16ToUnit(value: number): number {
    const signed = value & 0x8000 ? value - 0x10000 : value
    return signed < 0 ? signed / 32_768 : signed / 32_767
  }

  #analyzeWindow(timeDomain: Float32Array): AudioFrame {
    for (let index = 0; index < this.fftSize; index += 1) {
      const hann =
        0.5 - 0.5 * Math.cos((Math.PI * 2 * index) / (this.fftSize - 1))
      this.#windowed[index] = timeDomain[index] * hann
    }

    this.#fft.realTransform(this.#spectrum, this.#windowed)
    const frequencyDomain = new Float32Array(this.fftSize / 2)
    const magnitudeScale = this.fftSize / 4

    for (let bin = 0; bin < frequencyDomain.length; bin += 1) {
      const real = this.#spectrum[bin * 2]
      const imaginary = this.#spectrum[bin * 2 + 1]
      const magnitude =
        Math.sqrt(real * real + imaginary * imaginary) / magnitudeScale
      frequencyDomain[bin] = 20 * Math.log10(Math.max(1e-6, magnitude))
    }

    const timestampMs =
      (this.#processedSamples / this.sampleRate) * 1_000
    const frame = calculateAudioFrame({
      timestampMs,
      timeDomain,
      frequencyDomain,
      sampleRate: this.sampleRate,
      fftSize: this.fftSize,
      minDecibels: PCM_MIN_DECIBELS,
      maxDecibels: PCM_MAX_DECIBELS,
      previousFrame: this.#previousFrame,
      previousChangeRate: this.#previousChangeRate,
    })

    this.#processedSamples += this.fftSize
    this.#analyzedFrames += 1
    this.#previousFrame = frame
    this.#previousChangeRate = frame.changeRate
    return frame
  }
}
