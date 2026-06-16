// Spec 009 §5 (v0.4) — BFF /api/checkout/donation routes a confirm-page
// submit to the right BE 022 endpoint (charity-donation vs project-
// donation) based on the `_endpoint` discriminator the FE attaches.
//
// brief.md「不接金流」: BE only stores the order at PENDING (no real
// payment). This route just forwards body shape verbatim — no field
// translation needed (ADR 012 alignment).

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

const CHARITY_ID = '00000000-0000-4000-8000-000000000001'
const PROJECT_ID = '00000000-0000-4000-8000-000000000002'
const ORDER_ID = '11111111-1111-4111-8111-000000000010'

const VALID_CHARITY_BODY = {
  _endpoint: '/user/v1/donation/orders/charity-donation',
  donorName: 'Alice',
  isAnonymous: false,
  receiptOption: 'NONE',
  charityId: CHARITY_ID,
  donationFrequency: 'RECURRING',
  billingDay: 'DAY_16',
  amountTwd: 500,
} as const

const VALID_PROJECT_BODY = {
  _endpoint: '/user/v1/donation/orders/project-donation',
  donorName: 'Bob',
  isAnonymous: false,
  receiptOption: 'INDIVIDUAL',
  donationProjectId: PROJECT_ID,
  donationFrequency: 'ONE_TIME',
  amountTwd: 1000,
} as const

const noParams = { params: Promise.resolve({}) }

function postReq(body: unknown): Request {
  const headers = new Headers()
  headers.set('origin', 'http://localhost:3000')
  headers.set('content-type', 'application/json')
  const serialized = JSON.stringify(body)
  // parseBody reads `req.body` as a ReadableStream — happy-dom's Request
  // constructor's `body: string` doesn't always populate this, so we hand-
  // build a stub with both `body` (stream) and `headers`.
  const bodyStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(serialized))
      controller.close()
    },
  })
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/checkout/donation',
    headers,
    body: bodyStream,
  } as unknown as Request
}

beforeEach(() => {
  _resetMockRegistry()
  overrides.useMock = '0'
})

describe('POST /api/checkout/donation', () => {
  it('charity-donation body → 轉發到 BE /charity-donation，回傳 orderId + status', async () => {
    let receivedUrl: string | undefined
    let receivedBody: unknown
    mockBackend(
      'post',
      'http://backend.test/user/v1/donation/orders/charity-donation',
      async (req) => {
        receivedUrl = req.url
        receivedBody = await req.json()
        return HttpResponse.json(
          {
            id: ORDER_ID,
            status: 'PENDING',
            donorName: 'Alice',
            // ...rest of order body — FE doesn't read these fields
          },
          { status: 201 },
        )
      },
    )
    const res = await POST(postReq(VALID_CHARITY_BODY), noParams)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { orderId: string; status: string } }
    expect(body.data.orderId).toBe(ORDER_ID)
    expect(body.data.status).toBe('PENDING')
    // 確認 _endpoint 被剝掉、不會送進 BE（BE strict additionalProperties=false 會 400）
    expect(receivedUrl).toBe(
      'http://backend.test/user/v1/donation/orders/charity-donation',
    )
    expect(receivedBody).not.toHaveProperty('_endpoint')
    expect(receivedBody).toEqual({
      donorName: 'Alice',
      isAnonymous: false,
      receiptOption: 'NONE',
      charityId: CHARITY_ID,
      donationFrequency: 'RECURRING',
      billingDay: 'DAY_16',
      amountTwd: 500,
    })
  })

  it('v0.5: isAnonymous=true 也通過 schema（跨三類訂單支援匿名）', async () => {
    let receivedBody: Record<string, unknown> | undefined
    mockBackend(
      'post',
      'http://backend.test/user/v1/donation/orders/charity-donation',
      async (req) => {
        receivedBody = (await req.json()) as Record<string, unknown>
        return HttpResponse.json(
          { id: ORDER_ID, status: 'PENDING' },
          { status: 201 },
        )
      },
    )
    const body = { ...VALID_CHARITY_BODY, isAnonymous: true }
    const res = await POST(postReq(body), noParams)
    expect(res.status).toBe(200)
    expect(receivedBody?.isAnonymous).toBe(true)
  })

  it('project-donation body → 轉發到 BE /project-donation', async () => {
    let receivedUrl: string | undefined
    mockBackend(
      'post',
      'http://backend.test/user/v1/donation/orders/project-donation',
      async (req) => {
        receivedUrl = req.url
        return HttpResponse.json(
          { id: ORDER_ID, status: 'PENDING' },
          { status: 201 },
        )
      },
    )
    const res = await POST(postReq(VALID_PROJECT_BODY), noParams)
    expect(res.status).toBe(200)
    expect(receivedUrl).toBe(
      'http://backend.test/user/v1/donation/orders/project-donation',
    )
  })

  it('body 缺欄位（無 donorName）→ 400 ValidationError', async () => {
    const broken = { ...VALID_CHARITY_BODY, donorName: undefined }
    const res = await POST(postReq(broken), noParams)
    expect(res.status).toBe(400)
  })

  it('RECURRING 缺 billingDay → 400（cross-field refine）', async () => {
    const broken = { ...VALID_CHARITY_BODY, billingDay: undefined }
    const res = await POST(postReq(broken), noParams)
    expect(res.status).toBe(400)
  })

  it('ONE_TIME 帶 billingDay → 400（cross-field refine 禁設）', async () => {
    const broken = {
      ...VALID_CHARITY_BODY,
      donationFrequency: 'ONE_TIME',
      billingDay: 'DAY_6',
    }
    const res = await POST(postReq(broken), noParams)
    expect(res.status).toBe(400)
  })

  it('未知 _endpoint → 400', async () => {
    const broken = { ...VALID_CHARITY_BODY, _endpoint: '/user/v1/donation/orders/wrong' }
    const res = await POST(postReq(broken), noParams)
    expect(res.status).toBe(400)
  })

  it('BE 回 404（charity 不存在）→ 404 透傳', async () => {
    mockBackend(
      'post',
      'http://backend.test/user/v1/donation/orders/charity-donation',
      async () =>
        HttpResponse.json(
          { error: { code: 'CHARITY_NOT_FOUND', message: 'not found' } },
          { status: 404 },
        ),
    )
    const res = await POST(postReq(VALID_CHARITY_BODY), noParams)
    expect(res.status).toBe(404)
  })
})
