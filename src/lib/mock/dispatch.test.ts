import { describe, it, expect, beforeEach } from 'vitest'
import { registerMock, resolveMock, _resetMockRegistry } from './dispatch'

describe('mock/dispatch', () => {
  beforeEach(() => {
    _resetMockRegistry()
  })

  it('resolves a registered handler by path', () => {
    const handler = () => ({ data: 'foo' })
    registerMock('/foo', handler)
    expect(resolveMock('/foo')).toBe(handler)
  })

  it('returns undefined for unregistered path', () => {
    expect(resolveMock('/never')).toBeUndefined()
  })

  it('later registration on same path overwrites earlier', () => {
    const h1 = () => 1
    const h2 = () => 2
    registerMock('/dup', h1)
    registerMock('/dup', h2)
    expect(resolveMock('/dup')).toBe(h2)
  })

  it('handler receives query and body', () => {
    let captured: { query?: Record<string, unknown>; body?: unknown } | undefined
    registerMock('/echo', (opts) => {
      captured = opts
      return opts
    })
    const handler = resolveMock('/echo')
    handler?.({ query: { q: 'x' }, body: { k: 1 } })
    expect(captured).toEqual({ query: { q: 'x' }, body: { k: 1 } })
  })

  describe(':param patterns', () => {
    it('resolves a trailing :param and forwards captured value as `query.__<name>`', () => {
      let captured: { query?: Record<string, unknown> } | undefined
      registerMock('/things/:id', (opts) => {
        captured = opts
        return opts
      })
      const handler = resolveMock('/things/abc123')
      expect(handler).toBeDefined()
      handler?.({ query: { existing: 'kept' } })
      expect(captured?.query).toEqual({ existing: 'kept', __id: 'abc123' })
    })

    it('returns undefined when the segment count differs (captured slash)', () => {
      registerMock('/things/:id', () => ({}))
      expect(resolveMock('/things/abc/def')).toBeUndefined()
    })

    it('returns undefined when the captured segment is empty', () => {
      registerMock('/things/:id', () => ({}))
      expect(resolveMock('/things/')).toBeUndefined()
    })

    it('literal exact match takes precedence over a pattern of the same prefix', () => {
      const literal = () => 'L'
      const pattern = () => 'P'
      registerMock('/things/abc', literal)
      registerMock('/things/:id', pattern)
      expect(resolveMock('/things/abc')).toBe(literal)
    })

    // Spec 013a §3.3 — mid-segment :param (lifecycle endpoints like
    // /admin/admins/:id/role|archive|restore).
    it('resolves a mid-segment :param followed by a literal action', () => {
      let captured: { query?: Record<string, unknown> } | undefined
      registerMock('/admin/admins/:id/role', (opts) => {
        captured = opts
        return opts
      })
      const handler = resolveMock('/admin/admins/42/role')
      expect(handler).toBeDefined()
      handler?.({ query: {} })
      expect(captured?.query).toEqual({ __id: '42' })
    })

    it('does not match a mid-param pattern when the trailing literal differs', () => {
      registerMock('/admin/admins/:id/role', () => ({}))
      expect(resolveMock('/admin/admins/42/archive')).toBeUndefined()
    })

    it('disambiguates trailing vs mid-param patterns by segment count', () => {
      const detail = () => 'D'
      const role = () => 'R'
      registerMock('/admin/admins/:id', detail)
      registerMock('/admin/admins/:id/role', role)
      // 4 segments → detail; 5 segments → role
      expect(resolveMock('/admin/admins/7')?.({ query: {} })).toBe('D')
      expect(resolveMock('/admin/admins/7/role')?.({ query: {} })).toBe('R')
    })
  })
})
