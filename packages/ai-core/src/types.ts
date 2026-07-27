import type { Mood, SoundVisualInput } from '../../core/src'

export const AI_JOB_STATUSES = [
  'created',
  'captioning',
  'imaging',
  'succeeded',
  'failed',
  'canceled',
  'expired',
] as const

export type AiJobStatus = (typeof AI_JOB_STATUSES)[number]

export interface StructuredSoundCaption {
  version: 1
  environment: string[]
  sources: string[]
  dynamics: string[]
  materials: string[]
  spatial: string[]
  confidence: 'low' | 'medium' | 'high'
  containsSpeech: boolean
}

export interface AiGenerationRequest {
  jobId: string
  consentVersion: string
  mood: Mood
  summary: SoundVisualInput
  audioToken: string
  clientVersion: string
}

export interface CaptionProviderInput {
  jobId: string
  audioToken: string
  summary: SoundVisualInput
}

export interface ImageProviderInput {
  jobId: string
  caption: StructuredSoundCaption
  mood: Mood
  summary: SoundVisualInput
}

export interface CaptionProvider {
  readonly id: string
  caption(input: CaptionProviderInput): Promise<StructuredSoundCaption>
}

export interface ImageProviderResult {
  imageToken: string
  width: number
  height: number
  mediaType: 'image/mock'
}

export interface ImageProvider {
  readonly id: string
  generate(input: ImageProviderInput): Promise<ImageProviderResult>
}

export interface AiGenerationResult {
  jobId: string
  status: 'succeeded'
  caption: StructuredSoundCaption
  image: ImageProviderResult
  captionProvider: string
  imageProvider: string
}
