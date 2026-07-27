import { formatHex } from 'culori'
import type { Mood, MoodProfile, VisualPalette } from './types'

export const MOOD_PROFILES: Record<Mood, MoodProfile> = {
  good: {
    id: 'good',
    labelZh: '好',
    brightness: 0.78,
    chroma: 0.18,
    warmth: 18,
    expansion: 1.08,
    motionSpeed: 1.08,
    textureDensity: 0.72,
    edgeSoftness: 0.9,
    drift: 'outward',
  },
  neutral: {
    id: 'neutral',
    labelZh: '不好不坏',
    brightness: 0.64,
    chroma: 0.13,
    warmth: 0,
    expansion: 1,
    motionSpeed: 0.82,
    textureDensity: 0.84,
    edgeSoftness: 0.78,
    drift: 'balanced',
  },
  low: {
    id: 'low',
    labelZh: '不好',
    brightness: 0.5,
    chroma: 0.09,
    warmth: -16,
    expansion: 0.86,
    motionSpeed: 0.58,
    textureDensity: 1,
    edgeSoftness: 0.66,
    drift: 'inward',
  },
}

function wrapHue(value: number): number {
  return ((value % 360) + 360) % 360
}

function color(l: number, c: number, h: number, fallback: string): string {
  return formatHex({
    mode: 'oklch',
    l: Math.min(0.96, Math.max(0.08, l)),
    c: Math.min(0.24, Math.max(0, c)),
    h: wrapHue(h),
  }) ?? fallback
}

export function createMoodPalette(baseHue: number, mood: Mood): VisualPalette {
  const profile = MOOD_PROFILES[mood]
  const hue = wrapHue(baseHue + profile.warmth)

  return {
    background: color(
      profile.brightness + 0.14,
      profile.chroma * 0.28,
      hue + 22,
      '#f4f1eb',
    ),
    atmosphere: color(
      profile.brightness + 0.02,
      profile.chroma * 0.7,
      hue - 38,
      '#d6d7d3',
    ),
    base: color(profile.brightness - 0.09, profile.chroma, hue, '#a68b7c'),
    flow: color(
      profile.brightness + 0.08,
      profile.chroma * 0.92,
      hue + 76,
      '#82a3a0',
    ),
    sparkle: color(
      profile.brightness + 0.18,
      profile.chroma * 0.62,
      hue + 142,
      '#eee8d8',
    ),
  }
}
