import { describe, expect, it } from 'vitest'
import {
  createSeededLayout,
  createVisualState,
  MAX_PARTICLES,
  normalizeVisualInput,
  updateVisualInput,
  updateVisualMood,
} from '../src/visual-rules'

describe('visual rules', () => {
  it('clamps finite values and safely degrades invalid input', () => {
    expect(
      normalizeVisualInput({
        loudness: Number.NaN,
        lowEnergy: -0.4,
        midEnergy: 0.42,
        highEnergy: 2,
        changeRate: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      loudness: 0,
      lowEnergy: 0,
      midEnergy: 0.42,
      highEnergy: 1,
      changeRate: 0,
    })
  })

  it('creates a repeatable layout without replacing global randomness', () => {
    const first = createSeededLayout('same-seed')
    const second = createSeededLayout('same-seed')
    const different = createSeededLayout('different-seed')

    expect(second).toEqual(first)
    expect(different).not.toEqual(first)
    expect(first.baseShapes.length).toBeGreaterThanOrEqual(2)
    expect(first.baseShapes.length).toBeLessThanOrEqual(4)
    expect(first.particles).toHaveLength(MAX_PARTICLES)
  })

  it('preserves the same input and layout when mood changes', () => {
    const state = createVisualState('fixed-composition', {
      loudness: 0.7,
      lowEnergy: 0.2,
      midEnergy: 0.6,
      highEnergy: 0.4,
      changeRate: 0.3,
    })
    const changedMood = updateVisualMood(state, 'good')

    expect(changedMood.layout).toBe(state.layout)
    expect(changedMood.input).toBe(state.input)
    expect(changedMood.palette).not.toEqual(state.palette)
  })

  it('updates sound input without regenerating the composition', () => {
    const state = createVisualState('fixed-composition')
    const changedInput = updateVisualInput(state, {
      loudness: 1,
      lowEnergy: 0,
      midEnergy: 0.5,
      highEnergy: 0.8,
      changeRate: 0.6,
    })

    expect(changedInput.layout).toBe(state.layout)
    expect(changedInput.mood).toBe(state.mood)
    expect(changedInput.input).not.toBe(state.input)
  })
})
