import { clampUnit, createSoundSummary } from './sound-summary'
import type { AudioFrame, SoundSummary } from './types'

export const SAMPLE_DURATION_MS = 10_000

export function createSampleFrame(elapsedMs: number): AudioFrame {
  const time = Math.max(0, elapsedMs) / 1000
  const slowWave = Math.sin(time * 1.1)
  const fastWave = Math.sin(time * 3.8 + 0.7)

  return {
    timestampMs: Math.max(0, elapsedMs),
    loudness: clampUnit(0.38 + slowWave * 0.08 + fastWave * 0.025),
    lowEnergy: clampUnit(0.2 + slowWave * 0.035),
    midEnergy: clampUnit(0.35 + fastWave * 0.045),
    highEnergy: clampUnit(0.45 + Math.sin(time * 2.7) * 0.07),
    changeRate: clampUnit(0.38 + Math.abs(fastWave) * 0.12),
  }
}

export function createSampleSummary(
  frames: AudioFrame[],
  durationMs = SAMPLE_DURATION_MS,
): SoundSummary {
  return createSoundSummary(frames, durationMs, 'sample-park-morning')
}
