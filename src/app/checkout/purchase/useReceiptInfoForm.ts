'use client'

// Spec 009b v0.7 — sale-item purchase confirm form state + hook.
//
// Layout per spec: donorName + isAnonymous (no receiptOption — BE 022
// §4.3 SaleItemPurchaseBody does not accept it). Payload shape mirrors
// BE verbatim so the BFF route forwards without translation (ADR 012).
// The `_endpoint` is a FE-side discriminator the BFF strips before
// sending.
//
// v0.7 — opts collapsed from { query, item } → { draft } from the
// in-memory store. Sheet writes the draft; confirm page reads it.

import { useReducer, type Dispatch } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { clearPurchaseDraft, type PurchaseDraft } from './draft-store'

// ─── Form state ────────────────────────────────────────────────────

export interface FormState {
  donorName: string
  isAnonymous: boolean
}

export const DEFAULT_FORM: FormState = {
  donorName: '',
  isAnonymous: false,
}

export type Action =
  | { type: 'SET_DONOR_NAME'; value: string }
  | { type: 'SET_ANONYMOUS'; value: boolean }

export function reducer(s: FormState, a: Action): FormState {
  switch (a.type) {
    case 'SET_DONOR_NAME':
      return { ...s, donorName: a.value }
    case 'SET_ANONYMOUS':
      return { ...s, isAnonymous: a.value }
  }
}

// ─── Payload (BE 022 §4.3) ─────────────────────────────────────────

export type PurchaseConfirmPayload = {
  _endpoint: '/user/v1/donation/orders/sale-item-purchase'
  donorName: string
  isAnonymous: boolean
  items: [{ saleItemId: string; quantity: number }]
}

export function buildPayload(
  draft: PurchaseDraft,
  form: FormState,
): PurchaseConfirmPayload {
  return {
    _endpoint: '/user/v1/donation/orders/sale-item-purchase',
    donorName: form.donorName.trim(),
    isAnonymous: form.isAnonymous,
    items: [{ saleItemId: draft.item.id, quantity: draft.quantity }],
  }
}

// ─── Hook ──────────────────────────────────────────────────────────

export type UseReceiptInfoFormOpts = {
  draft: PurchaseDraft
}

export type UseReceiptInfoFormReturn = {
  form: FormState
  dispatch: Dispatch<Action>
  isValid: boolean
  subtotal: number
  shipping: number
  total: number
  handleSubmit: () => void
}

const DONOR_NAME_MAX = 120

export function useReceiptInfoForm(
  opts: UseReceiptInfoFormOpts,
): UseReceiptInfoFormReturn {
  const router = useRouter()
  const [form, dispatch] = useReducer(reducer, DEFAULT_FORM)
  const trimmed = form.donorName.trim()
  const isValid =
    trimmed.length > 0 && form.donorName.length <= DONOR_NAME_MAX

  // Derived totals — FE displays them, BE recomputes from SaleItem.priceTwd
  // snapshot at create time (BE 022 §4.3 internal behavior).
  const subtotal = opts.draft.item.priceTwd * opts.draft.quantity
  const shipping = 0
  const total = subtotal + shipping

  const handleSubmit = async () => {
    if (!isValid) return
    const payload = buildPayload(opts.draft, form)
    try {
      const res = await fetch('/api/checkout/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        toast.error('送出失敗，請稍後再試')
        return
      }
      toast.success('已送出（demo 不接金流）')
      // v0.7 — clear the in-memory draft on success; replace not push.
      clearPurchaseDraft()
      router.replace(`/sale-items/${opts.draft.item.id}`)
    } catch {
      toast.error('送出失敗，請稍後再試')
    }
  }

  return { form, dispatch, isValid, subtotal, shipping, total, handleSubmit }
}
