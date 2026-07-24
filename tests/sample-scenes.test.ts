import { describe, expect, it } from 'vitest'
import {
  createSampleFrame,
  createSampleSummary,
  pickSampleScene,
  SAMPLE_SCENES,
} from '../src/sample-scenes'

describe('sample scenes', () => {
  it('selects one of the three presets with bounded random input', () => {
    expect(pickSampleScene(0)).toBe('parkMorning')
    expect(pickSampleScene(0.34)).toBe('rainyStreet')
    expect(pickSampleScene(0.99)).toBe('cafeAfternoon')
    expect(pickSampleScene(Number.NaN)).toBe('parkMorning')
  })

  it('keeps every synthetic frame feature in the 0..1 range', () => {
    for (const sceneId of Object.keys(SAMPLE_SCENES) as Array<
      keyof typeof SAMPLE_SCENES
    >) {
      const frame = createSampleFrame(2_500, sceneId)

      expect(frame.timestampMs).toBe(2_500)
      expect(frame.loudness).toBeGreaterThanOrEqual(0)
      expect(frame.loudness).toBeLessThanOrEqual(1)
      expect(frame.lowEnergy).toBeGreaterThanOrEqual(0)
      expect(frame.midEnergy).toBeLessThanOrEqual(1)
      expect(frame.highEnergy).toBeGreaterThanOrEqual(0)
      expect(frame.changeRate).toBeLessThanOrEqual(1)
    }
  })

  it('creates distinct, stable summaries without audio assets', () => {
    const parkFrames = [0, 1_000, 2_000].map((elapsed) =>
      createSampleFrame(elapsed, 'parkMorning'),
    )
    const rainyFrames = [0, 1_000, 2_000].map((elapsed) =>
      createSampleFrame(elapsed, 'rainyStreet'),
    )

    const park = createSampleSummary(parkFrames, 2_000, 'parkMorning')
    const rainy = createSampleSummary(rainyFrames, 2_000, 'rainyStreet')

    expect(park.seed).toBe(SAMPLE_SCENES.parkMorning.seed)
    expect(rainy.seed).toBe(SAMPLE_SCENES.rainyStreet.seed)
    expect(park.composition).not.toEqual(rainy.composition)
  })
})
