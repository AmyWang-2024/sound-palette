import { describe, expect, it } from 'vitest'
import {
  PCM_FFT_SIZE,
  PCM_SAMPLE_RATE,
  PcmFrameAnalyzer,
  decodePcm16Le,
} from '../packages/core/src'

function pcmSine(frequency: number, sampleCount = PCM_FFT_SIZE): ArrayBuffer {
  const buffer = new ArrayBuffer(sampleCount * 2)
  const view = new DataView(buffer)

  for (let index = 0; index < sampleCount; index += 1) {
    const value = Math.sin((Math.PI * 2 * frequency * index) / PCM_SAMPLE_RATE)
    view.setInt16(index * 2, Math.round(value * 24_000), true)
  }

  return buffer
}

describe('PCM 16-bit little-endian analysis', () => {
  it('decodes signed little-endian samples into normalized floats', () => {
    const buffer = new ArrayBuffer(6)
    const view = new DataView(buffer)
    view.setInt16(0, -32_768, true)
    view.setInt16(2, 0, true)
    view.setInt16(4, 32_767, true)

    expect(Array.from(decodePcm16Le(buffer))).toEqual([-1, 0, 1])
  })

  it.each([
    { frequency: 100, dominant: 'lowEnergy' },
    { frequency: 1_000, dominant: 'midEnergy' },
    { frequency: 4_000, dominant: 'highEnergy' },
  ] as const)('maps a $frequency Hz tone to $dominant', ({ frequency, dominant }) => {
    const analyzer = new PcmFrameAnalyzer()
    const [frame] = analyzer.push(pcmSine(frequency))
    const otherBands = (['lowEnergy', 'midEnergy', 'highEnergy'] as const)
      .filter((band) => band !== dominant)
      .map((band) => frame[band])

    expect(frame[dominant]).toBeGreaterThan(Math.max(...otherBands))
    expect(frame.loudness).toBeGreaterThan(0)
  })

  it('carries an odd trailing byte without retaining the original buffer', () => {
    const analyzer = new PcmFrameAnalyzer()
    const source = new Uint8Array(pcmSine(440))
    const first = source.slice(0, 1_777)
    const second = source.slice(1_777)

    expect(analyzer.push(first.buffer)).toHaveLength(0)
    expect(analyzer.diagnostics().trailingBytes).toBe(1)
    expect(analyzer.push(second.buffer)).toHaveLength(1)
    expect(analyzer.diagnostics()).toMatchObject({
      receivedBytes: PCM_FFT_SIZE * 2,
      decodedSamples: PCM_FFT_SIZE,
      analyzedFrames: 1,
      trailingBytes: 0,
      bufferedSamples: 0,
    })
  })

  it('clears all transient PCM-derived state on reset', () => {
    const analyzer = new PcmFrameAnalyzer()
    analyzer.push(pcmSine(440))
    analyzer.reset()

    expect(analyzer.diagnostics()).toEqual({
      receivedBytes: 0,
      decodedSamples: 0,
      analyzedFrames: 0,
      trailingBytes: 0,
      bufferedSamples: 0,
    })
  })
})
