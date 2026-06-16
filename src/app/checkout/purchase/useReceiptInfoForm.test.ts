// Spec 009b v0.4 §9 — reducer pure (R1-R3) + hook integration (H1-H7).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

const routerReplaceMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn() }),
}))

const fetchMock = vi.fn<typeof fetch>()

function mockFetchOk() {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({ data: { orderId: 'ord-1', status: 'PENDING' } }),
      { status: 200 },
    ),
  )
}
function mockFetchError(status: number) {
  fetchMock.mockResolvedValue(new Response('err', { status }))
}
function mockFetchThrow() {
  fetchMock.mockRejectedValue(new TypeError('network down'))
}

import type { ItemDetail } from '@/lib/schemas/detail'
import type { PurchaseDraft } from './draft-store'
import {
  DEFAULT_FORM,
  reducer,
  useReceiptInfoForm,
} from './useReceiptInfoForm'

const ITEM_ID = '00000000-0000-4000-8000-000000000099'

const ITEM: ItemDetail = {
  id: ITEM_ID,
  name: '陸仕私廚 藤椒牛肉麵',
  description: '760g',
  content: '',
  priceTwd: 449,
  charity: { id: 'cha-1', name: '台灣紅絲帶基金會' },
  categories: [],
}

// v0.7 — opts collapsed { query, item } → { draft }
const VALID_DRAFT: PurchaseDraft = { quantity: 2, item: ITEM }

beforeEach(() => {
  toastSuccessMock.mockReset()
  toastErrorMock.mockReset()
  routerReplaceMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reducer (pure)', () => {
  it('R1: SET_DONOR_NAME "Alice"', () => {
    const next = reducer(DEFAULT_FORM, { type: 'SET_DONOR_NAME', value: 'Alice' })
    expect(next.donorName).toBe('Alice')
    expect(next.isAnonymous).toBe(false)
  })
  it('R2: SET_ANONYMOUS true → isAnonymous=true，其他欄位不變', () => {
    const seeded = reducer(DEFAULT_FORM, {
      type: 'SET_DONOR_NAME',
      value: 'X',
    })
    const next = reducer(seeded, { type: 'SET_ANONYMOUS', value: true })
    expect(next.isAnonymous).toBe(true)
    expect(next.donorName).toBe('X')
  })
  it('R3: SET_ANONYMOUS true 後 SET_ANONYMOUS false → false', () => {
    const on = reducer(DEFAULT_FORM, { type: 'SET_ANONYMOUS', value: true })
    const off = reducer(on, { type: 'SET_ANONYMOUS', value: false })
    expect(off.isAnonymous).toBe(false)
  })
})

describe('useReceiptInfoForm (hook)', () => {
  it('H1: 初始 isValid=false；subtotal=priceTwd×quantity；shipping=0；total=subtotal', () => {
    const { result } = renderHook(() =>
      useReceiptInfoForm({ draft: VALID_DRAFT }),
    )
    expect(result.current.form).toEqual(DEFAULT_FORM)
    expect(result.current.isValid).toBe(false)
    expect(result.current.subtotal).toBe(449 * 2)
    expect(result.current.shipping).toBe(0)
    expect(result.current.total).toBe(449 * 2)
  })

  it('H2: SET_DONOR_NAME → isValid=true', () => {
    const { result } = renderHook(() =>
      useReceiptInfoForm({ draft: VALID_DRAFT }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'Alice' }))
    expect(result.current.isValid).toBe(true)
  })

  it('H3: SET_ANONYMOUS true → state.isAnonymous=true、isValid 不變（v0.1 規則）', () => {
    const { result } = renderHook(() =>
      useReceiptInfoForm({ draft: VALID_DRAFT }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'A' }))
    act(() => result.current.dispatch({ type: 'SET_ANONYMOUS', value: true }))
    expect(result.current.form.isAnonymous).toBe(true)
    expect(result.current.isValid).toBe(true)
  })

  it('H4: 121 字 donorName → isValid=false', () => {
    const { result } = renderHook(() =>
      useReceiptInfoForm({ draft: VALID_DRAFT }),
    )
    act(() =>
      result.current.dispatch({
        type: 'SET_DONOR_NAME',
        value: 'a'.repeat(121),
      }),
    )
    expect(result.current.isValid).toBe(false)
  })

  it('H5: handleSubmit (valid) → fetch POST /api/checkout/purchase + body 對齊 BE 022 §4.3 + toast.success', async () => {
    mockFetchOk()
    const { result } = renderHook(() =>
      useReceiptInfoForm({ draft: VALID_DRAFT }),
    )
    act(() =>
      result.current.dispatch({ type: 'SET_DONOR_NAME', value: ' Alice ' }),
    )
    act(() => result.current.dispatch({ type: 'SET_ANONYMOUS', value: true }))
    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/checkout/purchase')
    expect(init.method).toBe('POST')
    const payload = JSON.parse(init.body as string) as Record<string, unknown>
    expect(payload._endpoint).toBe('/user/v1/donation/orders/sale-item-purchase')
    expect(payload.donorName).toBe('Alice')
    expect(payload.isAnonymous).toBe(true)
    expect(payload.items).toEqual([{ saleItemId: ITEM_ID, quantity: 2 }])

    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
    expect(toastErrorMock).not.toHaveBeenCalled()
    // v0.6 — 成功後導回 sale-item detail
    expect(routerReplaceMock).toHaveBeenCalledWith(`/sale-items/${ITEM_ID}`)
  })

  it('H6: handleSubmit (!isValid) → fetch 不被叫、toast 不被叫', async () => {
    const { result } = renderHook(() =>
      useReceiptInfoForm({ draft: VALID_DRAFT }),
    )
    await act(async () => {
      await result.current.handleSubmit()
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  it('H7: payload 不含 receiptOption / donationFrequency / billingDay / charityId', async () => {
    mockFetchOk()
    const { result } = renderHook(() =>
      useReceiptInfoForm({ draft: VALID_DRAFT }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'X' }))
    await act(async () => {
      await result.current.handleSubmit()
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(init.body as string) as Record<string, unknown>
    expect('receiptOption' in payload).toBe(false)
    expect('donationFrequency' in payload).toBe(false)
    expect('billingDay' in payload).toBe(false)
    expect('charityId' in payload).toBe(false)
  })

  it('H8 (v0.5): BFF 5xx → toast.error', async () => {
    mockFetchError(500)
    const { result } = renderHook(() =>
      useReceiptInfoForm({ draft: VALID_DRAFT }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'X' }))
    await act(async () => {
      await result.current.handleSubmit()
    })
    expect(toastErrorMock).toHaveBeenCalledWith('送出失敗，請稍後再試')
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('H9 (v0.5): network throw → 同樣 toast.error', async () => {
    mockFetchThrow()
    const { result } = renderHook(() =>
      useReceiptInfoForm({ draft: VALID_DRAFT }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'X' }))
    await act(async () => {
      await result.current.handleSubmit()
    })
    expect(toastErrorMock).toHaveBeenCalledWith('送出失敗，請稍後再試')
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })
})
