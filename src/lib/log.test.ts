import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { log, maskBearer, maskToken, maskSessionId, maskCsrfToken } from './log'

describe('log emitters', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('writes a single JSON line with level, event, time, and fields', () => {
    log.info({ requestId: 'req_1', path: '/x' }, 'bff.request.in')
    expect(infoSpy).toHaveBeenCalledTimes(1)
    const raw = infoSpy.mock.calls[0][0] as string
    expect(raw.split('\n')).toHaveLength(1)
    const parsed = JSON.parse(raw)
    expect(parsed.level).toBe('info')
    expect(parsed.event).toBe('bff.request.in')
    expect(parsed.requestId).toBe('req_1')
    expect(parsed.path).toBe('/x')
    expect(typeof parsed.time).toBe('string')
  })

  it('routes warn → console.warn and error → console.error', () => {
    log.warn({ a: 1 }, 'bff.upstream.error')
    log.error({ b: 2 }, 'bff.internal.error')
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(warnSpy.mock.calls[0][0] as string).level).toBe('warn')
    expect(JSON.parse(errorSpy.mock.calls[0][0] as string).level).toBe('error')
  })
})

describe('maskBearer', () => {
  it('keeps prefix + first 8 chars of token', () => {
    expect(maskBearer('Bearer abcdefghijklmnop')).toBe('Bearer abcdefgh...')
  })

  it('handles case-insensitive prefix', () => {
    expect(maskBearer('bearer abcdefghxyz')).toBe('Bearer abcdefgh...')
  })

  it('returns <malformed> when prefix missing', () => {
    expect(maskBearer('abcdefghxyz')).toBe('<malformed>')
  })

  it('returns empty string for null/undefined', () => {
    expect(maskBearer(null)).toBe('')
    expect(maskBearer(undefined)).toBe('')
  })
})

describe('maskToken', () => {
  it('returns first 8 chars + ...', () => {
    expect(maskToken('abcdefghijklmnop')).toBe('abcdefgh...')
  })

  it('returns empty string for null/undefined', () => {
    expect(maskToken(null)).toBe('')
    expect(maskToken(undefined)).toBe('')
  })
})

describe('maskSessionId', () => {
  it('returns first 4 chars + ...', () => {
    expect(maskSessionId('abcdefghij')).toBe('abcd...')
  })

  it('returns empty for null/undefined', () => {
    expect(maskSessionId(null)).toBe('')
  })
})

describe('maskCsrfToken', () => {
  it('returns presence + length, never raw value', () => {
    expect(maskCsrfToken('abcdefghij')).toEqual({ present: true, length: 10 })
    expect(maskCsrfToken('')).toEqual({ present: false, length: 0 })
    expect(maskCsrfToken(null)).toEqual({ present: false, length: 0 })
    expect(maskCsrfToken(undefined)).toEqual({ present: false, length: 0 })
  })
})
