import { describe, it, expect } from 'vitest'
import { newRequestId } from './request-id'

describe('newRequestId', () => {
  it('matches format req_YYYY-MM-DD_<8-base64url>', () => {
    const id = newRequestId()
    // base64url alphabet: A-Z, a-z, 0-9, -, _
    expect(id).toMatch(/^req_\d{4}-\d{2}-\d{2}_[A-Za-z0-9_-]{8}$/)
  })

  it('produces unique values across calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newRequestId()))
    expect(ids.size).toBe(200)
  })
})
