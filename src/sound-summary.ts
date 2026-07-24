import type { AudioFrame, SoundSummary, SoundVisualInput } from './types'

export interface FrequencyBinRange {
  start: number
  endExclusive: number
}

interface AudioFrameInput {
  timestampMs: number
  timeDomain: Float32Array
  frequencyDomain: Float32Array
  sampleRate: number
  fftSize: number
  minDecibels: number
  maxDecibels: number
  previousFrame?: AudioFrame
  previousChangeRate?: number
}

const QUIET_LOUDNESS_THRESHOLD = 0.035
const QUIET_ENERGY_THRESHOLD = 0.12

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(1, Math.max(0, value))
}

export function frequencyRangeToBins(
  minimumHz: number,
  maximumHz: number,
  sampleRate: number,
  fftSize: number,
): FrequencyBinRange {
  if (
    !Number.isFinite(minimumHz) ||
    !Number.isFinite(maximumHz) ||
    !Number.isFinite(sampleRate) ||
    !Number.isFinite(fftSize) ||
    sampleRate <= 0 ||
    fftSize < 2 ||
    maximumHz <= minimumHz
  ) {
    return { start: 0, endExclusive: 0 }
  }

  const frequencyBinCount = Math.floor(fftSize / 2)
  const binWidth = sampleRate / fftSize
  const nyquist = sampleRate / 2
  const safeMinimum = Math.max(0, minimumHz)
  const safeMaximum = Math.min(maximumHz, nyquist)

  if (safeMaximum <= safeMinimum) {
    return { start: 0, endExclusive: 0 }
  }

  const start = Math.min(
    frequencyBinCount,
    Math.max(0, Math.ceil(safeMinimum / binWidth)),
  )
  const endExclusive = Math.min(
    frequencyBinCount,
    Math.max(start, Math.floor(safeMaximum / binWidth) + 1),
  )

  return { start, endExclusive }
}

export function calculateRelativeLoudness(timeDomain: Float32Array): number {
  if (timeDomain.length === 0) {
    return 0
  }

  let sumSquares = 0
  let validSamples = 0

  for (const sample of timeDomain) {
    if (!Number.isFinite(sample)) {
      continue
    }

    sumSquares += sample * sample
    validSamples += 1
  }

  if (validSamples === 0) {
    return 0
  }

  const rms = Math.sqrt(sumSquares / validSamples)

  return clampUnit((rms - 0.003) / 0.12)
}

export function calculateBandEnergy(
  frequencyDomain: Float32Array,
  range: FrequencyBinRange,
  minDecibels: number,
  maxDecibels: number,
): number {
  const start = Math.max(0, Math.min(frequencyDomain.length, range.start))
  const end = Math.max(
    start,
    Math.min(frequencyDomain.length, range.endExclusive),
  )
  const decibelRange = maxDecibels - minDecibels

  if (start === end || !Number.isFinite(decibelRange) || decibelRange <= 0) {
    return 0
  }

  let sumSquares = 0
  let validBins = 0

  for (let index = start; index < end; index += 1) {
    const decibels = frequencyDomain[index]

    if (!Number.isFinite(decibels)) {
      continue
    }

    const normalized = clampUnit((decibels - minDecibels) / decibelRange)
    sumSquares += normalized * normalized
    validBins += 1
  }

  return validBins === 0 ? 0 : clampUnit(Math.sqrt(sumSquares / validBins))
}

function calculateChangeRate(
  current: SoundVisualInput,
  previousFrame: AudioFrame | undefined,
  previousChangeRate: number,
): number {
  if (!previousFrame) {
    return 0
  }

  const difference =
    (Math.abs(current.loudness - previousFrame.loudness) +
      Math.abs(current.lowEnergy - previousFrame.lowEnergy) +
      Math.abs(current.midEnergy - previousFrame.midEnergy) +
      Math.abs(current.highEnergy - previousFrame.highEnergy)) /
    4
  const spike =
    current.loudness - previousFrame.loudness > 0.18 ? 0.28 : 0
  const rawChange = clampUnit(difference * 2.6 + spike)

  return clampUnit(clampUnit(previousChangeRate) * 0.72 + rawChange * 0.28)
}

export function calculateAudioFrame(input: AudioFrameInput): AudioFrame {
  const lowRange = frequencyRangeToBins(
    40,
    250,
    input.sampleRate,
    input.fftSize,
  )
  const midRange = frequencyRangeToBins(
    250,
    2000,
    input.sampleRate,
    input.fftSize,
  )
  const highRange = frequencyRangeToBins(
    2000,
    8000,
    input.sampleRate,
    input.fftSize,
  )
  const current: SoundVisualInput = {
    loudness: calculateRelativeLoudness(input.timeDomain),
    lowEnergy: calculateBandEnergy(
      input.frequencyDomain,
      lowRange,
      input.minDecibels,
      input.maxDecibels,
    ),
    midEnergy: calculateBandEnergy(
      input.frequencyDomain,
      midRange,
      input.minDecibels,
      input.maxDecibels,
    ),
    highEnergy: calculateBandEnergy(
      input.frequencyDomain,
      highRange,
      input.minDecibels,
      input.maxDecibels,
    ),
    changeRate: 0,
  }

  current.changeRate = calculateChangeRate(
    current,
    input.previousFrame,
    input.previousChangeRate ?? 0,
  )

  return {
    timestampMs: Number.isFinite(input.timestampMs) ? input.timestampMs : 0,
    ...current,
  }
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + clampUnit(value), 0) / values.length
}

export function createSoundSummary(
  frames: AudioFrame[],
  durationMs: number,
  seed: string,
): SoundSummary {
  const loudnessMean = mean(frames.map((frame) => frame.loudness))
  const loudnessPeak =
    frames.length === 0
      ? 0
      : Math.max(...frames.map((frame) => clampUnit(frame.loudness)))
  const lowEnergy = mean(frames.map((frame) => frame.lowEnergy))
  const midEnergy = mean(frames.map((frame) => frame.midEnergy))
  const highEnergy = mean(frames.map((frame) => frame.highEnergy))
  const changeRate = mean(frames.map((frame) => frame.changeRate))
  const totalEnergy = lowEnergy + midEnergy + highEnergy
  const quiet =
    loudnessMean < QUIET_LOUDNESS_THRESHOLD &&
    totalEnergy < QUIET_ENERGY_THRESHOLD

  return {
    durationMs:
      Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : 0,
    loudnessMean: clampUnit(loudnessMean),
    loudnessPeak: clampUnit(loudnessPeak),
    lowEnergy: clampUnit(lowEnergy),
    midEnergy: clampUnit(midEnergy),
    highEnergy: clampUnit(highEnergy),
    changeRate: clampUnit(changeRate),
    quiet,
    composition:
      quiet || totalEnergy <= 0
        ? { base: 0, flow: 0, sparkle: 0 }
        : {
            base: lowEnergy / totalEnergy,
            flow: midEnergy / totalEnergy,
            sparkle: highEnergy / totalEnergy,
          },
    seed,
  }
}

export function summaryToVisualInput(
  summary: SoundSummary,
): SoundVisualInput {
  return {
    loudness: clampUnit(summary.loudnessMean),
    lowEnergy: clampUnit(summary.lowEnergy),
    midEnergy: clampUnit(summary.midEnergy),
    highEnergy: clampUnit(summary.highEnergy),
    changeRate: clampUnit(summary.changeRate),
  }
}
