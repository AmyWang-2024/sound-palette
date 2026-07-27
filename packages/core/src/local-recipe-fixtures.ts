import type { AudioFrame, RecipeId } from './types'

interface FixtureProfile {
  loudness: number
  lowEnergy: number
  midEnergy: number
  highEnergy: number
  changeRate: number
  alternate?: boolean
  impulse?: boolean
}

const FIXTURE_PROFILES: Record<RecipeId, FixtureProfile> = {
  'concentric-field': {
    loudness: 0.52,
    lowEnergy: 0.88,
    midEnergy: 0.08,
    highEnergy: 0.04,
    changeRate: 0.08,
  },
  'flowing-ribbons': {
    loudness: 0.5,
    lowEnergy: 0.08,
    midEnergy: 0.88,
    highEnergy: 0.04,
    changeRate: 0.18,
  },
  'particle-constellation': {
    loudness: 0.44,
    lowEnergy: 0.04,
    midEnergy: 0.08,
    highEnergy: 0.88,
    changeRate: 0.2,
  },
  'layered-paper': {
    loudness: 0.62,
    lowEnergy: 0.38,
    midEnergy: 0.38,
    highEnergy: 0.38,
    changeRate: 0.2,
  },
  'vertical-rain': {
    loudness: 0.5,
    lowEnergy: 0.06,
    midEnergy: 0.68,
    highEnergy: 0.68,
    changeRate: 0.3,
  },
  'radial-pulse': {
    loudness: 0.46,
    lowEnergy: 0.32,
    midEnergy: 0.34,
    highEnergy: 0.34,
    changeRate: 0.92,
    impulse: true,
  },
  'fractured-grid': {
    loudness: 0.5,
    lowEnergy: 0.48,
    midEnergy: 0.3,
    highEnergy: 0.44,
    changeRate: 0.48,
    alternate: true,
  },
  'calm-horizon': {
    loudness: 0.018,
    lowEnergy: 0.018,
    midEnergy: 0.014,
    highEnergy: 0.012,
    changeRate: 0.01,
  },
}

export function createLocalRecipeFixture(
  recipeId: RecipeId,
  frameCount = 80,
): AudioFrame[] {
  const profile = FIXTURE_PROFILES[recipeId]
  const safeFrameCount = Math.max(1, Math.round(frameCount))

  return Array.from({ length: safeFrameCount }, (_, index) => {
    const progress =
      safeFrameCount === 1 ? 0 : index / (safeFrameCount - 1)
    const wave = Math.sin(progress * Math.PI * 6)
    const fixtureBucketSize = Math.max(1, Math.floor(safeFrameCount / 20))
    const alternate =
      profile.alternate
        ? Math.floor(index / fixtureBucketSize) % 2 === 0
          ? -1
          : 1
        : 0
    const impulse =
      profile.impulse && index % 16 === 8 ? 0.48 : 0

    return {
      timestampMs: Math.round(progress * 10_000),
      loudness: Math.min(
        1,
        Math.max(
          0,
          profile.loudness + wave * 0.018 + alternate * 0.38 + impulse,
        ),
      ),
      lowEnergy: Math.min(
        1,
        Math.max(0, profile.lowEnergy + wave * 0.012 + alternate * 0.34),
      ),
      midEnergy: Math.min(
        1,
        Math.max(0, profile.midEnergy - wave * 0.012 - alternate * 0.28),
      ),
      highEnergy: Math.min(
        1,
        Math.max(0, profile.highEnergy + wave * 0.016 + alternate * 0.32),
      ),
      changeRate: Math.min(
        1,
        Math.max(0, profile.changeRate + Math.abs(wave) * 0.018),
      ),
    }
  })
}

export const LOCAL_RECIPE_FIXTURES = Object.freeze({
  'concentric-field': createLocalRecipeFixture('concentric-field'),
  'flowing-ribbons': createLocalRecipeFixture('flowing-ribbons'),
  'particle-constellation': createLocalRecipeFixture(
    'particle-constellation',
  ),
  'layered-paper': createLocalRecipeFixture('layered-paper'),
  'vertical-rain': createLocalRecipeFixture('vertical-rain'),
  'radial-pulse': createLocalRecipeFixture('radial-pulse'),
  'fractured-grid': createLocalRecipeFixture('fractured-grid'),
  'calm-horizon': createLocalRecipeFixture('calm-horizon'),
}) satisfies Readonly<Record<RecipeId, AudioFrame[]>>
