import { AiGenerationError } from './errors'
import type {
  CreditAccount,
  CreditLedgerEntry,
  CreditLedgerType,
} from './types'

type ReservationState = 'reserved' | 'settled' | 'released'

function safeTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

export class InMemoryCreditService {
  #accounts = new Map<string, CreditAccount>()
  #ledger: CreditLedgerEntry[] = []
  #reservations = new Map<string, ReservationState>()

  ensureAccount(
    userId: string,
    initialCredits: number,
    now: number,
  ): CreditAccount {
    const existing = this.#accounts.get(userId)
    if (existing) {
      return { ...existing }
    }

    const credits = Math.max(0, Math.floor(initialCredits))
    const account: CreditAccount = {
      userId,
      available: credits,
      reserved: 0,
      lifetimeGranted: credits,
      lifetimeSpent: 0,
      version: 1,
      updatedAt: safeTime(now),
    }
    this.#accounts.set(userId, account)

    if (credits > 0) {
      this.#appendLedger(
        userId,
        undefined,
        'grant',
        credits,
        'new_user_grant',
        now,
      )
    }

    return { ...account }
  }

  view(userId: string): CreditAccount {
    const account = this.#accounts.get(userId)
    if (!account) {
      throw new AiGenerationError('AUTH_REQUIRED')
    }

    return { ...account }
  }

  reserve(userId: string, jobId: string, now: number): CreditAccount {
    const account = this.#accounts.get(userId)
    if (!account) {
      throw new AiGenerationError('AUTH_REQUIRED')
    }

    const existing = this.#reservations.get(jobId)
    if (existing) {
      return { ...account }
    }
    if (account.available < 1) {
      throw new AiGenerationError('INSUFFICIENT_CREDITS')
    }

    account.available -= 1
    account.reserved += 1
    account.version += 1
    account.updatedAt = safeTime(now)
    this.#reservations.set(jobId, 'reserved')
    this.#appendLedger(userId, jobId, 'reserve', 1, 'generation', now)

    return { ...account }
  }

  settle(userId: string, jobId: string, now: number): CreditAccount {
    const account = this.#accounts.get(userId)
    if (!account) {
      throw new AiGenerationError('AUTH_REQUIRED')
    }

    const state = this.#reservations.get(jobId)
    if (state === 'settled') {
      return { ...account }
    }
    if (state !== 'reserved' || account.reserved < 1) {
      throw new AiGenerationError('JOB_STATE_CONFLICT')
    }

    account.reserved -= 1
    account.lifetimeSpent += 1
    account.version += 1
    account.updatedAt = safeTime(now)
    this.#reservations.set(jobId, 'settled')
    this.#appendLedger(userId, jobId, 'settle', 1, 'generation_succeeded', now)

    return { ...account }
  }

  release(
    userId: string,
    jobId: string,
    reasonCode: string,
    now: number,
  ): CreditAccount {
    const account = this.#accounts.get(userId)
    if (!account) {
      throw new AiGenerationError('AUTH_REQUIRED')
    }

    const state = this.#reservations.get(jobId)
    if (state === 'released') {
      return { ...account }
    }
    if (state === 'settled') {
      return { ...account }
    }
    if (state !== 'reserved' || account.reserved < 1) {
      throw new AiGenerationError('JOB_STATE_CONFLICT')
    }

    account.available += 1
    account.reserved -= 1
    account.version += 1
    account.updatedAt = safeTime(now)
    this.#reservations.set(jobId, 'released')
    this.#appendLedger(userId, jobId, 'release', 1, reasonCode, now)

    return { ...account }
  }

  adjust(userId: string, amount: number, reasonCode: string, now: number): CreditAccount {
    const account = this.#accounts.get(userId)
    if (!account || !Number.isInteger(amount) || amount === 0) {
      throw new AiGenerationError('INVALID_REQUEST')
    }
    if (account.available + amount < 0) {
      throw new AiGenerationError('INSUFFICIENT_CREDITS')
    }

    account.available += amount
    account.lifetimeGranted += Math.max(0, amount)
    account.version += 1
    account.updatedAt = safeTime(now)
    this.#appendLedger(
      userId,
      undefined,
      'adjustment',
      Math.abs(amount),
      reasonCode,
      now,
    )

    return { ...account }
  }

  ledger(userId?: string): CreditLedgerEntry[] {
    return this.#ledger
      .filter((entry) => !userId || entry.userId === userId)
      .map((entry) => ({ ...entry }))
  }

  reservationState(jobId: string): ReservationState | undefined {
    return this.#reservations.get(jobId)
  }

  #appendLedger(
    userId: string,
    jobId: string | undefined,
    type: CreditLedgerType,
    amount: number,
    reasonCode: string,
    now: number,
  ): void {
    this.#ledger.push({
      ledgerId: `ledger_${String(this.#ledger.length + 1).padStart(6, '0')}`,
      userId,
      ...(jobId ? { jobId } : {}),
      type,
      amount,
      reasonCode,
      createdAt: safeTime(now),
    })
  }
}
