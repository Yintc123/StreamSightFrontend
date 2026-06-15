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
import type { CharityDetail, DonationDetail } from '@/lib/schemas/detail'

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

export const DEFAULT_RECEIPT_OPTION: ReceiptOption = 'NONE'

export type DonationCheckoutQuery = {
  targetType: 'CHARITY' | 'DONATION_PROJECT'
  targetId: string
  donationFrequency: 'ONE_TIME' | 'RECURRING'
  billingDay?: 'DAY_6' | 'DAY_16' | 'DAY_26'
  amountTwd: number
}

// ─── Form state ────────────────────────────────────────────────────

export interface FormState {
  receiptOption: ReceiptOption
  donorName: string
}

export const DEFAULT_FORM: FormState = {
  receiptOption: DEFAULT_RECEIPT_OPTION,
  donorName: '',
}

export type Action =
  | { type: 'SET_RECEIPT_OPTION'; value: ReceiptOption }
  | { type: 'SET_DONOR_NAME'; value: string }

export function reducer(s: FormState, a: Action): FormState {
  switch (a.type) {
    case 'SET_RECEIPT_OPTION':
      return { ...s, receiptOption: a.value }
    case 'SET_DONOR_NAME':
      return { ...s, donorName: a.value }
  }
}

// ─── Payload (BE 022 §4.1 / §4.2) ──────────────────────────────────

type CharityDonationPayload = {
  _endpoint: '/v1/donation/orders/charity-donation'
  donorName: string
  isAnonymous: false
  receiptOption: ReceiptOption
  charityId: string
  donationFrequency: 'ONE_TIME' | 'RECURRING'
  billingDay?: 'DAY_6' | 'DAY_16' | 'DAY_26'
  amountTwd: number
}

type ProjectDonationPayload = {
  _endpoint: '/v1/donation/orders/project-donation'
  donorName: string
  isAnonymous: false
  receiptOption: ReceiptOption
  donationProjectId: string
  donationFrequency: 'ONE_TIME' | 'RECURRING'
  billingDay?: 'DAY_6' | 'DAY_16' | 'DAY_26'
  amountTwd: number
}

export type DonationConfirmPayload = CharityDonationPayload | ProjectDonationPayload

export function buildPayload(
  query: DonationCheckoutQuery,
  _target: CharityDetail | DonationDetail,
  form: FormState,
): DonationConfirmPayload {
  const base = {
    donorName: form.donorName.trim(),
    isAnonymous: false as const,
    receiptOption: form.receiptOption,
    donationFrequency: query.donationFrequency,
    ...(query.billingDay !== undefined && { billingDay: query.billingDay }),
    amountTwd: query.amountTwd,
  }
  if (query.targetType === 'CHARITY') {
    return {
      _endpoint: '/v1/donation/orders/charity-donation',
      ...base,
      charityId: query.targetId,
    }
  }
  return {
    _endpoint: '/v1/donation/orders/project-donation',
    ...base,
    donationProjectId: query.targetId,
  }
}

// ─── Hook ──────────────────────────────────────────────────────────

export type UseDonorInfoFormOpts = {
  query: DonationCheckoutQuery
  target: CharityDetail | DonationDetail
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
 * back to that page on success — same trip both directions, regardless
 * of how the user landed on the confirm page (direct URL, refresh, etc.).
 */
function entryUrl(query: DonationCheckoutQuery): string {
  return query.targetType === 'CHARITY'
    ? `/charities/${query.targetId}`
    : `/donation-projects/${query.targetId}`
}

export function useDonorInfoForm(
  opts: UseDonorInfoFormOpts,
): UseDonorInfoFormReturn {
  const router = useRouter()
  const [form, dispatch] = useReducer(reducer, DEFAULT_FORM)
  const trimmed = form.donorName.trim()
  const isValid =
    trimmed.length > 0 && form.donorName.length <= DONOR_NAME_MAX

  const handleSubmit = async () => {
    if (!isValid) return
    const payload = buildPayload(opts.query, opts.target, form)
    try {
      const res = await fetch('/api/checkout/donation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        // BFF wraps BE errors in spec 005's RFC 7807-ish shape; details
        // aren't shown to the user — toast 一致即可。
        toast.error('送出失敗，請稍後再試')
        return
      }
      toast.success('已送出（demo 不接金流）')
      // router.replace (not push) — confirm 頁完成任務後不該留在 history，
      // 否則使用者按返回會回到一個「已送出」的死頁面，甚至重複觸發 fetch。
      router.replace(entryUrl(opts.query))
    } catch {
      // Network failure / abort — same UX as backend error.
      toast.error('送出失敗，請稍後再試')
    }
  }

  return { form, dispatch, isValid, handleSubmit }
}
