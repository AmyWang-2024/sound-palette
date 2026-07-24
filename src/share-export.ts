export interface ShareCapabilities {
  canShareFiles: boolean
  iosLike: boolean
  weChat: boolean
}

export function detectShareCapabilities(
  navigatorLike: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> &
    Partial<Pick<Navigator, 'share' | 'canShare'>>,
): ShareCapabilities {
  const userAgent = navigatorLike.userAgent
  const iosLike =
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (navigatorLike.platform === 'MacIntel' &&
      navigatorLike.maxTouchPoints > 1)
  const weChat = /MicroMessenger/i.test(userAgent)

  return {
    canShareFiles:
      typeof navigatorLike.share === 'function' &&
      typeof navigatorLike.canShare === 'function',
    iosLike,
    weChat,
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
