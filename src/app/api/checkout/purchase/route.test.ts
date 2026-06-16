// Spec 009 §5 (v0.4) — BFF /api/checkout/purchase forwards to BE 022 §4.3
// `/user/v1/donation/orders/sale-item-purchase`. Body shape matches BE
// SaleItemPurchaseBody verbatim (ADR 012) so no field translation.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HttpResponse } from 'msw'

import { mockBackend } from '../../../../../tests/helpers/backend-mock'
import { _resetMockRegistry } from '@/lib/mock/dispatch'

const overrides = vi.hoisted(() => ({
  useMock: '0' as '0' | '1',
  backendUrl: 'http://backend.test',
}))

vi.mock('@/lib/config', () => ({
  env: {
    get USE_MOCK() {
      return overrides.useMock
    },
    get BACKEND_API_URL() {
      return overrides.backendUrl
    },
    NODE_ENV: 'test',
    SESSION_SECRET: 'test-session-secret-must-be-32-chars-long',
    SESSION_COOKIE_NAME: 'jko_session',
    SESSION_TTL_SECONDS: 2_592_000,
    ALLOWED_ORIGINS: 'http://localhost:3000',
    REDIS_KEY_PREFIX: 'jko-bff-test',
    APP_VERSION: '0.0.0-test',
    ENABLE_DEV_LOGIN: '1',
    NEXT_PUBLIC_APP_NAME: 'JKODonation',
  },
}))

vi.mock('@/lib/session/service', () => ({
  getSessionService: () => ({
    get: vi.fn().mockResolvedValue(null),
    touch: vi.fn().mockResolvedValue(undefined),
    wasMutated: () => false,
  }),
}))

import { POST } from './route'

const SALE_ITEM_ID = '00000000-0000-4000-8000-000000000099'
const ORDER_ID = '11111111-1111-4111-8111-000000000020'

const VALID_BODY = {
  _endpoint: '/user/v1/donation/orders/sale-item-purchase',
  donorName: 'Alice',
  isAnonymous: false,
  items: [{ saleItemId: SALE_ITEM_ID, quantity: 2 }],
} as const

const noParams = { params: Promise.resolve({}) }

function postReq(body: unknown): Request {
  const headers = new Headers()
  headers.set('origin', 'http://localhost:3000')
  headers.set('content-type', 'application/json')
  const serialized = JSON.stringify(body)
  const bodyStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(serialized))
      controller.close()
    },
  })
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/checkout/purchase',
    headers,
    body: bodyStream,
  } as unknown as Request
}

beforeEach(() => {
  _resetMockRegistry()
  overrides.useMock = '0'
})

describe('POST /api/checkout/purchase', () => {
  it('valid body → 轉發到 BE /sale-item-purchase，回傳 orderId + status', async () => {
    let receivedBody: unknown
    mockBackend(
      'post',
      'http://backend.test/user/v1/donation/orders/sale-item-purchase',
      async (req) => {
        receivedBody = await req.json()
        return HttpResponse.json(
          { id: ORDER_ID, status: 'PENDING' },
          { status: 201 },
        )
      },
    )
    const res = await POST(postReq(VALID_BODY), noParams)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { orderId: string; status: string } }
    expect(body.data.orderId).toBe(ORDER_ID)
    expect(receivedBody).not.toHaveProperty('_endpoint')
    expect(receivedBody).toEqual({
      donorName: 'Alice',
      isAnonymous: false,
      items: [{ saleItemId: SALE_ITEM_ID, quantity: 2 }],
    })
  })

  it('items.length=0 → 400', async () => {
    const broken = { ...VALID_BODY, items: [] }
    const res = await POST(postReq(broken), noParams)
    expect(res.status).toBe(400)
  })

  it('quantity > 100 → 400（對齊 BE 上限）', async () => {
    const broken = {
      ...VALID_BODY,
      items: [{ saleItemId: SALE_ITEM_ID, quantity: 101 }],
    }
    const res = await POST(postReq(broken), noParams)
    expect(res.status).toBe(400)
  })

  it('saleItemId 非 uuid → 400', async () => {
    const broken = {
      ...VALID_BODY,
      items: [{ saleItemId: 'not-uuid', quantity: 1 }],
    }
    const res = await POST(postReq(broken), noParams)
    expect(res.status).toBe(400)
  })

  it('BE 回 404（sale-item 不存在）→ 404 透傳', async () => {
    mockBackend(
      'post',
      'http://backend.test/user/v1/donation/orders/sale-item-purchase',
      async () =>
        HttpResponse.json(
          { error: { code: 'SALE_ITEM_NOT_FOUND', message: 'not found' } },
          { status: 404 },
        ),
    )
    const res = await POST(postReq(VALID_BODY), noParams)
    expect(res.status).toBe(404)
  })
})
