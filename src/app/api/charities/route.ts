// Spec 002 §2 / backend 016 §3 — public charity list BFF.
// Upstream: GET /v1/donation/charities

import 'server-only'

import { createListRoute } from '@/lib/api/createListRoute'
import {
  BackendCharityListItem,
  toClientCharity,
} from '@/lib/schemas/list'

export const GET = createListRoute({
  upstream: '/v1/donation/charities',
  backendItemSchema: BackendCharityListItem,
  toClientItem: toClientCharity,
  // Spec 002 §1.3 v0.3 — charity row layout, 10/page at mobile width.
  limit: 10,
  // Spec 002 §1.3 v0.7 — desktop lg:grid-cols-3 × 10 rows.
  // No tabletLimit override: md:grid-cols-2 still serves 10/page acceptably
  // (5 rows of 2 cards); jumping straight to 30 only when 3-col grid kicks in.
  desktopLimit: 30,
})
