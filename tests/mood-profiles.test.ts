import { describe, expect, it } from 'vitest'
import { createMoodPalette, MOOD_PROFILES } from '../src/mood-profiles'
import { MOODS } from '../src/types'

describe('mood profiles', () => {
  it('provides a clearly distinct profile for every mood', () => {
    const profiles = MOODS.map((mood) => MOOD_PROFILES[mood])

    expect(new Set(profiles.map((profile) => profile.brightness)).size).toBe(3)
    expect(new Set(profiles.map((profile) => profile.motionSpeed)).size).toBe(3)
    expect(new Set(profiles.map((profile) => profile.expansion)).size).toBe(3)
    expect(new Set(profiles.map((profile) => profile.drift)).size).toBe(3)
  })

  it('changes the full palette rather than only the background', () => {
    const palettes = MOODS.map((mood) => createMoodPalette(214, mood))

    expect(new Set(palettes.map((palette) => palette.background)).size).toBe(3)
    expect(new Set(palettes.map((palette) => palette.base)).size).toBe(3)
    expect(new Set(palettes.map((palette) => palette.flow)).size).toBe(3)
    expect(new Set(palettes.map((palette) => palette.sparkle)).size).toBe(3)
  })
})
