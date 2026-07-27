import { AiGenerationError, type AiErrorCode } from './errors'
import type {
  CaptionProvider,
  CaptionProviderInput,
  ImageProvider,
  ImageProviderInput,
  ImageProviderResult,
  StructuredSoundCaption,
} from './types'

export class MockCaptionProvider implements CaptionProvider {
  readonly id = 'mock-caption-v1'
  calls = 0
  readonly failure?: AiErrorCode

  constructor(failure?: AiErrorCode) {
    this.failure = failure
  }

  async caption(
    input: CaptionProviderInput,
  ): Promise<StructuredSoundCaption> {
    this.calls += 1
    if (this.failure) {
      throw new AiGenerationError(this.failure)
    }

    return {
      version: 1,
      environment: ['户外'],
      sources: ['细雨', '远处车辆'],
      dynamics:
        input.summary.changeRate > 0.5 ? ['间歇', '轻微脉冲'] : ['连续'],
      materials: ['半透明', '细颗粒'],
      spatial: ['开阔', '远近分层'],
      confidence: 'medium',
      containsSpeech: false,
    }
  }
}

export class MockImageProvider implements ImageProvider {
  readonly id = 'mock-image-v1'
  calls = 0
  readonly failure?: AiErrorCode

  constructor(failure?: AiErrorCode) {
    this.failure = failure
  }

  async generate(
    input: ImageProviderInput,
  ): Promise<ImageProviderResult> {
    this.calls += 1
    if (this.failure) {
      throw new AiGenerationError(this.failure)
    }

    return {
      imageToken: `mock://image/${input.jobId}/${input.mood}`,
      width: 864,
      height: 1152,
      mediaType: 'image/mock',
    }
  }
}
