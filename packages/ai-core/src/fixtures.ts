import type { AiGenerationRequest } from './types'

export const MOCK_AI_REQUEST: Readonly<AiGenerationRequest> = {
  jobId: '00000000-0000-4000-8000-000000000001',
  consentVersion: 'mock-consent-v1',
  mood: 'neutral',
  summary: {
    loudness: 0.42,
    lowEnergy: 0.28,
    midEnergy: 0.51,
    highEnergy: 0.21,
    changeRate: 0.33,
  },
  audioToken: 'fixture://rain-and-distant-traffic',
  clientVersion: 'ai-m0-test',
}
