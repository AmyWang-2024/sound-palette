import { AiGenerationError } from './errors'

export interface BudgetGuardConfig {
  dailyBudgetMicros: number
  warningRatio: number
  maxConcurrentJobs: number
}

interface BudgetReservation {
  estimatedMicros: number
}

export interface BudgetSnapshot {
  day: string
  spentMicros: number
  reservedMicros: number
  activeJobs: number
  dailyBudgetMicros: number
  utilization: number
  alert: 'none' | 'warning' | 'exhausted'
}

function dayKey(now: number): string {
  return new Date(
    Number.isFinite(now) ? Math.max(0, Math.round(now)) : 0,
  )
    .toISOString()
    .slice(0, 10)
}

export class DailyBudgetGuard {
  readonly config: BudgetGuardConfig
  #day = ''
  #spentMicros = 0
  #reservations = new Map<string, BudgetReservation>()

  constructor(config: BudgetGuardConfig) {
    this.config = {
      dailyBudgetMicros: Math.max(
        1,
        Math.round(config.dailyBudgetMicros),
      ),
      warningRatio: Math.min(
        0.99,
        Math.max(0.01, config.warningRatio),
      ),
      maxConcurrentJobs: Math.max(
        1,
        Math.floor(config.maxConcurrentJobs),
      ),
    }
  }

  reserve(jobId: string, estimatedMicros: number, now: number): BudgetSnapshot {
    this.#rollDay(now)
    if (this.#reservations.has(jobId)) {
      return this.snapshot(now)
    }
    const estimate = Math.max(0, Math.round(estimatedMicros))
    if (this.#reservations.size >= this.config.maxConcurrentJobs) {
      throw new AiGenerationError('USER_LIMITED')
    }
    const reserved = this.#reservedMicros()
    if (
      this.#spentMicros + reserved + estimate >
      this.config.dailyBudgetMicros
    ) {
      throw new AiGenerationError('PROJECT_BUDGET_EXHAUSTED')
    }

    this.#reservations.set(jobId, { estimatedMicros: estimate })
    return this.snapshot(now)
  }

  settle(jobId: string, actualMicros: number, now: number): BudgetSnapshot {
    this.#rollDay(now)
    if (!this.#reservations.has(jobId)) {
      return this.snapshot(now)
    }
    this.#reservations.delete(jobId)
    this.#spentMicros += Math.max(0, Math.round(actualMicros))
    return this.snapshot(now)
  }

  release(jobId: string, now: number): BudgetSnapshot {
    this.#rollDay(now)
    this.#reservations.delete(jobId)
    return this.snapshot(now)
  }

  snapshot(now: number): BudgetSnapshot {
    this.#rollDay(now)
    const reservedMicros = this.#reservedMicros()
    const utilization =
      (this.#spentMicros + reservedMicros) /
      this.config.dailyBudgetMicros

    return {
      day: this.#day,
      spentMicros: this.#spentMicros,
      reservedMicros,
      activeJobs: this.#reservations.size,
      dailyBudgetMicros: this.config.dailyBudgetMicros,
      utilization,
      alert:
        utilization >= 1
          ? 'exhausted'
          : utilization >= this.config.warningRatio
            ? 'warning'
            : 'none',
    }
  }

  #reservedMicros(): number {
    return [...this.#reservations.values()].reduce(
      (total, reservation) => total + reservation.estimatedMicros,
      0,
    )
  }

  #rollDay(now: number): void {
    const nextDay = dayKey(now)
    if (this.#day && this.#day !== nextDay) {
      this.#spentMicros = 0
      this.#reservations.clear()
    }
    this.#day = nextDay
  }
}
