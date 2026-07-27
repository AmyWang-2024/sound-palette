import type { Mood, SoundVisualInput } from '../../core/src'

export const AI_JOB_STATUSES = [
  'created',
  'captioning',
  'imaging',
  'finalizing',
  'succeeded',
  'failed',
  'canceled',
  'expired',
] as const

export type AiJobStatus = (typeof AI_JOB_STATUSES)[number]

export const AI_APP_STATES = [
  'home',
  'ai-consent',
  'listening',
  'mood',
  'ai-auth',
  'ai-generating',
  'result',
  'recoverable-error',
] as const

export type AiAppState = (typeof AI_APP_STATES)[number]
export type CreationMode = 'local' | 'ai'

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

// AI-M0-only provider fixture. This is not the AI-M2 metadata API contract.
export interface AiM0MockGenerationRequest {
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

export type AiUserStatus = 'active' | 'limited' | 'deleted'

export interface AiAccountView {
  userId: string
  status: AiUserStatus
  consentVersion: string
  consentedAt: number
  createdAt: number
  updatedAt: number
}

export interface MockAuthResult {
  businessToken: string
  account: AiAccountView
}

export interface CreditAccount {
  userId: string
  available: number
  reserved: number
  lifetimeGranted: number
  lifetimeSpent: number
  version: number
  updatedAt: number
}

export const CREDIT_LEDGER_TYPES = [
  'grant',
  'reserve',
  'settle',
  'release',
  'adjustment',
] as const

export type CreditLedgerType = (typeof CREDIT_LEDGER_TYPES)[number]

export interface CreditLedgerEntry {
  ledgerId: string
  userId: string
  jobId?: string
  type: CreditLedgerType
  amount: number
  reasonCode: string
  createdAt: number
}

export const AI_AUDIO_FORMAT_VERSION = 'pcm-s16le-16khz-mono-v1' as const

export interface CreateGenerationRequest {
  jobId: string
  consentVersion: string
  mood: Mood
  summary: SoundVisualInput
  audioFormatVersion: typeof AI_AUDIO_FORMAT_VERSION
  clientVersion: string
}

export interface MockAudioUpload {
  byteLength: number
  checksum: string
  audioFormatVersion: typeof AI_AUDIO_FORMAT_VERSION
}

export interface AiJobView {
  jobId: string
  userId: string
  status: AiJobStatus
  mood: Mood
  summaryNumbers?: SoundVisualInput
  captionModel?: string
  imageModel?: string
  providerRequestIds: string[]
  latencyMs: {
    caption?: number
    image?: number
    finalize?: number
  }
  costMicros: {
    caption: number
    image: number
    finalize: number
  }
  errorCode?: string
  result?: ImageProviderResult
  captionToken?: string
  resultExpiresAt?: number
  createdAt: number
  updatedAt: number
}

export interface AcceptedGeneration {
  statusCode: 202
  job: AiJobView
  uploadAuthorization?: {
    token: string
    expiresAt: number
  }
}

export interface RegenerateRequest {
  sourceJobId: string
  jobId: string
  mood: Mood
  clientVersion: string
}

export interface MockFinalizeResult {
  jobId: string
  outputVersion: string
  imageToken: string
  width: 1080
  height: 1440
  explicitAiLabel: true
  implicitMetadata: 'mock-pending-ai-m4'
}

export interface AiAuditEvent {
  jobId?: string
  event: string
  errorCode?: string
  createdAt: number
}
