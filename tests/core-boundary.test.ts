import { describe, expect, it } from 'vitest'
import * as sharedCore from '../packages/core/src'
import {
  createArtworkTags as createWebArtworkTags,
} from '../src/tag-rules'
import {
  createSeededLayout as createWebSeededLayout,
} from '../src/visual-rules'
import type { SoundSummary } from '../src/types'

const summary: SoundSummary = {
  durationMs: 10_000,
  loudnessMean: 0.42,
  loudnessPeak: 0.76,
  lowEnergy: 0.24,
  midEnergy: 0.51,
  highEnergy: 0.25,
  changeRate: 0.38,
  quiet: false,
  composition: {
    base: 0.24,
    flow: 0.51,
    sparkle: 0.25,
  },
  seed: 'shared-core-contract',
}

describe('shared core boundary', () => {
  it('keeps Web layout generation on the shared implementation', () => {
    expect(createWebSeededLayout('shared-seed')).toEqual(
      sharedCore.createSeededLayout('shared-seed'),
    )
  })

  it('keeps Web tag generation on the shared implementation', () => {
    expect(createWebArtworkTags(summary, 'neutral')).toEqual(
      sharedCore.createArtworkTags(summary, 'neutral'),
    )
  })
})
