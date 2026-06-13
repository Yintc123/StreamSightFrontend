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
})
