import type { VisualState } from '../vendor/shared-core'

const MINI_MAX_PARTICLES = 96

export interface CanvasViewport {
  width: number
  height: number
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
): void {
  const shortestSide = Math.min(viewport.width, viewport.height)
  const speed = state.profile.motionSpeed
  const loudnessScale = 0.84 + state.input.loudness * 0.42

  state.layout.baseShapes.forEach((shape, index) => {
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
      loudnessScale
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
    context.globalAlpha = 0.46 + state.profile.edgeSoftness * 0.28
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
): void {
  const flowStrength = 0.45 + state.input.midEnergy * 0.8

  state.layout.flows.forEach((flow, index) => {
    const phase =
      flow.phase + timeSeconds * state.profile.motionSpeed * (0.22 + index * 0.03)
    const baseline = viewport.height * flow.y
    const amplitude = viewport.height * flow.amplitude * flowStrength
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
    context.globalAlpha = 0.24 + state.input.midEnergy * 0.34
    context.strokeStyle = index % 2 === 0 ? state.palette.flow : state.palette.sparkle
    context.lineCap = 'round'
    context.lineWidth =
      Math.max(2, viewport.width * flow.width) * (0.75 + state.input.changeRate)
    context.stroke()
  })
}

function drawParticles(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
  timeSeconds: number,
): void {
  const density =
    state.profile.textureDensity * (0.28 + state.input.highEnergy * 0.72)
  const particleCount = Math.min(
    MINI_MAX_PARTICLES,
    Math.max(12, Math.round(state.layout.particles.length * density * 0.6)),
  )

  for (let index = 0; index < particleCount; index += 1) {
    const particle = state.layout.particles[index]
    const phase =
      particle.phase +
      timeSeconds * state.profile.motionSpeed * particle.drift * 0.14
    const x =
      viewport.width *
      (particle.x + Math.sin(phase) * 0.016 * (0.5 + state.input.changeRate))
    const y =
      viewport.height *
      (particle.y + Math.cos(phase * 0.83) * 0.012 * particle.drift)
    const size =
      particle.size *
      (0.72 + state.input.highEnergy * 1.35) *
      Math.max(1, viewport.width / 390)

    context.beginPath()
    context.arc(x, y, size, 0, Math.PI * 2)
    context.globalAlpha = 0.28 + state.input.highEnergy * 0.48
    context.fillStyle = state.palette.sparkle
    context.fill()
  }
}

export function drawSoundPalette(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  viewport: CanvasViewport,
  state: VisualState,
  timeSeconds: number,
): void {
  context.save()
  drawBackground(context, viewport, state)
  drawBaseShapes(context, viewport, state, timeSeconds)
  drawFlows(context, viewport, state, timeSeconds)
  drawParticles(context, viewport, state, timeSeconds)
  context.restore()
}
