// Spec 002 §2 / backend 016 §3 — public sale-item list BFF.
// Upstream: GET /v1/donation/sale-items

import 'server-only'

import { createListRoute } from '@/lib/api/createListRoute'
import {
  BackendItemListItem,
  toClientItem,
} from '@/lib/schemas/list'

export const GET = createListRoute({
  upstream: '/v1/donation/sale-items',
  backendItemSchema: BackendItemListItem,
  toClientItem: toClientItem,
  // Spec 002 §1.3 v0.3 — item 2-col square grid, 4/page at mobile width.
  limit: 4,
  // Spec 002 §1.3 v0.6 — grid widens md:grid-cols-3 → 6/page (2 rows).
  tabletLimit: 6,
  // Spec 002 §1.3 v0.6 — lg:grid-cols-4 → 12/page (3 rows).
  desktopLimit: 12,
})
