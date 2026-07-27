import { describe, expect, it } from 'vitest'
import {
  LOCAL_RECIPE_FIXTURES,
  RECIPE_IDS,
  createLocalSoundFingerprint,
  createLocalVisualState,
} from '../packages/core/src'
import canvasRendererSource from '../miniprogram/lib/canvas-renderer.ts?raw'
import recorderSessionSource from '../miniprogram/lib/recorder-session.ts?raw'
import homePageSource from '../miniprogram/pages/home/index.ts?raw'

describe('AI-M1 local recipe integration', () => {
  it('gives every recipe a dedicated Canvas composition branch', () => {
    for (const recipeId of RECIPE_IDS) {
      expect(canvasRendererSource).toContain(`case '${recipeId}'`)
    }

    expect(canvasRendererSource).toContain('state.featureSamples')
    expect(canvasRendererSource).toContain('sample.t')
    expect(canvasRendererSource).toContain('sample.changeRate')
  })

  it('keeps recorder completion deterministic and frees raw frame storage', () => {
    expect(recorderSessionSource).toContain('createLocalSoundFingerprint(')
    expect(recorderSessionSource).toContain('session.frames.length = 0')
    expect(recorderSessionSource).not.toMatch(
      /seed:\s*callbacks\.seed|wechat-audio-\$\{Date\.now/,
    )
    expect(homePageSource).toContain("createVisualState(\n      'local-live-preview-v1'")
    expect(homePageSource).toContain('createLocalVisualState(')
  })

  it('keeps generated layouts bounded for all eight fixed fixtures', () => {
    for (const recipeId of RECIPE_IDS) {
      const state = createLocalVisualState(
        createLocalSoundFingerprint(
          LOCAL_RECIPE_FIXTURES[recipeId],
          10_000,
        ),
      )

      expect(state.recipeId).toBe(recipeId)
      expect(state.featureSamples).toHaveLength(20)
      expect(state.layout.baseShapes.length).toBeLessThanOrEqual(4)
      expect(state.layout.flows.length).toBeLessThanOrEqual(4)
      expect(state.layout.particles.length).toBeLessThanOrEqual(160)
    }
  })
})
