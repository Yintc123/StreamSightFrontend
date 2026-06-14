import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const replaceMock = vi.fn()
let currentSearch = ''
const MOCK_PATHNAME = '/donation'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  usePathname: () => MOCK_PATHNAME,
}))

import { useUrlSync } from './useUrlSync'

describe('useUrlSync', () => {
  beforeEach(() => {
    replaceMock.mockClear()
    currentSearch = ''
  })

  it('URL 已是空 + 所有 params 都空 → 不呼叫 replace（避免無限 loop）', () => {
    renderHook(() =>
      useUrlSync({ q: '', tab: undefined, category: undefined }),
    )
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('URL 已含目標 params + 給的 values 跟 URL 一致 → 不呼叫 replace（防無限迴圈核心）', () => {
    currentSearch = 'tab=item&category=animal_protection'
    renderHook(() =>
      useUrlSync({
        q: undefined,
        tab: 'item',
        category: 'animal_protection',
      }),
    )
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('q 有值 但 URL 沒 → ?q=foo', () => {
    renderHook(() =>
      useUrlSync({ q: 'foo', tab: undefined, category: undefined }),
    )
    expect(replaceMock).toHaveBeenCalledWith('/donation?q=foo', {
      scroll: false,
    })
  })

  it('tab + category 從空 URL 寫入', () => {
    renderHook(() =>
      useUrlSync({
        q: '',
        tab: 'item',
        category: 'animal_protection',
      }),
    )
    expect(replaceMock).toHaveBeenCalledTimes(1)
    const [url, opts] = replaceMock.mock.calls[0]
    expect(url).toContain('tab=item')
    expect(url).toContain('category=animal_protection')
    expect(opts).toEqual({ scroll: false })
  })

  it('既有 URL searchParams 保留未指定的 key', () => {
    currentSearch = 'utm=abc'
    renderHook(() =>
      useUrlSync({ q: 'bar', tab: undefined, category: undefined }),
    )
    const called = replaceMock.mock.calls[0][0] as string
    expect(called).toContain('utm=abc')
    expect(called).toContain('q=bar')
  })

  it('清空 q 時 drop ?q=', () => {
    currentSearch = 'q=old'
    renderHook(() =>
      useUrlSync({ q: '', tab: undefined, category: undefined }),
    )
    expect(replaceMock).toHaveBeenCalledWith('/donation', { scroll: false })
  })

  it('scroll: false 始終為 true（避免每次 URL 變動都 scroll-to-top）', () => {
    renderHook(() =>
      useUrlSync({ q: 'foo', tab: undefined, category: undefined }),
    )
    const opts = replaceMock.mock.calls[0][1]
    expect(opts).toEqual({ scroll: false })
  })
})
