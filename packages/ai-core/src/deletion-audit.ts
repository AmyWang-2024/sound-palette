import type {
  AudioDeletionEvidence,
  AudioDeletionReason,
} from './temporary-audio'

export const REQUIRED_AUDIO_DELETION_REASONS = [
  'caption_succeeded',
  'caption_failed',
  'canceled',
  'timeout',
  'ttl',
] as const satisfies readonly AudioDeletionReason[]

export interface AudioDeletionAuditReport {
  status: 'passed' | 'blocked'
  totalEvidence: number
  failedEvidence: number
  missingReasons: AudioDeletionReason[]
  duplicateJobIds: string[]
}

export function auditAudioDeletionEvidence(
  evidence: AudioDeletionEvidence[],
): AudioDeletionAuditReport {
  const reasons = new Set<AudioDeletionReason>()
  const jobIds = new Set<string>()
  const duplicateJobIds = new Set<string>()
  let failedEvidence = 0

  for (const item of evidence) {
    reasons.add(item.reason)
    if (jobIds.has(item.jobId)) {
      duplicateJobIds.add(item.jobId)
    }
    jobIds.add(item.jobId)
    if (item.status === 'failed') {
      failedEvidence += 1
    }
  }

  const missingReasons = REQUIRED_AUDIO_DELETION_REASONS.filter(
    (reason) => !reasons.has(reason),
  )

  return {
    status:
      failedEvidence === 0 && missingReasons.length === 0
        ? 'passed'
        : 'blocked',
    totalEvidence: evidence.length,
    failedEvidence,
    missingReasons,
    duplicateJobIds: [...duplicateJobIds],
  }
}
