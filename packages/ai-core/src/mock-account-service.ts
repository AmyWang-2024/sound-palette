import { AiGenerationError } from './errors'
import type {
  AiAccountView,
  AiUserStatus,
  MockAuthResult,
} from './types'

interface StoredUser {
  userId: string
  wechatSubject: string
  status: AiUserStatus
  consentVersion: string
  consentedAt: number
  createdAt: number
  updatedAt: number
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

function safeTime(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function accountView(user: StoredUser): AiAccountView {
  return {
    userId: user.userId,
    status: user.status,
    consentVersion: user.consentVersion,
    consentedAt: user.consentedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export class MockWechatAccountService {
  #usersBySubject = new Map<string, StoredUser>()
  #tokens = new Map<string, string>()

  authenticate(
    loginCode: string,
    consentVersion: string,
    now: number,
  ): MockAuthResult {
    const normalizedCode = loginCode.trim()
    const normalizedConsent = consentVersion.trim()

    if (!normalizedCode) {
      throw new AiGenerationError('AUTH_REQUIRED')
    }
    if (!normalizedConsent) {
      throw new AiGenerationError('CONSENT_REQUIRED')
    }

    const timestamp = safeTime(now)
    const subjectHash = stableHash(`wechat:${normalizedCode}`)
    const protectedSubject = `protected:${subjectHash}`
    let user = this.#usersBySubject.get(protectedSubject)

    if (!user) {
      user = {
        userId: `user_${subjectHash}`,
        wechatSubject: protectedSubject,
        status: 'active',
        consentVersion: normalizedConsent,
        consentedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      this.#usersBySubject.set(protectedSubject, user)
    } else {
      user.consentVersion = normalizedConsent
      user.consentedAt = timestamp
      user.updatedAt = timestamp
    }

    const token = `mock_business_${stableHash(
      `${user.userId}:${timestamp}:${this.#tokens.size}`,
    )}`
    this.#tokens.set(token, user.userId)

    return {
      businessToken: token,
      account: accountView(user),
    }
  }

  resolve(businessToken: string): AiAccountView {
    const userId = this.#tokens.get(businessToken)
    const user = userId
      ? [...this.#usersBySubject.values()].find(
          (candidate) => candidate.userId === userId,
        )
      : undefined

    if (!user || user.status === 'deleted') {
      throw new AiGenerationError('AUTH_REQUIRED')
    }
    if (user.status === 'limited') {
      throw new AiGenerationError('USER_LIMITED')
    }

    return accountView(user)
  }

  setStatus(userId: string, status: AiUserStatus, now: number): void {
    const user = [...this.#usersBySubject.values()].find(
      (candidate) => candidate.userId === userId,
    )

    if (!user) {
      throw new AiGenerationError('AUTH_REQUIRED')
    }

    user.status = status
    user.updatedAt = safeTime(now)
  }

  debugProtectedSubjects(): string[] {
    return [...this.#usersBySubject.values()].map(
      (user) => user.wechatSubject,
    )
  }
}
