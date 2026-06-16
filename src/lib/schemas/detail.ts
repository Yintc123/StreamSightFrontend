/**
 * Spec 004 / backend spec 017 — detail-page schemas (single-resource lookups).
 *
 * Backend shape (what `/user/v1/donation/<resource>/:id` actually emits) and the
 * client shape (what the RSC detail page consumes) are separate types —
 * BFF strips backend-only fields (createdAt / updatedAt), drops null URL
 * values to `undefined` (matches existing `if (foo)` rendering), and
 * flattens inflated `categories[].key` into a plain key array.
 *
 * Category arrays here stay INFLATED on the client side (unlike the list
 * shape which collapses them to keys). Reason: detail pages render
 * `displayName` directly per spec 004 §5 (avoids a second lookup) and the
 * shape parity with backend keeps the BFF mapper near-identity.
 */

import { z } from 'zod'

import type { CategoryKey } from './categories'
import { CategoryKeyEnum } from './categories'

// —— Inflated category (re-declared here so detail.ts has no circular
// dependency on list.ts schema graph; exact same shape) ——
const InflatedCategory = z.object({
  id: z.string(),
  key: CategoryKeyEnum,
  displayName: z.string(),
})

// —— Backend response shapes (spec 017 §3 / §4 / §5) ——

export const BackendCharityDetail = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  logoUrl: z.string().url().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  officialWebsite: z.string().nullable(),
  approvalNo: z.string().nullable(),
  categories: z.array(InflatedCategory),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type BackendCharityDetail = z.infer<typeof BackendCharityDetail>

const NestedCharity = z.object({
  id: z.string().uuid(),
  name: z.string(),
  logoUrl: z.string().url().nullable(),
})

export const BackendDonationDetail = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  logoUrl: z.string().url().nullable(),
  coverImageUrl: z.string().url().nullable(),
  content: z.string(),
  raisingApprovalNo: z.string().nullable(),
  reliefApprovalNo: z.string().nullable(),
  charity: NestedCharity,
  categories: z.array(InflatedCategory),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type BackendDonationDetail = z.infer<typeof BackendDonationDetail>

export const BackendItemDetail = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  logoUrl: z.string().url().nullable(),
  coverImageUrl: z.string().url().nullable(),
  content: z.string(),
  priceTwd: z.number().int().nonnegative(),
  raisingApprovalNo: z.string().nullable(),
  reliefApprovalNo: z.string().nullable(),
  charity: NestedCharity,
  categories: z.array(InflatedCategory),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type BackendItemDetail = z.infer<typeof BackendItemDetail>

// —— Client-facing shapes (what RSC detail pages consume) ——
//
// Nullable backend values become optional fields here — the existing
// detail-page chrome reads with `if (foo)` and `foo.length > 0` style,
// not `foo !== null`. Drop createdAt / updatedAt entirely (UI doesn't
// render them).

export interface NestedCharityClient {
  id: string
  name: string
  logoUrl?: string
}

export interface CharityDetail {
  id: string
  name: string
  description: string
  logoUrl?: string
  contactPhone?: string
  contactEmail?: string
  officialWebsite?: string
  approvalNo?: string
  categories: { id: string; key: CategoryKey; displayName: string }[]
}

export interface DonationDetail {
  id: string
  name: string
  description: string
  logoUrl?: string
  coverImageUrl?: string
  content: string
  raisingApprovalNo?: string
  reliefApprovalNo?: string
  charity: NestedCharityClient
  categories: { id: string; key: CategoryKey; displayName: string }[]
}

export interface ItemDetail {
  id: string
  name: string
  description: string
  logoUrl?: string
  coverImageUrl?: string
  content: string
  priceTwd: number
  raisingApprovalNo?: string
  reliefApprovalNo?: string
  charity: NestedCharityClient
  categories: { id: string; key: CategoryKey; displayName: string }[]
}

// —— Mappers (backend → client) ——

function opt<T>(v: T | null): T | undefined {
  return v ?? undefined
}

function mapNestedCharity(c: z.infer<typeof NestedCharity>): NestedCharityClient {
  return {
    id: c.id,
    name: c.name,
    ...(c.logoUrl ? { logoUrl: c.logoUrl } : {}),
  }
}

export function toClientCharityDetail(b: BackendCharityDetail): CharityDetail {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    ...(b.logoUrl ? { logoUrl: b.logoUrl } : {}),
    ...(b.contactPhone ? { contactPhone: b.contactPhone } : {}),
    ...(b.contactEmail ? { contactEmail: b.contactEmail } : {}),
    ...(b.officialWebsite ? { officialWebsite: b.officialWebsite } : {}),
    ...(b.approvalNo ? { approvalNo: b.approvalNo } : {}),
    categories: b.categories,
  }
}

export function toClientDonationDetail(b: BackendDonationDetail): DonationDetail {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    ...(b.logoUrl ? { logoUrl: b.logoUrl } : {}),
    ...(b.coverImageUrl ? { coverImageUrl: b.coverImageUrl } : {}),
    content: b.content,
    ...(opt(b.raisingApprovalNo) !== undefined
      ? { raisingApprovalNo: b.raisingApprovalNo as string }
      : {}),
    ...(opt(b.reliefApprovalNo) !== undefined
      ? { reliefApprovalNo: b.reliefApprovalNo as string }
      : {}),
    charity: mapNestedCharity(b.charity),
    categories: b.categories,
  }
}

export function toClientItemDetail(b: BackendItemDetail): ItemDetail {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    ...(b.logoUrl ? { logoUrl: b.logoUrl } : {}),
    ...(b.coverImageUrl ? { coverImageUrl: b.coverImageUrl } : {}),
    content: b.content,
    priceTwd: b.priceTwd,
    ...(opt(b.raisingApprovalNo) !== undefined
      ? { raisingApprovalNo: b.raisingApprovalNo as string }
      : {}),
    ...(opt(b.reliefApprovalNo) !== undefined
      ? { reliefApprovalNo: b.reliefApprovalNo as string }
      : {}),
    charity: mapNestedCharity(b.charity),
    categories: b.categories,
  }
}
