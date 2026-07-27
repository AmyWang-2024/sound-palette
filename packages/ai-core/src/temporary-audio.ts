import { AiGenerationError } from './errors'
import { sanitizeStructuredSoundCaption } from './structured-caption'
import type {
  CaptionProvider,
  StructuredSoundCaption,
} from './types'
import type { SoundVisualInput } from '../../core/src'

export const MAX_TEMPORARY_PCM_TTL_MS = 10 * 60_000
export const MAX_TEMPORARY_PCM_BYTES = 512_000

export type AudioDeletionReason =
  | 'caption_succeeded'
  | 'caption_failed'
  | 'canceled'
  | 'timeout'
  | 'ttl'

export interface AudioDeletionEvidence {
  jobId: string
  reason: AudioDeletionReason
  status: 'deleted' | 'already-missing' | 'failed'
  createdAt: number
  errorCode?: 'AUDIO_DELETE_UNCONFIRMED'
}

interface TemporaryAudioEntry {
  jobId: string
  bytes: Uint8Array
  expiresAt: number
}

function safeTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

export class InMemoryTemporaryAudioStore {
  readonly deletionEvidence: AudioDeletionEvidence[] = []
  #entries = new Map<string, TemporaryAudioEntry>()
  #deleteFailures = new Set<string>()

  create(
    jobId: string,
    pcm: Uint8Array,
    consentConfirmed: boolean,
    now: number,
    ttlMs = MAX_TEMPORARY_PCM_TTL_MS,
  ): string {
    if (!consentConfirmed) {
      throw new AiGenerationError('CONSENT_REQUIRED')
    }
    if (
      !/^[A-Za-z0-9_-]{8,80}$/.test(jobId) ||
      pcm.byteLength < 1 ||
      pcm.byteLength > MAX_TEMPORARY_PCM_BYTES
    ) {
      throw new AiGenerationError('INVALID_AUDIO')
    }

    const timestamp = safeTime(now)
    const safeTtl = Math.min(
      MAX_TEMPORARY_PCM_TTL_MS,
      Math.max(1, Math.round(ttlMs)),
    )
    const token = `memory-audio:${jobId}`
    this.#entries.set(token, {
      jobId,
      bytes: new Uint8Array(pcm),
      expiresAt: timestamp + safeTtl,
    })

    return token
  }

  read(token: string, jobId: string, now: number): Uint8Array {
    const entry = this.#entries.get(token)
    if (!entry || entry.jobId !== jobId || safeTime(now) > entry.expiresAt) {
      throw new AiGenerationError('INVALID_AUDIO')
    }

    return new Uint8Array(entry.bytes)
  }

  delete(
    token: string,
    jobId: string,
    reason: AudioDeletionReason,
    now: number,
  ): AudioDeletionEvidence {
    const entry = this.#entries.get(token)
    if (!entry || entry.jobId !== jobId) {
      const evidence: AudioDeletionEvidence = {
        jobId,
        reason,
        status: 'already-missing',
        createdAt: safeTime(now),
      }
      this.deletionEvidence.push(evidence)
      return evidence
    }

    if (this.#deleteFailures.has(jobId)) {
      const evidence: AudioDeletionEvidence = {
        jobId,
        reason,
        status: 'failed',
        createdAt: safeTime(now),
        errorCode: 'AUDIO_DELETE_UNCONFIRMED',
      }
      this.deletionEvidence.push(evidence)
      return evidence
    }

    entry.bytes.fill(0)
    this.#entries.delete(token)
    const evidence: AudioDeletionEvidence = {
      jobId,
      reason,
      status: 'deleted',
      createdAt: safeTime(now),
    }
    this.deletionEvidence.push(evidence)
    return evidence
  }

  sweepExpired(now: number): number {
    let deleted = 0
    const timestamp = safeTime(now)

    for (const [token, entry] of this.#entries) {
      if (timestamp > entry.expiresAt) {
        const evidence = this.delete(
          token,
          entry.jobId,
          'ttl',
          timestamp,
        )
        if (evidence.status === 'deleted') {
          deleted += 1
        }
      }
    }

    return deleted
  }

  has(token: string): boolean {
    return this.#entries.has(token)
  }

  failDeletionForTest(jobId: string): void {
    this.#deleteFailures.add(jobId)
  }
}

export interface SafeCaptionPipelineInput {
  jobId: string
  pcm: Uint8Array
  consentConfirmed: boolean
  summary: SoundVisualInput
  now: number
  cancellationRequested?: () => boolean
}

export interface SafeCaptionPipelineResult {
  caption: StructuredSoundCaption
  deletion: AudioDeletionEvidence
}

export class SafeCaptionPipeline {
  readonly provider: CaptionProvider
  readonly audioStore: InMemoryTemporaryAudioStore

  constructor(
    provider: CaptionProvider,
    audioStore = new InMemoryTemporaryAudioStore(),
  ) {
    this.provider = provider
    this.audioStore = audioStore
  }

  async execute(
    input: SafeCaptionPipelineInput,
  ): Promise<SafeCaptionPipelineResult> {
    const token = this.audioStore.create(
      input.jobId,
      input.pcm,
      input.consentConfirmed,
      input.now,
    )
    let reason: AudioDeletionReason = 'caption_failed'
    let caption: StructuredSoundCaption | undefined
    let pipelineError: unknown

    try {
      if (input.cancellationRequested?.()) {
        reason = 'canceled'
        throw new AiGenerationError('JOB_CANCELED')
      }

      // Reading proves that only the short-lived in-memory token can resolve
      // the bytes. The provider receives the opaque token, never a Base64 copy.
      this.audioStore.read(token, input.jobId, input.now)
      caption = sanitizeStructuredSoundCaption(
        await this.provider.caption({
          jobId: input.jobId,
          audioToken: token,
          summary: input.summary,
        }),
      )

      if (input.cancellationRequested?.()) {
        reason = 'canceled'
        throw new AiGenerationError('JOB_CANCELED')
      }

      reason = 'caption_succeeded'
    } catch (error) {
      pipelineError = error
      if (
        error instanceof AiGenerationError &&
        error.code === 'CAPTION_TIMEOUT'
      ) {
        reason = 'timeout'
      }
      if (
        error instanceof AiGenerationError &&
        error.code === 'JOB_CANCELED'
      ) {
        reason = 'canceled'
      }
    }

    const deletion = this.audioStore.delete(
      token,
      input.jobId,
      reason,
      input.now,
    )
    if (deletion.status === 'failed') {
      throw new AiGenerationError('AUDIO_DELETE_UNCONFIRMED')
    }
    if (pipelineError) {
      throw pipelineError
    }
    if (!caption) {
      throw new AiGenerationError('CAPTION_INVALID_RESPONSE')
    }

    return { caption, deletion }
  }
}
