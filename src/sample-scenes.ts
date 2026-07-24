import { clampUnit, createSoundSummary } from './sound-summary'
import type { AudioFrame, SoundSummary } from './types'

export const SAMPLE_DURATION_MS = 10_000

export const SAMPLE_SCENES = {
  parkMorning: {
    labelZh: '清晨公园',
    lowEnergy: 0.2,
    midEnergy: 0.35,
    highEnergy: 0.45,
    loudness: 0.35,
    changeRate: 0.45,
    seed: 'sample-park-morning',
  },
  rainyStreet: {
    labelZh: '雨中街道',
    lowEnergy: 0.45,
    midEnergy: 0.45,
    highEnergy: 0.1,
    loudness: 0.6,
    changeRate: 0.28,
    seed: 'sample-rainy-street',
  },
  cafeAfternoon: {
    labelZh: '午后咖啡馆',
    lowEnergy: 0.25,
    midEnergy: 0.6,
    highEnergy: 0.15,
    loudness: 0.45,
    changeRate: 0.22,
    seed: 'sample-cafe-afternoon',
  },
} as const

export type SampleSceneId = keyof typeof SAMPLE_SCENES

export function pickSampleScene(randomValue = Math.random()): SampleSceneId {
  const sceneIds = Object.keys(SAMPLE_SCENES) as SampleSceneId[]
  const safeRandom = Number.isFinite(randomValue)
    ? Math.min(0.999_999, Math.max(0, randomValue))
    : 0

  return sceneIds[Math.floor(safeRandom * sceneIds.length)]
}

export function createSampleFrame(
  elapsedMs: number,
  sceneId: SampleSceneId = 'parkMorning',
): AudioFrame {
  const scene = SAMPLE_SCENES[sceneId]
  const time = Math.max(0, elapsedMs) / 1000
  const slowWave = Math.sin(time * 1.1)
  const fastWave = Math.sin(time * 3.8 + 0.7)

  return {
    timestampMs: Math.max(0, elapsedMs),
    loudness: clampUnit(
      scene.loudness + slowWave * 0.07 + fastWave * 0.025,
    ),
    lowEnergy: clampUnit(scene.lowEnergy + slowWave * 0.035),
    midEnergy: clampUnit(scene.midEnergy + fastWave * 0.045),
    highEnergy: clampUnit(
      scene.highEnergy + Math.sin(time * 2.7) * 0.06,
    ),
    changeRate: clampUnit(
      scene.changeRate + (Math.abs(fastWave) - 0.5) * 0.1,
    ),
  }
}

export function createSampleSummary(
  frames: AudioFrame[],
  durationMs = SAMPLE_DURATION_MS,
  sceneId: SampleSceneId = 'parkMorning',
): SoundSummary {
  return createSoundSummary(
    frames,
    durationMs,
    SAMPLE_SCENES[sceneId].seed,
  )
}
