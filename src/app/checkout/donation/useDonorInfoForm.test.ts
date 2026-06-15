// Spec 009a v0.4 §8 — three-tier tests for useDonorInfoForm.
// R1-R3 reducer pure, H1-H8 hook integration.

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

// Each test installs its own fetch behavior via mockFetch(...).
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  toastErrorMock.mockReset()
  routerReplaceMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

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

import type { CharityDetail, DonationDetail } from '@/lib/schemas/detail'
import {
  DEFAULT_FORM,
  reducer,
  RECEIPT_OPTIONS,
  useDonorInfoForm,
  type DonationCheckoutQuery,
  type ReceiptOption,
} from './useDonorInfoForm'

const CHARITY_ID = '00000000-0000-4000-8000-000000000001'

const CHARITY_TARGET: CharityDetail = {
  id: CHARITY_ID,
  name: 'ACC 中華耆幼關懷協會',
  description: 'desc',
  contactPhone: undefined,
  contactEmail: undefined,
  officialWebsite: undefined,
  approvalNo: undefined,
  categories: [],
}

const PROJECT_TARGET: DonationDetail = {
  id: CHARITY_ID,
  name: '偏鄉AI 數位學習計畫',
  description: 'd',
  content: 'content',
  raisingApprovalNo: undefined,
  reliefApprovalNo: undefined,
  coverImageUrl: undefined,
  charity: {
    id: '00000000-0000-4000-8000-0000000000aa',
    name: '主辦團體 X',
  },
  categories: [],
}

const VALID_QUERY: DonationCheckoutQuery = {
  targetType: 'CHARITY',
  targetId: CHARITY_ID,
  donationFrequency: 'RECURRING',
  billingDay: 'DAY_16',
  amountTwd: 500,
}

beforeEach(() => {
  toastSuccessMock.mockReset()
})


// ─── R1-R3 reducer pure tests ─────────────────────────────────────

describe('reducer (pure)', () => {
  it('R1: SET_RECEIPT_OPTION INDIVIDUAL → state.receiptOption 更新', () => {
    const next = reducer(DEFAULT_FORM, {
      type: 'SET_RECEIPT_OPTION',
      value: 'INDIVIDUAL',
    })
    expect(next.receiptOption).toBe('INDIVIDUAL')
    expect(next.donorName).toBe('')
  })
  it('R2: SET_DONOR_NAME "Alice" → state.donorName="Alice"', () => {
    const next = reducer(DEFAULT_FORM, { type: 'SET_DONOR_NAME', value: 'Alice' })
    expect(next.donorName).toBe('Alice')
  })
  it('R3: SET_DONOR_NAME "" → state.donorName=""', () => {
    const seeded = reducer(DEFAULT_FORM, { type: 'SET_DONOR_NAME', value: 'A' })
    const next = reducer(seeded, { type: 'SET_DONOR_NAME', value: '' })
    expect(next.donorName).toBe('')
  })
})

describe('RECEIPT_OPTIONS', () => {
  it('長度 5、對齊 BE 022 §4.1 ReceiptOption enum', () => {
    expect(RECEIPT_OPTIONS).toHaveLength(5)
    const values = RECEIPT_OPTIONS.map((o) => o.value).sort()
    expect(values).toEqual(
      (['CORPORATE', 'DEFER', 'GOVERNMENT_DONATION', 'INDIVIDUAL', 'NONE'] as ReceiptOption[]).sort(),
    )
  })
})

// ─── H1-H8 hook integration ────────────────────────────────────────

describe('useDonorInfoForm (hook integration)', () => {
  it('H1: 初始 isValid=false（donorName=""、receiptOption="NONE"）', () => {
    const { result } = renderHook(() =>
      useDonorInfoForm({ query: VALID_QUERY, target: CHARITY_TARGET }),
    )
    expect(result.current.form).toEqual(DEFAULT_FORM)
    expect(result.current.isValid).toBe(false)
  })

  it('H2: SET_DONOR_NAME "Alice" → isValid=true', () => {
    const { result } = renderHook(() =>
      useDonorInfoForm({ query: VALID_QUERY, target: CHARITY_TARGET }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'Alice' }))
    expect(result.current.isValid).toBe(true)
  })

  it('H3: SET_DONOR_NAME "   " → isValid=false（trim 後空）', () => {
    const { result } = renderHook(() =>
      useDonorInfoForm({ query: VALID_QUERY, target: CHARITY_TARGET }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: '   ' }))
    expect(result.current.isValid).toBe(false)
  })

  it('H4: SET_DONOR_NAME 121 字 → isValid=false（BE 1-120 上限）', () => {
    const { result } = renderHook(() =>
      useDonorInfoForm({ query: VALID_QUERY, target: CHARITY_TARGET }),
    )
    const tooLong = 'a'.repeat(121)
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: tooLong }))
    expect(result.current.isValid).toBe(false)
  })

  it('H5: handleSubmit (CHARITY, BFF 200) → fetch POST /api/checkout/donation + body 對齊 BE 022 §4.1 + toast.success', async () => {
    mockFetchOk()
    const { result } = renderHook(() =>
      useDonorInfoForm({ query: VALID_QUERY, target: CHARITY_TARGET }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: ' Alice ' }))
    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/checkout/donation')
    expect(init.method).toBe('POST')
    const payload = JSON.parse(init.body as string) as Record<string, unknown>
    expect(payload._endpoint).toBe('/v1/donation/orders/charity-donation')
    expect(payload.charityId).toBe(CHARITY_ID)
    expect(payload.donorName).toBe('Alice')                    // trimmed
    expect(payload.isAnonymous).toBe(false)
    expect(payload.receiptOption).toBe('NONE')                  // default
    expect(payload.donationFrequency).toBe('RECURRING')
    expect(payload.billingDay).toBe('DAY_16')
    expect(payload.amountTwd).toBe(500)

    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
    expect(toastErrorMock).not.toHaveBeenCalled()
    // v0.6 — 成功後 router.replace 回 entry detail page（CHARITY → /charities/:id）
    expect(routerReplaceMock).toHaveBeenCalledWith(`/charities/${CHARITY_ID}`)
  })

  it('H6: handleSubmit (DONATION_PROJECT) → payload._endpoint = project-donation + donationProjectId + 導回 /donation-projects/:id', async () => {
    mockFetchOk()
    const projectQuery: DonationCheckoutQuery = {
      ...VALID_QUERY,
      targetType: 'DONATION_PROJECT',
    }
    const { result } = renderHook(() =>
      useDonorInfoForm({ query: projectQuery, target: PROJECT_TARGET }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'Bob' }))
    await act(async () => {
      await result.current.handleSubmit()
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(init.body as string) as Record<string, unknown>
    expect(payload._endpoint).toBe('/v1/donation/orders/project-donation')
    expect(payload.donationProjectId).toBe(CHARITY_ID)
    expect('charityId' in payload).toBe(false)
    expect(routerReplaceMock).toHaveBeenCalledWith(
      `/donation-projects/${CHARITY_ID}`,
    )
  })

  it('H7: handleSubmit (!isValid) → fetch 不被叫、toast 不被叫', async () => {
    const { result } = renderHook(() =>
      useDonorInfoForm({ query: VALID_QUERY, target: CHARITY_TARGET }),
    )
    await act(async () => {
      await result.current.handleSubmit()
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('H8: donationFrequency=ONE_TIME → payload 不含 billingDay 欄位（BE 規約）', async () => {
    mockFetchOk()
    const oneTimeQuery: DonationCheckoutQuery = {
      targetType: 'CHARITY',
      targetId: CHARITY_ID,
      donationFrequency: 'ONE_TIME',
      amountTwd: 1000,
    }
    const { result } = renderHook(() =>
      useDonorInfoForm({ query: oneTimeQuery, target: CHARITY_TARGET }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'C' }))
    await act(async () => {
      await result.current.handleSubmit()
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(init.body as string) as Record<string, unknown>
    expect(payload.donationFrequency).toBe('ONE_TIME')
    expect('billingDay' in payload).toBe(false)
  })

  it('H9 (v0.5): BFF 5xx → toast.error「送出失敗」，toast.success 不被叫', async () => {
    mockFetchError(500)
    const { result } = renderHook(() =>
      useDonorInfoForm({ query: VALID_QUERY, target: CHARITY_TARGET }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'A' }))
    await act(async () => {
      await result.current.handleSubmit()
    })
    expect(toastErrorMock).toHaveBeenCalledWith('送出失敗，請稍後再試')
    expect(toastSuccessMock).not.toHaveBeenCalled()
    // 失敗不導頁
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('H10 (v0.5): fetch 拋 network 錯 → 同樣 toast.error', async () => {
    mockFetchThrow()
    const { result } = renderHook(() =>
      useDonorInfoForm({ query: VALID_QUERY, target: CHARITY_TARGET }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'A' }))
    await act(async () => {
      await result.current.handleSubmit()
    })
    expect(toastErrorMock).toHaveBeenCalledWith('送出失敗，請稍後再試')
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })
})
