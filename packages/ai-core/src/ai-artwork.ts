import type {
  Mood,
  SoundVisualInput,
} from '../../core/src'
import { AiGenerationError } from './errors'
import { sanitizeStructuredSoundCaption } from './structured-caption'
import type {
  ImageProviderResult,
  StructuredSoundCaption,
} from './types'

export const AI_SHARE_WIDTH = 1080
export const AI_SHARE_HEIGHT = 1440

export interface AiHybridArtworkManifest {
  version: 1
  mode: 'ai'
  jobId: string
  mood: Mood
  baseImage: ImageProviderResult
  summary: SoundVisualInput
  captionPreview: string[]
  promptHash: string
  createdAt: number
  share: {
    width: typeof AI_SHARE_WIDTH
    height: typeof AI_SHARE_HEIGHT
    explicitLabel: 'AI 生成'
    localSoundOverlay: true
    finalizeRequired: true
    implicitMetadata: 'pending-server-finalize'
  }
}

export type AiFinalizeVerification =
  | 'mock-only'
  | 'real-passed'
  | 'failed'

export interface FinalizedAiAssetEvidence {
  jobId: string
  outputVersion: string
  imageToken: string
  width: 1080
  height: 1440
  explicitLabelDetected: boolean
  implicitMetadataDetected: boolean
  verification: AiFinalizeVerification
  verifiedAt: number
}

export function createAiHybridArtworkManifest(input: {
  jobId: string
  mood: Mood
  baseImage: ImageProviderResult
  summary: SoundVisualInput
  caption: StructuredSoundCaption
  promptHash: string
  createdAt: number
}): AiHybridArtworkManifest {
  const validSummary = Object.values(input.summary).every(
    (value) => Number.isFinite(value) && value >= 0 && value <= 1,
  )
  if (
    !/^[A-Za-z0-9_-]{8,80}$/.test(input.jobId) ||
    !['good', 'neutral', 'low'].includes(input.mood) ||
    !validSummary ||
    input.baseImage.width !== 864 ||
    input.baseImage.height !== 1152 ||
    !/^[a-f0-9]{8}$/.test(input.promptHash)
  ) {
    throw new AiGenerationError('IMAGE_INVALID_RESPONSE')
  }

  const caption = sanitizeStructuredSoundCaption(input.caption)
  const captionPreview = [
    ...caption.environment,
    ...caption.sources,
    ...caption.dynamics,
    ...caption.spatial,
  ].slice(0, 3)

  return {
    version: 1,
    mode: 'ai',
    jobId: input.jobId,
    mood: input.mood,
    baseImage: { ...input.baseImage },
    summary: { ...input.summary },
    captionPreview,
    promptHash: input.promptHash,
    createdAt: Number.isFinite(input.createdAt)
      ? Math.max(0, Math.round(input.createdAt))
      : 0,
    share: {
      width: AI_SHARE_WIDTH,
      height: AI_SHARE_HEIGHT,
      explicitLabel: 'AI 生成',
      localSoundOverlay: true,
      finalizeRequired: true,
      implicitMetadata: 'pending-server-finalize',
    },
  }
}

export function assertFinalizedAiAssetCanBeShared(
  evidence: FinalizedAiAssetEvidence,
): FinalizedAiAssetEvidence {
  if (
    evidence.width !== AI_SHARE_WIDTH ||
    evidence.height !== AI_SHARE_HEIGHT ||
    !evidence.explicitLabelDetected ||
    !evidence.implicitMetadataDetected ||
    evidence.verification !== 'real-passed'
  ) {
    throw new AiGenerationError('AI_LABEL_UNVERIFIED')
  }

  return { ...evidence }
}

export function createMockFinalizeEvidence(input: {
  jobId: string
  outputVersion: string
  now: number
  explicitLabelDetected?: boolean
  implicitMetadataDetected?: boolean
}): FinalizedAiAssetEvidence {
  return {
    jobId: input.jobId,
    outputVersion: input.outputVersion,
    imageToken: `mock://finalized/${input.jobId}/${input.outputVersion}`,
    width: AI_SHARE_WIDTH,
    height: AI_SHARE_HEIGHT,
    explicitLabelDetected: input.explicitLabelDetected ?? true,
    implicitMetadataDetected: input.implicitMetadataDetected ?? false,
    verification: 'mock-only',
    verifiedAt: Number.isFinite(input.now)
      ? Math.max(0, Math.round(input.now))
      : 0,
  }
}
