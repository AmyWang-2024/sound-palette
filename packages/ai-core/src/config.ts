export interface AiFeatureConfig {
  enabled: boolean
  allowRealProviders: boolean
}

export const DEFAULT_AI_FEATURE_CONFIG: Readonly<AiFeatureConfig> = {
  enabled: false,
  allowRealProviders: false,
}

export function createAiFeatureConfig(
  overrides: Partial<AiFeatureConfig> = {},
): AiFeatureConfig {
  return {
    enabled: overrides.enabled === true,
    allowRealProviders: overrides.allowRealProviders === true,
  }
}

export interface MockTaskServiceConfig {
  initialCredits: number
  userDailyJobLimit: number
  projectDailyJobBudget: number
  uploadAuthorizationTtlMs: number
  captionTokenTtlMs: number
  resultTtlMs: number
  consentVersion: string
}

export const DEFAULT_MOCK_TASK_SERVICE_CONFIG: Readonly<MockTaskServiceConfig> = {
  initialCredits: 3,
  userDailyJobLimit: 5,
  projectDailyJobBudget: 100,
  uploadAuthorizationTtlMs: 60_000,
  captionTokenTtlMs: 10 * 60_000,
  resultTtlMs: 60 * 60_000,
  consentVersion: 'ai-privacy-v1',
}

export function createMockTaskServiceConfig(
  overrides: Partial<MockTaskServiceConfig> = {},
): MockTaskServiceConfig {
  const whole = (value: number | undefined, fallback: number, minimum = 0) =>
    Number.isFinite(value)
      ? Math.max(minimum, Math.floor(value ?? fallback))
      : fallback

  return {
    initialCredits: whole(
      overrides.initialCredits,
      DEFAULT_MOCK_TASK_SERVICE_CONFIG.initialCredits,
    ),
    userDailyJobLimit: whole(
      overrides.userDailyJobLimit,
      DEFAULT_MOCK_TASK_SERVICE_CONFIG.userDailyJobLimit,
      1,
    ),
    projectDailyJobBudget: whole(
      overrides.projectDailyJobBudget,
      DEFAULT_MOCK_TASK_SERVICE_CONFIG.projectDailyJobBudget,
      1,
    ),
    uploadAuthorizationTtlMs: whole(
      overrides.uploadAuthorizationTtlMs,
      DEFAULT_MOCK_TASK_SERVICE_CONFIG.uploadAuthorizationTtlMs,
      1,
    ),
    captionTokenTtlMs: whole(
      overrides.captionTokenTtlMs,
      DEFAULT_MOCK_TASK_SERVICE_CONFIG.captionTokenTtlMs,
      1,
    ),
    resultTtlMs: whole(
      overrides.resultTtlMs,
      DEFAULT_MOCK_TASK_SERVICE_CONFIG.resultTtlMs,
      1,
    ),
    consentVersion:
      overrides.consentVersion?.trim() ||
      DEFAULT_MOCK_TASK_SERVICE_CONFIG.consentVersion,
  }
}
