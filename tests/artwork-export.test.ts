import { describe, expect, it } from 'vitest'
import {
  createExportFilename,
  EXPORT_HEIGHT,
  EXPORT_LAYOUT,
  EXPORT_WIDTH,
  formatExportTimestamp,
} from '../src/artwork-export'

describe('artwork export layout', () => {
  it('uses the required 1080 by 1440 canvas size', () => {
    expect(EXPORT_WIDTH).toBe(1080)
    expect(EXPORT_HEIGHT).toBe(1440)
  })

  it('keeps artwork, content, and footer within the card bounds', () => {
    const { artwork, contentTop, footerBaseline } = EXPORT_LAYOUT

    expect(artwork.x).toBeGreaterThanOrEqual(0)
    expect(artwork.y).toBeGreaterThanOrEqual(0)
    expect(artwork.x + artwork.width).toBeLessThanOrEqual(EXPORT_WIDTH)
    expect(artwork.y + artwork.height).toBeLessThan(contentTop)
    expect(contentTop).toBeLessThan(footerBaseline)
    expect(footerBaseline).toBeLessThan(EXPORT_HEIGHT)
  })

  it('creates a stable PNG filename without unsafe characters', () => {
    const date = new Date(2026, 0, 2, 3, 4)

    expect(createExportFilename(date)).toBe(
      'sound-palette-20260102-0304.png',
    )
    expect(formatExportTimestamp(date)).toContain('2026')
  })
})
