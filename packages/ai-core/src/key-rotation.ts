import { AiGenerationError } from './errors'

export type ProviderKeyStatus = 'active' | 'standby' | 'retired'

export interface ProviderKeyMetadata {
  provider: string
  keyId: string
  status: ProviderKeyStatus
  createdAt: number
  activatedAt?: number
  retiredAt?: number
}

function safeTime(now: number): number {
  return Number.isFinite(now) ? Math.max(0, Math.round(now)) : 0
}

export class ProviderKeyMetadataRegistry {
  #keys = new Map<string, ProviderKeyMetadata>()

  register(input: {
    provider: string
    keyId: string
    status: 'active' | 'standby'
    now: number
  }): ProviderKeyMetadata {
    const provider = input.provider.trim()
    const keyId = input.keyId.trim()
    if (
      !/^[A-Za-z0-9._-]{2,40}$/.test(provider) ||
      !/^[A-Za-z0-9._-]{4,80}$/.test(keyId) ||
      this.#keys.has(`${provider}:${keyId}`)
    ) {
      throw new AiGenerationError('INVALID_REQUEST')
    }
    if (
      input.status === 'active' &&
      this.list(provider).some((key) => key.status === 'active')
    ) {
      throw new AiGenerationError('JOB_STATE_CONFLICT')
    }

    const timestamp = safeTime(input.now)
    const metadata: ProviderKeyMetadata = {
      provider,
      keyId,
      status: input.status,
      createdAt: timestamp,
      ...(input.status === 'active'
        ? { activatedAt: timestamp }
        : {}),
    }
    this.#keys.set(`${provider}:${keyId}`, metadata)
    return { ...metadata }
  }

  rotate(provider: string, nextKeyId: string, now: number): ProviderKeyMetadata {
    const keys = this.list(provider)
    const next = keys.find((key) => key.keyId === nextKeyId)
    if (!next || next.status !== 'standby') {
      throw new AiGenerationError('INVALID_REQUEST')
    }

    const timestamp = safeTime(now)
    for (const key of this.#keys.values()) {
      if (key.provider === provider && key.status === 'active') {
        key.status = 'retired'
        key.retiredAt = timestamp
      }
    }
    const storedNext = this.#keys.get(`${provider}:${nextKeyId}`)
    if (!storedNext) {
      throw new AiGenerationError('INVALID_REQUEST')
    }
    storedNext.status = 'active'
    storedNext.activatedAt = timestamp
    storedNext.retiredAt = undefined

    return { ...storedNext }
  }

  list(provider?: string): ProviderKeyMetadata[] {
    return [...this.#keys.values()]
      .filter((key) => !provider || key.provider === provider)
      .map((key) => ({ ...key }))
  }
}
