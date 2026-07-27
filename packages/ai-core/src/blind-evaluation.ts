import type { Mood } from '../../core/src'
import type { ImageCandidateId } from './image-candidate-provider'

export const BLIND_SOUND_CATEGORIES = [
  'quiet',
  'rain',
  'street',
  'ambient-speech',
  'nature',
  'music',
  'transient',
  'sustained-low',
] as const

export type BlindSoundCategory =
  (typeof BLIND_SOUND_CATEGORIES)[number]

export const BLIND_SCORE_DIMENSIONS = [
  'appeal',
  'soundRelation',
  'compositionVariation',
  'styleConsistency',
  'latency',
  'cost',
  'shareability',
] as const

export type BlindScoreDimension =
  (typeof BLIND_SCORE_DIMENSIONS)[number]

export interface BlindEvaluationCase {
  evaluationId: string
  groupId: string
  category: BlindSoundCategory
  variant: 1 | 2 | 3
  mood: Mood
  candidateCode: 'A' | 'B'
  outputRef: string
}

export interface BlindEvaluationKey {
  A: ImageCandidateId
  B: ImageCandidateId
}

export interface BlindEvaluationPlan {
  version: 1
  inputGroups: number
  moodsPerGroup: 3
  candidatesPerMood: 2
  cases: BlindEvaluationCase[]
}

export interface BlindEvaluationScore {
  evaluationId: string
  reviewerId: string
  scores: Record<BlindScoreDimension, number>
}

export interface BlindEvaluationSummary {
  status: 'incomplete' | 'ready-for-human-decision'
  expectedCases: number
  scoredCases: number
  missingCases: number
  candidateAverages: Record<
    'A' | 'B',
    Record<BlindScoreDimension, number>
  >
  automaticWinner: null
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}

function emptyAverages(): Record<BlindScoreDimension, number> {
  return {
    appeal: 0,
    soundRelation: 0,
    compositionVariation: 0,
    styleConsistency: 0,
    latency: 0,
    cost: 0,
    shareability: 0,
  }
}

export function createBlindEvaluationPlan(seed: string): {
  evaluatorPlan: BlindEvaluationPlan
  sealedKey: BlindEvaluationKey
} {
  const swapped = stableHash(seed) % 2 === 1
  const sealedKey: BlindEvaluationKey = swapped
    ? { A: 'hunyuan-image-fast', B: 'z-image-turbo' }
    : { A: 'z-image-turbo', B: 'hunyuan-image-fast' }
  const moods: Mood[] = ['good', 'neutral', 'low']
  const groups = BLIND_SOUND_CATEGORIES.flatMap((category) =>
    ([1, 2, 3] as const).map((variant) => ({
      groupId: `${category}-${variant}`,
      category,
      variant,
    })),
  )
  const cases = groups.flatMap((group) =>
    moods.flatMap((mood) =>
      (['A', 'B'] as const).map((candidateCode) => {
        const evaluationId = [
          group.groupId,
          mood,
          candidateCode,
        ].join(':')

        return {
          evaluationId,
          ...group,
          mood,
          candidateCode,
          outputRef: `blind://${stableHash(
            `${seed}:${evaluationId}`,
          ).toString(16)}`,
        }
      }),
    ),
  )

  return {
    evaluatorPlan: {
      version: 1,
      inputGroups: groups.length,
      moodsPerGroup: 3,
      candidatesPerMood: 2,
      cases,
    },
    sealedKey,
  }
}

export function summarizeBlindEvaluation(
  plan: BlindEvaluationPlan,
  scores: BlindEvaluationScore[],
): BlindEvaluationSummary {
  const cases = new Map(
    plan.cases.map((evaluationCase) => [
      evaluationCase.evaluationId,
      evaluationCase,
    ]),
  )
  const validScores = new Map<string, BlindEvaluationScore>()

  for (const score of scores) {
    if (
      !cases.has(score.evaluationId) ||
      !score.reviewerId.trim() ||
      !BLIND_SCORE_DIMENSIONS.every((dimension) => {
        const value = score.scores[dimension]
        return Number.isInteger(value) && value >= 1 && value <= 5
      })
    ) {
      continue
    }
    validScores.set(score.evaluationId, score)
  }

  const totals = {
    A: emptyAverages(),
    B: emptyAverages(),
  }
  const counts = { A: 0, B: 0 }

  for (const [evaluationId, score] of validScores) {
    const candidateCode = cases.get(evaluationId)?.candidateCode
    if (!candidateCode) {
      continue
    }
    counts[candidateCode] += 1
    for (const dimension of BLIND_SCORE_DIMENSIONS) {
      totals[candidateCode][dimension] += score.scores[dimension]
    }
  }

  for (const candidateCode of ['A', 'B'] as const) {
    for (const dimension of BLIND_SCORE_DIMENSIONS) {
      totals[candidateCode][dimension] =
        counts[candidateCode] === 0
          ? 0
          : Math.round(
              (totals[candidateCode][dimension] /
                counts[candidateCode]) *
                100,
            ) / 100
    }
  }

  const scoredCases = validScores.size
  const expectedCases = plan.cases.length

  return {
    status:
      scoredCases === expectedCases
        ? 'ready-for-human-decision'
        : 'incomplete',
    expectedCases,
    scoredCases,
    missingCases: Math.max(0, expectedCases - scoredCases),
    candidateAverages: totals,
    automaticWinner: null,
  }
}
