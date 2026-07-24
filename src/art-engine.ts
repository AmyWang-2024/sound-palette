import { Application } from 'pixi.js'

export async function createEmptyArtCanvas(container: HTMLElement): Promise<Application> {
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

  return application
}
