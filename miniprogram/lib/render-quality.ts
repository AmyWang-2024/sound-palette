export type RenderQualityTier = 'low' | 'medium' | 'high'

export interface RenderCapability {
  benchmarkLevel?: number
  memorySizeMb?: number
  platform?: string
}

export interface RenderQuality {
  tier: RenderQualityTier
  dprCap: number
  framesPerSecond: number
  maxParticles: number
}

export function selectRenderQuality(
  capability: RenderCapability,
): RenderQuality {
  const benchmark = Number.isFinite(capability.benchmarkLevel)
    ? capability.benchmarkLevel ?? -1
    : -1
  const memory = Number.isFinite(capability.memorySizeMb)
    ? capability.memorySizeMb ?? 0
    : 0

  if (
    (benchmark > 0 && benchmark <= 10) ||
    (memory > 0 && memory <= 2_048)
  ) {
    return {
      tier: 'low',
      dprCap: 1.5,
      framesPerSecond: 20,
      maxParticles: 48,
    }
  }

  if (
    benchmark >= 30 &&
    (memory === 0 || memory >= 4_096)
  ) {
    return {
      tier: 'high',
      dprCap: 2,
      framesPerSecond: 30,
      maxParticles: 96,
    }
  }

  return {
    tier: 'medium',
    dprCap: 2,
    framesPerSecond: 24,
    maxParticles: 72,
  }
}
