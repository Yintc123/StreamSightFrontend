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
import type { DonationDraft } from './draft-store'
import {
  DEFAULT_FORM,
  reducer,
  RECEIPT_OPTIONS,
  useDonorInfoForm,
  type ReceiptOption,
} from './useDonorInfoForm'

const CHARITY_ID = '00000000-0000-4000-8000-000000000001'

const CHARITY: CharityDetail = {
  id: CHARITY_ID,
  name: 'ACC 中華耆幼關懷協會',
  description: 'desc',
  categories: [],
}

const PROJECT: DonationDetail = {
  id: CHARITY_ID,
  name: '偏鄉AI 數位學習計畫',
  description: 'd',
  content: 'content',
  charity: { id: '00000000-0000-4000-8000-0000000000aa', name: '主辦團體 X' },
  categories: [],
}

// v0.7 — opts collapsed from { query, target } → { draft } from the
// in-memory store. Each test composes the draft it needs from these
// helpers; H8 builds an ONE_TIME variant inline.
const VALID_DRAFT: DonationDraft = {
  donationFrequency: 'RECURRING',
  billingDay: 'DAY_16',
  amountTwd: 500,
  target: { type: 'CHARITY', detail: CHARITY },
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
  it('R4 (v0.8): SET_ANONYMOUS true → state.isAnonymous=true、其他欄位不變', () => {
    const seeded = reducer(DEFAULT_FORM, {
      type: 'SET_DONOR_NAME',
      value: 'Alice',
    })
    const next = reducer(seeded, { type: 'SET_ANONYMOUS', value: true })
    expect(next.isAnonymous).toBe(true)
    expect(next.donorName).toBe('Alice')
    expect(next.receiptOption).toBeNull()    // v0.9 — 預設無收據選項
  })
  it('R5 (v0.8): DEFAULT_FORM.isAnonymous=false', () => {
    expect(DEFAULT_FORM.isAnonymous).toBe(false)
  })
  it('R6 (v0.9): DEFAULT_FORM.receiptOption=null（未選）', () => {
    expect(DEFAULT_FORM.receiptOption).toBeNull()
  })
  it('R7 (v0.9): SET_RECEIPT_OPTION null → state.receiptOption 回 null（使用者改回未選）', () => {
    const seeded = reducer(DEFAULT_FORM, {
      type: 'SET_RECEIPT_OPTION',
      value: 'INDIVIDUAL',
    })
    const next = reducer(seeded, {
      type: 'SET_RECEIPT_OPTION',
      value: null,
    })
    expect(next.receiptOption).toBeNull()
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
  it('H1: 初始 isValid=false（receiptOption=null、donorName=""）', () => {
    const { result } = renderHook(() =>
      useDonorInfoForm({ draft: VALID_DRAFT }),
    )
    expect(result.current.form).toEqual(DEFAULT_FORM)
    expect(result.current.isValid).toBe(false)
  })

  it('H2 (v0.9): SET_DONOR_NAME 但 receiptOption 仍 null → isValid=false', () => {
    const { result } = renderHook(() =>
      useDonorInfoForm({ draft: VALID_DRAFT }),
    )
    act(() => result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'Alice' }))
    expect(result.current.isValid).toBe(false)
  })

  it('H2b (v0.9): SET_RECEIPT_OPTION + SET_DONOR_NAME → isValid=true', () => {
    const { result } = renderHook(() =>
      useDonorInfoForm({ draft: VALID_DRAFT }),
    )
    act(() => {
      result.current.dispatch({ type: 'SET_RECEIPT_OPTION', value: 'NONE' })
      result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'Alice' })
    })
    expect(result.current.isValid).toBe(true)
  })

  it('H3: SET_DONOR_NAME "   " → isValid=false（trim 後空，即使 receiptOption 已選）', () => {
    const { result } = renderHook(() =>
      useDonorInfoForm({ draft: VALID_DRAFT }),
    )
    act(() => {
      result.current.dispatch({ type: 'SET_RECEIPT_OPTION', value: 'NONE' })
      result.current.dispatch({ type: 'SET_DONOR_NAME', value: '   ' })
    })
    expect(result.current.isValid).toBe(false)
  })

  it('H4: SET_DONOR_NAME 121 字 → isValid=false（BE 1-120 上限）', () => {
    const { result } = renderHook(() =>
      useDonorInfoForm({ draft: VALID_DRAFT }),
    )
    const tooLong = 'a'.repeat(121)
    act(() => {
      result.current.dispatch({ type: 'SET_RECEIPT_OPTION', value: 'NONE' })
      result.current.dispatch({ type: 'SET_DONOR_NAME', value: tooLong })
    })
    expect(result.current.isValid).toBe(false)
  })

  it('H5: handleSubmit (CHARITY, BFF 200) → fetch POST /api/checkout/donation + body 對齊 BE 022 §4.1 + toast.success', async () => {
    mockFetchOk()
    const { result } = renderHook(() =>
      useDonorInfoForm({ draft: VALID_DRAFT }),
    )
    act(() => {
      result.current.dispatch({ type: 'SET_RECEIPT_OPTION', value: 'NONE' })
      result.current.dispatch({ type: 'SET_DONOR_NAME', value: ' Alice ' })
    })
    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/checkout/donation')
    expect(init.method).toBe('POST')
    const payload = JSON.parse(init.body as string) as Record<string, unknown>
    expect(payload._endpoint).toBe('/user/v1/donation/orders/charity-donation')
    expect(payload.charityId).toBe(CHARITY_ID)
    expect(payload.donorName).toBe('Alice')                    // trimmed
    expect(payload.isAnonymous).toBe(false)
    expect(payload.receiptOption).toBe('NONE')                  // dispatched above
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
    const projectDraft: DonationDraft = {
      donationFrequency: 'RECURRING',
      billingDay: 'DAY_16',
      amountTwd: 500,
      target: { type: 'DONATION_PROJECT', detail: PROJECT },
    }
    const { result } = renderHook(() =>
      useDonorInfoForm({ draft: projectDraft }),
    )
    act(() => {
      result.current.dispatch({ type: 'SET_RECEIPT_OPTION', value: 'NONE' })
      result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'Bob' })
    })
    await act(async () => {
      await result.current.handleSubmit()
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(init.body as string) as Record<string, unknown>
    expect(payload._endpoint).toBe('/user/v1/donation/orders/project-donation')
    expect(payload.donationProjectId).toBe(CHARITY_ID)
    expect('charityId' in payload).toBe(false)
    expect(routerReplaceMock).toHaveBeenCalledWith(
      `/donation-projects/${CHARITY_ID}`,
    )
  })

  it('H7: handleSubmit (!isValid) → fetch 不被叫、toast 不被叫', async () => {
    const { result } = renderHook(() =>
      useDonorInfoForm({ draft: VALID_DRAFT }),
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
    const oneTimeDraft: DonationDraft = {
      donationFrequency: 'ONE_TIME',
      amountTwd: 1000,
      target: { type: 'CHARITY', detail: CHARITY },
    }
    const { result } = renderHook(() =>
      useDonorInfoForm({ draft: oneTimeDraft }),
    )
    act(() => {
      result.current.dispatch({ type: 'SET_RECEIPT_OPTION', value: 'NONE' })
      result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'C' })
    })
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
      useDonorInfoForm({ draft: VALID_DRAFT }),
    )
    act(() => {
      result.current.dispatch({ type: 'SET_RECEIPT_OPTION', value: 'NONE' })
      result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'A' })
    })
    await act(async () => {
      await result.current.handleSubmit()
    })
    expect(toastErrorMock).toHaveBeenCalledWith('送出失敗，請稍後再試')
    expect(toastSuccessMock).not.toHaveBeenCalled()
    // 失敗不導頁
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('H11 (v0.8): 勾匿名 + submit → payload.isAnonymous=true', async () => {
    mockFetchOk()
    const { result } = renderHook(() =>
      useDonorInfoForm({ draft: VALID_DRAFT }),
    )
    act(() => {
      result.current.dispatch({ type: 'SET_RECEIPT_OPTION', value: 'NONE' })
      result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'A' })
      result.current.dispatch({ type: 'SET_ANONYMOUS', value: true })
    })
    await act(async () => {
      await result.current.handleSubmit()
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(init.body as string) as Record<string, unknown>
    expect(payload.isAnonymous).toBe(true)
  })

  it('H10 (v0.5): fetch 拋 network 錯 → 同樣 toast.error', async () => {
    mockFetchThrow()
    const { result } = renderHook(() =>
      useDonorInfoForm({ draft: VALID_DRAFT }),
    )
    act(() => {
      result.current.dispatch({ type: 'SET_RECEIPT_OPTION', value: 'NONE' })
      result.current.dispatch({ type: 'SET_DONOR_NAME', value: 'A' })
    })
    await act(async () => {
      await result.current.handleSubmit()
    })
    expect(toastErrorMock).toHaveBeenCalledWith('送出失敗，請稍後再試')
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })
})
