export type FallbackKind = 'donation' | 'item'

export const FALLBACK_POOL_SIZE = 6

function hash(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i)
  }
  return h >>> 0
}

export function pickFallbackImage(kind: FallbackKind, id: string): string {
  const n = (hash(id) % FALLBACK_POOL_SIZE) + 1
  return `/mock-images/${kind}/${n}.svg`
}
