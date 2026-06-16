'use client'

// Spec 009a v0.4 — DonorInfo form state + hook.
//
// Pure layer: reducer + RECEIPT_OPTIONS + buildPayload. Hook layer wraps
// useReducer + isValid + handleSubmit (console.log + sonner toast — brief
// "不接金流" placeholder).
//
// Naming and shape follow ADR 012 / BE 022 §4.1 (charity-donation) and
// §4.2 (project-donation) verbatim. A `_endpoint` discriminator on the
// payload tells the future BFF which endpoint to forward to; BE strips
// underscore-prefixed fields via TypeBox `additionalProperties: false`,
// so the BFF must remove it before sending.

import { useReducer, type Dispatch } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { clearDonationDraft, type DonationDraft } from './draft-store'

// ─── BE-aligned types ──────────────────────────────────────────────

export type ReceiptOption =
  | 'NONE'
  | 'INDIVIDUAL'
  | 'CORPORATE'
  | 'GOVERNMENT_DONATION'
  | 'DEFER'

export const RECEIPT_OPTIONS: { value: ReceiptOption; label: string }[] = [
  { value: 'NONE', label: '都不需要' },
  { value: 'INDIVIDUAL', label: '個人' },
  { value: 'CORPORATE', label: '公司' },
  { value: 'GOVERNMENT_DONATION', label: '政府捐款抵稅' },
  { value: 'DEFER', label: '稍後決定' },
]

// v0.9 — no default. The dropdown opens in an explicit "unselected"
// state (null) and the donor name input stays hidden until the user
// picks something. Used to be DEFAULT_RECEIPT_OPTION = 'NONE'.

// v0.7 — DonationCheckoutQuery removed. The confirm page now reads its
// inputs from the in-memory draft store (DonationDraft from ./draft-store),
// not from URL query params. Refresh / direct-visit finds no draft and
// bounces to /donation.

// ─── Form state ────────────────────────────────────────────────────

export interface FormState {
  /**
   * v0.9 — nullable. `null` = "尚未選擇" state; the donor-name input is
   * hidden until the user picks something. Once picked, BE 022 requires
   * `receiptOption` as required field, so isValid gates submit on
   * non-null.
   */
  receiptOption: ReceiptOption | null
  donorName: string
  // v0.8 — isAnonymous on all three order types (matches BE 022); checkbox
  // surfaced on donation flow per user request after IMG_4890 precedent.
  isAnonymous: boolean
}

export const DEFAULT_FORM: FormState = {
  receiptOption: null,
  donorName: '',
  isAnonymous: false,
}

export type Action =
  // v0.9 — value may be null when user reverts to the placeholder
  | { type: 'SET_RECEIPT_OPTION'; value: ReceiptOption | null }
  | { type: 'SET_DONOR_NAME'; value: string }
  | { type: 'SET_ANONYMOUS'; value: boolean }

export function reducer(s: FormState, a: Action): FormState {
  switch (a.type) {
    case 'SET_RECEIPT_OPTION':
      return { ...s, receiptOption: a.value }
    case 'SET_DONOR_NAME':
      return { ...s, donorName: a.value }
    case 'SET_ANONYMOUS':
      return { ...s, isAnonymous: a.value }
  }
}

// ─── Payload (BE 022 §4.1 / §4.2) ──────────────────────────────────

type CharityDonationPayload = {
  _endpoint: '/user/v1/donation/orders/charity-donation'
  donorName: string
  isAnonymous: boolean      // v0.8 — was literal false; now wired to form state
  receiptOption: ReceiptOption
  charityId: string
  donationFrequency: 'ONE_TIME' | 'RECURRING'
  billingDay?: 'DAY_6' | 'DAY_16' | 'DAY_26'
  amountTwd: number
}

type ProjectDonationPayload = {
  _endpoint: '/user/v1/donation/orders/project-donation'
  donorName: string
  isAnonymous: boolean      // v0.8 — see CharityDonationPayload
  receiptOption: ReceiptOption
  donationProjectId: string
  donationFrequency: 'ONE_TIME' | 'RECURRING'
  billingDay?: 'DAY_6' | 'DAY_16' | 'DAY_26'
  amountTwd: number
}

export type DonationConfirmPayload = CharityDonationPayload | ProjectDonationPayload

export function buildPayload(
  draft: DonationDraft,
  form: FormState,
): DonationConfirmPayload {
  const base = {
    donorName: form.donorName.trim(),
    isAnonymous: form.isAnonymous,    // v0.8 — wired to checkbox
    // v0.9 — non-null guarantee from isValid gate (handleSubmit early-returns
    // when receiptOption is null). Asserted here so TS sees the narrowed type
    // for the BE-bound payload.
    receiptOption: form.receiptOption as ReceiptOption,
    donationFrequency: draft.donationFrequency,
    ...(draft.billingDay !== undefined && { billingDay: draft.billingDay }),
    amountTwd: draft.amountTwd,
  }
  if (draft.target.type === 'CHARITY') {
    return {
      _endpoint: '/user/v1/donation/orders/charity-donation',
      ...base,
      charityId: draft.target.detail.id,
    }
  }
  return {
    _endpoint: '/user/v1/donation/orders/project-donation',
    ...base,
    donationProjectId: draft.target.detail.id,
  }
}

// ─── Hook ──────────────────────────────────────────────────────────

export type UseDonorInfoFormOpts = {
  draft: DonationDraft
}

export type UseDonorInfoFormReturn = {
  form: FormState
  dispatch: Dispatch<Action>
  isValid: boolean
  handleSubmit: () => void
}

const DONOR_NAME_MAX = 120 // matches BE 022 §4.1 donorName maxLength

/**
 * Where to return the user after a successful submit. The CTA that opened
 * the flow always lived on the detail page of the target, so we navigate
 * back to that page on success.
 */
function entryUrl(draft: DonationDraft): string {
  return draft.target.type === 'CHARITY'
    ? `/charities/${draft.target.detail.id}`
    : `/donation-projects/${draft.target.detail.id}`
}

export function useDonorInfoForm(
  opts: UseDonorInfoFormOpts,
): UseDonorInfoFormReturn {
  const router = useRouter()
  const [form, dispatch] = useReducer(reducer, DEFAULT_FORM)
  const trimmed = form.donorName.trim()
  // v0.9 — receiptOption must be picked first (input is hidden until then,
  // but gate the submit too for safety).
  const isValid =
    form.receiptOption !== null &&
    trimmed.length > 0 &&
    form.donorName.length <= DONOR_NAME_MAX

  const handleSubmit = async () => {
    if (!isValid) return
    const payload = buildPayload(opts.draft, form)
    try {
      const res = await fetch('/api/checkout/donation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast.error('送出失敗，請稍後再試')
        return
      }
      toast.success('已送出（demo 不接金流）')
      // v0.7 — clear the in-memory draft on success so a subsequent
      // direct visit to /checkout/donation no longer finds it. Then
      // replace (not push) back to the entry detail page.
      clearDonationDraft()
      router.replace(entryUrl(opts.draft))
    } catch {
      toast.error('送出失敗，請稍後再試')
    }
  }

  return { form, dispatch, isValid, handleSubmit }
}
