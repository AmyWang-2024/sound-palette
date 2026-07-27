import {
  DEFAULT_AI_FEATURE_CONFIG,
  DEFAULT_MOCK_TASK_SERVICE_CONFIG,
  type AiFeatureConfig,
  type MockTaskServiceConfig,
} from './config'
import { InMemoryCreditService } from './credit-service'
import { AiGenerationError, type AiErrorCode } from './errors'
import { MockWechatAccountService } from './mock-account-service'
import type {
  AcceptedGeneration,
  AiAuditEvent,
  AiJobStatus,
  AiJobView,
  CaptionProvider,
  CreateGenerationRequest,
  CreditAccount,
  CreditLedgerEntry,
  ImageProvider,
  MockAudioUpload,
  MockAuthResult,
  MockFinalizeResult,
  RegenerateRequest,
  StructuredSoundCaption,
} from './types'
import type { SoundVisualInput } from '../../core/src'
import { AI_AUDIO_FORMAT_VERSION } from './types'

interface StoredJob extends AiJobView {
  requestFingerprint: string
  consentVersion: string
  clientVersion: string
  audioFormatVersion: typeof AI_AUDIO_FORMAT_VERSION
  uploadToken?: string
  uploadExpiresAt?: number
  uploadChecksum?: string
  workerStarted: boolean
  reuseCaptionToken?: string
}

interface CaptionCacheEntry {
  caption: StructuredSoundCaption
  summary: SoundVisualInput
  expiresAt: number
}

interface FinalizeCacheEntry {
  result: MockFinalizeResult
}

const TERMINAL_STATUSES: ReadonlySet<AiJobStatus> = new Set([
  'succeeded',
  'failed',
  'canceled',
  'expired',
])

function safeTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function dayKey(timestamp: number): string {
  return new Date(safeTime(timestamp)).toISOString().slice(0, 10)
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function cloneSummary(
  summary: SoundVisualInput | undefined,
): SoundVisualInput | undefined {
  return summary ? { ...summary } : undefined
}

function cloneJob(job: StoredJob): AiJobView {
  return {
    jobId: job.jobId,
    userId: job.userId,
    status: job.status,
    mood: job.mood,
    ...(job.summaryNumbers
      ? { summaryNumbers: { ...job.summaryNumbers } }
      : {}),
    ...(job.captionModel ? { captionModel: job.captionModel } : {}),
    ...(job.imageModel ? { imageModel: job.imageModel } : {}),
    providerRequestIds: [...job.providerRequestIds],
    latencyMs: { ...job.latencyMs },
    costMicros: { ...job.costMicros },
    ...(job.errorCode ? { errorCode: job.errorCode } : {}),
    ...(job.result ? { result: { ...job.result } } : {}),
    ...(job.captionToken ? { captionToken: job.captionToken } : {}),
    ...(job.resultExpiresAt
      ? { resultExpiresAt: job.resultExpiresAt }
      : {}),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}

function isValidSummary(summary: SoundVisualInput): boolean {
  return Object.values(summary).every(
    (value) => Number.isFinite(value) && value >= 0 && value <= 1,
  )
}

function validateJobId(jobId: string): void {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(jobId)) {
    throw new AiGenerationError('INVALID_REQUEST')
  }
}

function asGenerationError(error: unknown): AiGenerationError {
  return error instanceof AiGenerationError
    ? error
    : new AiGenerationError('PROVIDER_UNAVAILABLE')
}

export class InMemoryAiTaskService {
  readonly featureConfig: AiFeatureConfig
  readonly config: MockTaskServiceConfig
  readonly accounts: MockWechatAccountService
  readonly credits: InMemoryCreditService
  readonly captionProvider: CaptionProvider
  readonly imageProvider: ImageProvider
  readonly auditEvents: AiAuditEvent[] = []

  #jobs = new Map<string, StoredJob>()
  #inFlight = new Map<string, Promise<AiJobView>>()
  #captionCache = new Map<string, CaptionCacheEntry>()
  #finalizeCache = new Map<string, FinalizeCacheEntry>()
  #projectDailyJobs = new Map<string, number>()
  #userDailyJobs = new Map<string, number>()

  constructor(options: {
    captionProvider: CaptionProvider
    imageProvider: ImageProvider
    featureConfig?: AiFeatureConfig
    config?: MockTaskServiceConfig
    accounts?: MockWechatAccountService
    credits?: InMemoryCreditService
  }) {
    this.captionProvider = options.captionProvider
    this.imageProvider = options.imageProvider
    this.featureConfig =
      options.featureConfig ?? { ...DEFAULT_AI_FEATURE_CONFIG }
    this.config =
      options.config ?? { ...DEFAULT_MOCK_TASK_SERVICE_CONFIG }
    this.accounts = options.accounts ?? new MockWechatAccountService()
    this.credits = options.credits ?? new InMemoryCreditService()
  }

  authenticateWechat(
    loginCode: string,
    consentVersion: string,
    now: number,
  ): MockAuthResult {
    this.#requireMockEnabled()
    if (consentVersion !== this.config.consentVersion) {
      throw new AiGenerationError('CONSENT_REQUIRED')
    }

    const auth = this.accounts.authenticate(loginCode, consentVersion, now)
    this.credits.ensureAccount(
      auth.account.userId,
      this.config.initialCredits,
      now,
    )
    this.#audit('account_authenticated', now)

    return auth
  }

  getCredits(businessToken: string): CreditAccount {
    this.#requireMockEnabled()
    const account = this.accounts.resolve(businessToken)

    return this.credits.view(account.userId)
  }

  getLedger(businessToken: string): CreditLedgerEntry[] {
    this.#requireMockEnabled()
    const account = this.accounts.resolve(businessToken)

    return this.credits.ledger(account.userId)
  }

  createGeneration(
    businessToken: string,
    request: CreateGenerationRequest,
    now: number,
  ): AcceptedGeneration {
    this.#requireMockEnabled()
    const account = this.accounts.resolve(businessToken)
    this.#validateCreateRequest(account.consentVersion, request)
    const requestFingerprint = this.#requestFingerprint(request)
    const existing = this.#jobs.get(request.jobId)

    if (existing) {
      if (
        existing.userId !== account.userId ||
        existing.requestFingerprint !== requestFingerprint
      ) {
        throw new AiGenerationError('IDEMPOTENCY_CONFLICT')
      }

      return this.#accepted(existing)
    }

    this.#checkLimits(account.userId, now)
    this.credits.reserve(account.userId, request.jobId, now)
    this.#countAcceptedJob(account.userId, now)

    const timestamp = safeTime(now)
    const uploadToken = `mock_upload_${stableHash(
      `${request.jobId}:${account.userId}:${timestamp}`,
    )}`
    const job: StoredJob = {
      jobId: request.jobId,
      userId: account.userId,
      status: 'created',
      mood: request.mood,
      summaryNumbers: { ...request.summary },
      providerRequestIds: [],
      latencyMs: {},
      costMicros: { caption: 0, image: 0, finalize: 0 },
      createdAt: timestamp,
      updatedAt: timestamp,
      requestFingerprint,
      consentVersion: request.consentVersion,
      clientVersion: request.clientVersion,
      audioFormatVersion: request.audioFormatVersion,
      uploadToken,
      uploadExpiresAt:
        timestamp + this.config.uploadAuthorizationTtlMs,
      workerStarted: false,
    }
    this.#jobs.set(job.jobId, job)
    this.#audit('credit_reserved', now, job.jobId)
    this.#audit('job_created', now, job.jobId)

    return this.#accepted(job)
  }

  uploadMockAudio(
    businessToken: string,
    jobId: string,
    uploadAuthorization: string,
    upload: MockAudioUpload,
    now: number,
  ): AiJobView {
    this.#requireMockEnabled()
    const account = this.accounts.resolve(businessToken)
    const job = this.#ownedJob(account.userId, jobId)

    if (
      job.status === 'captioning' &&
      job.uploadChecksum === upload.checksum
    ) {
      return cloneJob(job)
    }
    if (job.status !== 'created') {
      throw new AiGenerationError('JOB_STATE_CONFLICT')
    }
    if (
      !job.uploadExpiresAt ||
      safeTime(now) > job.uploadExpiresAt ||
      job.uploadToken !== uploadAuthorization
    ) {
      this.#expireUnuploadedJob(job, now)
      throw new AiGenerationError('UPLOAD_AUTH_EXPIRED')
    }
    if (
      upload.audioFormatVersion !== job.audioFormatVersion ||
      upload.byteLength < 1 ||
      upload.byteLength > 512_000 ||
      !/^[A-Za-z0-9:_-]{8,160}$/.test(upload.checksum)
    ) {
      throw new AiGenerationError('INVALID_AUDIO')
    }

    job.uploadChecksum = upload.checksum
    job.uploadToken = undefined
    job.status = 'captioning'
    job.updatedAt = safeTime(now)
    this.#audit('mock_audio_accepted', now, job.jobId)

    return cloneJob(job)
  }

  getGeneration(
    businessToken: string,
    jobId: string,
    now: number,
  ): AiJobView {
    this.#requireMockEnabled()
    const account = this.accounts.resolve(businessToken)
    const job = this.#ownedJob(account.userId, jobId)

    if (
      job.status === 'succeeded' &&
      job.resultExpiresAt &&
      safeTime(now) > job.resultExpiresAt
    ) {
      job.status = 'expired'
      job.errorCode = 'RESULT_EXPIRED'
      job.result = undefined
      job.captionToken = undefined
      job.updatedAt = safeTime(now)
      this.#audit('result_expired', now, job.jobId, 'RESULT_EXPIRED')
    }

    return cloneJob(job)
  }

  processJob(jobId: string, now: number): Promise<AiJobView> {
    this.#requireMockEnabled()
    const job = this.#jobs.get(jobId)
    if (!job) {
      return Promise.reject(new AiGenerationError('JOB_NOT_FOUND'))
    }
    if (TERMINAL_STATUSES.has(job.status)) {
      return Promise.resolve(cloneJob(job))
    }
    if (job.status === 'created' || job.status === 'finalizing') {
      return Promise.reject(new AiGenerationError('JOB_STATE_CONFLICT'))
    }
    if (job.errorCode === 'IMAGE_TIMEOUT') {
      return Promise.resolve(cloneJob(job))
    }

    const existing = this.#inFlight.get(jobId)
    if (existing) {
      return existing
    }

    const operation = this.#processJob(job, now).finally(() => {
      this.#inFlight.delete(jobId)
    })
    this.#inFlight.set(jobId, operation)

    return operation
  }

  cancelGeneration(
    businessToken: string,
    jobId: string,
    now: number,
  ): AiJobView {
    this.#requireMockEnabled()
    const account = this.accounts.resolve(businessToken)
    const job = this.#ownedJob(account.userId, jobId)

    if (TERMINAL_STATUSES.has(job.status)) {
      return cloneJob(job)
    }
    if (job.workerStarted || job.errorCode === 'IMAGE_TIMEOUT') {
      return cloneJob(job)
    }

    job.status = 'canceled'
    job.summaryNumbers = undefined
    job.uploadToken = undefined
    job.errorCode = undefined
    job.updatedAt = safeTime(now)
    this.credits.release(job.userId, job.jobId, 'user_canceled', now)
    this.#audit('job_canceled', now, job.jobId)

    return cloneJob(job)
  }

  expirePendingUploads(now: number): number {
    this.#requireMockEnabled()
    let expired = 0

    for (const job of this.#jobs.values()) {
      if (
        job.status === 'created' &&
        job.uploadExpiresAt &&
        safeTime(now) > job.uploadExpiresAt
      ) {
        this.#expireUnuploadedJob(job, now)
        expired += 1
      }
    }

    return expired
  }

  failRecoverableImageTimeout(jobId: string, now: number): AiJobView {
    this.#requireMockEnabled()
    const job = this.#jobs.get(jobId)
    if (!job) {
      throw new AiGenerationError('JOB_NOT_FOUND')
    }
    if (job.status !== 'imaging' || job.errorCode !== 'IMAGE_TIMEOUT') {
      throw new AiGenerationError('JOB_STATE_CONFLICT')
    }

    job.status = 'failed'
    job.summaryNumbers = undefined
    job.updatedAt = safeTime(now)
    this.credits.release(job.userId, job.jobId, 'image_final_timeout', now)
    this.#audit('job_failed', now, job.jobId, 'IMAGE_TIMEOUT')

    return cloneJob(job)
  }

  regenerate(
    businessToken: string,
    request: RegenerateRequest,
    now: number,
  ): AcceptedGeneration {
    this.#requireMockEnabled()
    const account = this.accounts.resolve(businessToken)
    validateJobId(request.jobId)
    const source = this.#ownedJob(account.userId, request.sourceJobId)

    if (
      source.status !== 'succeeded' ||
      !source.captionToken ||
      !['good', 'neutral', 'low'].includes(request.mood)
    ) {
      throw new AiGenerationError('RESULT_EXPIRED')
    }

    const captionCache = this.#captionCache.get(source.captionToken)
    if (!captionCache || safeTime(now) > captionCache.expiresAt) {
      throw new AiGenerationError('RESULT_EXPIRED')
    }

    const requestFingerprint = JSON.stringify({
      sourceJobId: source.jobId,
      captionToken: source.captionToken,
      mood: request.mood,
      clientVersion: request.clientVersion,
    })
    const existing = this.#jobs.get(request.jobId)
    if (existing) {
      if (
        existing.userId !== account.userId ||
        existing.requestFingerprint !== requestFingerprint
      ) {
        throw new AiGenerationError('IDEMPOTENCY_CONFLICT')
      }

      return this.#accepted(existing)
    }

    this.#checkLimits(account.userId, now)
    this.credits.reserve(account.userId, request.jobId, now)
    this.#countAcceptedJob(account.userId, now)

    const timestamp = safeTime(now)
    const job: StoredJob = {
      jobId: request.jobId,
      userId: account.userId,
      status: 'imaging',
      mood: request.mood,
      summaryNumbers: { ...captionCache.summary },
      providerRequestIds: [],
      latencyMs: {},
      costMicros: { caption: 0, image: 0, finalize: 0 },
      createdAt: timestamp,
      updatedAt: timestamp,
      requestFingerprint,
      consentVersion: source.consentVersion,
      clientVersion: request.clientVersion,
      audioFormatVersion: source.audioFormatVersion,
      workerStarted: false,
      reuseCaptionToken: source.captionToken,
    }
    this.#jobs.set(job.jobId, job)
    this.#audit('regeneration_created', now, job.jobId)
    this.#audit('credit_reserved', now, job.jobId)

    return this.#accepted(job)
  }

  finalize(
    businessToken: string,
    jobId: string,
    outputVersion: string,
    now: number,
  ): MockFinalizeResult {
    this.#requireMockEnabled()
    const account = this.accounts.resolve(businessToken)
    const job = this.#ownedJob(account.userId, jobId)

    if (
      job.status !== 'succeeded' ||
      !job.result ||
      !job.resultExpiresAt ||
      safeTime(now) > job.resultExpiresAt
    ) {
      throw new AiGenerationError('RESULT_EXPIRED')
    }
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(outputVersion)) {
      throw new AiGenerationError('INVALID_REQUEST')
    }

    const key = `${jobId}:${outputVersion}`
    const existing = this.#finalizeCache.get(key)
    if (existing) {
      return { ...existing.result }
    }

    job.status = 'finalizing'
    job.updatedAt = safeTime(now)
    const result: MockFinalizeResult = {
      jobId,
      outputVersion,
      imageToken: `mock://finalized/${jobId}/${outputVersion}`,
      width: 1080,
      height: 1440,
      explicitAiLabel: true,
      implicitMetadata: 'mock-pending-ai-m4',
    }
    this.#finalizeCache.set(key, { result })
    job.status = 'succeeded'
    job.latencyMs.finalize = 0
    job.updatedAt = safeTime(now)
    this.#audit('finalize_mocked', now, job.jobId)

    return { ...result }
  }

  #requireMockEnabled(): void {
    if (!this.featureConfig.enabled) {
      throw new AiGenerationError('AI_FEATURE_DISABLED')
    }
    if (this.featureConfig.allowRealProviders) {
      throw new AiGenerationError('PROVIDER_UNAVAILABLE')
    }
  }

  #validateCreateRequest(
    accountConsentVersion: string,
    request: CreateGenerationRequest,
  ): void {
    validateJobId(request.jobId)
    if (
      request.consentVersion !== this.config.consentVersion ||
      request.consentVersion !== accountConsentVersion
    ) {
      throw new AiGenerationError('CONSENT_REQUIRED')
    }
    if (
      !['good', 'neutral', 'low'].includes(request.mood) ||
      !isValidSummary(request.summary) ||
      request.audioFormatVersion !== AI_AUDIO_FORMAT_VERSION ||
      !request.clientVersion.trim()
    ) {
      throw new AiGenerationError('INVALID_REQUEST')
    }
  }

  #requestFingerprint(request: CreateGenerationRequest): string {
    return JSON.stringify({
      consentVersion: request.consentVersion,
      mood: request.mood,
      summary: request.summary,
      audioFormatVersion: request.audioFormatVersion,
      clientVersion: request.clientVersion,
    })
  }

  #accepted(job: StoredJob): AcceptedGeneration {
    return {
      statusCode: 202,
      job: cloneJob(job),
      ...(job.status === 'created' &&
      job.uploadToken &&
      job.uploadExpiresAt
        ? {
            uploadAuthorization: {
              token: job.uploadToken,
              expiresAt: job.uploadExpiresAt,
            },
          }
        : {}),
    }
  }

  #checkLimits(userId: string, now: number): void {
    const key = dayKey(now)
    const projectCount = this.#projectDailyJobs.get(key) ?? 0
    const userCount = this.#userDailyJobs.get(`${userId}:${key}`) ?? 0

    if (userCount >= this.config.userDailyJobLimit) {
      throw new AiGenerationError('USER_LIMITED')
    }
    if (projectCount >= this.config.projectDailyJobBudget) {
      throw new AiGenerationError('PROJECT_BUDGET_EXHAUSTED')
    }
  }

  #countAcceptedJob(userId: string, now: number): void {
    const key = dayKey(now)
    const userKey = `${userId}:${key}`
    this.#projectDailyJobs.set(
      key,
      (this.#projectDailyJobs.get(key) ?? 0) + 1,
    )
    this.#userDailyJobs.set(
      userKey,
      (this.#userDailyJobs.get(userKey) ?? 0) + 1,
    )
  }

  #ownedJob(userId: string, jobId: string): StoredJob {
    const job = this.#jobs.get(jobId)
    if (!job || job.userId !== userId) {
      throw new AiGenerationError('JOB_NOT_FOUND')
    }

    return job
  }

  #expireUnuploadedJob(job: StoredJob, now: number): void {
    if (job.status !== 'created') {
      return
    }

    job.status = 'expired'
    job.errorCode = 'UPLOAD_AUTH_EXPIRED'
    job.summaryNumbers = undefined
    job.uploadToken = undefined
    job.updatedAt = safeTime(now)
    this.credits.release(
      job.userId,
      job.jobId,
      'upload_authorization_expired',
      now,
    )
    this.#audit(
      'job_expired',
      now,
      job.jobId,
      'UPLOAD_AUTH_EXPIRED',
    )
  }

  async #processJob(job: StoredJob, now: number): Promise<AiJobView> {
    job.workerStarted = true
    let stage: 'caption' | 'image' =
      job.reuseCaptionToken ? 'image' : 'caption'

    try {
      let caption: StructuredSoundCaption
      let summary = cloneSummary(job.summaryNumbers)

      if (!summary) {
        throw new AiGenerationError('INVALID_AUDIO')
      }

      if (job.reuseCaptionToken) {
        const cached = this.#captionCache.get(job.reuseCaptionToken)
        if (!cached || safeTime(now) > cached.expiresAt) {
          throw new AiGenerationError('RESULT_EXPIRED')
        }
        caption = cached.caption
        summary = { ...cached.summary }
        job.captionToken = job.reuseCaptionToken
      } else {
        if (!job.uploadChecksum || job.status !== 'captioning') {
          throw new AiGenerationError('JOB_STATE_CONFLICT')
        }
        caption = await this.captionProvider.caption({
          jobId: job.jobId,
          audioToken: `mock-audio://${job.uploadChecksum}`,
          summary,
        })
        job.captionModel = this.captionProvider.id
        job.providerRequestIds.push(
          `${this.captionProvider.id}:${job.jobId}:caption`,
        )
        job.latencyMs.caption = 0
        const captionToken = `caption_${stableHash(
          `${job.jobId}:${job.userId}`,
        )}`
        job.captionToken = captionToken
        this.#captionCache.set(captionToken, {
          caption,
          summary: { ...summary },
          expiresAt: safeTime(now) + this.config.captionTokenTtlMs,
        })
        job.status = 'imaging'
        job.updatedAt = safeTime(now)
        this.#audit('caption_succeeded', now, job.jobId)
      }

      stage = 'image'
      const image = await this.imageProvider.generate({
        jobId: job.jobId,
        caption,
        mood: job.mood,
        summary,
      })
      job.imageModel = this.imageProvider.id
      job.providerRequestIds.push(
        `${this.imageProvider.id}:${job.jobId}:image`,
      )
      job.latencyMs.image = 0
      job.result = image
      job.resultExpiresAt =
        safeTime(now) + this.config.resultTtlMs
      job.status = 'succeeded'
      job.errorCode = undefined
      job.summaryNumbers = undefined
      job.updatedAt = safeTime(now)
      this.credits.settle(job.userId, job.jobId, now)
      this.#audit('credit_settled', now, job.jobId)
      this.#audit('job_succeeded', now, job.jobId)

      return cloneJob(job)
    } catch (error) {
      const generationError = asGenerationError(error)

      if (stage === 'image' && generationError.code === 'IMAGE_TIMEOUT') {
        job.status = 'imaging'
        job.errorCode = generationError.code
        job.updatedAt = safeTime(now)
        this.#audit(
          'job_recoverable',
          now,
          job.jobId,
          generationError.code,
        )
        return cloneJob(job)
      }

      job.status = 'failed'
      job.errorCode = generationError.code
      job.summaryNumbers = undefined
      job.updatedAt = safeTime(now)
      this.credits.release(
        job.userId,
        job.jobId,
        generationError.code.toLowerCase(),
        now,
      )
      this.#audit(
        'credit_released',
        now,
        job.jobId,
        generationError.code,
      )
      this.#audit(
        'job_failed',
        now,
        job.jobId,
        generationError.code,
      )

      return cloneJob(job)
    }
  }

  #audit(
    event: string,
    now: number,
    jobId?: string,
    errorCode?: AiErrorCode | 'UPLOAD_AUTH_EXPIRED',
  ): void {
    this.auditEvents.push({
      ...(jobId ? { jobId } : {}),
      event,
      ...(errorCode ? { errorCode } : {}),
      createdAt: safeTime(now),
    })
  }
}

export async function pollGeneration(
  getJob: () => Promise<AiJobView> | AiJobView,
  maxAttempts = 6,
): Promise<AiJobView> {
  const attempts = Math.min(
    12,
    Math.max(1, Number.isFinite(maxAttempts) ? Math.floor(maxAttempts) : 6),
  )

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const job = await getJob()
    if (TERMINAL_STATUSES.has(job.status)) {
      return job
    }
  }

  throw new AiGenerationError('IMAGE_TIMEOUT')
}
