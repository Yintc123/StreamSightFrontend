import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  DEFAULT_FORM,
  buildPayload,
  isValid,
  reducer,
  useCharityForm,
  type FormState,
} from './useCharityForm'

const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccessMock(...a),
    error: (...a: unknown[]) => toastErrorMock(...a),
  },
}))

const routerReplaceMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/cms/charities/new',
}))

const fetchMock = vi.fn<typeof fetch>()

function csrfResp(): Response {
  return new Response(JSON.stringify({ data: { csrfToken: 'csrf-token-x' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

// Most tests don't care which endpoint is hit — they want the same response
// regardless. This wrapper intercepts /api/csrf first (so getCsrfToken works)
// and routes everything else to the test-defined response.
function setFetchResponse(mutationResp: Response | Error) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.endsWith('/api/csrf')) return csrfResp()
    if (mutationResp instanceof Error) throw mutationResp
    return mutationResp
  })
}

beforeEach(() => {
  toastSuccessMock.mockReset()
  toastErrorMock.mockReset()
  routerReplaceMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

// ── Reducer (R) ──────────────────────────────────────────────────────────

describe('reducer', () => {
  it('R1: DEFAULT_FORM sanity', () => {
    expect(DEFAULT_FORM.name).toBe('')
    expect(DEFAULT_FORM.displayOrder).toBe(0)
    expect(DEFAULT_FORM.categoryIds).toEqual([])
  })

  it('R2: SET_NAME → s.name 更新、其他不變', () => {
    const s = reducer(DEFAULT_FORM, { type: 'SET_NAME', value: 'X' })
    expect(s.name).toBe('X')
    expect(s.description).toBe('')
  })

  it('R3: SET_DISPLAY_ORDER → 數字', () => {
    const s = reducer(DEFAULT_FORM, { type: 'SET_DISPLAY_ORDER', value: 5 })
    expect(s.displayOrder).toBe(5)
  })

  it('R4: HYDRATE → 整個 state 換掉', () => {
    const init: FormState = { ...DEFAULT_FORM, name: '已存在' }
    const s = reducer(DEFAULT_FORM, { type: 'HYDRATE', value: init })
    expect(s).toEqual(init)
  })

  it('R5: SET_CATEGORY_IDS → array 替換', () => {
    const s = reducer(DEFAULT_FORM, {
      type: 'SET_CATEGORY_IDS',
      value: ['a', 'b'],
    })
    expect(s.categoryIds).toEqual(['a', 'b'])
  })
})

// ── isValid (V) ──────────────────────────────────────────────────────────

describe('isValid', () => {
  function withRequired(over: Partial<FormState> = {}): FormState {
    return { ...DEFAULT_FORM, name: 'X', description: 'd', ...over }
  }

  it('V1: name 空 → false', () => {
    expect(isValid({ ...withRequired(), name: '' })).toBe(false)
  })

  it('V2: name 超過 120 → false', () => {
    expect(isValid({ ...withRequired(), name: 'a'.repeat(121) })).toBe(false)
  })

  it('V3: description 空 → false', () => {
    expect(isValid({ ...withRequired(), description: '' })).toBe(false)
  })

  it('V4: publishEnd <= publishStart → false', () => {
    expect(
      isValid({
        ...withRequired(),
        publishStartAt: '2026-06-16T03:00:00.000Z',
        publishEndAt: '2026-06-16T03:00:00.000Z',
      }),
    ).toBe(false)
  })

  it('V5: categoryIds 17 個 → false', () => {
    expect(
      isValid({
        ...withRequired(),
        categoryIds: Array.from({ length: 17 }, (_, i) => String(i)),
      }),
    ).toBe(false)
  })

  it('V6: 必填齊 + optional 空 → true', () => {
    expect(isValid(withRequired())).toBe(true)
  })

  it('V7: contactEmail 非 email → false', () => {
    expect(isValid({ ...withRequired(), contactEmail: 'no-at-sign' })).toBe(
      false,
    )
  })
})

// ── buildPayload (P) ─────────────────────────────────────────────────────

describe('buildPayload', () => {
  function full(over: Partial<FormState> = {}): FormState {
    return {
      ...DEFAULT_FORM,
      name: '  trim 前後  ',
      description: 'd',
      ...over,
    }
  }

  it('P1: name trim', () => {
    expect(buildPayload(full()).name).toBe('trim 前後')
  })

  it('P2: optional 空字串 → key omit', () => {
    const p = buildPayload(full())
    expect(p).not.toHaveProperty('contactPhone')
    expect(p).not.toHaveProperty('contactEmail')
    expect(p).not.toHaveProperty('officialWebsite')
    expect(p).not.toHaveProperty('approvalNo')
    expect(p).not.toHaveProperty('publishStartAt')
    expect(p).not.toHaveProperty('publishEndAt')
  })

  it('P3: optional 有值 → key 帶入', () => {
    const p = buildPayload(
      full({
        contactPhone: '02-12345678',
        contactEmail: 'x@y.com',
      }),
    )
    expect(p.contactPhone).toBe('02-12345678')
    expect(p.contactEmail).toBe('x@y.com')
  })

  it('P4: categoryIds 永遠 array', () => {
    expect(buildPayload(full()).categoryIds).toEqual([])
    expect(buildPayload(full({ categoryIds: ['a'] })).categoryIds).toEqual(['a'])
  })
})

// ── Hook (H) — async handleSubmit ────────────────────────────────────────

describe('useCharityForm', () => {
  it('H1: 初始 invalid（name 空）', () => {
    const { result } = renderHook(() => useCharityForm())
    expect(result.current.isValid).toBe(false)
  })

  it('H2: dispatch 後 isValid 反映', () => {
    const { result } = renderHook(() => useCharityForm())
    act(() => {
      result.current.dispatch({ type: 'SET_NAME', value: 'X' })
    })
    act(() => {
      result.current.dispatch({ type: 'SET_DESCRIPTION', value: 'd' })
    })
    expect(result.current.isValid).toBe(true)
  })

  it('H3: invalid 時 handleSubmit → fetch 不叫', async () => {
    const { result } = renderHook(() => useCharityForm())
    await act(async () => {
      await result.current.handleSubmit()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('H4: create happy → POST /api/cms/charities (含 x-csrf-token) + toast.success + router.replace /cms/charities', async () => {
    setFetchResponse(
      new Response(JSON.stringify({ data: { id: 'new-id' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const { result } = renderHook(() => useCharityForm())
    act(() => {
      result.current.dispatch({ type: 'SET_NAME', value: 'X' })
      result.current.dispatch({ type: 'SET_DESCRIPTION', value: 'd' })
    })
    await act(async () => {
      await result.current.handleSubmit()
    })
    // first call hits /api/csrf, second hits the mutation
    const calls = fetchMock.mock.calls
    expect(calls[0][0]).toBe('/api/csrf')
    expect(calls[1][0]).toBe('/api/cms/charities')
    expect(calls[1][1]?.method).toBe('POST')
    expect(
      (calls[1][1] as RequestInit).headers as Record<string, string>,
    ).toMatchObject({ 'x-csrf-token': 'csrf-token-x' })
    expect(toastSuccessMock).toHaveBeenCalled()
    expect(routerReplaceMock).toHaveBeenCalledWith('/cms/charities')
  })

  it('H5: edit happy → PATCH /api/cms/charities/:id', async () => {
    setFetchResponse(
      new Response(JSON.stringify({ data: { id: 'x' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const init: FormState = {
      ...DEFAULT_FORM,
      name: 'Existing',
      description: 'd',
    }
    const { result } = renderHook(() => useCharityForm({ id: 'abc', initial: init }))
    await act(async () => {
      await result.current.handleSubmit()
    })
    const calls = fetchMock.mock.calls
    expect(calls[0][0]).toBe('/api/csrf')
    expect(calls[1][0]).toBe('/api/cms/charities/abc')
    expect(calls[1][1]?.method).toBe('PATCH')
  })

  it('H6: BFF 500 → toast.error + 不導頁', async () => {
    setFetchResponse(
      new Response('{}', {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const { result } = renderHook(() => useCharityForm())
    act(() => {
      result.current.dispatch({ type: 'SET_NAME', value: 'X' })
      result.current.dispatch({ type: 'SET_DESCRIPTION', value: 'd' })
    })
    await act(async () => {
      await result.current.handleSubmit()
    })
    expect(toastErrorMock).toHaveBeenCalled()
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('H7: fetch throw → toast.error + 不導頁', async () => {
    setFetchResponse(new Error('network'))
    const { result } = renderHook(() => useCharityForm())
    act(() => {
      result.current.dispatch({ type: 'SET_NAME', value: 'X' })
      result.current.dispatch({ type: 'SET_DESCRIPTION', value: 'd' })
    })
    await act(async () => {
      await result.current.handleSubmit()
    })
    expect(toastErrorMock).toHaveBeenCalled()
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })
})
