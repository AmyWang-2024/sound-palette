import { describe, expect, it } from 'vitest'
import { selectRenderQuality } from '../miniprogram/lib/render-quality'

describe('W4 mini program render quality', () => {
  it('limits DPR, frame rate, and particles on low-end devices', () => {
    expect(
      selectRenderQuality({
        benchmarkLevel: 8,
        memorySizeMb: 1_536,
        platform: 'android',
      }),
    ).toEqual({
      tier: 'low',
      dprCap: 1.5,
      framesPerSecond: 20,
      maxParticles: 48,
    })
  })

  it('uses a conservative medium tier when capability data is unavailable', () => {
    expect(selectRenderQuality({})).toEqual({
      tier: 'medium',
      dprCap: 2,
      framesPerSecond: 24,
      maxParticles: 72,
    })
  })

  it('never exceeds the W4 high quality bounds', () => {
    const quality = selectRenderQuality({
      benchmarkLevel: 45,
      memorySizeMb: 8_192,
      platform: 'ios',
    })

    expect(quality.tier).toBe('high')
    expect(quality.dprCap).toBeLessThanOrEqual(2)
    expect(quality.framesPerSecond).toBeLessThanOrEqual(30)
    expect(quality.maxParticles).toBeLessThanOrEqual(96)
  })
})
