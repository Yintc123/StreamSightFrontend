// Spec 008b v0.5 §7 — three-layer test plan:
//   R1-R7 reducer pure tests        (no React)
//   H1-H7 hook integration tests     (renderHook + mocked router)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const routerPushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

import {
  DEFAULT_FORM,
  MIN_PRESET_AMOUNT,
  parseAmount,
  PRESET_AMOUNTS,
  reducer,
  useDonationSettingsForm,
  type DonationTarget,
} from './useDonationSettingsForm'

const CHARITY_ID = '00000000-0000-4000-8000-000000000001'
const CHARITY_TARGET: DonationTarget = { type: 'CHARITY', id: CHARITY_ID }

beforeEach(() => {
  routerPushMock.mockReset()
})

// ─────────────────────────────────────────────────────────────────────────
// §7.1 Reducer pure unit tests (R1-R7)
// ─────────────────────────────────────────────────────────────────────────

describe('reducer (pure)', () => {
  it('R1: SET_FREQUENCY ONE_TIME → billingDay 自動變 null', () => {
    const seeded = reducer(DEFAULT_FORM, {
      type: 'SET_BILLING_DAY',
      billingDay: 'DAY_16',
    })
    expect(seeded.billingDay).toBe('DAY_16')

    const next = reducer(seeded, {
      type: 'SET_FREQUENCY',
      donationFrequency: 'ONE_TIME',
    })
    expect(next.donationFrequency).toBe('ONE_TIME')
    expect(next.billingDay).toBeNull()
  })

  it('R1b: SET_FREQUENCY 切回 RECURRING → 不還原 billingDay（必須重選）', () => {
    // 對齊 spec 規約：SET_FREQUENCY oneTime 清 billingDay；切回 RECURRING 是空白。
    const oneTime = reducer(DEFAULT_FORM, {
      type: 'SET_FREQUENCY',
      donationFrequency: 'ONE_TIME',
    })
    const recurring = reducer(oneTime, {
      type: 'SET_FREQUENCY',
      donationFrequency: 'RECURRING',
    })
    expect(recurring.billingDay).toBeNull()
  })

  it('R2 (v0.6): SET_PRESET → amount.source=preset、amountInputRaw=String(value)（自動帶入 input）', () => {
    // 先讓 raw 有值，確認 SET_PRESET **取代**它而非清空
    const withInput = reducer(DEFAULT_FORM, { type: 'SET_INPUT', raw: '999' })
    expect(withInput.amountInputRaw).toBe('999')

    const next = reducer(withInput, { type: 'SET_PRESET', value: 500 })
    expect(next.amount).toEqual({ source: 'preset', value: 500 })
    expect(next.amountInputRaw).toBe('500') // 自動帶入
  })

  it('R3: SET_INPUT "100" → amount={source:input,value:100}、raw="100"', () => {
    const next = reducer(DEFAULT_FORM, { type: 'SET_INPUT', raw: '100' })
    expect(next.amount).toEqual({ source: 'input', value: 100 })
    expect(next.amountInputRaw).toBe('100')
  })

  it('R4: SET_INPUT "00" → amount=null、raw="00"（raw 保留，解 ghost-reset）', () => {
    const next = reducer(DEFAULT_FORM, { type: 'SET_INPUT', raw: '00' })
    expect(next.amount).toBeNull()
    expect(next.amountInputRaw).toBe('00')
  })

  it('R5: SET_INPUT "1,500" → strip 逗號、amount.value=1500、raw="1,500"', () => {
    const next = reducer(DEFAULT_FORM, { type: 'SET_INPUT', raw: '1,500' })
    expect(next.amount).toEqual({ source: 'input', value: 1500 })
    expect(next.amountInputRaw).toBe('1,500')
  })

  it('R6: SET_INPUT "" → amount=null、raw=""', () => {
    const seeded = reducer(DEFAULT_FORM, { type: 'SET_INPUT', raw: '50' })
    const next = reducer(seeded, { type: 'SET_INPUT', raw: '' })
    expect(next.amount).toBeNull()
    expect(next.amountInputRaw).toBe('')
  })

  it('R7: RESET → DEFAULT_FORM', () => {
    const seeded = reducer(
      reducer(DEFAULT_FORM, { type: 'SET_INPUT', raw: '500' }),
      { type: 'SET_BILLING_DAY', billingDay: 'DAY_26' },
    )
    expect(seeded).not.toEqual(DEFAULT_FORM)
    const reset = reducer(seeded, { type: 'RESET' })
    expect(reset).toEqual(DEFAULT_FORM)
  })

  it('DEFAULT_FORM: donationFrequency 預設 RECURRING（對齊 IMG_4885）', () => {
    expect(DEFAULT_FORM.donationFrequency).toBe('RECURRING')
    expect(DEFAULT_FORM.billingDay).toBeNull()
    expect(DEFAULT_FORM.amount).toBeNull()
    expect(DEFAULT_FORM.amountInputRaw).toBe('')
  })

  it('PRESET_AMOUNTS / MIN_PRESET_AMOUNT: 對應 v0.6 引入的最小金額 gate', () => {
    expect(PRESET_AMOUNTS).toEqual([100, 500, 1000])
    expect(MIN_PRESET_AMOUNT).toBe(100)
  })
})

describe('parseAmount (pure)', () => {
  it('純數字 → integer', () => {
    expect(parseAmount('100')).toBe(100)
  })
  it('strip 逗號 / 字母', () => {
    expect(parseAmount('TWD 1,500')).toBe(1500)
  })
  it('空字串 → null', () => {
    expect(parseAmount('')).toBeNull()
  })
  it('全非數字 → null', () => {
    expect(parseAmount('abc')).toBeNull()
  })
  it('"0" → null（最小 1，對齊 BE 022 amountTwd minimum:1）', () => {
    expect(parseAmount('0')).toBeNull()
  })
  it('"00" → 0 strip 後 < 1 → null', () => {
    expect(parseAmount('00')).toBeNull()
  })
  it('上限 1_000_000（含）→ 通過', () => {
    expect(parseAmount('1000000')).toBe(1_000_000)
  })
  it('上限 +1 → null（對齊 BE maximum:1_000_000）', () => {
    expect(parseAmount('1000001')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// §7.2 Hook integration tests (H1-H7)
// ─────────────────────────────────────────────────────────────────────────

describe('useDonationSettingsForm (hook integration)', () => {
  it('H1: 初始 isValid=false、form=DEFAULT_FORM', () => {
    const { result } = renderHook(() =>
      useDonationSettingsForm({
        open: true,
        target: CHARITY_TARGET,
        onClose: vi.fn(),
      }),
    )
    expect(result.current.form).toEqual(DEFAULT_FORM)
    expect(result.current.isValid).toBe(false)
  })

  it('H2: SET_PRESET 100、billingDay 仍 null → isValid=false', () => {
    const { result } = renderHook(() =>
      useDonationSettingsForm({
        open: true,
        target: CHARITY_TARGET,
        onClose: vi.fn(),
      }),
    )
    act(() => {
      result.current.dispatch({ type: 'SET_PRESET', value: 100 })
    })
    expect(result.current.isValid).toBe(false)
  })

  it('H3: SET_BILLING_DAY DAY_16 + SET_PRESET 100 → isValid=true', () => {
    const { result } = renderHook(() =>
      useDonationSettingsForm({
        open: true,
        target: CHARITY_TARGET,
        onClose: vi.fn(),
      }),
    )
    act(() => {
      result.current.dispatch({
        type: 'SET_BILLING_DAY',
        billingDay: 'DAY_16',
      })
      result.current.dispatch({ type: 'SET_PRESET', value: 100 })
    })
    expect(result.current.isValid).toBe(true)
  })

  it('H3b (v0.6): SET_INPUT "50" < MIN_PRESET → isValid=false（即使 day 已選）', () => {
    const { result } = renderHook(() =>
      useDonationSettingsForm({
        open: true,
        target: CHARITY_TARGET,
        onClose: vi.fn(),
      }),
    )
    act(() => {
      result.current.dispatch({ type: 'SET_BILLING_DAY', billingDay: 'DAY_6' })
      result.current.dispatch({ type: 'SET_INPUT', raw: '50' })
    })
    expect(result.current.form.amount?.value).toBe(50)
    expect(result.current.isValid).toBe(false) // 50 < MIN_PRESET_AMOUNT (100)
  })

  it('H3c (v0.6): SET_INPUT "100" (= MIN_PRESET) → isValid=true', () => {
    const { result } = renderHook(() =>
      useDonationSettingsForm({
        open: true,
        target: CHARITY_TARGET,
        onClose: vi.fn(),
      }),
    )
    act(() => {
      result.current.dispatch({ type: 'SET_BILLING_DAY', billingDay: 'DAY_6' })
      result.current.dispatch({ type: 'SET_INPUT', raw: '100' })
    })
    expect(result.current.isValid).toBe(true)
  })

  it('H4: SET_FREQUENCY ONE_TIME + SET_PRESET 100 → isValid=true（不需 day）', () => {
    const { result } = renderHook(() =>
      useDonationSettingsForm({
        open: true,
        target: CHARITY_TARGET,
        onClose: vi.fn(),
      }),
    )
    act(() => {
      result.current.dispatch({
        type: 'SET_FREQUENCY',
        donationFrequency: 'ONE_TIME',
      })
      result.current.dispatch({ type: 'SET_PRESET', value: 100 })
    })
    expect(result.current.isValid).toBe(true)
  })

  it('H5: handleSubmit (isValid) → router.push + onClose 被叫', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() =>
      useDonationSettingsForm({
        open: true,
        target: CHARITY_TARGET,
        onClose,
      }),
    )
    act(() => {
      result.current.dispatch({
        type: 'SET_BILLING_DAY',
        billingDay: 'DAY_16',
      })
      result.current.dispatch({ type: 'SET_PRESET', value: 100 })
    })
    act(() => result.current.handleSubmit())
    expect(routerPushMock).toHaveBeenCalledTimes(1)
    const url = routerPushMock.mock.calls[0][0] as string
    expect(url).toContain('targetType=CHARITY')
    expect(url).toContain(`targetId=${CHARITY_ID}`)
    expect(url).toContain('donationFrequency=RECURRING')
    expect(url).toContain('billingDay=DAY_16')
    expect(url).toContain('amountTwd=100')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('H5b: ONE_TIME → 不帶 billingDay 在 URL（對齊 BE 規約）', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() =>
      useDonationSettingsForm({
        open: true,
        target: { type: 'DONATION_PROJECT', id: CHARITY_ID },
        onClose,
      }),
    )
    act(() => {
      result.current.dispatch({
        type: 'SET_FREQUENCY',
        donationFrequency: 'ONE_TIME',
      })
      result.current.dispatch({ type: 'SET_PRESET', value: 500 })
    })
    act(() => result.current.handleSubmit())
    const url = routerPushMock.mock.calls[0][0] as string
    expect(url).toContain('donationFrequency=ONE_TIME')
    expect(url).not.toContain('billingDay')
    expect(url).toContain('targetType=DONATION_PROJECT')
  })

  it('H6: handleSubmit (!isValid) → router.push 不被叫', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() =>
      useDonationSettingsForm({
        open: true,
        target: CHARITY_TARGET,
        onClose,
      }),
    )
    act(() => result.current.handleSubmit())
    expect(routerPushMock).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('H7: opts.open false → true rerender → form 重置（useEffect-on-open）', () => {
    const { result, rerender } = renderHook(
      (props: { open: boolean }) =>
        useDonationSettingsForm({
          open: props.open,
          target: CHARITY_TARGET,
          onClose: vi.fn(),
        }),
      { initialProps: { open: true } },
    )
    act(() => {
      result.current.dispatch({ type: 'SET_PRESET', value: 1000 })
      result.current.dispatch({
        type: 'SET_BILLING_DAY',
        billingDay: 'DAY_26',
      })
    })
    expect(result.current.form.amount).toEqual({ source: 'preset', value: 1000 })

    rerender({ open: false })
    rerender({ open: true })
    expect(result.current.form).toEqual(DEFAULT_FORM)
  })
})
