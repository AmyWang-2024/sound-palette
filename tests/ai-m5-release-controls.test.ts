import { describe, expect, it } from 'vitest'
import {
  AI_RELEASE_GATE_IDS,
  DailyBudgetGuard,
  DEFAULT_AI_ROLLOUT_CONFIG,
  ProviderCircuitBreaker,
  ProviderKeyMetadataRegistry,
  assertAiReleaseReady,
  auditAudioDeletionEvidence,
  decideAiRollout,
  evaluateAiReleaseGates,
  rollbackAiRollout,
  type AiReleaseGateEvidence,
  type AiReleaseGateId,
  type ReleaseEvidenceKind,
} from '../packages/ai-core/src'

const NOW = Date.UTC(2026, 6, 27, 15)

const EVIDENCE_KINDS: Record<
  AiReleaseGateId,
  Exclude<ReleaseEvidenceKind, 'mock'>
> = {
  'repository-tests': 'automatic',
  'web-production-build': 'automatic',
  'miniprogram-production-build': 'automatic',
  'local-zero-network': 'automatic',
  'android-local-latest': 'real-device',
  'iphone-local-latest': 'real-device',
  'android-ai-latest': 'real-device',
  'iphone-ai-latest': 'real-device',
  'mainland-network-benchmark': 'operations',
  'privacy-platform-config': 'platform',
  'ai-terms-approved': 'platform',
  'miniprogram-filing': 'platform',
  'supplier-contracts': 'supplier',
  'temporary-audio-deletion': 'operations',
  'ai-explicit-implicit-labels': 'operations',
  'supplier-blind-evaluation': 'supplier',
  'production-budget-alerts': 'operations',
  'production-service-deployed': 'operations',
  'experience-version-accepted': 'platform',
  'wechat-review-approved': 'platform',
  'administrator-published': 'platform',
}

function passedEvidence(
  includeAdministrator = false,
): AiReleaseGateEvidence[] {
  return AI_RELEASE_GATE_IDS.filter(
    (gateId) =>
      includeAdministrator || gateId !== 'administrator-published',
  ).map((gateId) => ({
    gateId,
    status: 'passed',
    evidenceKind: EVIDENCE_KINDS[gateId],
    reference: `evidence://${gateId}`,
    checkedAt: NOW,
  }))
}

describe('AI-M5 release gates and rollout', () => {
  it('keeps repository-only evidence blocked and rejects mock or wrong-kind proof', () => {
    const repositoryEvidence: AiReleaseGateEvidence[] = [
      'repository-tests',
      'web-production-build',
      'miniprogram-production-build',
      'local-zero-network',
    ].map((gateId) => ({
      gateId: gateId as AiReleaseGateId,
      status: 'passed',
      evidenceKind: 'automatic',
      reference: `local://${gateId}`,
      checkedAt: NOW,
    }))
    repositoryEvidence.push({
      gateId: 'iphone-ai-latest',
      status: 'passed',
      evidenceKind: 'automatic',
      reference: 'invalid://simulator',
      checkedAt: NOW,
    })
    repositoryEvidence.push({
      gateId: 'ai-explicit-implicit-labels',
      status: 'passed',
      evidenceKind: 'mock',
      reference: 'mock://label',
      checkedAt: NOW,
    })

    const report = evaluateAiReleaseGates(repositoryEvidence)
    expect(report.status).toBe('blocked')
    expect(report.blocking).toContainEqual({
      gateId: 'iphone-ai-latest',
      reason: 'wrong-kind',
    })
    expect(report.blocking).toContainEqual({
      gateId: 'ai-explicit-implicit-labels',
      reason: 'mock-only',
    })
    expect(() => assertAiReleaseReady(report)).toThrowError(
      expect.objectContaining({ code: 'AI_RELEASE_BLOCKED' }),
    )
  })

  it('separates ready-for-administrator from published and defaults rollout off', () => {
    const ready = evaluateAiReleaseGates(passedEvidence())
    expect(ready.status).toBe('ready-for-administrator')
    expect(() => assertAiReleaseReady(ready)).not.toThrow()

    const beforePublish = decideAiRollout({
      userId: 'user_release_control_001',
      config: {
        enabled: true,
        killSwitch: false,
        percentage: 100,
        version: 'rollout-v1',
      },
      releaseReport: ready,
    })
    expect(beforePublish).toMatchObject({
      enabled: false,
      reason: 'release-gates-blocked',
    })

    const published = evaluateAiReleaseGates(passedEvidence(true))
    expect(published.status).toBe('published')
    expect(
      decideAiRollout({
        userId: 'user_release_control_001',
        config: DEFAULT_AI_ROLLOUT_CONFIG,
        releaseReport: published,
      }),
    ).toMatchObject({ enabled: false, reason: 'kill-switch' })
    expect(
      decideAiRollout({
        userId: 'user_release_control_001',
        config: {
          enabled: true,
          killSwitch: false,
          percentage: 100,
          version: 'rollout-v1',
        },
        releaseReport: published,
      }),
    ).toMatchObject({ enabled: true, reason: 'selected' })
  })

  it('rolls any cohort back to zero with the kill switch enabled', () => {
    expect(
      rollbackAiRollout({
        enabled: true,
        killSwitch: false,
        percentage: 5,
        version: 'rollout-5-percent-v1',
      }),
    ).toEqual({
      enabled: false,
      killSwitch: true,
      percentage: 0,
      version: 'rollout-5-percent-v1-rollback',
    })
  })
})

describe('AI-M5 operational controls', () => {
  it('enforces daily budget, warning threshold, concurrency, and day rollover', () => {
    const guard = new DailyBudgetGuard({
      dailyBudgetMicros: 100_000,
      warningRatio: 0.8,
      maxConcurrentJobs: 2,
    })

    expect(guard.reserve('job-budget-001', 60_000, NOW)).toMatchObject({
      reservedMicros: 60_000,
      alert: 'none',
    })
    expect(guard.reserve('job-budget-002', 20_000, NOW)).toMatchObject({
      reservedMicros: 80_000,
      alert: 'warning',
    })
    expect(() =>
      guard.reserve('job-budget-003', 1_000, NOW),
    ).toThrowError(expect.objectContaining({ code: 'USER_LIMITED' }))
    guard.release('job-budget-002', NOW)
    expect(() =>
      guard.reserve('job-budget-004', 50_000, NOW),
    ).toThrowError(
      expect.objectContaining({ code: 'PROJECT_BUDGET_EXHAUSTED' }),
    )
    expect(guard.settle('job-budget-001', 90_000, NOW)).toMatchObject({
      spentMicros: 90_000,
      alert: 'warning',
    })
    expect(
      guard.snapshot(NOW + 24 * 60 * 60_000),
    ).toMatchObject({
      spentMicros: 0,
      reservedMicros: 0,
      activeJobs: 0,
      alert: 'none',
    })
  })

  it('opens, probes once after cooldown, and closes a provider circuit', () => {
    const breaker = new ProviderCircuitBreaker(2, 1_000)
    expect(breaker.canRequest(NOW)).toBe(true)
    breaker.recordFailure(NOW)
    expect(breaker.snapshot().state).toBe('closed')
    breaker.recordFailure(NOW + 1)
    expect(breaker.snapshot().state).toBe('open')
    expect(breaker.canRequest(NOW + 500)).toBe(false)
    expect(breaker.canRequest(NOW + 1_001)).toBe(true)
    expect(breaker.canRequest(NOW + 1_002)).toBe(false)
    breaker.recordSuccess()
    expect(breaker.snapshot()).toEqual({
      state: 'closed',
      consecutiveFailures: 0,
    })
  })

  it('rotates only key metadata and never accepts secret material', () => {
    const registry = new ProviderKeyMetadataRegistry()
    registry.register({
      provider: 'image-candidate',
      keyId: 'key-meta-v1',
      status: 'active',
      now: NOW,
    })
    registry.register({
      provider: 'image-candidate',
      keyId: 'key-meta-v2',
      status: 'standby',
      now: NOW + 1,
    })
    registry.rotate('image-candidate', 'key-meta-v2', NOW + 2)

    expect(registry.list('image-candidate')).toEqual([
      expect.objectContaining({
        keyId: 'key-meta-v1',
        status: 'retired',
      }),
      expect.objectContaining({
        keyId: 'key-meta-v2',
        status: 'active',
      }),
    ])
    expect(JSON.stringify(registry.list())).not.toMatch(
      /secret|token|credential/i,
    )
  })

  it('blocks deletion audits with missing paths or any failed evidence', () => {
    const complete = [
      'caption_succeeded',
      'caption_failed',
      'canceled',
      'timeout',
      'ttl',
    ].map((reason, index) => ({
      jobId: `job-deletion-audit-${index}`,
      reason: reason as
        | 'caption_succeeded'
        | 'caption_failed'
        | 'canceled'
        | 'timeout'
        | 'ttl',
      status: 'deleted' as const,
      createdAt: NOW + index,
    }))
    expect(auditAudioDeletionEvidence(complete)).toMatchObject({
      status: 'passed',
      failedEvidence: 0,
      missingReasons: [],
    })
    expect(auditAudioDeletionEvidence(complete.slice(0, 4))).toMatchObject({
      status: 'blocked',
      missingReasons: ['ttl'],
    })
    expect(
      auditAudioDeletionEvidence([
        ...complete,
        {
          jobId: 'job-deletion-failed',
          reason: 'timeout',
          status: 'failed',
          errorCode: 'AUDIO_DELETE_UNCONFIRMED',
          createdAt: NOW + 10,
        },
      ]),
    ).toMatchObject({ status: 'blocked', failedEvidence: 1 })
  })
})
