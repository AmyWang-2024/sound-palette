import { AiGenerationError } from './errors'
import { parseStructuredSoundCaption } from './structured-caption'
import type {
  CaptionProvider,
  CaptionProviderInput,
  StructuredSoundCaption,
} from './types'
import type { CaptionCallMetric } from './caption-metrics'

export const QWEN3_OMNI_CANDIDATE_MODEL =
  'Qwen3-Omni-30B-A3B-Captioner'

export interface QwenCaptionTransportResult {
  output: unknown
  providerRequestId: string
  latencyMs: number
  costMicros: number
}

export interface QwenCaptionTransport {
  invoke(input: {
    model: typeof QWEN3_OMNI_CANDIDATE_MODEL
    jobId: string
    temporaryAudioToken: string
    summary: CaptionProviderInput['summary']
    responseSchemaVersion: 1
  }): Promise<QwenCaptionTransportResult>
  repairStructuredOutput?(
    invalidOutput: unknown,
  ): Promise<QwenCaptionTransportResult>
}

export class QwenCaptionTransportError extends Error {
  readonly transient: boolean

  constructor(transient: boolean) {
    super('Qwen caption transport failed')
    this.name = 'QwenCaptionTransportError'
    this.transient = transient
  }
}

export interface QwenCandidateConfig {
  enabled: boolean
  verifiedMainlandRegion: boolean
}

export const DEFAULT_QWEN_CANDIDATE_CONFIG: Readonly<QwenCandidateConfig> = {
  enabled: false,
  verifiedMainlandRegion: false,
}

function safeMetric(
  result: QwenCaptionTransportResult,
  status: CaptionCallMetric['status'],
): CaptionCallMetric {
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

export class Qwen3OmniCandidateProvider implements CaptionProvider {
  readonly id = 'qwen3-omni-candidate-unverified'
  readonly transport: QwenCaptionTransport
  readonly config: QwenCandidateConfig
  readonly metrics: CaptionCallMetric[] = []
  readonly providerRequestIds: string[] = []

  constructor(
    transport: QwenCaptionTransport,
    config: QwenCandidateConfig = {
      ...DEFAULT_QWEN_CANDIDATE_CONFIG,
    },
  ) {
    this.transport = transport
    this.config = config
  }

  async caption(
    input: CaptionProviderInput,
  ): Promise<StructuredSoundCaption> {
    if (!this.config.enabled || !this.config.verifiedMainlandRegion) {
      throw new AiGenerationError('PROVIDER_UNAVAILABLE')
    }

    const transportInput: Parameters<QwenCaptionTransport['invoke']>[0] = {
      model: QWEN3_OMNI_CANDIDATE_MODEL,
      jobId: input.jobId,
      temporaryAudioToken: input.audioToken,
      summary: input.summary,
      responseSchemaVersion: 1 as const,
    }
    let initialResult: QwenCaptionTransportResult
    try {
      initialResult = await this.transport.invoke(transportInput)
    } catch (error) {
      if (
        error instanceof QwenCaptionTransportError &&
        error.transient
      ) {
        this.metrics.push({
          status: 'failed',
          latencyMs: 0,
          costMicros: 0,
        })
        try {
          initialResult = await this.transport.invoke(transportInput)
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

    let repairResult: QwenCaptionTransportResult | undefined
    try {
      const caption = await parseStructuredSoundCaption(
        initialResult.output,
        this.transport.repairStructuredOutput
          ? async (invalidOutput) => {
              repairResult =
                await this.transport.repairStructuredOutput?.(
                  invalidOutput,
                )
              if (!repairResult) {
                throw new AiGenerationError('CAPTION_INVALID_RESPONSE')
              }
              return repairResult.output
            }
          : undefined,
      )

      if (repairResult) {
        this.#recordTransportResult(initialResult, 'failed')
        this.#recordTransportResult(repairResult, 'succeeded')
      } else {
        this.#recordTransportResult(initialResult, 'succeeded')
      }

      return caption
    } catch (error) {
      this.#recordTransportResult(initialResult, 'failed')
      if (repairResult) {
        this.#recordTransportResult(repairResult, 'failed')
      }
      if (error instanceof AiGenerationError) {
        throw error
      }
      this.metrics.push({ status: 'failed', latencyMs: 0, costMicros: 0 })
      throw new AiGenerationError('CAPTION_INVALID_RESPONSE')
    }
  }

  #recordTransportResult(
    result: QwenCaptionTransportResult,
    status: CaptionCallMetric['status'],
  ): void {
    this.metrics.push(safeMetric(result, status))
    const requestId = result.providerRequestId
      .replace(/[^A-Za-z0-9._:-]/g, '')
      .slice(0, 120)
    if (requestId) {
      this.providerRequestIds.push(requestId)
    }
  }
}
