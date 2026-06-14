// Spec 002 §2 / backend 016 §3 — public donation-project list BFF.
// Upstream: GET /v1/donation/donation-projects
//
// Path name divergence is intentional: client URL stays `/api/donations`
// (matches spec 002 §3.2 RESOURCE_TO_PATH); the longer backend path
// (`donation-projects` to avoid clashing with the parent `/donation/`
// namespace, spec 016 v0.7) only lives at the BFF→backend hop.

import 'server-only'

import { createListRoute } from '@/lib/api/createListRoute'
import {
  BackendDonationListItem,
  toClientDonation,
} from '@/lib/schemas/list'

export const GET = createListRoute({
  upstream: '/v1/donation/donation-projects',
  backendItemSchema: BackendDonationListItem,
  toClientItem: toClientDonation,
  // Spec 002 §1.3 v0.3 — donation 16:9 cover cards, 5/page at mobile width.
  limit: 5,
})
