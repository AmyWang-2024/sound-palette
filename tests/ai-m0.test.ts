import { describe, expect, it } from 'vitest'
import {
  AiGenerationError,
  MOCK_AI_REQUEST,
  MockCaptionProvider,
  MockGenerationService,
  MockImageProvider,
  createAiFeatureConfig,
} from '../packages/ai-core/src'

function service(options: {
  enabled?: boolean
  captionFailure?: ConstructorParameters<typeof MockCaptionProvider>[0]
  imageFailure?: ConstructorParameters<typeof MockImageProvider>[0]
} = {}) {
  const caption = new MockCaptionProvider(options.captionFailure)
  const image = new MockImageProvider(options.imageFailure)
  const generation = new MockGenerationService({
    captionProvider: caption,
    imageProvider: image,
    config: createAiFeatureConfig({ enabled: options.enabled }),
  })
  return { caption, image, generation }
}

describe('AI-M0 feature flag and mock providers', () => {
  it('keeps AI disabled by default without calling a provider', async () => {
    const { caption, image, generation } = service()

    await expect(generation.generate({ ...MOCK_AI_REQUEST })).rejects.toMatchObject({
      code: 'AI_FEATURE_DISABLED',
    })
    expect(caption.calls).toBe(0)
    expect(image.calls).toBe(0)
  })

  it('runs a deterministic local-only mock flow when explicitly enabled', async () => {
    const { caption, image, generation } = service({ enabled: true })
    const result = await generation.generate({ ...MOCK_AI_REQUEST })

    expect(result.status).toBe('succeeded')
    expect(result.image).toMatchObject({
      width: 864,
      height: 1152,
      mediaType: 'image/mock',
    })
    expect(result.image.imageToken).toMatch(/^mock:\/\//)
    expect(caption.calls).toBe(1)
    expect(image.calls).toBe(1)
  })

  it('returns the same task without duplicate provider calls', async () => {
    const { caption, image, generation } = service({ enabled: true })
    const first = await generation.generate({ ...MOCK_AI_REQUEST })
    const second = await generation.generate({ ...MOCK_AI_REQUEST })

    expect(second).toEqual(first)
    expect(caption.calls).toBe(1)
    expect(image.calls).toBe(1)
  })

  it('rejects a reused job id with different input', async () => {
    const { generation } = service({ enabled: true })
    await generation.generate({ ...MOCK_AI_REQUEST })

    await expect(
      generation.generate({ ...MOCK_AI_REQUEST, mood: 'good' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })

  it('does not call the image provider when captioning fails', async () => {
    const { caption, image, generation } = service({
      enabled: true,
      captionFailure: 'CAPTION_TIMEOUT',
    })

    await expect(
      generation.generate({ ...MOCK_AI_REQUEST }),
    ).rejects.toBeInstanceOf(AiGenerationError)
    expect(caption.calls).toBe(1)
    expect(image.calls).toBe(0)
  })
})
