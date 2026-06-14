import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useScrollPercentSentinel } from './useScrollPercentSentinel'

/**
 * 模擬 viewport：透過 monkey-patch documentElement 的 scrollHeight / clientHeight
 * 與 window.scrollY，以驅動 distFromBottom / percentFromBottom 計算。
 */
function setViewport({
  scrollHeight,
  clientHeight,
  scrollY,
}: {
  scrollHeight: number
  clientHeight: number
  scrollY: number
}) {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  })
  Object.defineProperty(document.documentElement, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  })
  Object.defineProperty(document.documentElement, 'scrollTop', {
    configurable: true,
    get: () => scrollY,
  })
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    get: () => scrollY,
  })
}

describe('useScrollPercentSentinel', () => {
  beforeEach(() => {
    setViewport({ scrollHeight: 2000, clientHeight: 800, scrollY: 0 })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('enabled=false → 不註冊 listener、不觸發', () => {
    const onTrigger = vi.fn()
    renderHook(() => useScrollPercentSentinel({ enabled: false, onTrigger }))
    setViewport({ scrollHeight: 2000, clientHeight: 800, scrollY: 1200 })
    window.dispatchEvent(new Event('scroll'))
    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('enabled=true 且初始已在底端 → 立即觸發一次', () => {
    // scrollY=1200 → distFromBottom = 2000 - 1200 - 800 = 0；percentFromBottom = 0 ≤ 0.1
    setViewport({ scrollHeight: 2000, clientHeight: 800, scrollY: 1200 })
    const onTrigger = vi.fn()
    renderHook(() => useScrollPercentSentinel({ enabled: true, onTrigger }))
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('scroll 到距底 10% 內才觸發', () => {
    const onTrigger = vi.fn()
    renderHook(() =>
      useScrollPercentSentinel({ enabled: true, onTrigger, threshold: 0.1 }),
    )
    // 初始 scrollY=0：distFromBottom = 1200；percent = 1200/2000 = 0.6 (> 0.1) → 不觸
    expect(onTrigger).not.toHaveBeenCalled()

    // 捲到 scrollY=1100：distFromBottom = 2000 - 1100 - 800 = 100；percent = 0.05 ≤ 0.1 → 觸
    act(() => {
      setViewport({ scrollHeight: 2000, clientHeight: 800, scrollY: 1100 })
      window.dispatchEvent(new Event('scroll'))
    })
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('在觸發區內反覆觸發 scroll → 只觸發 1 次（fired latch）', () => {
    const onTrigger = vi.fn()
    renderHook(() => useScrollPercentSentinel({ enabled: true, onTrigger }))
    expect(onTrigger).not.toHaveBeenCalled()

    act(() => {
      setViewport({ scrollHeight: 2000, clientHeight: 800, scrollY: 1150 })
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('scroll'))
    })
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('離開觸發區再回到 → 可重觸發', () => {
    const onTrigger = vi.fn()
    renderHook(() => useScrollPercentSentinel({ enabled: true, onTrigger }))

    act(() => {
      setViewport({ scrollHeight: 2000, clientHeight: 800, scrollY: 1150 })
      window.dispatchEvent(new Event('scroll'))
    })
    expect(onTrigger).toHaveBeenCalledTimes(1)

    // 離開觸發區（滑回上面）
    act(() => {
      setViewport({ scrollHeight: 2000, clientHeight: 800, scrollY: 0 })
      window.dispatchEvent(new Event('scroll'))
    })
    expect(onTrigger).toHaveBeenCalledTimes(1)

    // 再回到觸發區
    act(() => {
      setViewport({ scrollHeight: 2000, clientHeight: 800, scrollY: 1150 })
      window.dispatchEvent(new Event('scroll'))
    })
    expect(onTrigger).toHaveBeenCalledTimes(2)
  })
})
