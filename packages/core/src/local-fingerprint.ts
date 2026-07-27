import { createSoundSummary, clampUnit, summaryToVisualInput } from './sound-summary'
import type {
  AudioFrame,
  LocalArtworkManifest,
  LocalSoundFingerprint,
  Mood,
  RecipeId,
  SoundFeatureSample,
  VisualState,
} from './types'
import { createVisualState } from './visual-rules'

export const LOCAL_FINGERPRINT_VERSION = 1 as const
export const LOCAL_RECIPE_VERSION = 1 as const
export const LOCAL_FINGERPRINT_SAMPLE_COUNT = 20

const LOCAL_SEED_PREFIX = `local-v${LOCAL_RECIPE_VERSION}`

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + clampUnit(value), 0) / values.length
}

function meanFrame(
  frames: AudioFrame[],
  normalizedTime: number,
): SoundFeatureSample {
  return {
    t: clampUnit(normalizedTime),
    loudness: mean(frames.map((frame) => frame.loudness)),
    lowEnergy: mean(frames.map((frame) => frame.lowEnergy)),
    midEnergy: mean(frames.map((frame) => frame.midEnergy)),
    highEnergy: mean(frames.map((frame) => frame.highEnergy)),
    changeRate: mean(frames.map((frame) => frame.changeRate)),
  }
}

export function compressSoundFrames(
  frames: AudioFrame[],
  sampleCount = LOCAL_FINGERPRINT_SAMPLE_COUNT,
): SoundFeatureSample[] {
  const safeCount = Math.min(
    24,
    Math.max(
      16,
      Math.round(
        Number.isFinite(sampleCount)
          ? sampleCount
          : LOCAL_FINGERPRINT_SAMPLE_COUNT,
      ),
    ),
  )
  const validFrames = frames.filter((frame) =>
    [
      frame.loudness,
      frame.lowEnergy,
      frame.midEnergy,
      frame.highEnergy,
      frame.changeRate,
    ].some(Number.isFinite),
  )

  if (validFrames.length === 0) {
    return Array.from({ length: safeCount }, (_, index) =>
      meanFrame([], safeCount === 1 ? 0 : index / (safeCount - 1)),
    )
  }

  return Array.from({ length: safeCount }, (_, index) => {
    const start = Math.floor((index * validFrames.length) / safeCount)
    const end = Math.floor(((index + 1) * validFrames.length) / safeCount)
    const bucket =
      end > start
        ? validFrames.slice(start, end)
        : [validFrames[Math.min(validFrames.length - 1, start)]]

    return meanFrame(bucket, safeCount === 1 ? 0 : index / (safeCount - 1))
  })
}

function quantize(value: number): number {
  return Math.round(clampUnit(value) * 255)
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function hashSoundFeatureSamples(
  samples: SoundFeatureSample[],
): string {
  const payload = samples
    .map((sample) =>
      [
        quantize(sample.t),
        quantize(sample.loudness),
        quantize(sample.lowEnergy),
        quantize(sample.midEnergy),
        quantize(sample.highEnergy),
        quantize(sample.changeRate),
      ].join(','),
    )
    .join('|')

  return fnv1a(`${LOCAL_FINGERPRINT_VERSION}:${payload}`)
}

export function createLocalSoundFingerprint(
  frames: AudioFrame[],
  durationMs: number,
): LocalSoundFingerprint {
  const samples = compressSoundFrames(frames)
  const hash = hashSoundFeatureSamples(samples)
  const seed = `${LOCAL_SEED_PREFIX}-${hash}`

  return {
    version: LOCAL_FINGERPRINT_VERSION,
    samples,
    summary: createSoundSummary(frames, durationMs, seed),
    hash,
  }
}

function sampleVariation(samples: SoundFeatureSample[]): number {
  if (samples.length < 2) {
    return 0
  }

  let difference = 0

  for (let index = 1; index < samples.length; index += 1) {
    const current = samples[index]
    const previous = samples[index - 1]
    difference +=
      (Math.abs(current.loudness - previous.loudness) +
        Math.abs(current.lowEnergy - previous.lowEnergy) +
        Math.abs(current.midEnergy - previous.midEnergy) +
        Math.abs(current.highEnergy - previous.highEnergy)) /
      4
  }

  return clampUnit(difference / (samples.length - 1))
}

function hashBias(hash: string, recipeIndex: number): number {
  const offset = (recipeIndex * 2) % Math.max(1, hash.length - 1)
  const parsed = Number.parseInt(hash.slice(offset, offset + 2), 16)

  return (Number.isFinite(parsed) ? parsed / 255 : 0) * 0.08
}

export function selectLocalRecipe(
  fingerprint: LocalSoundFingerprint,
): RecipeId {
  const { summary, samples, hash } = fingerprint
  const totalEnergy =
    summary.lowEnergy + summary.midEnergy + summary.highEnergy
  const lowShare = totalEnergy > 0 ? summary.lowEnergy / totalEnergy : 0
  const midShare = totalEnergy > 0 ? summary.midEnergy / totalEnergy : 0
  const highShare = totalEnergy > 0 ? summary.highEnergy / totalEnergy : 0
  const balance =
    1 -
    Math.min(
      1,
      (Math.abs(lowShare - midShare) +
        Math.abs(midShare - highShare) +
        Math.abs(highShare - lowShare)) /
        2,
    )
  const variation = sampleVariation(samples)
  const loudnessRange =
    samples.length === 0
      ? 0
      : Math.max(...samples.map((sample) => sample.loudness)) -
        Math.min(...samples.map((sample) => sample.loudness))
  const scores: Array<[RecipeId, number]> = [
    [
      'concentric-field',
      lowShare * 2.4 + summary.lowEnergy * 0.7 + (1 - summary.changeRate) * 0.25,
    ],
    [
      'flowing-ribbons',
      midShare * 2.35 + summary.midEnergy * 0.75 + summary.changeRate * 0.2,
    ],
    [
      'particle-constellation',
      highShare * 2.35 + summary.highEnergy * 0.75 + summary.changeRate * 0.25,
    ],
    ['layered-paper', 1.15 + balance * 1.35 + summary.loudnessMean * 0.22],
    [
      'vertical-rain',
      Math.min(summary.midEnergy, summary.highEnergy) * 2.7 +
        (1 - summary.lowEnergy) * 0.55 +
        summary.changeRate * 0.25,
    ],
    [
      'radial-pulse',
      summary.changeRate * 3.15 +
        loudnessRange * 1.45 +
        summary.loudnessPeak * 0.2,
    ],
    [
      'fractured-grid',
      variation * 4.1 +
        loudnessRange * 1.05 +
        summary.changeRate * 0.65,
    ],
    [
      'calm-horizon',
      (1 - summary.loudnessMean) * 1.35 +
        (1 - Math.min(1, totalEnergy)) * 0.9 +
        (1 - summary.changeRate) * 0.45 +
        (summary.quiet ? 2.5 : 0),
    ],
  ]

  return scores
    .map(([recipeId, score], index) => [
      recipeId,
      score + hashBias(hash, index),
    ] as const)
    .reduce((best, candidate) => (candidate[1] > best[1] ? candidate : best))[0]
}

export function createLocalVisualState(
  fingerprint: LocalSoundFingerprint,
  mood: Mood = 'neutral',
): VisualState {
  return createVisualState(
    fingerprint.summary.seed,
    summaryToVisualInput(fingerprint.summary),
    mood,
    {
      recipeId: selectLocalRecipe(fingerprint),
      featureSamples: fingerprint.samples,
    },
  )
}

export function createLocalArtworkManifest(
  fingerprint: LocalSoundFingerprint,
  mood: Mood,
  createdAt: number,
): LocalArtworkManifest {
  return {
    version: LOCAL_RECIPE_VERSION,
    mode: 'local',
    recipeId: selectLocalRecipe(fingerprint),
    seed: fingerprint.summary.seed,
    mood,
    summary: fingerprint.summary,
    fingerprintHash: fingerprint.hash,
    createdAt: Number.isFinite(createdAt) ? Math.max(0, Math.round(createdAt)) : 0,
  }
}
