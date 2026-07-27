import { describe, expect, it } from 'vitest'

describe('W2 mini program privacy boundary', () => {
  it('contains no project network, account, or persistent audio calls', () => {
    const modules = import.meta.glob(
      '../miniprogram/**/*.{ts,js,wxml,json}',
      {
        eager: true,
        import: 'default',
        query: '?raw',
      },
    )
    const source = Object.entries(modules)
      .filter(([path]) => !path.includes('/vendor/'))
      .map(([, contents]) => String(contents))
      .join('\n')

    expect(source).not.toMatch(
      /wx\.(?:request|uploadFile|downloadFile|login)\s*\(/,
    )
    expect(source).not.toMatch(
      /\.(?:saveFile|writeFile|appendFile)\s*\(/,
    )
  })
})
