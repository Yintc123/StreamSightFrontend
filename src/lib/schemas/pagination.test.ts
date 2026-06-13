import { describe, it, expect } from 'vitest'
import { CursorPage } from './pagination'

describe('CursorPage', () => {
  it('accepts empty items with null cursor', () => {
    expect(CursorPage.parse({ items: [], nextCursor: null })).toEqual({
      items: [],
      nextCursor: null,
    })
  })

  it('accepts string cursor', () => {
    expect(CursorPage.parse({ items: [1, 2], nextCursor: 'abc' })).toEqual({
      items: [1, 2],
      nextCursor: 'abc',
    })
  })

  it('rejects missing nextCursor', () => {
    expect(() => CursorPage.parse({ items: [] })).toThrow()
  })

  it('rejects non-array items', () => {
    expect(() => CursorPage.parse({ items: 'no', nextCursor: null })).toThrow()
  })
})
