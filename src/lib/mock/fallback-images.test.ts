import { describe, it, expect } from 'vitest'
import { pickFallbackImage, FALLBACK_POOL_SIZE } from './fallback-images'

describe('pickFallbackImage', () => {
  it('回傳 /mock-images/<kind>/<n>.svg 的 path', () => {
    const url = pickFallbackImage('donation', 'any-id')
    expect(url).toMatch(/^\/mock-images\/donation\/[1-6]\.svg$/)
  })

  it('支援 donation / item 兩種 kind', () => {
    expect(pickFallbackImage('donation', 'x')).toMatch(/\/donation\//)
    expect(pickFallbackImage('item', 'x')).toMatch(/\/item\//)
  })

  it('deterministic：同 (kind, id) → 必同結果', () => {
    const id = '11111111-1111-4111-8111-000000000001'
    expect(pickFallbackImage('donation', id)).toBe(
      pickFallbackImage('donation', id),
    )
    expect(pickFallbackImage('item', id)).toBe(
      pickFallbackImage('item', id),
    )
  })

  it('不同 id → 在足夠樣本下分散到 ≥3 張不同圖', () => {
    const ids = Array.from({ length: 30 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    )
    const picked = new Set(ids.map((id) => pickFallbackImage('item', id)))
    expect(picked.size).toBeGreaterThanOrEqual(3)
  })

  it('空字串 id 也能回傳有效 path（不 throw）', () => {
    expect(pickFallbackImage('donation', '')).toMatch(
      /^\/mock-images\/donation\/[1-6]\.svg$/,
    )
  })

  it('FALLBACK_POOL_SIZE === 6（與 public/mock-images/* 檔案數同步）', () => {
    expect(FALLBACK_POOL_SIZE).toBe(6)
  })
})
