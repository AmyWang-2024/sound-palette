import { MOOD_PROFILES } from './mood-profiles'
import type { ArtworkTags } from './tag-rules'
import type { Mood, SoundSummary } from './types'

export const EXPORT_WIDTH = 1080
export const EXPORT_HEIGHT = 1440

export interface ArtworkExportData {
  artwork: CanvasImageSource
  summary: SoundSummary
  mood: Mood
  tags: ArtworkTags
  createdAt?: Date
  sourceLabel?: string
}

export interface ExportLayout {
  artwork: { x: number; y: number; width: number; height: number }
  contentTop: number
  footerBaseline: number
}

export const EXPORT_LAYOUT: ExportLayout = {
  artwork: {
    x: 72,
    y: 154,
    width: 936,
    height: 790,
  },
  contentTop: 1_016,
  footerBaseline: 1_374,
}

export function formatExportTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function createExportFilename(date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join('')

  return `sound-palette-${stamp}.png`
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const dimensions = image as unknown as {
    videoWidth?: number
    videoHeight?: number
    naturalWidth?: number
    naturalHeight?: number
    displayWidth?: number
    displayHeight?: number
    width?: number
    height?: number
  }
  const sourceWidth =
    dimensions.videoWidth ??
    dimensions.naturalWidth ??
    dimensions.displayWidth ??
    dimensions.width ??
    1
  const sourceHeight =
    dimensions.videoHeight ??
    dimensions.naturalHeight ??
    dimensions.displayHeight ??
    dimensions.height ??
    1
  const safeWidth = Math.max(1, sourceWidth)
  const safeHeight = Math.max(1, sourceHeight)
  const sourceRatio = safeWidth / safeHeight
  const targetRatio = width / height
  let cropX = 0
  let cropY = 0
  let cropWidth = safeWidth
  let cropHeight = safeHeight

  if (sourceRatio > targetRatio) {
    cropWidth = safeHeight * targetRatio
    cropX = (safeWidth - cropWidth) / 2
  } else {
    cropHeight = safeWidth / targetRatio
    cropY = (safeHeight - cropHeight) / 2
  }

  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    x,
    y,
    width,
    height,
  )
}

function drawComposition(
  context: CanvasRenderingContext2D,
  summary: SoundSummary,
): void {
  const entries = [
    ['基底声', summary.composition.base, '#8d776d'],
    ['流动声', summary.composition.flow, '#718e8a'],
    ['闪烁声', summary.composition.sparkle, '#c9aa68'],
  ] as const
  const startX = 72
  const columnWidth = 292

  entries.forEach(([label, value, color], index) => {
    const x = startX + index * (columnWidth + 30)
    const percentage = Math.round(value * 100)

    context.fillStyle = '#746d75'
    context.font =
      '500 24px Inter, "Segoe UI", system-ui, sans-serif'
    context.fillText(label, x, 1_174)
    context.fillStyle = '#2e2930'
    context.font =
      '500 46px Georgia, "Times New Roman", serif'
    context.fillText(`${percentage}%`, x, 1_230)
    context.fillStyle = '#e1dcdd'
    context.fillRect(x, 1_252, columnWidth, 8)
    context.fillStyle = color
    context.fillRect(x, 1_252, columnWidth * value, 8)
  })
}

export function composeArtworkCard(data: ArtworkExportData): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = EXPORT_WIDTH
  canvas.height = EXPORT_HEIGHT
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('当前浏览器无法创建导出画布。')
  }

  const createdAt = data.createdAt ?? new Date()
  const moodLabel = MOOD_PROFILES[data.mood].labelZh
  const layout = EXPORT_LAYOUT

  context.fillStyle = '#f1ece5'
  context.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT)
  context.fillStyle = '#2c272e'
  context.font =
    '600 25px Inter, "Segoe UI", system-ui, sans-serif'
  context.letterSpacing = '4px'
  context.fillText('SOUND PALETTE', 72, 80)
  context.letterSpacing = '0px'
  context.fillStyle = '#756e77'
  context.font =
    '400 22px Inter, "Segoe UI", system-ui, sans-serif'
  context.textAlign = 'right'
  context.fillText(formatExportTimestamp(createdAt), 1_008, 80)
  context.textAlign = 'left'

  context.save()
  context.beginPath()
  context.roundRect(
    layout.artwork.x,
    layout.artwork.y,
    layout.artwork.width,
    layout.artwork.height,
    34,
  )
  context.clip()
  drawImageCover(
    context,
    data.artwork,
    layout.artwork.x,
    layout.artwork.y,
    layout.artwork.width,
    layout.artwork.height,
  )
  context.restore()

  context.fillStyle = '#756e77'
  context.font =
    '600 21px Inter, "Segoe UI", system-ui, sans-serif'
  context.fillText(data.sourceLabel ?? '此刻的声音画', 72, layout.contentTop)
  context.fillStyle = '#2d2830'
  context.font =
    '400 64px Georgia, "Times New Roman", serif'
  context.fillText('此刻的声景', 72, 1_088)

  context.textAlign = 'right'
  context.fillStyle = '#5a505d'
  context.font =
    '500 30px Inter, "Segoe UI", system-ui, sans-serif'
  context.fillText(`Mood · ${moodLabel}`, 1_008, 1_082)
  context.textAlign = 'left'

  drawComposition(context, data.summary)

  const tags = [data.tags.structure, data.tags.movement, data.tags.mood]
  context.font =
    '500 24px Inter, "Segoe UI", system-ui, sans-serif'
  let tagX = 72

  for (const tag of tags) {
    const width = Math.ceil(context.measureText(tag).width) + 44
    context.fillStyle = '#e1dadd'
    context.beginPath()
    context.roundRect(tagX, 1_306, width, 48, 24)
    context.fill()
    context.fillStyle = '#4a424c'
    context.fillText(tag, tagX + 22, 1_338)
    tagX += width + 14
  }

  context.fillStyle = '#7b747c'
  context.font =
    '500 18px Inter, "Segoe UI", system-ui, sans-serif'
  context.fillText('声音调色盘 · 在设备本地生成', 72, layout.footerBaseline)
  context.textAlign = 'right'
  context.fillText('sound palette / v0.1', 1_008, layout.footerBaseline)
  context.textAlign = 'left'

  return canvas
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
        return
      }

      reject(new Error('PNG 生成失败，请稍后重试。'))
    }, 'image/png')
  })
}
