import { describe, expect, it } from 'vitest'
import {
  calculateAudioFrame,
  calculateBandEnergy,
  calculateRelativeLoudness,
  createSoundSummary,
  frequencyRangeToBins,
  summaryToVisualInput,
} from '../src/sound-summary'
import type { AudioFrame } from '../src/types'

describe('sound summary rules', () => {
  it('converts frequency ranges to FFT bins without hard-coded indexes', () => {
    expect(frequencyRangeToBins(40, 250, 48_000, 2048)).toEqual({
      start: 2,
      endExclusive: 11,
    })
    expect(frequencyRangeToBins(250, 2000, 48_000, 2048)).toEqual({
      start: 11,
      endExclusive: 86,
    })
    expect(frequencyRangeToBins(2000, 8000, 8000, 2048)).toEqual({
      start: 512,
      endExclusive: 1024,
    })
  })

  it('calculates bounded loudness and band energy', () => {
    expect(calculateRelativeLoudness(new Float32Array(32))).toBe(0)
    expect(calculateRelativeLoudness(new Float32Array(32).fill(0.123))).toBe(1)

    const spectrum = new Float32Array([-90, -50, -10])
    expect(calculateBandEnergy(spectrum, { start: 0, endExclusive: 1 }, -90, -10)).toBe(
      0,
    )
    expect(calculateBandEnergy(spectrum, { start: 2, endExclusive: 3 }, -90, -10)).toBe(
      1,
    )
  })

  it('normalizes a non-quiet composition to one', () => {
    const frames: AudioFrame[] = [
      {
        timestampMs: 0,
        loudness: 0.4,
        lowEnergy: 0.2,
        midEnergy: 0.3,
        highEnergy: 0.5,
        changeRate: 0.25,
      },
      {
        timestampMs: 16,
        loudness: 0.6,
        lowEnergy: 0.2,
        midEnergy: 0.3,
        highEnergy: 0.5,
        changeRate: 0.35,
      },
    ]
    const summary = createSoundSummary(frames, 10_000, 'summary-seed')
    const total =
      summary.composition.base +
      summary.composition.flow +
      summary.composition.sparkle

    expect(summary.quiet).toBe(false)
    expect(total).toBeCloseTo(1, 10)
    expect(summary.composition).toEqual({
      base: 0.2,
      flow: 0.3,
      sparkle: 0.5,
    })
  })

  it('keeps a silent composition empty instead of inventing proportions', () => {
    const summary = createSoundSummary(
      [
        {
          timestampMs: 0,
          loudness: 0,
          lowEnergy: 0,
          midEnergy: 0,
          highEnergy: 0,
          changeRate: 0,
        },
      ],
      10_000,
      'quiet-seed',
    )

    expect(summary.quiet).toBe(true)
    expect(summary.composition).toEqual({ base: 0, flow: 0, sparkle: 0 })
  })

  it('safely degrades NaN and Infinity before visual use', () => {
    const summary = createSoundSummary(
      [
        {
          timestampMs: Number.NaN,
          loudness: Number.NaN,
          lowEnergy: Number.POSITIVE_INFINITY,
          midEnergy: -2,
          highEnergy: 3,
          changeRate: Number.NaN,
        },
      ],
      Number.NaN,
      'invalid-seed',
    )

    expect(summary.durationMs).toBe(0)
    expect(summary.loudnessMean).toBe(0)
    expect(summary.highEnergy).toBe(1)
    expect(Object.values(summaryToVisualInput(summary)).every(Number.isFinite)).toBe(
      true,
    )
  })

  it('returns finite frame features and smooths change rate', () => {
    const previousFrame: AudioFrame = {
      timestampMs: 0,
      loudness: 0,
      lowEnergy: 0,
      midEnergy: 0,
      highEnergy: 0,
      changeRate: 0,
    }
    const frame = calculateAudioFrame({
      timestampMs: 16,
      timeDomain: new Float32Array(2048).fill(0.08),
      frequencyDomain: new Float32Array(1024).fill(-30),
      sampleRate: 48_000,
      fftSize: 2048,
      minDecibels: -90,
      maxDecibels: -10,
      previousFrame,
      previousChangeRate: 0.2,
    })

    expect(frame.changeRate).toBeGreaterThan(0)
    expect(
      Object.values(frame).every((value) => Number.isFinite(value)),
    ).toBe(true)
  })

  it('separates synthetic quiet, speech, low tone, and clap-like inputs', () => {
    const sampleRate = 48_000
    const fftSize = 2048
    const spectrumFor = (
      range: ReturnType<typeof frequencyRangeToBins> | undefined,
    ): Float32Array => {
      const spectrum = new Float32Array(fftSize / 2).fill(-90)

      if (range) {
        spectrum.fill(-20, range.start, range.endExclusive)
      }

      return spectrum
    }
    const lowRange = frequencyRangeToBins(40, 250, sampleRate, fftSize)
    const midRange = frequencyRangeToBins(250, 2000, sampleRate, fftSize)
    const highRange = frequencyRangeToBins(2000, 8000, sampleRate, fftSize)
    const quiet = calculateAudioFrame({
      timestampMs: 0,
      timeDomain: new Float32Array(fftSize),
      frequencyDomain: spectrumFor(undefined),
      sampleRate,
      fftSize,
      minDecibels: -90,
      maxDecibels: -10,
    })
    const speech = calculateAudioFrame({
      timestampMs: 16,
      timeDomain: new Float32Array(fftSize).fill(0.05),
      frequencyDomain: spectrumFor(midRange),
      sampleRate,
      fftSize,
      minDecibels: -90,
      maxDecibels: -10,
      previousFrame: quiet,
    })
    const lowTone = calculateAudioFrame({
      timestampMs: 32,
      timeDomain: new Float32Array(fftSize).fill(0.08),
      frequencyDomain: spectrumFor(lowRange),
      sampleRate,
      fftSize,
      minDecibels: -90,
      maxDecibels: -10,
      previousFrame: speech,
      previousChangeRate: speech.changeRate,
    })
    const clap = calculateAudioFrame({
      timestampMs: 48,
      timeDomain: new Float32Array(fftSize).fill(0.123),
      frequencyDomain: spectrumFor(highRange),
      sampleRate,
      fftSize,
      minDecibels: -90,
      maxDecibels: -10,
      previousFrame: quiet,
    })

    expect(quiet.loudness).toBe(0)
    expect(speech.midEnergy).toBeGreaterThan(speech.lowEnergy)
    expect(lowTone.lowEnergy).toBeGreaterThan(lowTone.midEnergy)
    expect(clap.highEnergy).toBeGreaterThan(clap.lowEnergy)
    expect(clap.changeRate).toBeGreaterThan(quiet.changeRate)
  })
})
