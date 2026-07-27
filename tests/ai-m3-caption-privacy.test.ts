import { describe, expect, it } from 'vitest'
import {
  AiGenerationError,
  InMemoryTemporaryAudioStore,
  MockCaptionProvider,
  QWEN3_OMNI_CANDIDATE_MODEL,
  Qwen3OmniCandidateProvider,
  QwenCaptionTransportError,
  SafeCaptionPipeline,
  parseStructuredSoundCaption,
  sanitizeStructuredSoundCaption,
  summarizeCaptionMetrics,
  type AiErrorCode,
  type QwenCaptionTransport,
  type StructuredSoundCaption,
} from '../packages/ai-core/src'

const NOW = Date.UTC(2026, 6, 27, 13)
const SUMMARY = {
  loudness: 0.42,
  lowEnergy: 0.28,
  midEnergy: 0.51,
  highEnergy: 0.21,
  changeRate: 0.33,
}
const SAFE_CAPTION: StructuredSoundCaption = {
  version: 1,
  environment: ['户外'],
  sources: ['细雨', '远处车辆'],
  dynamics: ['连续'],
  materials: ['半透明', '细颗粒'],
  spatial: ['开阔'],
  confidence: 'medium',
  containsSpeech: false,
}

function pcm(): Uint8Array {
  return new Uint8Array(320_000).fill(7)
}

describe('AI-M3 structured caption privacy', () => {
  it('bounds fields and removes contact, transcript, identity, and address data', () => {
    const caption = sanitizeStructuredSoundCaption({
      version: 1,
      environment: ['户外', '上海市某路 88 号地址', '室内', '自然', '额外'],
      sources: [
        '细雨',
        '电话 13800138000',
        '他说“明天见”',
        '女性说话',
        '远处车辆',
        '脚步',
      ],
      dynamics: ['连续', '间歇', '渐强', '渐弱', '额外动态'],
      materials: ['半透明', '细颗粒'],
      spatial: ['开阔', '远处'],
      confidence: 'high',
      containsSpeech: false,
    })

    expect(caption.environment).toEqual(['户外', '室内', '自然'])
    expect(caption.sources).toEqual(['细雨', '远处车辆', '脚步'])
    expect(caption.dynamics).toHaveLength(4)
    expect(JSON.stringify(caption)).not.toMatch(
      /13800138000|明天见|女性|地址/,
    )
  })

  it('reduces speech to a generic environmental marker', () => {
    const caption = sanitizeStructuredSoundCaption({
      ...SAFE_CAPTION,
      sources: ['有人说出姓名 Amy', '近处谈话', '车辆'],
      environment: ['咖啡馆', '有人讲话'],
      containsSpeech: true,
    })

    expect(caption.sources).toEqual(['近处有人声'])
    expect(JSON.stringify(caption)).not.toMatch(/Amy|谈话|讲话/)
  })

  it('uses conservative wording for low-confidence output', () => {
    const caption = sanitizeStructuredSoundCaption({
      ...SAFE_CAPTION,
      environment: ['繁忙街道'],
      sources: ['摩托车'],
      confidence: 'low',
    })

    expect(caption.environment).toEqual(['环境不确定'])
    expect(caption.sources).toEqual(['模糊环境声'])
  })

  it('allows one controlled repair and rejects a second invalid result', async () => {
    let repairs = 0
    const repaired = await parseStructuredSoundCaption('{invalid', () => {
      repairs += 1
      return SAFE_CAPTION
    })

    expect(repaired).toEqual(SAFE_CAPTION)
    expect(repairs).toBe(1)

    repairs = 0
    await expect(
      parseStructuredSoundCaption('{invalid', () => {
        repairs += 1
        return '{still-invalid'
      }),
    ).rejects.toMatchObject({ code: 'CAPTION_INVALID_RESPONSE' })
    expect(repairs).toBe(1)
  })
})

describe('AI-M3 temporary PCM lifecycle', () => {
  it('requires explicit consent and uses only an opaque in-memory token', () => {
    const store = new InMemoryTemporaryAudioStore()

    expect(() =>
      store.create('job_audio_consent_000001', pcm(), false, NOW),
    ).toThrowError(expect.objectContaining({ code: 'CONSENT_REQUIRED' }))

    const token = store.create(
      'job_audio_consent_000001',
      pcm(),
      true,
      NOW,
    )
    expect(token).toBe('memory-audio:job_audio_consent_000001')
    expect(token).not.toMatch(/={2}$|data:audio|base64/i)
    expect(
      store.read(token, 'job_audio_consent_000001', NOW),
    ).toHaveLength(320_000)
  })

  it.each([
    ['success', undefined, 'caption_succeeded'],
    ['failure', 'PROVIDER_UNAVAILABLE', 'caption_failed'],
    ['timeout', 'CAPTION_TIMEOUT', 'timeout'],
  ] as const)(
    'deletes temporary PCM after %s',
    async (_label, failure, expectedReason) => {
      const provider = new MockCaptionProvider(failure as AiErrorCode | undefined)
      const store = new InMemoryTemporaryAudioStore()
      const pipeline = new SafeCaptionPipeline(provider, store)
      const jobId = `job_audio_${expectedReason}_000001`

      if (failure) {
        await expect(
          pipeline.execute({
            jobId,
            pcm: pcm(),
            consentConfirmed: true,
            summary: SUMMARY,
            now: NOW,
          }),
        ).rejects.toBeInstanceOf(AiGenerationError)
      } else {
        await expect(
          pipeline.execute({
            jobId,
            pcm: pcm(),
            consentConfirmed: true,
            summary: SUMMARY,
            now: NOW,
          }),
        ).resolves.toMatchObject({
          deletion: { status: 'deleted', reason: expectedReason },
        })
      }

      expect(store.has(`memory-audio:${jobId}`)).toBe(false)
      expect(store.deletionEvidence.at(-1)).toMatchObject({
        jobId,
        status: 'deleted',
        reason: expectedReason,
      })
    },
  )

  it('deletes on cancellation before a provider call', async () => {
    const provider = new MockCaptionProvider()
    const store = new InMemoryTemporaryAudioStore()
    const pipeline = new SafeCaptionPipeline(provider, store)

    await expect(
      pipeline.execute({
        jobId: 'job_audio_canceled_000001',
        pcm: pcm(),
        consentConfirmed: true,
        summary: SUMMARY,
        now: NOW,
        cancellationRequested: () => true,
      }),
    ).rejects.toMatchObject({ code: 'JOB_CANCELED' })
    expect(provider.calls).toBe(0)
    expect(store.deletionEvidence.at(-1)).toMatchObject({
      reason: 'canceled',
      status: 'deleted',
    })
  })

  it('uses a ten-minute maximum TTL and records TTL deletion', () => {
    const store = new InMemoryTemporaryAudioStore()
    const token = store.create(
      'job_audio_ttl_0000000001',
      pcm(),
      true,
      NOW,
      60 * 60_000,
    )

    expect(store.sweepExpired(NOW + 10 * 60_000)).toBe(0)
    expect(store.sweepExpired(NOW + 10 * 60_000 + 1)).toBe(1)
    expect(store.has(token)).toBe(false)
    expect(store.deletionEvidence.at(-1)).toMatchObject({
      reason: 'ttl',
      status: 'deleted',
    })
  })

  it('discards the result when deletion cannot be proven', async () => {
    const store = new InMemoryTemporaryAudioStore()
    store.failDeletionForTest('job_audio_delete_failure_001')
    const pipeline = new SafeCaptionPipeline(
      new MockCaptionProvider(),
      store,
    )

    await expect(
      pipeline.execute({
        jobId: 'job_audio_delete_failure_001',
        pcm: pcm(),
        consentConfirmed: true,
        summary: SUMMARY,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'AUDIO_DELETE_UNCONFIRMED' })
    expect(store.deletionEvidence.at(-1)).toMatchObject({
      status: 'failed',
      errorCode: 'AUDIO_DELETE_UNCONFIRMED',
    })
  })
})

describe('AI-M3 Qwen candidate adapter and metrics', () => {
  it('is disabled until both credentials path and mainland region are verified', async () => {
    let calls = 0
    const transport: QwenCaptionTransport = {
      async invoke() {
        calls += 1
        return {
          output: SAFE_CAPTION,
          providerRequestId: 'unused',
          latencyMs: 1,
          costMicros: 1,
        }
      },
    }
    const provider = new Qwen3OmniCandidateProvider(transport)

    await expect(
      provider.caption({
        jobId: 'job_qwen_disabled_0000001',
        audioToken: 'memory-audio:disabled',
        summary: SUMMARY,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
    expect(calls).toBe(0)
  })

  it('uses an injected mock transport and repairs structured output once', async () => {
    let repairs = 0
    const transport: QwenCaptionTransport = {
      async invoke(input) {
        expect(input.model).toBe(QWEN3_OMNI_CANDIDATE_MODEL)
        expect(input.temporaryAudioToken).toMatch(/^memory-audio:/)
        return {
          output: '{invalid',
          providerRequestId: 'mock request id/with spaces',
          latencyMs: 1_200,
          costMicros: 3_000,
        }
      },
      async repairStructuredOutput() {
        repairs += 1
        return {
          output: SAFE_CAPTION,
          providerRequestId: 'mock-repair-001',
          latencyMs: 200,
          costMicros: 400,
        }
      },
    }
    const provider = new Qwen3OmniCandidateProvider(transport, {
      enabled: true,
      verifiedMainlandRegion: true,
    })
    const caption = await provider.caption({
      jobId: 'job_qwen_mock_transport_001',
      audioToken: 'memory-audio:job_qwen_mock_transport_001',
      summary: SUMMARY,
    })

    expect(caption).toEqual(SAFE_CAPTION)
    expect(repairs).toBe(1)
    expect(provider.providerRequestIds).toEqual([
      'mockrequestidwithspaces',
      'mock-repair-001',
    ])
    expect(provider.metrics).toHaveLength(2)
  })

  it('retries a declared transient transport failure only once', async () => {
    let calls = 0
    const transport: QwenCaptionTransport = {
      async invoke() {
        calls += 1
        if (calls === 1) {
          throw new QwenCaptionTransportError(true)
        }
        return {
          output: SAFE_CAPTION,
          providerRequestId: 'mock-transient-retry-001',
          latencyMs: 900,
          costMicros: 2_500,
        }
      },
    }
    const provider = new Qwen3OmniCandidateProvider(transport, {
      enabled: true,
      verifiedMainlandRegion: true,
    })

    await expect(
      provider.caption({
        jobId: 'job_qwen_transient_retry_001',
        audioToken: 'memory-audio:job_qwen_transient_retry_001',
        summary: SUMMARY,
      }),
    ).resolves.toEqual(SAFE_CAPTION)
    expect(calls).toBe(2)
    expect(provider.metrics.map((metric) => metric.status)).toEqual([
      'failed',
      'succeeded',
    ])
  })

  it('summarizes fixed latency and cost records without claiming a real benchmark', () => {
    const summary = summarizeCaptionMetrics([
      { status: 'succeeded', latencyMs: 1_000, costMicros: 3_000 },
      { status: 'succeeded', latencyMs: 2_000, costMicros: 4_000 },
      { status: 'failed', latencyMs: 6_000, costMicros: 1_000 },
      { status: 'succeeded', latencyMs: 3_000, costMicros: 5_000 },
    ])

    expect(summary).toEqual({
      calls: 4,
      succeeded: 3,
      failed: 1,
      successRate: 0.75,
      latencyP50Ms: 2_000,
      latencyP95Ms: 6_000,
      totalCostMicros: 13_000,
      averageSuccessfulCostMicros: 4_000,
    })
  })
})
