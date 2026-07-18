import { describe, it, expect } from 'vitest'
import { formatDate } from './date'

describe('formatDate', () => {
  it('formats an ISO string as YYYY/MM/DD', () => {
    expect(formatDate('2026-07-01T00:00:00Z')).toBe('2026/07/01')
  })

  it('zero-pads month and day', () => {
    expect(formatDate('2026-03-05T12:00:00Z')).toBe('2026/03/05')
  })

  it('returns a dash for null / empty / invalid input', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('')).toBe('—')
    expect(formatDate('not-a-date')).toBe('—')
  })
})
