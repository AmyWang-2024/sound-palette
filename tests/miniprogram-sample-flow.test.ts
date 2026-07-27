import { describe, expect, it } from 'vitest'
import {
  SAMPLE_DURATION_MS,
  createArtworkTags,
  createSampleFrame,
  createSampleSummary,
  createVisualState,
  summaryToVisualInput,
  updateVisualMood,
} from '../packages/core/src'

function sampleFrames() {
  return Array.from({ length: 101 }, (_, index) =>
    createSampleFrame(index * 100, 'parkMorning'),
  )
}

describe('W1 mini program sample flow', () => {
  it('creates a complete deterministic ten-second sample summary', () => {
    const first = createSampleSummary(
      sampleFrames(),
      SAMPLE_DURATION_MS,
      'parkMorning',
    )
    const second = createSampleSummary(
      sampleFrames(),
      SAMPLE_DURATION_MS,
      'parkMorning',
    )

    expect(first).toEqual(second)
    expect(first.durationMs).toBe(10_000)
    expect(first.seed).toBe('sample-park-morning')
    expect(first.composition.base + first.composition.flow + first.composition.sparkle)
      .toBeCloseTo(1, 8)
  })

  it('preserves layout and audio input while mood changes the visual profile', () => {
    const summary = createSampleSummary(
      sampleFrames(),
      SAMPLE_DURATION_MS,
      'parkMorning',
    )
    const neutral = createVisualState(
      summary.seed,
      summaryToVisualInput(summary),
      'neutral',
    )
    const good = updateVisualMood(neutral, 'good')
    const low = updateVisualMood(good, 'low')

    expect(good.layout).toBe(neutral.layout)
    expect(low.layout).toBe(neutral.layout)
    expect(good.input).toBe(neutral.input)
    expect(low.input).toBe(neutral.input)
    expect(good.palette).not.toEqual(neutral.palette)
    expect(low.profile.drift).toBe('inward')
  })

  it('produces all three stable result tags', () => {
    const summary = createSampleSummary(
      sampleFrames(),
      SAMPLE_DURATION_MS,
      'parkMorning',
    )

    expect(Object.values(createArtworkTags(summary, 'neutral'))).toHaveLength(3)
    expect(createArtworkTags(summary, 'neutral')).toEqual(
      createArtworkTags(summary, 'neutral'),
    )
  })
})
