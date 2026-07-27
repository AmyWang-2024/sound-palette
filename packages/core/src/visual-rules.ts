import seedrandom from 'seedrandom'
import { createMoodPalette, MOOD_PROFILES } from './mood-profiles'
import type {
  Mood,
  SoundVisualInput,
  VisualLayout,
  VisualState,
} from './types'

export const MAX_PARTICLES = 160

export const DEFAULT_VISUAL_INPUT: SoundVisualInput = {
  loudness: 0.45,
  lowEnergy: 0.38,
  midEnergy: 0.52,
  highEnergy: 0.28,
  changeRate: 0.32,
}

function unit(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(1, Math.max(0, value ?? 0))
}

export function normalizeVisualInput(
  input: Partial<SoundVisualInput>,
): SoundVisualInput {
  return {
    loudness: unit(input.loudness),
    lowEnergy: unit(input.lowEnergy),
    midEnergy: unit(input.midEnergy),
    highEnergy: unit(input.highEnergy),
    changeRate: unit(input.changeRate),
  }
}

export function createSeededLayout(
  seed: string,
  particleCount = MAX_PARTICLES,
): VisualLayout {
  const random = seedrandom(seed)
  const baseShapeCount = 2 + Math.floor(random() * 3)
  const flowCount = 2 + Math.floor(random() * 3)
  const safeParticleCount = Math.min(
    MAX_PARTICLES,
    Math.max(0, Math.floor(particleCount)),
  )

  return {
    seed,
    baseHue: random() * 360,
    baseShapes: Array.from({ length: baseShapeCount }, () => ({
      x: 0.16 + random() * 0.68,
      y: 0.16 + random() * 0.68,
      radius: 0.15 + random() * 0.16,
      stretch: 0.72 + random() * 0.72,
      phase: random() * Math.PI * 2,
      driftX: 0.018 + random() * 0.035,
      driftY: 0.016 + random() * 0.032,
    })),
    flows: Array.from({ length: flowCount }, () => ({
      y: 0.18 + random() * 0.64,
      amplitude: 0.05 + random() * 0.12,
      frequency: 0.7 + random() * 1.25,
      phase: random() * Math.PI * 2,
      width: 0.008 + random() * 0.016,
    })),
    particles: Array.from({ length: safeParticleCount }, () => ({
      x: random(),
      y: random(),
      phase: random() * Math.PI * 2,
      size: 0.7 + random() * 1.8,
      drift: 0.5 + random(),
    })),
  }
}

export function createVisualState(
  seed: string,
  input: Partial<SoundVisualInput> = DEFAULT_VISUAL_INPUT,
  mood: Mood = 'neutral',
): VisualState {
  const layout = createSeededLayout(seed)

  return {
    input: normalizeVisualInput(input),
    mood,
    profile: MOOD_PROFILES[mood],
    palette: createMoodPalette(layout.baseHue, mood),
    layout,
  }
}

export function updateVisualInput(
  state: VisualState,
  input: Partial<SoundVisualInput>,
): VisualState {
  return {
    ...state,
    input: normalizeVisualInput(input),
  }
}

export function updateVisualMood(state: VisualState, mood: Mood): VisualState {
  return {
    ...state,
    mood,
    profile: MOOD_PROFILES[mood],
    palette: createMoodPalette(state.layout.baseHue, mood),
  }
}
