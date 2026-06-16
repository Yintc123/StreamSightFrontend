// Spec 011 §5.4 — admin variant of charity detail.
//
// Backend spec 026 admin GET endpoints return the public charity detail
// (spec 017) plus the 5 admin lifecycle fields. Mirror that shape so
// edit forms can pre-fill displayOrder / publishStartAt / publishEndAt
// — the public schema in detail.ts intentionally omits these.

import { z } from 'zod'
import { InflatedCategory } from './detail'

// Re-derive the public shape inline here; importing BackendCharityDetail
// then `.merge()` would couple the modules circularly during refactors.
export const BackendAdminCharityDetail = z.object({
  // ── public CharityDetail fields ─────────────────────────────────────
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
  // ── admin lifecycle metadata (spec 026 §5.1.2) ──────────────────────
  displayOrder: z.number().int(),
  publishStartAt: z.string().nullable(),
  publishEndAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
})

export type BackendAdminCharityDetail = z.infer<typeof BackendAdminCharityDetail>
