import { describe, expect, it } from 'vitest'
import { detectShareCapabilities } from '../src/share-export'

function navigatorLike(
  overrides: Partial<Navigator> = {},
): Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> &
  Partial<Pick<Navigator, 'share' | 'canShare'>> {
  return {
    userAgent: 'Mozilla/5.0 Chrome/130',
    platform: 'Win32',
    maxTouchPoints: 0,
    ...overrides,
  }
}

describe('share capability detection', () => {
  it('recognizes iPhone and desktop-mode iPad', () => {
    expect(
      detectShareCapabilities(
        navigatorLike({
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)',
          platform: 'iPhone',
        }),
      ).iosLike,
    ).toBe(true)

    expect(
      detectShareCapabilities(
        navigatorLike({
          userAgent: 'Mozilla/5.0 Safari/605.1.15',
          platform: 'MacIntel',
          maxTouchPoints: 5,
        }),
      ).iosLike,
    ).toBe(true)
  })

  it('recognizes the WeChat embedded browser', () => {
    expect(
      detectShareCapabilities(
        navigatorLike({
          userAgent: 'Mozilla/5.0 MicroMessenger/8.0.50',
        }),
      ).weChat,
    ).toBe(true)
  })

  it('requires both share and canShare before attempting file share', () => {
    expect(detectShareCapabilities(navigatorLike()).canShareFiles).toBe(false)
    expect(
      detectShareCapabilities(
        navigatorLike({
          share: async () => undefined,
          canShare: () => true,
        }),
      ).canShareFiles,
    ).toBe(true)
  })
})
