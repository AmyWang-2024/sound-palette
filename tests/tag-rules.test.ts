import { describe, expect, it } from 'vitest'
import { createArtworkTags } from '../src/tag-rules'
import type { SoundSummary } from '../src/types'

function summary(
  composition: SoundSummary['composition'],
  overrides: Partial<SoundSummary> = {},
): SoundSummary {
  return {
    durationMs: 10_000,
    loudnessMean: 0.4,
    loudnessPeak: 0.7,
    lowEnergy: composition.base,
    midEnergy: composition.flow,
    highEnergy: composition.sparkle,
    changeRate: 0.4,
    quiet: false,
    composition,
    seed: 'stable-tag-seed',
    ...overrides,
  }
}

describe('artwork tag rules', () => {
  it('returns the same three tags for the same seed and inputs', () => {
    const input = summary({ base: 0.2, flow: 0.55, sparkle: 0.25 })

    expect(createArtworkTags(input, 'good')).toEqual(
      createArtworkTags(input, 'good'),
    )
  })

  it('selects the structural label from the normalized composition', () => {
    expect(
      createArtworkTags(
        summary({ base: 0.7, flow: 0.2, sparkle: 0.1 }),
        'neutral',
      ).structure,
    ).toBe('厚重基底')
    expect(
      createArtworkTags(
        summary({ base: 0.15, flow: 0.7, sparkle: 0.15 }),
        'neutral',
      ).structure,
    ).toBe('持续流动')
    expect(
      createArtworkTags(
        summary({ base: 0.1, flow: 0.15, sparkle: 0.75 }),
        'neutral',
      ).structure,
    ).toBe('明亮细节')
    expect(
      createArtworkTags(
        summary({ base: 0.34, flow: 0.33, sparkle: 0.33 }),
        'neutral',
      ).structure,
    ).toBe('层次均衡')
  })

  it('uses quiet and movement rules without fabricating a composition', () => {
    const quiet = summary(
      { base: 0, flow: 0, sparkle: 0 },
      { quiet: true, changeRate: 0.05 },
    )
    const active = summary(
      { base: 0.3, flow: 0.4, sparkle: 0.3 },
      { changeRate: 0.9 },
    )

    expect(['安静', '留白']).toContain(
      createArtworkTags(quiet, 'neutral').structure,
    )
    expect(createArtworkTags(quiet, 'neutral').movement).toBe('缓慢')
    expect(['跳跃', '起伏明显']).toContain(
      createArtworkTags(active, 'neutral').movement,
    )
  })

  it('uses a mood-specific label while leaving the summary untouched', () => {
    const input = summary({ base: 0.3, flow: 0.4, sparkle: 0.3 })
    const before = structuredClone(input)

    expect(['舒展', '清亮', '有生气']).toContain(
      createArtworkTags(input, 'good').mood,
    )
    expect(['日常', '平稳', '观察中']).toContain(
      createArtworkTags(input, 'neutral').mood,
    )
    expect(['下沉', '收拢', '沉静']).toContain(
      createArtworkTags(input, 'low').mood,
    )
    expect(input).toEqual(before)
  })
})
