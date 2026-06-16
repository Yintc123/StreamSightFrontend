// Spec 004b / backend 017 §4 — Donation-project detail BFF.
// Upstream: GET /user/v1/donation/donation-projects/:id (BE spec 023 §2.4)

import 'server-only'

import { createDetailRoute } from '@/lib/api/createDetailRoute'
import {
  BackendDonationDetail,
  toClientDonationDetail,
} from '@/lib/schemas/detail'

export const GET = createDetailRoute({
  upstream: '/user/v1/donation/donation-projects',
  backendSchema: BackendDonationDetail,
  toClient: toClientDonationDetail,
})
