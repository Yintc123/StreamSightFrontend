import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('初始值立即回傳', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300))
    expect(result.current).toBe('a')
  })

  it('值變動：delay 內仍回舊值', () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedValue(v, 300),
      { initialProps: { v: 'a' } },
    )
    rerender({ v: 'b' })
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('a')
  })

  it('delay 後更新為新值', () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedValue(v, 300),
      { initialProps: { v: 'a' } },
    )
    rerender({ v: 'b' })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('b')
  })

  it('連續 5 次 set 在 delay 內 → 只更新 1 次（最後值）', () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useDebouncedValue(v, 300),
      { initialProps: { v: '' } },
    )
    for (const v of ['f', 'fo', 'foo', 'foob', 'fooba']) {
      rerender({ v })
      act(() => {
        vi.advanceTimersByTime(50) // 50ms each, total 250 < 300
      })
    }
    expect(result.current).toBe('')
    // 最後一次更新後再過 300ms
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('fooba')
  })
})
