declare module 'culori' {
  interface OklchColor {
    mode: 'oklch'
    l: number
    c: number
    h?: number
    alpha?: number
  }

  export function formatHex(color: OklchColor | string): string | undefined
}
