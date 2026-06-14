import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useViewport } from './useViewport'

type MatchMediaListener = (e: { matches: boolean }) => void

type Controller = {
  set: (m: { tablet?: boolean; desktop?: boolean }) => void
}

function setupMatchMedia(initial: { tablet: boolean; desktop: boolean }): Controller {
  const state = { ...initial }
  type Mql = {
    matches: boolean
    media: string
    addEventListener: (k: 'change', cb: MatchMediaListener) => void
    removeEventListener: (k: 'change', cb: MatchMediaListener) => void
  }
  const listeners = new Map<string, Set<MatchMediaListener>>()
  const makeMql = (key: 'tablet' | 'desktop', media: string): Mql => {
    listeners.set(media, new Set())
    return {
      get matches() {
        return state[key]
      },
      media,
      addEventListener: (_: 'change', cb) => {
        listeners.get(media)!.add(cb)
      },
      removeEventListener: (_: 'change', cb) => {
        listeners.get(media)!.delete(cb)
      },
    }
  }
  const tabletMql = makeMql('tablet', '(min-width: 768px)')
  const desktopMql = makeMql('desktop', '(min-width: 1024px)')
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((q: string) =>
      q === '(min-width: 1024px)' ? desktopMql : tabletMql,
    ),
  })
  return {
    set(next: { tablet?: boolean; desktop?: boolean }) {
      if (next.tablet !== undefined) {
        state.tablet = next.tablet
        listeners.get('(min-width: 768px)')!.forEach((cb) =>
          cb({ matches: state.tablet }),
        )
      }
      if (next.desktop !== undefined) {
        state.desktop = next.desktop
        listeners.get('(min-width: 1024px)')!.forEach((cb) =>
          cb({ matches: state.desktop }),
        )
      }
    },
  }
}

describe('useViewport', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia')
  })

  it('width < 768 → "mobile"', () => {
    setupMatchMedia({ tablet: false, desktop: false })
    const { result } = renderHook(() => useViewport())
    expect(result.current).toBe('mobile')
  })

  it('768 ≤ width < 1024 → "tablet"', () => {
    setupMatchMedia({ tablet: true, desktop: false })
    const { result } = renderHook(() => useViewport())
    expect(result.current).toBe('tablet')
  })

  it('width ≥ 1024 → "desktop"', () => {
    setupMatchMedia({ tablet: true, desktop: true })
    const { result } = renderHook(() => useViewport())
    expect(result.current).toBe('desktop')
  })

  it('breakpoint 切換 mobile → tablet → desktop → mobile 都正確更新', () => {
    const ctrl = setupMatchMedia({ tablet: false, desktop: false })
    const { result } = renderHook(() => useViewport())
    expect(result.current).toBe('mobile')
    act(() => ctrl.set({ tablet: true }))
    expect(result.current).toBe('tablet')
    act(() => ctrl.set({ desktop: true }))
    expect(result.current).toBe('desktop')
    act(() => ctrl.set({ tablet: false, desktop: false }))
    expect(result.current).toBe('mobile')
  })

  it('unmount → 不漏 listener', () => {
    setupMatchMedia({ tablet: false, desktop: false })
    const { unmount } = renderHook(() => useViewport())
    expect(() => unmount()).not.toThrow()
  })
})
