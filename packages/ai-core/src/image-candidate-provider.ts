import { AiGenerationError } from './errors'
import {
  createDeterministicImagePrompt,
  type DeterministicImagePrompt,
} from './prompt-template'
import type {
  ImageProvider,
  ImageProviderInput,
  ImageProviderResult,
} from './types'

export type ImageCandidateId =
  | 'z-image-turbo'
  | 'hunyuan-image-fast'

export interface ImageCandidateConfig {
  candidate: ImageCandidateId
  enabled: boolean
  verifiedMainlandRegion: boolean
}

export const IMAGE_CANDIDATE_MODELS: Readonly<
  Record<ImageCandidateId, string>
> = {
  'z-image-turbo': 'Z-Image-Turbo candidate (unverified)',
  'hunyuan-image-fast': 'Hunyuan Image Fast candidate (unverified)',
}

export interface ImageCandidateTransportResult {
  imageToken: string
  width: number
  height: number
  mediaType: ImageProviderResult['mediaType']
  providerRequestId: string
  latencyMs: number
  costMicros: number
}

export interface ImageCandidateTransport {
  invoke(input: {
    model: string
    jobId: string
    prompt: DeterministicImagePrompt['prompt']
    negativePrompt: DeterministicImagePrompt['negativePrompt']
    promptHash: string
    seed: number
    width: 864
    height: 1152
    steps: 8
    promptExtend: false
    imageCount: 1
  }): Promise<ImageCandidateTransportResult>
}

export class ImageCandidateTransportError extends Error {
  readonly transient: boolean

  constructor(transient: boolean) {
    super('Image candidate transport failed')
    this.name = 'ImageCandidateTransportError'
    this.transient = transient
  }
}

export interface ImageCallMetric {
  status: 'succeeded' | 'failed'
  latencyMs: number
  costMicros: number
}

function safeMetric(
  result: ImageCandidateTransportResult,
  status: ImageCallMetric['status'],
): ImageCallMetric {
  return {
    status,
    latencyMs: Number.isFinite(result.latencyMs)
      ? Math.max(0, Math.round(result.latencyMs))
      : 0,
    costMicros: Number.isFinite(result.costMicros)
      ? Math.max(0, Math.round(result.costMicros))
      : 0,
  }
}

export class ControlledImageCandidateProvider implements ImageProvider {
  readonly id: string
  readonly transport: ImageCandidateTransport
  readonly config: ImageCandidateConfig
  readonly metrics: ImageCallMetric[] = []
  readonly providerRequestIds: string[] = []
  lastPromptHash?: string

  constructor(
    transport: ImageCandidateTransport,
    config: ImageCandidateConfig,
  ) {
    this.transport = transport
    this.config = config
    this.id = `${config.candidate}-candidate-unverified`
  }

  async generate(input: ImageProviderInput): Promise<ImageProviderResult> {
    if (!this.config.enabled || !this.config.verifiedMainlandRegion) {
      throw new AiGenerationError('PROVIDER_UNAVAILABLE')
    }

    const prompt = createDeterministicImagePrompt(input)
    this.lastPromptHash = prompt.promptHash
    const transportInput: Parameters<ImageCandidateTransport['invoke']>[0] = {
      model: IMAGE_CANDIDATE_MODELS[this.config.candidate],
      jobId: input.jobId,
      prompt: prompt.prompt,
      negativePrompt: prompt.negativePrompt,
      promptHash: prompt.promptHash,
      seed: prompt.seed,
      width: prompt.width,
      height: prompt.height,
      steps: prompt.steps,
      promptExtend: prompt.promptExtend,
      imageCount: 1,
    }
    let result: ImageCandidateTransportResult

    try {
      result = await this.transport.invoke(transportInput)
    } catch (error) {
      if (
        error instanceof ImageCandidateTransportError &&
        error.transient
      ) {
        this.metrics.push({
          status: 'failed',
          latencyMs: 0,
          costMicros: 0,
        })
        try {
          result = await this.transport.invoke(transportInput)
        } catch {
          this.metrics.push({
            status: 'failed',
            latencyMs: 0,
            costMicros: 0,
          })
          throw new AiGenerationError('PROVIDER_UNAVAILABLE')
        }
      } else {
        this.metrics.push({
          status: 'failed',
          latencyMs: 0,
          costMicros: 0,
        })
        throw new AiGenerationError('PROVIDER_UNAVAILABLE')
      }
    }

    if (
      result.width !== prompt.width ||
      result.height !== prompt.height ||
      !['image/mock', 'image/webp', 'image/jpeg'].includes(
        result.mediaType,
      ) ||
      !result.imageToken
    ) {
      this.metrics.push(safeMetric(result, 'failed'))
      throw new AiGenerationError('IMAGE_INVALID_RESPONSE')
    }

    this.metrics.push(safeMetric(result, 'succeeded'))
    const requestId = result.providerRequestId
      .replace(/[^A-Za-z0-9._:-]/g, '')
      .slice(0, 120)
    if (requestId) {
      this.providerRequestIds.push(requestId)
    }

    return {
      imageToken: result.imageToken,
      width: result.width,
      height: result.height,
      mediaType: result.mediaType,
    }
  }
}
