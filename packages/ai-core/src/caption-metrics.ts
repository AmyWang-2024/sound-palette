export interface CaptionCallMetric {
  status: 'succeeded' | 'failed'
  latencyMs: number
  costMicros: number
}

export interface CaptionMetricSummary {
  calls: number
  succeeded: number
  failed: number
  successRate: number
  latencyP50Ms: number
  latencyP95Ms: number
  totalCostMicros: number
  averageSuccessfulCostMicros: number
}

function safeWhole(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function percentile(sorted: number[], percentileValue: number): number {
  if (sorted.length === 0) {
    return 0
  }

  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1),
  )
  return sorted[index]
}

export function summarizeCaptionMetrics(
  records: CaptionCallMetric[],
): CaptionMetricSummary {
  const normalized = records.map((record) => ({
    status: record.status,
    latencyMs: safeWhole(record.latencyMs),
    costMicros: safeWhole(record.costMicros),
  }))
  const succeeded = normalized.filter(
    (record) => record.status === 'succeeded',
  )
  const latencies = normalized
    .map((record) => record.latencyMs)
    .sort((left, right) => left - right)
  const totalCostMicros = normalized.reduce(
    (total, record) => total + record.costMicros,
    0,
  )
  const successfulCost = succeeded.reduce(
    (total, record) => total + record.costMicros,
    0,
  )

  return {
    calls: normalized.length,
    succeeded: succeeded.length,
    failed: normalized.length - succeeded.length,
    successRate:
      normalized.length === 0 ? 0 : succeeded.length / normalized.length,
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP95Ms: percentile(latencies, 0.95),
    totalCostMicros,
    averageSuccessfulCostMicros:
      succeeded.length === 0
        ? 0
        : Math.round(successfulCost / succeeded.length),
  }
}
