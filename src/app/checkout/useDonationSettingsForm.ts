'use client'

// Spec 008b v0.5 — DonationSettings form state + hook.
//
// Pure layer (reducer / parseAmount / buildPayload / DEFAULT_FORM) is exported
// alongside the hook so unit tests can hit it without renderHook. The hook
// itself wraps useReducer + useEffect-on-open reset + isValid + handleSubmit
// + router.push. The presentational component (DonationSettingsSheet.tsx)
// stays a pure props→JSX layer.
//
// Naming follows ADR 012: donationFrequency / billingDay / amountTwd / target
// .type ('CHARITY' | 'DONATION_PROJECT') match the backend 022 body shape so
// the BFF can forward the URL query verbatim to the corresponding endpoint.

import { useEffect, useReducer, type Dispatch } from 'react'
import { useRouter } from 'next/navigation'

// ─── Types ──────────────────────────────────────────────────────────────

export type DonationFrequency = 'ONE_TIME' | 'RECURRING'
export type BillingDay = 'DAY_6' | 'DAY_16' | 'DAY_26'
export type PresetAmount = 100 | 500 | 1000

/**
 * Preset amount buttons + the derived "minimum donation" gate (v0.6).
 * Smallest preset doubles as the lower bound on input-source amounts:
 * typing 50 is parsed but rejected by isValid and shows a red hint in UI.
 * Exported so the component can render the preset row + min hint message
 * without re-declaring constants.
 */
export const PRESET_AMOUNTS: readonly PresetAmount[] = [100, 500, 1000]
export const MIN_PRESET_AMOUNT: PresetAmount = PRESET_AMOUNTS.reduce(
  (min, v) => (v < min ? v : min),
  PRESET_AMOUNTS[0],
)

export type DonationTarget = {
  type: 'CHARITY' | 'DONATION_PROJECT'
  id: string
}

export type AmountState =
  | { source: 'preset'; value: PresetAmount }
  | { source: 'input'; value: number }
  | null

export interface FormState {
  donationFrequency: DonationFrequency
  billingDay: BillingDay | null
  amount: AmountState
  amountInputRaw: string
}

export const DEFAULT_FORM: FormState = {
  donationFrequency: 'RECURRING',
  billingDay: null,
  amount: null,
  amountInputRaw: '',
}

export type Action =
  | { type: 'SET_FREQUENCY'; donationFrequency: DonationFrequency }
  | { type: 'SET_BILLING_DAY'; billingDay: BillingDay }
  | { type: 'SET_PRESET'; value: PresetAmount }
  | { type: 'SET_INPUT'; raw: string }
  | { type: 'RESET' }

// ─── Pure helpers ───────────────────────────────────────────────────────

// Aligned with BE 022 §4.1 `amountTwd: Type.Integer({ minimum: 1, maximum: 1_000_000 })`.
const AMOUNT_MIN = 1
const AMOUNT_MAX = 1_000_000

export function parseAmount(raw: string): number | null {
  const digitsOnly = raw.replace(/[^0-9]/g, '')
  if (!digitsOnly) return null
  const n = parseInt(digitsOnly, 10)
  return n >= AMOUNT_MIN && n <= AMOUNT_MAX ? n : null
}

export function reducer(state: FormState, action: Action): FormState {
  switch (action.type) {
    case 'SET_FREQUENCY':
      return {
        ...state,
        donationFrequency: action.donationFrequency,
        // ONE_TIME 強制清 billingDay；切回 RECURRING 不還原（使用者重新選）
        billingDay:
          action.donationFrequency === 'ONE_TIME' ? null : state.billingDay,
      }
    case 'SET_BILLING_DAY':
      return { ...state, billingDay: action.billingDay }
    case 'SET_PRESET':
      // v0.6 — auto-fill the input box with the picked preset value so the
      // user sees the same number both in the chip and in the text field.
      // (v0.5 used '' to keep the input empty, which felt detached.)
      return {
        ...state,
        amount: { source: 'preset', value: action.value },
        amountInputRaw: String(action.value),
      }
    case 'SET_INPUT': {
      const parsed = parseAmount(action.raw)
      return {
        ...state,
        amountInputRaw: action.raw,
        amount: parsed !== null ? { source: 'input', value: parsed } : null,
      }
    }
    case 'RESET':
      return DEFAULT_FORM
  }
}

export type DonationSettingsPayload = {
  target: DonationTarget
  donationFrequency: DonationFrequency
  billingDay: BillingDay | null
  amountTwd: number
}

export function buildPayload(
  form: FormState,
  target: DonationTarget,
): DonationSettingsPayload {
  return {
    target,
    donationFrequency: form.donationFrequency,
    billingDay:
      form.donationFrequency === 'ONE_TIME' ? null : form.billingDay,
    // isValid gate guarantees amount is non-null when handleSubmit runs.
    amountTwd: (form.amount as { source: string; value: number }).value,
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────

export type UseDonationSettingsFormOpts = {
  open: boolean
  target: DonationTarget
  onClose: () => void
}

export type UseDonationSettingsFormReturn = {
  form: FormState
  dispatch: Dispatch<Action>
  isValid: boolean
  handleSubmit: () => void
}

export function useDonationSettingsForm(
  opts: UseDonationSettingsFormOpts,
): UseDonationSettingsFormReturn {
  const router = useRouter()
  const [form, dispatch] = useReducer(reducer, DEFAULT_FORM)

  // Form reset on open=true (spec 008b §3.5). Caller always mounts the sheet
  // (per 008a §5), so we can't rely on unmount/remount to reset state.
  useEffect(() => {
    if (opts.open) dispatch({ type: 'RESET' })
  }, [opts.open])

  const isValid =
    form.amount !== null &&
    form.amount.value >= MIN_PRESET_AMOUNT &&
    (form.donationFrequency === 'ONE_TIME' || form.billingDay !== null)

  const handleSubmit = () => {
    if (!isValid) return
    const payload = buildPayload(form, opts.target)
    const params = new URLSearchParams({
      targetType: payload.target.type,
      targetId: payload.target.id,
      donationFrequency: payload.donationFrequency,
      ...(payload.billingDay !== null && { billingDay: payload.billingDay }),
      amountTwd: String(payload.amountTwd),
    })
    router.push(`/checkout/donation?${params.toString()}`)
    opts.onClose()
  }

  return { form, dispatch, isValid, handleSubmit }
}
