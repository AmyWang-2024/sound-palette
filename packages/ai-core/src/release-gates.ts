import { AiGenerationError } from './errors'

export const AI_RELEASE_GATE_IDS = [
  'repository-tests',
  'web-production-build',
  'miniprogram-production-build',
  'local-zero-network',
  'android-local-latest',
  'iphone-local-latest',
  'android-ai-latest',
  'iphone-ai-latest',
  'mainland-network-benchmark',
  'privacy-platform-config',
  'ai-terms-approved',
  'miniprogram-filing',
  'supplier-contracts',
  'temporary-audio-deletion',
  'ai-explicit-implicit-labels',
  'supplier-blind-evaluation',
  'production-budget-alerts',
  'production-service-deployed',
  'experience-version-accepted',
  'wechat-review-approved',
  'administrator-published',
] as const

export type AiReleaseGateId =
  (typeof AI_RELEASE_GATE_IDS)[number]

export type ReleaseEvidenceKind =
  | 'automatic'
  | 'real-device'
  | 'platform'
  | 'supplier'
  | 'operations'
  | 'mock'

export interface AiReleaseGateEvidence {
  gateId: AiReleaseGateId
  status: 'passed' | 'failed' | 'not-verified'
  evidenceKind: ReleaseEvidenceKind
  reference: string
  checkedAt: number
}

export interface AiReleaseGateReport {
  status: 'blocked' | 'ready-for-administrator' | 'published'
  passed: AiReleaseGateId[]
  blocking: Array<{
    gateId: AiReleaseGateId
    reason:
      | 'missing'
      | 'failed'
      | 'not-verified'
      | 'mock-only'
      | 'wrong-kind'
  }>
}

const REQUIRED_EVIDENCE_KIND: Record<
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

export function evaluateAiReleaseGates(
  evidence: AiReleaseGateEvidence[],
): AiReleaseGateReport {
  const latest = new Map<AiReleaseGateId, AiReleaseGateEvidence>()

  for (const item of evidence) {
    const existing = latest.get(item.gateId)
    if (!existing || item.checkedAt >= existing.checkedAt) {
      latest.set(item.gateId, item)
    }
  }

  const passed: AiReleaseGateId[] = []
  const blocking: AiReleaseGateReport['blocking'] = []

  for (const gateId of AI_RELEASE_GATE_IDS) {
    if (gateId === 'administrator-published') {
      continue
    }
    const item = latest.get(gateId)
    if (!item) {
      blocking.push({ gateId, reason: 'missing' })
    } else if (item.evidenceKind === 'mock') {
      blocking.push({ gateId, reason: 'mock-only' })
    } else if (
      item.evidenceKind !== REQUIRED_EVIDENCE_KIND[gateId]
    ) {
      blocking.push({ gateId, reason: 'wrong-kind' })
    } else if (item.status === 'failed') {
      blocking.push({ gateId, reason: 'failed' })
    } else if (item.status !== 'passed') {
      blocking.push({ gateId, reason: 'not-verified' })
    } else {
      passed.push(gateId)
    }
  }

  const administratorEvidence = latest.get('administrator-published')
  if (administratorEvidence?.status === 'failed') {
    blocking.push({
      gateId: 'administrator-published',
      reason: 'failed',
    })
  }
  const administratorPublished =
    administratorEvidence?.status === 'passed' &&
    administratorEvidence.evidenceKind === 'platform'

  return {
    status:
      blocking.length > 0
        ? 'blocked'
        : administratorPublished
          ? 'published'
          : 'ready-for-administrator',
    passed,
    blocking,
  }
}

export function assertAiReleaseReady(
  report: AiReleaseGateReport,
): void {
  if (report.status === 'blocked') {
    throw new AiGenerationError('AI_RELEASE_BLOCKED')
  }
}
