/// <reference types="miniprogram-api-typings" />

import {
  MOOD_PROFILES,
  type ArtworkTags,
  type Mood,
  type SoundSummary,
  type VisualState,
} from '../vendor/shared-core'
import { drawSoundPalette } from './canvas-renderer'

export const MINI_EXPORT_WIDTH = 1080
export const MINI_EXPORT_HEIGHT = 1440

export const MINI_EXPORT_LAYOUT = {
  artwork: { x: 72, y: 142, width: 936, height: 790 },
  contentTop: 1_006,
  footerBaseline: 1_382,
} as const

export interface MiniArtworkExportData {
  state: VisualState
  summary: SoundSummary
  mood: Mood
  tags: ArtworkTags
  createdAt: Date
}

type MiniCanvasContext =
  WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatMiniExportTimestamp(date: Date): string {
  return [
    date.getFullYear(),
    '.',
    twoDigits(date.getMonth() + 1),
    '.',
    twoDigits(date.getDate()),
    ' ',
    twoDigits(date.getHours()),
    ':',
    twoDigits(date.getMinutes()),
  ].join('')
}

export function createMiniExportFilename(date: Date): string {
  return [
    'sound-palette-',
    date.getFullYear(),
    twoDigits(date.getMonth() + 1),
    twoDigits(date.getDate()),
    '-',
    twoDigits(date.getHours()),
    twoDigits(date.getMinutes()),
    '.png',
  ].join('')
}

function roundedRect(
  context: MiniCanvasContext,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.arcTo(x + width, y, x + width, y + safeRadius, safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.arcTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
    safeRadius,
  )
  context.lineTo(x + safeRadius, y + height)
  context.arcTo(x, y + height, x, y + height - safeRadius, safeRadius)
  context.lineTo(x, y + safeRadius)
  context.arcTo(x, y, x + safeRadius, y, safeRadius)
  context.closePath()
}

function drawComposition(
  context: MiniCanvasContext,
  summary: SoundSummary,
): void {
  const entries = [
    ['基底', summary.composition.base, '#8d776d'],
    ['流动', summary.composition.flow, '#718e8a'],
    ['闪烁', summary.composition.sparkle, '#c9aa68'],
  ] as const
  const startX = 72
  const columnWidth = 292

  entries.forEach(([label, value, color], index) => {
    const x = startX + index * (columnWidth + 30)
    context.fillStyle = '#746d75'
    context.font = '500 24px sans-serif'
    context.fillText(label, x, 1_174)
    context.fillStyle = '#2e2930'
    context.font = '500 46px serif'
    context.fillText(`${Math.round(value * 100)}%`, x, 1_230)
    context.fillStyle = '#e1dcdd'
    context.fillRect(x, 1_252, columnWidth, 8)
    context.fillStyle = color
    context.fillRect(x, 1_252, columnWidth * value, 8)
  })
}

function drawTags(
  context: MiniCanvasContext,
  tags: ArtworkTags,
): void {
  const values = [tags.structure, tags.movement, tags.mood]
  let x = 72

  context.font = '500 24px sans-serif'
  for (const tag of values) {
    const width = Math.min(
      270,
      Math.ceil(context.measureText(tag).width) + 44,
    )
    roundedRect(context, x, 1_306, width, 48, 24)
    context.fillStyle = '#e1dadd'
    context.fill()
    context.fillStyle = '#4a424c'
    context.fillText(tag, x + 22, 1_338, width - 36)
    x += width + 14
  }
}

export function renderMiniArtworkCard(
  canvas: WechatMiniprogram.Canvas,
  data: MiniArtworkExportData,
): void {
  canvas.width = MINI_EXPORT_WIDTH
  canvas.height = MINI_EXPORT_HEIGHT
  const context = canvas.getContext('2d')
  const layout = MINI_EXPORT_LAYOUT

  context.save()
  context.globalAlpha = 1
  context.fillStyle = '#f1ece5'
  context.fillRect(0, 0, MINI_EXPORT_WIDTH, MINI_EXPORT_HEIGHT)
  context.fillStyle = '#2c272e'
  context.font = '600 25px sans-serif'
  context.fillText('S O U N D  P A L E T T E', 72, 80)
  context.textAlign = 'right'
  context.fillStyle = '#756e77'
  context.font = '400 22px sans-serif'
  context.fillText(
    formatMiniExportTimestamp(data.createdAt),
    1_008,
    80,
  )
  context.textAlign = 'left'

  context.save()
  roundedRect(
    context,
    layout.artwork.x,
    layout.artwork.y,
    layout.artwork.width,
    layout.artwork.height,
    34,
  )
  context.clip()
  context.translate(layout.artwork.x, layout.artwork.y)
  drawSoundPalette(
    context,
    { width: layout.artwork.width, height: layout.artwork.height },
    data.state,
    0,
  )
  context.restore()

  context.fillStyle = '#756e77'
  context.font = '600 21px sans-serif'
  context.fillText('本地声音可视化 · 声音未上传', 72, layout.contentTop)
  context.fillStyle = '#2d2830'
  context.font = '400 64px serif'
  context.fillText('我的声音相册', 72, 1_088)

  context.textAlign = 'right'
  context.fillStyle = '#5a505d'
  context.font = '500 30px sans-serif'
  context.fillText(
    `Mood · ${MOOD_PROFILES[data.mood].labelZh}`,
    1_008,
    1_082,
  )
  context.textAlign = 'left'

  drawComposition(context, data.summary)
  drawTags(context, data.tags)

  context.fillStyle = '#7b747c'
  context.font = '500 18px sans-serif'
  context.fillText('我的声音相册 · 在设备本地生成', 72, layout.footerBaseline)
  context.textAlign = 'right'
  context.fillText('sound palette / v0.1', 1_008, layout.footerBaseline)
  context.restore()
}

export function releaseMiniExportCanvas(
  canvas: WechatMiniprogram.Canvas,
): void {
  canvas.width = 1
  canvas.height = 1
}
