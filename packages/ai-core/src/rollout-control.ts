import type { AiReleaseGateReport } from './release-gates'

export interface AiRolloutConfig {
  enabled: boolean
  killSwitch: boolean
  percentage: number
  version: string
}

export const DEFAULT_AI_ROLLOUT_CONFIG: Readonly<AiRolloutConfig> = {
  enabled: false,
  killSwitch: true,
  percentage: 0,
  version: 'ai-rollout-disabled-v1',
}

export interface AiRolloutDecision {
  enabled: boolean
  reason:
    | 'release-gates-blocked'
    | 'kill-switch'
    | 'feature-disabled'
    | 'outside-cohort'
    | 'selected'
  bucket: number
}

function stableBucket(userId: string, version: string): number {
  let hash = 0x811c9dc5
  const value = `${version}:${userId}`

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0) % 10_000
}

export function decideAiRollout(input: {
  userId: string
  config: AiRolloutConfig
  releaseReport: AiReleaseGateReport
}): AiRolloutDecision {
  const bucket = stableBucket(input.userId, input.config.version)

  if (input.releaseReport.status !== 'published') {
    return { enabled: false, reason: 'release-gates-blocked', bucket }
  }
  if (input.config.killSwitch) {
    return { enabled: false, reason: 'kill-switch', bucket }
  }
  if (!input.config.enabled) {
    return { enabled: false, reason: 'feature-disabled', bucket }
  }

  const percentage = Number.isFinite(input.config.percentage)
    ? Math.min(100, Math.max(0, input.config.percentage))
    : 0
  if (bucket >= percentage * 100) {
    return { enabled: false, reason: 'outside-cohort', bucket }
  }

  return { enabled: true, reason: 'selected', bucket }
}

export function rollbackAiRollout(
  config: AiRolloutConfig,
): AiRolloutConfig {
  return {
    ...config,
    enabled: false,
    killSwitch: true,
    percentage: 0,
    version: `${config.version}-rollback`,
  }
}
