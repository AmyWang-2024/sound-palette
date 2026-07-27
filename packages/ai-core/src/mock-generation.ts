import { AiGenerationError } from './errors'
import {
  DEFAULT_AI_FEATURE_CONFIG,
  type AiFeatureConfig,
} from './config'
import type {
  AiGenerationRequest,
  AiGenerationResult,
  CaptionProvider,
  ImageProvider,
} from './types'

interface CachedRequest {
  fingerprint: string
  result: Promise<AiGenerationResult>
}

function requestFingerprint(request: AiGenerationRequest): string {
  return JSON.stringify({
    consentVersion: request.consentVersion,
    mood: request.mood,
    summary: request.summary,
    audioToken: request.audioToken,
    clientVersion: request.clientVersion,
  })
}

export class MockGenerationService {
  readonly config: AiFeatureConfig
  readonly captionProvider: CaptionProvider
  readonly imageProvider: ImageProvider
  #requests = new Map<string, CachedRequest>()

  constructor(options: {
    captionProvider: CaptionProvider
    imageProvider: ImageProvider
    config?: AiFeatureConfig
  }) {
    this.captionProvider = options.captionProvider
    this.imageProvider = options.imageProvider
    this.config = options.config ?? { ...DEFAULT_AI_FEATURE_CONFIG }
  }

  generate(request: AiGenerationRequest): Promise<AiGenerationResult> {
    if (!this.config.enabled) {
      return Promise.reject(new AiGenerationError('AI_FEATURE_DISABLED'))
    }
    if (this.config.allowRealProviders) {
      return Promise.reject(new AiGenerationError('PROVIDER_UNAVAILABLE'))
    }

    const fingerprint = requestFingerprint(request)
    const existing = this.#requests.get(request.jobId)
    if (existing) {
      return existing.fingerprint === fingerprint
        ? existing.result
        : Promise.reject(
            new AiGenerationError('IDEMPOTENCY_CONFLICT'),
          )
    }

    const result = this.#run(request)
    this.#requests.set(request.jobId, { fingerprint, result })
    return result
  }

  async #run(
    request: AiGenerationRequest,
  ): Promise<AiGenerationResult> {
    const caption = await this.captionProvider.caption({
      jobId: request.jobId,
      audioToken: request.audioToken,
      summary: request.summary,
    })
    const image = await this.imageProvider.generate({
      jobId: request.jobId,
      caption,
      mood: request.mood,
      summary: request.summary,
    })

    return {
      jobId: request.jobId,
      status: 'succeeded',
      caption,
      image,
      captionProvider: this.captionProvider.id,
      imageProvider: this.imageProvider.id,
    }
  }
}
