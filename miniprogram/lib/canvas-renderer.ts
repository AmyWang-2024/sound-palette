/// <reference types="miniprogram-api-typings" />

import {
  deriveReactiveVisualMetrics,
  type ReactiveVisualMetrics,
  type VisualState,
} from '../vendor/shared-core'

const MINI_MAX_PARTICLES = 96

export interface CanvasViewport {
  width: number
  height: number
}

export interface DrawSoundPaletteOptions {
  maxParticles?: number
}

function drawBackground(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
): void {
  context.globalAlpha = 1
  context.fillStyle = state.palette.background
  context.fillRect(0, 0, viewport.width, viewport.height)

  const atmosphere = context.createRadialGradient(
    viewport.width * 0.72,
    viewport.height * 0.24,
    0,
    viewport.width * 0.72,
    viewport.height * 0.24,
    Math.max(viewport.width, viewport.height) * 0.72,
  )
  atmosphere.addColorStop(0, state.palette.atmosphere)
  atmosphere.addColorStop(1, state.palette.background)
  context.globalAlpha = 0.72
  context.fillStyle = atmosphere
  context.fillRect(0, 0, viewport.width, viewport.height)
}

function drawBaseShapes(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
  timeSeconds: number,
  reactive: ReactiveVisualMetrics,
): void {
  const shortestSide = Math.min(viewport.width, viewport.height)
  const speed = state.profile.motionSpeed * reactive.motionMultiplier

  state.layout.baseShapes.forEach((shape, index) => {
    const bandEnergy =
      index % 3 === 0
        ? reactive.lowDominance
        : index % 3 === 1
          ? reactive.midDominance
          : reactive.highDominance
    const soundScale = reactive.shapeScale * (0.72 + bandEnergy * 0.58)
    const phase = shape.phase + timeSeconds * speed * (0.18 + index * 0.025)
    const driftDirection = state.profile.drift === 'inward' ? -0.55 : 1
    const centerX =
      viewport.width *
      (shape.x +
        Math.sin(phase) * shape.driftX * driftDirection +
        (state.profile.drift === 'outward' ? (shape.x - 0.5) * 0.025 : 0))
    const centerY =
      viewport.height *
      (shape.y + Math.cos(phase * 0.86) * shape.driftY * driftDirection)
    const radius =
      shortestSide *
      shape.radius *
      state.profile.expansion *
      soundScale
    const glow = context.createRadialGradient(
      centerX,
      centerY,
      radius * 0.08,
      centerX,
      centerY,
      radius,
    )

    glow.addColorStop(0, index % 2 === 0 ? state.palette.base : state.palette.flow)
    glow.addColorStop(1, state.palette.background)
    context.save()
    context.translate(centerX, centerY)
    context.rotate(Math.sin(phase * 0.7) * 0.18)
    context.scale(shape.stretch, 1 / Math.max(0.72, shape.stretch * 0.86))
    context.beginPath()
    context.arc(0, 0, radius, 0, Math.PI * 2)
    context.globalAlpha =
      0.24 +
      state.profile.edgeSoftness * 0.2 +
      bandEnergy * 0.34 +
      reactive.loudness * 0.16
    context.fillStyle = glow
    context.fill()
    context.restore()
  })
}

function drawFlows(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
  timeSeconds: number,
  reactive: ReactiveVisualMetrics,
): void {
  state.layout.flows.forEach((flow, index) => {
    const phase =
      flow.phase +
      timeSeconds *
        state.profile.motionSpeed *
        reactive.motionMultiplier *
        (0.22 + index * 0.03)
    const baseline = viewport.height * flow.y
    const amplitude =
      viewport.height * flow.amplitude * reactive.flowAmplitude
    const offset = Math.sin(phase) * amplitude

    context.beginPath()
    context.moveTo(-viewport.width * 0.08, baseline + offset)
    context.bezierCurveTo(
      viewport.width * 0.25,
      baseline - amplitude,
      viewport.width * 0.65,
      baseline + amplitude,
      viewport.width * 1.08,
      baseline - offset * 0.7,
    )
    context.globalAlpha =
      0.1 + reactive.midDominance * 0.7 + reactive.change * 0.14
    context.strokeStyle = index % 2 === 0 ? state.palette.flow : state.palette.sparkle
    context.lineCap = 'round'
    context.lineWidth =
      Math.max(2, viewport.width * flow.width) *
      (0.45 + reactive.midDominance * 2.65 + reactive.change * 1.1)
    context.stroke()
  })
}

function drawParticles(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
  timeSeconds: number,
  reactive: ReactiveVisualMetrics,
  maxParticles: number,
): void {
  const density = state.profile.textureDensity * reactive.particleDensity
  const particleCount = Math.min(
    Math.min(MINI_MAX_PARTICLES, Math.max(0, maxParticles)),
    Math.max(6, Math.round(state.layout.particles.length * density * 0.72)),
  )

  for (let index = 0; index < particleCount; index += 1) {
    const particle = state.layout.particles[index]
    const phase =
      particle.phase +
      timeSeconds *
        state.profile.motionSpeed *
        reactive.motionMultiplier *
        particle.drift *
        0.14
    const x =
      viewport.width *
      (particle.x + Math.sin(phase) * 0.02 * (0.45 + reactive.change))
    const y =
      viewport.height *
      (particle.y + Math.cos(phase * 0.83) * 0.012 * particle.drift)
    const size =
      particle.size *
      (0.45 +
        reactive.highDominance * 2.8 +
        reactive.change * 0.85) *
      Math.max(1, viewport.width / 390)

    context.beginPath()
    context.arc(x, y, size, 0, Math.PI * 2)
    context.globalAlpha =
      0.12 + reactive.highDominance * 0.72 + reactive.change * 0.12
    context.fillStyle = state.palette.sparkle
    context.fill()
  }
}

function drawSoundPulse(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
  timeSeconds: number,
  reactive: ReactiveVisualMetrics,
): void {
  const shortestSide = Math.min(viewport.width, viewport.height)
  const pulse =
    0.08 +
    reactive.loudness * 0.25 +
    reactive.lowDominance * 0.1 +
    Math.sin(timeSeconds * (1.2 + reactive.change * 4.2)) *
      reactive.change *
      0.04
  const radius = shortestSide * pulse
  const centerX =
    viewport.width * (0.5 + (reactive.midDominance - 1 / 3) * 0.14)
  const centerY =
    viewport.height * (0.5 + (reactive.highDominance - 1 / 3) * 0.11)

  context.beginPath()
  context.arc(centerX, centerY, Math.max(8, radius), 0, Math.PI * 2)
  context.globalAlpha =
    0.06 + reactive.loudness * 0.26 + reactive.change * 0.24
  context.strokeStyle = state.palette.sparkle
  context.lineWidth =
    Math.max(1.5, viewport.width * 0.006) *
    (0.65 + reactive.change * 2.9)
  context.stroke()
}

export function drawSoundPalette(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
  timeSeconds: number,
  options: DrawSoundPaletteOptions = {},
): void {
  const reactive = deriveReactiveVisualMetrics(state.input)
  context.save()
  drawBackground(context, viewport, state)
  drawBaseShapes(context, viewport, state, timeSeconds, reactive)
  drawSoundPulse(context, viewport, state, timeSeconds, reactive)
  drawFlows(context, viewport, state, timeSeconds, reactive)
  drawParticles(
    context,
    viewport,
    state,
    timeSeconds,
    reactive,
    options.maxParticles ?? MINI_MAX_PARTICLES,
  )
  context.restore()
}
