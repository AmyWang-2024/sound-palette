import { describe, expect, it } from 'vitest'
import {
  AiGenerationError,
  MOCK_AUDIO_UPLOAD,
  MOCK_CREATE_GENERATION_REQUEST,
  MockCaptionProvider,
  MockImageProvider,
  InMemoryAiTaskService,
  createAiFeatureConfig,
  createMockTaskServiceConfig,
  pollGeneration,
  type AiErrorCode,
  type CreateGenerationRequest,
  type ImageProvider,
  type ImageProviderInput,
  type ImageProviderResult,
} from '../packages/ai-core/src'

const NOW = Date.UTC(2026, 6, 27, 12)

function taskService(options: {
  enabled?: boolean
  initialCredits?: number
  userDailyJobLimit?: number
  projectDailyJobBudget?: number
  captionFailure?: AiErrorCode
  imageFailure?: AiErrorCode
} = {}) {
  const caption = new MockCaptionProvider(options.captionFailure)
  const image = new MockImageProvider(options.imageFailure)
  const service = new InMemoryAiTaskService({
    captionProvider: caption,
    imageProvider: image,
    featureConfig: createAiFeatureConfig({
      enabled: options.enabled ?? true,
    }),
    config: createMockTaskServiceConfig({
      initialCredits: options.initialCredits,
      userDailyJobLimit: options.userDailyJobLimit,
      projectDailyJobBudget: options.projectDailyJobBudget,
    }),
  })

  return { service, caption, image }
}

function authenticate(
  service: InMemoryAiTaskService,
  loginCode = 'mock-wechat-login-code',
) {
  return service.authenticateWechat(loginCode, 'ai-privacy-v1', NOW)
}

function request(
  jobId = MOCK_CREATE_GENERATION_REQUEST.jobId,
): CreateGenerationRequest {
  return { ...MOCK_CREATE_GENERATION_REQUEST, jobId }
}

async function completeJob(
  service: InMemoryAiTaskService,
  businessToken: string,
  generationRequest = request(),
) {
  const accepted = service.createGeneration(
    businessToken,
    generationRequest,
    NOW,
  )
  service.uploadMockAudio(
    businessToken,
    generationRequest.jobId,
    accepted.uploadAuthorization?.token ?? '',
    { ...MOCK_AUDIO_UPLOAD },
    NOW + 1_000,
  )

  return service.processJob(generationRequest.jobId, NOW + 2_000)
}

describe('AI-M2 in-memory account, credits, and task service', () => {
  it('keeps all account and provider work disabled by default', () => {
    const { service, caption, image } = taskService({ enabled: false })

    expect(() => authenticate(service)).toThrowError(AiGenerationError)
    expect(caption.calls).toBe(0)
    expect(image.calls).toBe(0)
  })

  it('creates a minimal repeatable account without exposing the login code', () => {
    const { service } = taskService()
    const first = authenticate(service)
    const second = authenticate(service)

    expect(second.account.userId).toBe(first.account.userId)
    expect(first.account).not.toHaveProperty('wechatSubject')
    expect(first.account).not.toHaveProperty('openId')
    expect(service.accounts.debugProtectedSubjects()).toEqual([
      expect.stringMatching(/^protected:[a-f0-9]{8}$/),
    ])
    expect(JSON.stringify(first)).not.toContain('mock-wechat-login-code')
    expect(service.getCredits(first.businessToken)).toMatchObject({
      available: 3,
      reserved: 0,
      lifetimeGranted: 3,
      lifetimeSpent: 0,
    })
  })

  it('returns 202 and reserves before accepting mock audio or calling providers', () => {
    const { service, caption, image } = taskService()
    const auth = authenticate(service)
    const accepted = service.createGeneration(
      auth.businessToken,
      request(),
      NOW,
    )

    expect(accepted.statusCode).toBe(202)
    expect(accepted.job.status).toBe('created')
    expect(accepted.uploadAuthorization).toMatchObject({
      token: expect.stringMatching(/^mock_upload_/),
    })
    expect(service.getCredits(auth.businessToken)).toMatchObject({
      available: 2,
      reserved: 1,
    })
    expect(caption.calls).toBe(0)
    expect(image.calls).toBe(0)
    expect(request()).not.toHaveProperty('audio')
    expect(request()).not.toHaveProperty('audioToken')
  })

  it('replays a job id without another reserve and rejects changed metadata', () => {
    const { service } = taskService()
    const auth = authenticate(service)
    const first = service.createGeneration(
      auth.businessToken,
      request(),
      NOW,
    )
    const second = service.createGeneration(
      auth.businessToken,
      request(),
      NOW + 1,
    )

    expect(second).toEqual(first)
    expect(service.getCredits(auth.businessToken).reserved).toBe(1)
    expect(
      service
        .getLedger(auth.businessToken)
        .filter((entry) => entry.type === 'reserve'),
    ).toHaveLength(1)
    expect(() =>
      service.createGeneration(
        auth.businessToken,
        { ...request(), mood: 'good' },
        NOW + 2,
      ),
    ).toThrowError(expect.objectContaining({ code: 'IDEMPOTENCY_CONFLICT' }))
  })

  it('settles exactly once and recovers the result without repeating providers', async () => {
    const { service, caption, image } = taskService()
    const auth = authenticate(service)
    const completed = await completeJob(service, auth.businessToken)
    const replay = await service.processJob(completed.jobId, NOW + 3_000)
    const recovered = service.getGeneration(
      auth.businessToken,
      completed.jobId,
      NOW + 4_000,
    )

    expect(completed.status).toBe('succeeded')
    expect(completed.summaryNumbers).toBeUndefined()
    expect(replay).toEqual(completed)
    expect(recovered.result).toEqual(completed.result)
    expect(caption.calls).toBe(1)
    expect(image.calls).toBe(1)
    expect(service.getCredits(auth.businessToken)).toMatchObject({
      available: 2,
      reserved: 0,
      lifetimeSpent: 1,
    })
    expect(
      service
        .getLedger(auth.businessToken)
        .filter((entry) => entry.type === 'settle'),
    ).toHaveLength(1)
  })

  it('releases a reservation on caption and final image failures', async () => {
    for (const [stage, code] of [
      ['caption', 'CAPTION_TIMEOUT'],
      ['image', 'PROVIDER_UNAVAILABLE'],
    ] as const) {
      const { service, caption, image } = taskService({
        ...(stage === 'caption'
          ? { captionFailure: code }
          : { imageFailure: code }),
      })
      const auth = authenticate(service, `login-${stage}`)
      const completed = await completeJob(
        service,
        auth.businessToken,
        request(`job_failure_${stage}_0001`),
      )

      expect(completed).toMatchObject({ status: 'failed', errorCode: code })
      expect(completed.summaryNumbers).toBeUndefined()
      expect(service.getCredits(auth.businessToken)).toMatchObject({
        available: 3,
        reserved: 0,
        lifetimeSpent: 0,
      })
      expect(caption.calls).toBe(1)
      expect(image.calls).toBe(stage === 'caption' ? 0 : 1)
    }
  })

  it('keeps image timeout recoverable, then releases on final timeout', async () => {
    const { service } = taskService({ imageFailure: 'IMAGE_TIMEOUT' })
    const auth = authenticate(service)
    const pending = await completeJob(service, auth.businessToken)

    expect(pending).toMatchObject({
      status: 'imaging',
      errorCode: 'IMAGE_TIMEOUT',
    })
    expect(service.getCredits(auth.businessToken)).toMatchObject({
      available: 2,
      reserved: 1,
    })

    const failed = service.failRecoverableImageTimeout(
      pending.jobId,
      NOW + 60_000,
    )
    expect(failed.status).toBe('failed')
    expect(service.getCredits(auth.businessToken)).toMatchObject({
      available: 3,
      reserved: 0,
    })
  })

  it('continues an already-started provider task after client cancellation', async () => {
    let resolveImage:
      | ((result: ImageProviderResult) => void)
      | undefined
    const deferredImage: ImageProvider = {
      id: 'mock-deferred-image-v1',
      generate(_input: ImageProviderInput) {
        return new Promise((resolve) => {
          resolveImage = resolve
        })
      },
    }
    const service = new InMemoryAiTaskService({
      captionProvider: new MockCaptionProvider(),
      imageProvider: deferredImage,
      featureConfig: createAiFeatureConfig({ enabled: true }),
      config: createMockTaskServiceConfig(),
    })
    const auth = authenticate(service)
    const generationRequest = request('job_disconnect_recovery_00001')
    const accepted = service.createGeneration(
      auth.businessToken,
      generationRequest,
      NOW,
    )
    service.uploadMockAudio(
      auth.businessToken,
      generationRequest.jobId,
      accepted.uploadAuthorization?.token ?? '',
      { ...MOCK_AUDIO_UPLOAD },
      NOW + 1_000,
    )
    const processing = service.processJob(
      generationRequest.jobId,
      NOW + 2_000,
    )
    await Promise.resolve()
    await Promise.resolve()

    const afterCancel = service.cancelGeneration(
      auth.businessToken,
      generationRequest.jobId,
      NOW + 2_100,
    )
    expect(afterCancel.status).toBe('imaging')
    expect(service.getCredits(auth.businessToken).reserved).toBe(1)

    resolveImage?.({
      imageToken: 'mock://image/recovered',
      width: 864,
      height: 1152,
      mediaType: 'image/mock',
    })
    const completed = await processing
    expect(completed.status).toBe('succeeded')
    expect(
      service.getGeneration(
        auth.businessToken,
        generationRequest.jobId,
        NOW + 3_000,
      ).result?.imageToken,
    ).toBe('mock://image/recovered')
    expect(service.getCredits(auth.businessToken)).toMatchObject({
      reserved: 0,
      lifetimeSpent: 1,
    })
  })

  it('releases before worker start on cancel and upload authorization expiry', () => {
    const { service } = taskService()
    const auth = authenticate(service)
    const cancelRequest = request('job_cancel_before_worker_0001')
    service.createGeneration(auth.businessToken, cancelRequest, NOW)
    const canceled = service.cancelGeneration(
      auth.businessToken,
      cancelRequest.jobId,
      NOW + 10,
    )
    expect(canceled.status).toBe('canceled')
    expect(canceled.summaryNumbers).toBeUndefined()

    const expireRequest = request('job_upload_expiry_00000001')
    service.createGeneration(auth.businessToken, expireRequest, NOW)
    expect(service.expirePendingUploads(NOW + 61_000)).toBe(1)
    expect(
      service.getGeneration(
        auth.businessToken,
        expireRequest.jobId,
        NOW + 61_000,
      ),
    ).toMatchObject({
      status: 'expired',
      errorCode: 'UPLOAD_AUTH_EXPIRED',
    })
    expect(service.getCredits(auth.businessToken)).toMatchObject({
      available: 3,
      reserved: 0,
    })
  })

  it('enforces credits, per-user limits, project budget, and atomic reservation', () => {
    const noCredits = taskService({ initialCredits: 0 }).service
    const noCreditsAuth = authenticate(noCredits, 'no-credits')
    expect(() =>
      noCredits.createGeneration(
        noCreditsAuth.businessToken,
        request('job_no_credits_000000001'),
        NOW,
      ),
    ).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_CREDITS' }))

    const limited = taskService({ userDailyJobLimit: 1 }).service
    const limitedAuth = authenticate(limited, 'limited-user')
    limited.createGeneration(
      limitedAuth.businessToken,
      request('job_user_limit_000000001'),
      NOW,
    )
    expect(() =>
      limited.createGeneration(
        limitedAuth.businessToken,
        request('job_user_limit_000000002'),
        NOW,
      ),
    ).toThrowError(expect.objectContaining({ code: 'USER_LIMITED' }))

    const budget = taskService({ projectDailyJobBudget: 1 }).service
    const first = authenticate(budget, 'budget-user-one')
    const second = authenticate(budget, 'budget-user-two')
    budget.createGeneration(
      first.businessToken,
      request('job_project_budget_0000001'),
      NOW,
    )
    expect(() =>
      budget.createGeneration(
        second.businessToken,
        request('job_project_budget_0000002'),
        NOW,
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'PROJECT_BUDGET_EXHAUSTED' }),
    )

    const atomic = taskService({ initialCredits: 1 }).service
    const atomicAuth = authenticate(atomic, 'atomic-user')
    atomic.createGeneration(
      atomicAuth.businessToken,
      request('job_atomic_credit_00000001'),
      NOW,
    )
    expect(() =>
      atomic.createGeneration(
        atomicAuth.businessToken,
        request('job_atomic_credit_00000002'),
        NOW,
      ),
    ).toThrowError(expect.objectContaining({ code: 'INSUFFICIENT_CREDITS' }))
    expect(atomic.getCredits(atomicAuth.businessToken)).toMatchObject({
      available: 0,
      reserved: 1,
    })
  })

  it('regenerates with a new id and cached caption while charging once per image', async () => {
    const { service, caption, image } = taskService()
    const auth = authenticate(service)
    const first = await completeJob(service, auth.businessToken)
    const regenerateRequest = {
      sourceJobId: first.jobId,
      jobId: 'job_regenerate_new_00000001',
      mood: 'good' as const,
      clientVersion: 'ai-m2-test',
    }
    const accepted = service.regenerate(
      auth.businessToken,
      regenerateRequest,
      NOW + 3_000,
    )
    const replay = service.regenerate(
      auth.businessToken,
      regenerateRequest,
      NOW + 3_100,
    )
    const second = await service.processJob(
      regenerateRequest.jobId,
      NOW + 4_000,
    )

    expect(accepted.uploadAuthorization).toBeUndefined()
    expect(replay).toEqual(accepted)
    expect(second.status).toBe('succeeded')
    expect(caption.calls).toBe(1)
    expect(image.calls).toBe(2)
    expect(service.getCredits(auth.businessToken)).toMatchObject({
      available: 1,
      reserved: 0,
      lifetimeSpent: 2,
    })
  })

  it('finalizes idempotently without another credit or provider call', async () => {
    const { service, caption, image } = taskService()
    const auth = authenticate(service)
    const completed = await completeJob(service, auth.businessToken)
    const beforeLedger = service.getLedger(auth.businessToken)
    const first = service.finalize(
      auth.businessToken,
      completed.jobId,
      'share-v1',
      NOW + 3_000,
    )
    const second = service.finalize(
      auth.businessToken,
      completed.jobId,
      'share-v1',
      NOW + 4_000,
    )

    expect(second).toEqual(first)
    expect(first).toMatchObject({
      width: 1080,
      height: 1440,
      explicitAiLabel: true,
      implicitMetadata: 'mock-pending-ai-m4',
    })
    expect(service.getLedger(auth.businessToken)).toEqual(beforeLedger)
    expect(caption.calls).toBe(1)
    expect(image.calls).toBe(1)
  })

  it('expires only the temporary result without refunding a delivered image', async () => {
    const { service } = taskService()
    const auth = authenticate(service)
    const completed = await completeJob(service, auth.businessToken)
    const accountBeforeExpiry = service.getCredits(auth.businessToken)
    const expired = service.getGeneration(
      auth.businessToken,
      completed.jobId,
      NOW + 60 * 60_000 + 2_001,
    )

    expect(expired).toMatchObject({
      status: 'expired',
      errorCode: 'RESULT_EXPIRED',
    })
    expect(expired.result).toBeUndefined()
    expect(service.getCredits(auth.businessToken)).toEqual(
      accountBeforeExpiry,
    )
  })

  it('bounds polling and keeps audit events free of sensitive payloads', async () => {
    const { service } = taskService()
    const auth = authenticate(service, 'private-login-code')
    const accepted = service.createGeneration(
      auth.businessToken,
      request('job_polling_bounded_0000001'),
      NOW,
    )
    let polls = 0

    await expect(
      pollGeneration(() => {
        polls += 1
        return service.getGeneration(
          auth.businessToken,
          accepted.job.jobId,
          NOW,
        )
      }, 3),
    ).rejects.toMatchObject({ code: 'IMAGE_TIMEOUT' })
    expect(polls).toBe(3)

    const audit = JSON.stringify(service.auditEvents)
    expect(audit).not.toContain('private-login-code')
    expect(audit).not.toContain('0.42')
    expect(audit).not.toContain('mock_pcm_checksum')
    expect(audit).not.toContain('caption')
    expect(audit).not.toContain('prompt')
  })
})
