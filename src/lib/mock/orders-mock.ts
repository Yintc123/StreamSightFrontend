import 'server-only'

// Spec 022 §4.1-4.3 — mock handlers for the three order-creation POST
// endpoints (USE_MOCK=1 path). They synthesise a PENDING order body that
// satisfies the minimum FE/BFF needs: `id` + `status`. Real backend
// returns the full OrderResponse (lines, inflated subjects, etc.) but
// the BFF route only plucks { orderId, status } from the response, so
// the mock stays light.

import type { MockHandler } from './dispatch'

function makeOrderId(prefix: string): string {
  // Deterministic enough for assertions, varied enough to look real.
  const t = Date.now().toString(16).padStart(12, '0').slice(-12)
  return `${prefix.padEnd(8, '0')}-0000-4000-8000-${t}`
}

export const charityDonationHandler: MockHandler = () => ({
  id: makeOrderId('chad'),
  status: 'PENDING',
})

export const projectDonationHandler: MockHandler = () => ({
  id: makeOrderId('prod'),
  status: 'PENDING',
})

export const saleItemPurchaseHandler: MockHandler = () => ({
  id: makeOrderId('saip'),
  status: 'PENDING',
})
