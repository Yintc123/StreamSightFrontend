'use client'
// Spec 011a §4 / §5 — charity admin form state + submit.
// Reducer pure tests / hook integration tests live in `.test.ts`.

import { useCallback, useReducer } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { getCsrfToken } from '@/lib/client/csrf'

export interface FormState {
  name: string
  description: string
  contactPhone: string
  contactEmail: string
  officialWebsite: string
  approvalNo: string
  displayOrder: number
  publishStartAt: string
  publishEndAt: string
  categoryIds: string[]
}

export const DEFAULT_FORM: FormState = {
  name: '',
  description: '',
  contactPhone: '',
  contactEmail: '',
  officialWebsite: '',
  approvalNo: '',
  displayOrder: 0,
  publishStartAt: '',
  publishEndAt: '',
  categoryIds: [],
}

export type Action =
  | { type: 'SET_NAME'; value: string }
  | { type: 'SET_DESCRIPTION'; value: string }
  | { type: 'SET_CONTACT_PHONE'; value: string }
  | { type: 'SET_CONTACT_EMAIL'; value: string }
  | { type: 'SET_OFFICIAL_WEBSITE'; value: string }
  | { type: 'SET_APPROVAL_NO'; value: string }
  | { type: 'SET_DISPLAY_ORDER'; value: number }
  | { type: 'SET_PUBLISH_START_AT'; value: string }
  | { type: 'SET_PUBLISH_END_AT'; value: string }
  | { type: 'SET_CATEGORY_IDS'; value: string[] }
  | { type: 'HYDRATE'; value: FormState }

export function reducer(s: FormState, a: Action): FormState {
  switch (a.type) {
    case 'SET_NAME': return { ...s, name: a.value }
    case 'SET_DESCRIPTION': return { ...s, description: a.value }
    case 'SET_CONTACT_PHONE': return { ...s, contactPhone: a.value }
    case 'SET_CONTACT_EMAIL': return { ...s, contactEmail: a.value }
    case 'SET_OFFICIAL_WEBSITE': return { ...s, officialWebsite: a.value }
    case 'SET_APPROVAL_NO': return { ...s, approvalNo: a.value }
    case 'SET_DISPLAY_ORDER': return { ...s, displayOrder: a.value }
    case 'SET_PUBLISH_START_AT': return { ...s, publishStartAt: a.value }
    case 'SET_PUBLISH_END_AT': return { ...s, publishEndAt: a.value }
    case 'SET_CATEGORY_IDS': return { ...s, categoryIds: a.value }
    case 'HYDRATE': return a.value
  }
}

// Client-side soft validation. BE is source of truth.
function isLikelyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}
function isLikelyUrl(s: string): boolean {
  try { new URL(s); return /^https?:/.test(s) } catch { return false }
}

export function isValid(s: FormState): boolean {
  const trimmedName = s.name.trim()
  if (trimmedName.length === 0 || trimmedName.length > 120) return false
  if (s.description.length === 0 || s.description.length > 500) return false
  if (s.contactPhone && s.contactPhone.length > 40) return false
  if (s.contactEmail && !isLikelyEmail(s.contactEmail)) return false
  if (s.officialWebsite && !isLikelyUrl(s.officialWebsite)) return false
  if (s.approvalNo && s.approvalNo.length > 100) return false
  if (s.displayOrder < -1000 || s.displayOrder > 1000) return false
  if (s.publishStartAt && s.publishEndAt && s.publishEndAt <= s.publishStartAt) {
    return false
  }
  if (s.categoryIds.length > 16) return false
  return true
}

export interface CharityCreatePayload {
  name: string
  description: string
  contactPhone?: string
  contactEmail?: string
  officialWebsite?: string
  approvalNo?: string
  displayOrder: number
  publishStartAt?: string
  publishEndAt?: string
  categoryIds: string[]
}

export function buildPayload(s: FormState): CharityCreatePayload {
  return {
    name: s.name.trim(),
    description: s.description,
    ...(s.contactPhone && { contactPhone: s.contactPhone }),
    ...(s.contactEmail && { contactEmail: s.contactEmail }),
    ...(s.officialWebsite && { officialWebsite: s.officialWebsite }),
    ...(s.approvalNo && { approvalNo: s.approvalNo }),
    displayOrder: s.displayOrder,
    ...(s.publishStartAt && { publishStartAt: s.publishStartAt }),
    ...(s.publishEndAt && { publishEndAt: s.publishEndAt }),
    categoryIds: s.categoryIds,
  }
}

export interface UseCharityFormOptions {
  /** If set, hook PATCHes /api/cms/charities/:id; else POSTs /api/cms/charities */
  id?: string
  /** Edit mode seed; merged via HYDRATE on initial reducer state */
  initial?: FormState
}

export function useCharityForm(opts: UseCharityFormOptions = {}) {
  const [form, dispatch] = useReducer(reducer, opts.initial ?? DEFAULT_FORM)
  const router = useRouter()
  const valid = isValid(form)

  const handleSubmit = useCallback(async () => {
    if (!isValid(form)) return
    const payload = buildPayload(form)
    const endpoint = opts.id
      ? `/api/cms/charities/${opts.id}`
      : '/api/cms/charities'
    const method = opts.id ? 'PATCH' : 'POST'
    try {
      // /api/cms/* are CSRF-gated (admin BFFs do not opt into csrfExempt);
      // fetch the token from the session each submit. One extra round
      // trip is fine for admin operations.
      const csrfToken = await getCsrfToken()
      const res = await fetch(endpoint, {
        method,
        body: JSON.stringify(payload),
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
      })
      if (!res.ok) throw new Error(`non-2xx: ${res.status}`)
      toast.success(opts.id ? '已更新' : '已建立')
      router.replace('/cms/charities')
    } catch {
      toast.error('操作失敗，請稍後再試')
    }
  }, [form, opts.id, router])

  return { form, dispatch, isValid: valid, handleSubmit }
}
