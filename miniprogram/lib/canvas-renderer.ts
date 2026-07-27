/// <reference types="miniprogram-api-typings" />

import {
  deriveReactiveVisualMetrics,
  type ReactiveVisualMetrics,
  type SoundFeatureSample,
  type VisualState,
} from '../vendor/shared-core'

const MINI_MAX_PARTICLES = 96

export interface CanvasViewport {
  width: number
  height: number
}

export interface DrawSoundPaletteOptions {
  maxParticles?: number
  drawBackground?: boolean
}

function featureSamples(state: VisualState): SoundFeatureSample[] {
  if (state.featureSamples.length > 0) {
    return state.featureSamples
  }

  return Array.from({ length: 20 }, (_, index) => ({
    t: index / 19,
    ...state.input,
  }))
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
  const samples = featureSamples(state)
  state.layout.flows.forEach((flow, index) => {
    const sample = samples[index % samples.length]
    const phase =
      flow.phase +
      timeSeconds *
        state.profile.motionSpeed *
        reactive.motionMultiplier *
        (0.22 + index * 0.03)
    const baseline = viewport.height * flow.y
    const amplitude =
      viewport.height *
      flow.amplitude *
      reactive.flowAmplitude *
      (0.72 + sample.midEnergy * 0.68)
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
  const samples = featureSamples(state)
  const particleCount = Math.min(
    Math.min(MINI_MAX_PARTICLES, Math.max(0, maxParticles)),
    Math.max(6, Math.round(state.layout.particles.length * density * 0.72)),
  )

  for (let index = 0; index < particleCount; index += 1) {
    const particle = state.layout.particles[index]
    const sample = samples[index % samples.length]
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
      (particle.y +
        Math.cos(phase * 0.83) * 0.012 * particle.drift +
        (sample.highEnergy - 0.5) * 0.025)
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

function drawConcentricField(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
  timeSeconds: number,
): void {
  const samples = featureSamples(state)
  const shortestSide = Math.min(viewport.width, viewport.height)
  const anchor = state.layout.baseShapes[0]
  const centerX = viewport.width * (0.32 + anchor.x * 0.3)
  const centerY = viewport.height * (0.34 + anchor.y * 0.3)

  samples.forEach((sample, index) => {
    const progress = (index + 1) / samples.length
    const wobble =
      Math.sin(timeSeconds * 0.2 + index * 0.72) *
      shortestSide *
      0.008 *
      sample.changeRate
    const radius =
      shortestSide *
        (0.055 +
          progress * 0.42 +
          sample.lowEnergy * 0.035 +
          sample.loudness * 0.025) +
      wobble

    context.beginPath()
    context.ellipse(
      centerX + (sample.midEnergy - 0.5) * shortestSide * 0.04,
      centerY + (sample.highEnergy - 0.5) * shortestSide * 0.035,
      Math.max(4, radius * (0.86 + sample.lowEnergy * 0.2)),
      Math.max(4, radius),
      anchor.phase * 0.08,
      0,
      Math.PI * 2,
    )
    context.globalAlpha = 0.055 + sample.loudness * 0.16
    context.strokeStyle =
      index % 3 === 0 ? state.palette.sparkle : state.palette.flow
    context.lineWidth =
      Math.max(1, viewport.width * 0.0025) *
      (0.7 + sample.lowEnergy * 1.5)
    context.stroke()
  })
}

function drawVerticalRain(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
  timeSeconds: number,
): void {
  const samples = featureSamples(state)

  samples.forEach((sample, index) => {
    const x = viewport.width * (0.04 + sample.t * 0.92)
    const phase =
      (timeSeconds * (0.035 + sample.changeRate * 0.08) +
        sample.t * 1.7) %
      1
    const length =
      viewport.height *
      (0.09 + sample.midEnergy * 0.22 + sample.highEnergy * 0.2)
    const y = viewport.height * (phase * 1.25 - 0.2)

    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(
      x + (sample.midEnergy - sample.highEnergy) * viewport.width * 0.025,
      y + length,
    )
    context.globalAlpha = 0.07 + sample.loudness * 0.22
    context.strokeStyle =
      index % 4 === 0 ? state.palette.sparkle : state.palette.flow
    context.lineWidth =
      Math.max(1, viewport.width * 0.002) *
      (0.7 + sample.highEnergy * 1.8)
    context.lineCap = 'round'
    context.stroke()
  })
}

function drawRadialFingerprint(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
  timeSeconds: number,
): void {
  const samples = featureSamples(state)
  const shortestSide = Math.min(viewport.width, viewport.height)
  const centerX = viewport.width * 0.5
  const centerY = viewport.height * 0.5

  samples.forEach((sample, index) => {
    const angle = sample.t * Math.PI * 2 - Math.PI / 2
    const innerRadius =
      shortestSide * (0.12 + sample.lowEnergy * 0.08)
    const outerRadius =
      innerRadius +
      shortestSide *
        (0.09 +
          sample.loudness * 0.19 +
          sample.changeRate * 0.13) *
        (0.96 + Math.sin(timeSeconds * 0.5 + index) * 0.04)

    context.beginPath()
    context.moveTo(
      centerX + Math.cos(angle) * innerRadius,
      centerY + Math.sin(angle) * innerRadius,
    )
    context.lineTo(
      centerX + Math.cos(angle) * outerRadius,
      centerY + Math.sin(angle) * outerRadius,
    )
    context.globalAlpha = 0.08 + sample.changeRate * 0.34
    context.strokeStyle =
      index % 2 === 0 ? state.palette.sparkle : state.palette.flow
    context.lineWidth =
      Math.max(1, viewport.width * 0.0025) *
      (0.7 + sample.loudness * 1.6)
    context.stroke()
  })
}

function drawFracturedGrid(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
  timeSeconds: number,
): void {
  const samples = featureSamples(state)
  const columns = 4
  const rows = Math.ceil(samples.length / columns)
  const cellWidth = viewport.width / columns
  const cellHeight = viewport.height / rows

  samples.forEach((sample, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const left = column * cellWidth
    const top = row * cellHeight
    const fracture =
      (sample.changeRate - 0.5) * cellWidth * 0.24 +
      Math.sin(timeSeconds * 0.12 + index) * cellWidth * 0.015

    context.beginPath()
    context.moveTo(left + cellWidth * 0.08 + fracture, top + cellHeight * 0.1)
    context.lineTo(
      left + cellWidth * (0.88 - sample.highEnergy * 0.12),
      top + cellHeight * 0.04,
    )
    context.lineTo(
      left + cellWidth * 0.94,
      top + cellHeight * (0.82 + sample.midEnergy * 0.1),
    )
    context.lineTo(
      left + cellWidth * (0.12 + sample.lowEnergy * 0.12),
      top + cellHeight * 0.94,
    )
    context.closePath()
    context.globalAlpha = 0.035 + sample.loudness * 0.13
    context.fillStyle =
      index % 3 === 0 ? state.palette.base : state.palette.atmosphere
    context.fill()
    context.globalAlpha = 0.045 + sample.changeRate * 0.16
    context.strokeStyle = state.palette.flow
    context.lineWidth = Math.max(0.8, viewport.width * 0.0018)
    context.stroke()
  })
}

function drawCalmHorizon(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
  timeSeconds: number,
): void {
  const samples = featureSamples(state)

  samples.forEach((sample, index) => {
    const y =
      viewport.height *
      (0.22 +
        sample.t * 0.6 +
        Math.sin(timeSeconds * 0.08 + sample.t * Math.PI * 2) *
          0.008 *
          (0.2 + sample.changeRate))
    const inset = viewport.width * (0.04 + sample.loudness * 0.07)

    context.beginPath()
    context.moveTo(inset, y)
    context.bezierCurveTo(
      viewport.width * 0.32,
      y - viewport.height * sample.lowEnergy * 0.025,
      viewport.width * 0.68,
      y + viewport.height * sample.highEnergy * 0.025,
      viewport.width - inset,
      y,
    )
    context.globalAlpha = 0.035 + sample.loudness * 0.12
    context.strokeStyle =
      index % 5 === 0 ? state.palette.sparkle : state.palette.flow
    context.lineWidth =
      Math.max(1, viewport.width * 0.0022) *
      (0.7 + sample.midEnergy)
    context.stroke()
  })
}

function drawConstellationLinks(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
): void {
  const samples = featureSamples(state)
  context.beginPath()

  samples.forEach((sample, index) => {
    const x = viewport.width * (0.08 + sample.t * 0.84)
    const y =
      viewport.height *
      (0.18 +
        (1 - sample.highEnergy) * 0.58 +
        Math.sin(sample.t * Math.PI * 4) * sample.changeRate * 0.08)

    if (index === 0) {
      context.moveTo(x, y)
    } else {
      context.lineTo(x, y)
    }
  })

  context.globalAlpha = 0.09 + state.input.highEnergy * 0.2
  context.strokeStyle = state.palette.sparkle
  context.lineWidth = Math.max(1, viewport.width * 0.002)
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
  const maxParticles = options.maxParticles ?? MINI_MAX_PARTICLES
  context.save()
  if (options.drawBackground !== false) {
    drawBackground(context, viewport, state)
  }

  switch (state.recipeId) {
    case 'concentric-field':
      drawBaseShapes(context, viewport, state, timeSeconds, reactive)
      drawConcentricField(context, viewport, state, timeSeconds)
      break
    case 'flowing-ribbons':
      drawBaseShapes(context, viewport, state, timeSeconds, reactive)
      drawFlows(context, viewport, state, timeSeconds, reactive)
      drawFlows(context, viewport, state, timeSeconds + 2.6, reactive)
      break
    case 'particle-constellation':
      drawBaseShapes(context, viewport, state, timeSeconds, reactive)
      drawConstellationLinks(context, viewport, state)
      drawParticles(
        context,
        viewport,
        state,
        timeSeconds,
        reactive,
        maxParticles,
      )
      break
    case 'vertical-rain':
      drawBaseShapes(context, viewport, state, timeSeconds, reactive)
      drawVerticalRain(context, viewport, state, timeSeconds)
      break
    case 'radial-pulse':
      drawBaseShapes(context, viewport, state, timeSeconds, reactive)
      drawSoundPulse(context, viewport, state, timeSeconds, reactive)
      drawRadialFingerprint(context, viewport, state, timeSeconds)
      break
    case 'fractured-grid':
      drawFracturedGrid(context, viewport, state, timeSeconds)
      drawParticles(
        context,
        viewport,
        state,
        timeSeconds,
        reactive,
        Math.round(maxParticles * 0.5),
      )
      break
    case 'calm-horizon':
      drawBaseShapes(context, viewport, state, timeSeconds, reactive)
      drawCalmHorizon(context, viewport, state, timeSeconds)
      break
    case 'layered-paper':
    default:
      drawBaseShapes(context, viewport, state, timeSeconds, reactive)
      drawSoundPulse(context, viewport, state, timeSeconds, reactive)
      drawFlows(context, viewport, state, timeSeconds, reactive)
      drawParticles(
        context,
        viewport,
        state,
        timeSeconds,
        reactive,
        maxParticles,
      )
      break
  }
  context.restore()
}
