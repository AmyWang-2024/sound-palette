import { Application, Graphics } from 'pixi.js'
import { createNoise2D } from 'simplex-noise'
import seedrandom from 'seedrandom'
import type { Mood, SoundVisualInput, VisualState } from './types'
import {
  createVisualState,
  MAX_PARTICLES,
  updateVisualInput,
  updateVisualMood,
} from './visual-rules'

interface ArtEngineOptions {
  seed: string
  input: SoundVisualInput
  mood: Mood
}

const BASE_GEOMETRY_RADIUS = 100

export class ArtEngine {
  readonly application: Application

  #state: VisualState
  #timeSeconds = 0
  #reducedMotion: boolean
  #destroyed = false
  readonly #noise: ReturnType<typeof createNoise2D>
  readonly #motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  readonly #resizeObserver: ResizeObserver
  readonly #background = new Graphics()
  readonly #atmosphere = new Graphics()
  readonly #baseGraphics: Graphics[]
  readonly #flowGraphics: Graphics[]
  readonly #sparkles = new Graphics()

  private constructor(
    application: Application,
    container: HTMLElement,
    options: ArtEngineOptions,
  ) {
    this.application = application
    this.#state = createVisualState(options.seed, options.input, options.mood)
    this.#noise = createNoise2D(seedrandom(`${options.seed}:motion`))
    this.#reducedMotion = this.#motionPreference.matches
    this.#baseGraphics = this.#state.layout.baseShapes.map(() => new Graphics())
    this.#flowGraphics = this.#state.layout.flows.map(() => new Graphics())
    this.#resizeObserver = new ResizeObserver(() => {
      this.application.resize()
      this.#renderFrame()
    })

    this.application.stage.addChild(this.#background)
    this.application.stage.addChild(this.#atmosphere)
    this.application.stage.addChild(...this.#baseGraphics)
    this.application.stage.addChild(...this.#flowGraphics)
    this.application.stage.addChild(this.#sparkles)

    this.#applyPalette()
    this.application.ticker.add(this.#renderFrame)
    document.addEventListener('visibilitychange', this.#handleVisibility)
    window.addEventListener('orientationchange', this.#handleResize)
    this.#motionPreference.addEventListener('change', this.#handleMotionPreference)
    this.#resizeObserver.observe(container)
    this.#renderFrame()
  }

  static async create(
    container: HTMLElement,
    options: ArtEngineOptions,
  ): Promise<ArtEngine> {
    const application = new Application()

    await application.init({
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
      resizeTo: container,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    })

    application.canvas.setAttribute('aria-hidden', 'true')
    container.append(application.canvas)

    return new ArtEngine(application, container, options)
  }

  setInput(input: SoundVisualInput): void {
    this.#state = updateVisualInput(this.#state, input)
  }

  setMood(mood: Mood): void {
    if (mood === this.#state.mood) {
      return
    }

    this.#state = updateVisualMood(this.#state, mood)
    this.#applyPalette()
  }

  snapshot(): HTMLCanvasElement {
    this.#renderFrame()

    return this.application.renderer.extract.canvas({
      target: this.application.stage,
      antialias: true,
    }) as HTMLCanvasElement
  }

  destroy(): void {
    if (this.#destroyed) {
      return
    }

    this.#destroyed = true
    document.removeEventListener('visibilitychange', this.#handleVisibility)
    window.removeEventListener('orientationchange', this.#handleResize)
    this.#motionPreference.removeEventListener('change', this.#handleMotionPreference)
    this.#resizeObserver.disconnect()
    this.application.ticker.remove(this.#renderFrame)
    this.application.destroy(true, { children: true })
  }

  #applyPalette(): void {
    const { palette, profile } = this.#state

    this.#baseGraphics.forEach((graphics, index) => {
      graphics
        .clear()
        .circle(0, 0, BASE_GEOMETRY_RADIUS)
        .fill({
          color: index % 2 === 0 ? palette.base : palette.atmosphere,
          alpha: 0.2 + profile.edgeSoftness * 0.18,
        })
    })
  }

  readonly #renderFrame = (): void => {
    if (this.#destroyed) {
      return
    }

    const width = this.application.screen.width
    const height = this.application.screen.height

    if (width <= 0 || height <= 0) {
      return
    }

    const { input, layout, palette, profile } = this.#state
    const minimumDimension = Math.min(width, height)
    const motionScale = this.#reducedMotion ? 0.24 : 1
    const deltaSeconds = Math.min(this.application.ticker.deltaMS / 1000, 0.05)
    this.#timeSeconds += deltaSeconds * profile.motionSpeed * motionScale
    const time = this.#timeSeconds
    const driftDirection =
      profile.drift === 'outward' ? 1 : profile.drift === 'inward' ? -1 : 0

    this.#background
      .clear()
      .rect(0, 0, width, height)
      .fill({ color: palette.background, alpha: 1 })

    const atmospherePulse = 1 + Math.sin(time * 0.35) * 0.035 * input.loudness
    this.#atmosphere
      .clear()
      .circle(width * 0.2, height * 0.24, minimumDimension * 0.62 * atmospherePulse)
      .circle(width * 0.82, height * 0.74, minimumDimension * 0.55)
      .fill({
        color: palette.atmosphere,
        alpha: 0.1 + input.loudness * 0.08,
      })

    this.#baseGraphics.forEach((graphics, index) => {
      const shape = layout.baseShapes[index]
      const noiseX = this.#noise(shape.phase, time * 0.1)
      const noiseY = this.#noise(shape.phase + 12, time * 0.1)
      const outwardX = (shape.x - 0.5) * driftDirection * 0.04
      const outwardY = (shape.y - 0.5) * driftDirection * 0.04
      const activity = 0.45 + input.changeRate * 0.9
      const radius =
        minimumDimension *
        shape.radius *
        (0.66 + input.lowEnergy * 0.9) *
        (0.86 + input.loudness * 0.32) *
        profile.expansion

      graphics.position.set(
        width *
          (shape.x + noiseX * shape.driftX * activity + outwardX * profile.expansion),
        height *
          (shape.y + noiseY * shape.driftY * activity + outwardY * profile.expansion),
      )
      graphics.scale.set(
        (radius *
          shape.stretch *
          (1 + noiseX * 0.08 * input.changeRate)) /
          BASE_GEOMETRY_RADIUS,
        (radius * (1 + noiseY * 0.08 * input.changeRate)) /
          BASE_GEOMETRY_RADIUS,
      )
      graphics.alpha = 0.5 + input.lowEnergy * 0.42
    })

    this.#flowGraphics.forEach((graphics, index) => {
      const flow = layout.flows[index]
      const waveActivity = 0.45 + input.midEnergy * 1.2
      const movement = time * (0.22 + input.changeRate * 0.52)
      const strokeWidth =
        Math.max(1.5, minimumDimension * flow.width) *
        (0.5 + input.midEnergy * 1.25)

      graphics.clear()

      for (let point = 0; point <= 16; point += 1) {
        const progress = point / 16
        const x = progress * width
        const wave =
          Math.sin(
            progress * Math.PI * 2 * flow.frequency +
              flow.phase +
              movement,
          ) *
          height *
          flow.amplitude *
          waveActivity
        const organic =
          this.#noise(progress * 2 + flow.phase, time * 0.13 + index) *
          height *
          0.025 *
          input.changeRate
        const y = height * flow.y + wave + organic

        if (point === 0) {
          graphics.moveTo(x, y)
        } else {
          graphics.lineTo(x, y)
        }
      }

      graphics.stroke({
        color: palette.flow,
        width: strokeWidth,
        alpha: 0.2 + input.midEnergy * 0.5,
        cap: 'round',
        join: 'round',
      })
    })

    const activeParticleCount = Math.min(
      MAX_PARTICLES,
      Math.floor(
        (10 + input.highEnergy * (MAX_PARTICLES - 10)) *
          profile.textureDensity *
          (this.#reducedMotion ? 0.45 : 1),
      ),
    )

    this.#sparkles.clear()

    for (let index = 0; index < activeParticleCount; index += 1) {
      const particle = layout.particles[index]
      const drift =
        this.#noise(particle.phase, time * 0.18 * particle.drift) *
        input.changeRate
      const x =
        (particle.x +
          Math.sin(time * 0.16 + particle.phase) * 0.018 +
          drift * 0.016 +
          1) %
        1
      const y =
        (particle.y +
          Math.cos(time * 0.12 + particle.phase) * 0.016 +
          drift * 0.012 +
          1) %
        1
      const size =
        particle.size *
        (0.7 + input.highEnergy * 1.9) *
        (0.86 + input.loudness * 0.34)

      this.#sparkles.circle(x * width, y * height, size)
    }

    this.#sparkles.fill({
      color: palette.sparkle,
      alpha: 0.24 + input.highEnergy * 0.64,
    })
  }

  readonly #handleVisibility = (): void => {
    if (document.hidden) {
      this.application.ticker.stop()
      return
    }

    this.application.ticker.start()
  }

  readonly #handleResize = (): void => {
    this.application.resize()
    this.#renderFrame()
  }

  readonly #handleMotionPreference = (event: MediaQueryListEvent): void => {
    this.#reducedMotion = event.matches
  }
}
