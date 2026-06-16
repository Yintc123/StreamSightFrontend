// Spec 004a / backend 017 §3 — Charity detail BFF.
// Upstream: GET /user/v1/donation/charities/:id (BE spec 023 §2.4)

import 'server-only'

import { createDetailRoute } from '@/lib/api/createDetailRoute'
import {
  BackendCharityDetail,
  toClientCharityDetail,
} from '@/lib/schemas/detail'

export const GET = createDetailRoute({
  upstream: '/user/v1/donation/charities',
  backendSchema: BackendCharityDetail,
  toClient: toClientCharityDetail,
})
