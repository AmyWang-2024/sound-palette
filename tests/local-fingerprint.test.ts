import { describe, expect, it, vi } from 'vitest'
import {
  LOCAL_FINGERPRINT_SAMPLE_COUNT,
  LOCAL_RECIPE_FIXTURES,
  RECIPE_IDS,
  compressSoundFrames,
  createLocalArtworkManifest,
  createLocalSoundFingerprint,
  createLocalVisualState,
  selectLocalRecipe,
  updateVisualMood,
  type AudioFrame,
} from '../packages/core/src'

describe('AI-M1 local sound fingerprint', () => {
  it('compresses complete, short, missing, and invalid input safely', () => {
    const shortFrame: AudioFrame = {
      timestampMs: 100,
      loudness: 2,
      lowEnergy: -1,
      midEnergy: Number.NaN,
      highEnergy: 0.4,
      changeRate: Number.POSITIVE_INFINITY,
    }

    expect(compressSoundFrames([])).toHaveLength(
      LOCAL_FINGERPRINT_SAMPLE_COUNT,
    )
    expect(compressSoundFrames([shortFrame])).toHaveLength(
      LOCAL_FINGERPRINT_SAMPLE_COUNT,
    )
    expect(
      compressSoundFrames([shortFrame]).every((sample) =>
        Object.values(sample).every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 1,
        ),
      ),
    ).toBe(true)
    expect(compressSoundFrames([], 1)).toHaveLength(16)
    expect(compressSoundFrames([], 100)).toHaveLength(24)
    expect(compressSoundFrames([], Number.NaN)).toHaveLength(20)
  })

  it('is deterministic and does not use wall-clock time as its seed', () => {
    const frames = LOCAL_RECIPE_FIXTURES['flowing-ribbons']
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const first = createLocalSoundFingerprint(frames, 10_000)
    vi.setSystemTime(new Date('2036-12-31T23:59:59Z'))
    const second = createLocalSoundFingerprint(frames, 10_000)

    expect(second).toEqual(first)
    expect(first.samples).toHaveLength(20)
    expect(first.summary.seed).toBe(`local-v1-${first.hash}`)
    expect(
      createLocalSoundFingerprint(
        LOCAL_RECIPE_FIXTURES['particle-constellation'],
        10_000,
      ).hash,
    ).not.toBe(first.hash)
    vi.useRealTimers()
  })

  it('maps all eight fixed fixtures to their intended recipe', () => {
    const selected = RECIPE_IDS.map((recipeId) => {
      const fingerprint = createLocalSoundFingerprint(
        LOCAL_RECIPE_FIXTURES[recipeId],
        10_000,
      )

      return selectLocalRecipe(fingerprint)
    })

    expect(selected).toEqual(RECIPE_IDS)
    expect(new Set(selected).size).toBe(8)
  })

  it('keeps recipe, seed, feature samples, and main layout across mood changes', () => {
    const fingerprint = createLocalSoundFingerprint(
      LOCAL_RECIPE_FIXTURES['fractured-grid'],
      10_000,
    )
    const neutral = createLocalVisualState(fingerprint, 'neutral')
    const good = updateVisualMood(neutral, 'good')
    const low = updateVisualMood(good, 'low')

    expect(good.recipeId).toBe(neutral.recipeId)
    expect(low.recipeId).toBe(neutral.recipeId)
    expect(good.layout).toBe(neutral.layout)
    expect(low.layout).toBe(neutral.layout)
    expect(good.featureSamples).toBe(neutral.featureSamples)
    expect(low.featureSamples).toBe(neutral.featureSamples)
    expect(good.layout.seed).toBe(fingerprint.summary.seed)
  })

  it('creates a reproducible manifest when creation metadata is fixed', () => {
    const fingerprint = createLocalSoundFingerprint(
      LOCAL_RECIPE_FIXTURES['radial-pulse'],
      10_000,
    )
    const first = createLocalArtworkManifest(
      fingerprint,
      'neutral',
      1_785_000_000_000,
    )
    const second = createLocalArtworkManifest(
      fingerprint,
      'neutral',
      1_785_000_000_000,
    )

    expect(second).toEqual(first)
    expect(first.recipeId).toBe('radial-pulse')
    expect(first.fingerprintHash).toBe(fingerprint.hash)
  })
})
