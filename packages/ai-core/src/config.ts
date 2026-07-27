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
