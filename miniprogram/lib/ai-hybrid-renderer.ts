/// <reference types="miniprogram-api-typings" />

import type { VisualState } from '../vendor/shared-core'
import { drawSoundPalette } from './canvas-renderer'

export const AI_HYBRID_WIDTH = 1080
export const AI_HYBRID_HEIGHT = 1440

type MiniCanvasContext =
  WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D

export interface AiHybridRenderData {
  baseImage: WechatMiniprogram.CanvasRenderingContext.CanvasImageSource
  state: VisualState
  captionPreview: string[]
  createdAtLabel: string
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

export function renderAiHybridArtwork(
  canvas: WechatMiniprogram.Canvas,
  data: AiHybridRenderData,
): void {
  canvas.width = AI_HYBRID_WIDTH
  canvas.height = AI_HYBRID_HEIGHT
  const context = canvas.getContext('2d')

  context.save()
  context.globalAlpha = 1
  context.fillStyle = '#17151a'
  context.fillRect(0, 0, AI_HYBRID_WIDTH, AI_HYBRID_HEIGHT)
  context.drawImage(
    data.baseImage,
    0,
    0,
    AI_HYBRID_WIDTH,
    AI_HYBRID_HEIGHT,
  )

  context.save()
  context.globalCompositeOperation = 'screen'
  drawSoundPalette(
    context,
    { width: AI_HYBRID_WIDTH, height: AI_HYBRID_HEIGHT },
    data.state,
    0,
    { drawBackground: false, maxParticles: 56 },
  )
  context.restore()

  const footer = context.createLinearGradient(
    0,
    AI_HYBRID_HEIGHT * 0.66,
    0,
    AI_HYBRID_HEIGHT,
  )
  footer.addColorStop(0, 'rgba(24, 21, 27, 0)')
  footer.addColorStop(1, 'rgba(24, 21, 27, 0.88)')
  context.fillStyle = footer
  context.fillRect(
    0,
    AI_HYBRID_HEIGHT * 0.62,
    AI_HYBRID_WIDTH,
    AI_HYBRID_HEIGHT * 0.38,
  )

  roundedRect(context, 824, 58, 184, 64, 32)
  context.fillStyle = 'rgba(30, 27, 33, 0.9)'
  context.fill()
  context.fillStyle = '#ffffff'
  context.font = '600 28px sans-serif'
  context.textAlign = 'center'
  context.fillText('AI 生成', 916, 100)
  context.textAlign = 'left'

  context.fillStyle = '#ffffff'
  context.font = '600 26px sans-serif'
  context.fillText('S O U N D  P A L E T T E', 72, 1_222)
  context.font = '400 22px sans-serif'
  context.fillStyle = 'rgba(255, 255, 255, 0.74)'
  context.fillText(data.createdAtLabel, 72, 1_266)

  const caption = data.captionPreview
    .slice(0, 3)
    .join(' · ')
    .slice(0, 42)
  context.font = '500 32px sans-serif'
  context.fillStyle = '#ffffff'
  context.fillText(caption || '声音线索不确定', 72, 1_344, 936)
  context.restore()
}

export function releaseAiHybridCanvas(
  canvas: WechatMiniprogram.Canvas,
): void {
  canvas.width = 1
  canvas.height = 1
}
