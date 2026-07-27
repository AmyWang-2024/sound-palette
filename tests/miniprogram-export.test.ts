import { describe, expect, it } from 'vitest'
import {
  MINI_EXPORT_HEIGHT,
  MINI_EXPORT_LAYOUT,
  MINI_EXPORT_WIDTH,
  createMiniExportFilename,
  formatMiniExportTimestamp,
} from '../miniprogram/lib/artwork-export'

describe('W3 mini program artwork export contract', () => {
  it('uses a 1080 by 1440 portrait PNG layout', () => {
    expect(MINI_EXPORT_WIDTH).toBe(1080)
    expect(MINI_EXPORT_HEIGHT).toBe(1440)
    expect(
      MINI_EXPORT_LAYOUT.artwork.x + MINI_EXPORT_LAYOUT.artwork.width,
    ).toBeLessThanOrEqual(MINI_EXPORT_WIDTH)
    expect(
      MINI_EXPORT_LAYOUT.artwork.y + MINI_EXPORT_LAYOUT.artwork.height,
    ).toBeLessThan(MINI_EXPORT_LAYOUT.contentTop)
    expect(MINI_EXPORT_LAYOUT.footerBaseline).toBeLessThan(
      MINI_EXPORT_HEIGHT,
    )
  })

  it('creates stable reader-facing dates and safe PNG names', () => {
    const date = new Date(2026, 6, 27, 9, 5)

    expect(formatMiniExportTimestamp(date)).toBe('2026.07.27 09:05')
    expect(createMiniExportFilename(date)).toBe(
      'sound-palette-20260727-0905.png',
    )
  })
})
