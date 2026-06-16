// Spec 004c / backend 017 §5 — Sale-item detail BFF.
// Upstream: GET /user/v1/donation/sale-items/:id (BE spec 023 §2.4)

import 'server-only'

import { createDetailRoute } from '@/lib/api/createDetailRoute'
import {
  BackendItemDetail,
  toClientItemDetail,
} from '@/lib/schemas/detail'

export const GET = createDetailRoute({
  upstream: '/user/v1/donation/sale-items',
  backendSchema: BackendItemDetail,
  toClient: toClientItemDetail,
})
