import { describe, it, expect } from 'vitest'
import { okResponse } from './responses'

describe('okResponse', () => {
  it('returns 200 with { data } envelope', async () => {
    const res = okResponse({ id: 1 })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(res.headers.get('cache-control')).toBe('no-store, private')
    expect(await res.json()).toEqual({ data: { id: 1 } })
  })

  it('includes meta when provided', async () => {
    const res = okResponse([1, 2], { count: 2 })
    expect(await res.json()).toEqual({ data: [1, 2], meta: { count: 2 } })
  })

  it('omits meta when undefined', async () => {
    const body = await okResponse('x').json()
    expect(body).not.toHaveProperty('meta')
  })
})
