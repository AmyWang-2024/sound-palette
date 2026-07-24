export const APP_STATES = ['home', 'listening', 'mood', 'result'] as const

export type AppState = (typeof APP_STATES)[number]

export const MOODS = ['good', 'neutral', 'low'] as const

export type Mood = (typeof MOODS)[number]

export interface SoundVisualInput {
  loudness: number
  lowEnergy: number
  midEnergy: number
  highEnergy: number
  changeRate: number
}

export interface AudioFrame extends SoundVisualInput {
  timestampMs: number
}

export interface SoundSummary {
  durationMs: number
  loudnessMean: number
  loudnessPeak: number
  lowEnergy: number
  midEnergy: number
  highEnergy: number
  changeRate: number
  quiet: boolean
  composition: {
    base: number
    flow: number
    sparkle: number
  }
  seed: string
}

export interface MoodProfile {
  id: Mood
  labelZh: string
  brightness: number
  chroma: number
  warmth: number
  expansion: number
  motionSpeed: number
  textureDensity: number
  edgeSoftness: number
  drift: 'outward' | 'balanced' | 'inward'
}

export interface VisualPalette {
  background: string
  atmosphere: string
  base: string
  flow: string
  sparkle: string
}

export interface BaseShapeLayout {
  x: number
  y: number
  radius: number
  stretch: number
  phase: number
  driftX: number
  driftY: number
}

export interface FlowLayout {
  y: number
  amplitude: number
  frequency: number
  phase: number
  width: number
}

export interface ParticleLayout {
  x: number
  y: number
  phase: number
  size: number
  drift: number
}

export interface VisualLayout {
  seed: string
  baseHue: number
  baseShapes: BaseShapeLayout[]
  flows: FlowLayout[]
  particles: ParticleLayout[]
}

export interface VisualState {
  input: SoundVisualInput
  mood: Mood
  profile: MoodProfile
  palette: VisualPalette
  layout: VisualLayout
}
