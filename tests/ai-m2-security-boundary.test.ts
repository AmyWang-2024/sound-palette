import { describe, expect, it } from 'vitest'

describe('AI-M2 mock service security boundary', () => {
  it('contains no real network client, platform login call, or embedded secret', () => {
    const modules = import.meta.glob('../packages/ai-core/src/**/*.ts', {
      eager: true,
      import: 'default',
      query: '?raw',
    })
    const source = Object.values(modules).map(String).join('\n')

    expect(source).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(|wx\.(?:login|request|uploadFile)\s*\(/,
    )
    expect(source).not.toMatch(
      /\b(?:AppSecret|session_key|OPENAI_API_KEY|DASHSCOPE_API_KEY)\b\s*[:=]/,
    )
    expect(source).not.toMatch(/https?:\/\//)
  })
})
