import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useImageWithFallback } from './useImageWithFallback'

describe('useImageWithFallback', () => {
  it('primary 有值 → src = primary', () => {
    const { result } = renderHook(() =>
      useImageWithFallback('https://example.com/a.jpg', '/mock-images/x.svg'),
    )
    expect(result.current.src).toBe('https://example.com/a.jpg')
  })

  it('primary 為 undefined → src = fallback', () => {
    const { result } = renderHook(() =>
      useImageWithFallback(undefined, '/mock-images/x.svg'),
    )
    expect(result.current.src).toBe('/mock-images/x.svg')
  })

  it('primary 為空字串 → src = fallback', () => {
    const { result } = renderHook(() =>
      useImageWithFallback('', '/mock-images/x.svg'),
    )
    expect(result.current.src).toBe('/mock-images/x.svg')
  })

  it('呼叫 onError 後 → src 切到 fallback', () => {
    const { result } = renderHook(() =>
      useImageWithFallback('https://broken/a.jpg', '/mock-images/x.svg'),
    )
    expect(result.current.src).toBe('https://broken/a.jpg')
    act(() => result.current.onError())
    expect(result.current.src).toBe('/mock-images/x.svg')
  })

  it('onError 是穩定 reference（避免子元件不必要 re-render）', () => {
    const { result, rerender } = renderHook(
      ({ p }: { p: string }) =>
        useImageWithFallback(p, '/mock-images/x.svg'),
      { initialProps: { p: 'a.jpg' } },
    )
    const first = result.current.onError
    rerender({ p: 'a.jpg' })
    expect(result.current.onError).toBe(first)
  })

  it('primary 換掉後 → 重置 failed state（再給新 src 一次機會）', () => {
    const { result, rerender } = renderHook(
      ({ p }: { p: string }) =>
        useImageWithFallback(p, '/mock-images/x.svg'),
      { initialProps: { p: 'a.jpg' } },
    )
    act(() => result.current.onError())
    expect(result.current.src).toBe('/mock-images/x.svg')
    rerender({ p: 'b.jpg' })
    expect(result.current.src).toBe('b.jpg')
  })
})
