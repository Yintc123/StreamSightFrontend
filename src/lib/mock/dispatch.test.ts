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

  describe('single-:param pattern', () => {
    it('resolves a path matching the prefix and forwards captured value as `query.__<name>`', () => {
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

    it('returns undefined when the captured segment contains a slash (no recursive prefix match)', () => {
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
      // resolveMock returns the literal exactly, but the pattern resolver
      // is a wrapper, so identity equality is only meaningful for literal.
      expect(resolveMock('/things/abc')).toBe(literal)
    })

    it('only allows a trailing single :param segment', () => {
      expect(() =>
        registerMock('/things/:id/foo', () => ({})),
      ).toThrow(/trailing single :param/)
    })
  })
})
