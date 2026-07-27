export type CircuitBreakerState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerSnapshot {
  state: CircuitBreakerState
  consecutiveFailures: number
  openedAt?: number
}

export class ProviderCircuitBreaker {
  readonly failureThreshold: number
  readonly cooldownMs: number
  #state: CircuitBreakerState = 'closed'
  #consecutiveFailures = 0
  #openedAt?: number
  #halfOpenProbeUsed = false

  constructor(failureThreshold = 3, cooldownMs = 60_000) {
    this.failureThreshold = Math.max(1, Math.floor(failureThreshold))
    this.cooldownMs = Math.max(1, Math.round(cooldownMs))
  }

  canRequest(now: number): boolean {
    const timestamp = Number.isFinite(now)
      ? Math.max(0, Math.round(now))
      : 0

    if (this.#state === 'closed') {
      return true
    }
    if (
      this.#state === 'open' &&
      this.#openedAt !== undefined &&
      timestamp - this.#openedAt >= this.cooldownMs
    ) {
      this.#state = 'half-open'
      this.#halfOpenProbeUsed = false
    }
    if (this.#state === 'half-open' && !this.#halfOpenProbeUsed) {
      this.#halfOpenProbeUsed = true
      return true
    }

    return false
  }

  recordSuccess(): void {
    this.#state = 'closed'
    this.#consecutiveFailures = 0
    this.#openedAt = undefined
    this.#halfOpenProbeUsed = false
  }

  recordFailure(now: number): void {
    this.#consecutiveFailures += 1
    if (
      this.#state === 'half-open' ||
      this.#consecutiveFailures >= this.failureThreshold
    ) {
      this.#state = 'open'
      this.#openedAt = Number.isFinite(now)
        ? Math.max(0, Math.round(now))
        : 0
      this.#halfOpenProbeUsed = false
    }
  }

  snapshot(): CircuitBreakerSnapshot {
    return {
      state: this.#state,
      consecutiveFailures: this.#consecutiveFailures,
      ...(this.#openedAt !== undefined
        ? { openedAt: this.#openedAt }
        : {}),
    }
  }
}
