// Spec 009 §5 (v0.4) — BFF route for donation confirm submit.
//
// Receives the FE payload built by useDonorInfoForm.buildPayload (ADR 012
// — already in BE 022 §4.1 / §4.2 body shape), routes to one of the two
// BE endpoints by the `_endpoint` discriminator, strips that discriminator
// before forwarding (BE TypeBox uses `additionalProperties: false`), and
// returns a minimal `{ orderId, status }` envelope to the FE.
//
// brief.md「不接金流」: BE stores the order with status PENDING. No mock-
// confirm-payment is called here — that's a separate step the spec leaves
// for a future "付款選擇頁".
//
// CSRF: csrfExempt=true, matching dev-login's anonymous-POST pattern. The
// BE endpoints themselves are unauthenticated (BE 022 §2.1), so there's
// no session cookie to defend.

import 'server-only'
import { z } from 'zod'

import { createRoute, okResponse } from '@/lib/api'
import { backendFetch } from '@/lib/api/backend'

const RECEIPT_OPTION = z.enum([
  'NONE',
  'INDIVIDUAL',
  'CORPORATE',
  'GOVERNMENT_DONATION',
  'DEFER',
])

const DONATION_FREQUENCY = z.enum(['ONE_TIME', 'RECURRING'])
const BILLING_DAY = z.enum(['DAY_6', 'DAY_16', 'DAY_26'])

const BASE = {
  donorName: z.string().min(1).max(120),
  // v0.5 — isAnonymous accepted as boolean across all three order types
  // (BE 022 §4.1 / §4.2 — donation flow gained the checkbox in 009a v0.8).
  isAnonymous: z.boolean(),
  receiptOption: RECEIPT_OPTION,
  donationFrequency: DONATION_FREQUENCY,
  billingDay: BILLING_DAY.optional(),
  amountTwd: z.number().int().min(1).max(1_000_000),
}

const CharityDonationBody = z.object({
  _endpoint: z.literal('/user/v1/donation/orders/charity-donation'),
  ...BASE,
  charityId: z.string().uuid(),
})

const ProjectDonationBody = z.object({
  _endpoint: z.literal('/user/v1/donation/orders/project-donation'),
  ...BASE,
  donationProjectId: z.string().uuid(),
})

const Body = z
  .discriminatedUnion('_endpoint', [CharityDonationBody, ProjectDonationBody])
  .refine(
    (b) => b.donationFrequency === 'ONE_TIME' || b.billingDay !== undefined,
    { message: 'billingDay required when donationFrequency=RECURRING' },
  )
  .refine(
    (b) => b.donationFrequency !== 'ONE_TIME' || b.billingDay === undefined,
    { message: 'billingDay must be omitted when donationFrequency=ONE_TIME' },
  )

type BodyShape = z.infer<typeof Body>
type BeOrderResponse = { id: string; status: string }

export const POST = createRoute({
  csrfExempt: true,
  bodySchema: Body,
  handler: async ({ body, requestId }) => {
    // Strip FE-side discriminator before forwarding — BE 022 TypeBox uses
    // `additionalProperties: false`, leaving _endpoint in would 400.
    const { _endpoint, ...forwardBody } = body as BodyShape
    const { data } = await backendFetch<BeOrderResponse>(_endpoint, {
      method: 'POST',
      body: forwardBody,
      requestId,
    })
    return okResponse({ orderId: data.id, status: data.status })
  },
})
