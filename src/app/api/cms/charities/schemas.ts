// Spec 011a §6.1 — shared Zod schemas for /api/cms/charities create + edit.
//
// Mirrors BE 020 §5.1 CharityCreateBody / CharityPatchBody TypeBox.
// Two refines applied identically to both (create + partial-update) so a
// PATCH that touches one publish-window endpoint validates the same way.

import { z } from 'zod'

const publishWindowOk = (v: {
  publishStartAt?: string
  publishEndAt?: string
}) => !v.publishStartAt || !v.publishEndAt || v.publishEndAt > v.publishStartAt

const CharityFields = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().min(1).max(500),
  contactPhone: z.string().trim().min(1).max(40).optional(),
  contactEmail: z.string().email().max(254).optional(),
  officialWebsite: z.string().url().max(2048).optional(),
  approvalNo: z.string().min(1).max(100).optional(),
  displayOrder: z.number().int().min(-1000).max(1000).default(0),
  publishStartAt: z.string().datetime().optional(),
  publishEndAt: z.string().datetime().optional(),
  categoryIds: z.array(z.string().uuid()).max(16).default([]),
})

export const CharityCreateBody = CharityFields.refine(publishWindowOk, {
  message: 'publishEndAt must be > publishStartAt',
  path: ['publishEndAt'],
})

export const CharityPatchBody = CharityFields.partial().refine(publishWindowOk, {
  message: 'publishEndAt must be > publishStartAt',
  path: ['publishEndAt'],
})

export const CharityIdParams = z.object({ id: z.string().uuid() })

export type CharityCreateBodyT = z.infer<typeof CharityCreateBody>
export type CharityPatchBodyT = z.infer<typeof CharityPatchBody>
