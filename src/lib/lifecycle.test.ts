import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const closeMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/session/store', () => ({
  getSessionStore: () => ({ close: closeMock }),
}))

import { registerLifecycle, _resetLifecycleForTest } from './lifecycle'

const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
const processOnSpy = vi.spyOn(process, 'on')

beforeEach(() => {
  closeMock.mockClear().mockResolvedValue(undefined)
  exitSpy.mockClear()
  processOnSpy.mockClear()
  _resetLifecycleForTest()
  process.removeAllListeners('SIGTERM')
  process.removeAllListeners('SIGINT')
})

afterEach(() => {
  process.removeAllListeners('SIGTERM')
  process.removeAllListeners('SIGINT')
})

describe('registerLifecycle', () => {
  it('registers SIGTERM + SIGINT listeners exactly once even when called twice', () => {
    registerLifecycle()
    registerLifecycle()
    const sigterm = processOnSpy.mock.calls.filter((c) => c[0] === 'SIGTERM')
    const sigint = processOnSpy.mock.calls.filter((c) => c[0] === 'SIGINT')
    expect(sigterm).toHaveLength(1)
    expect(sigint).toHaveLength(1)
  })

  it('on SIGTERM: closes store and exits cleanly', async () => {
    registerLifecycle()
    process.emit('SIGTERM')
    // Allow microtasks to drain
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
    expect(closeMock).toHaveBeenCalledTimes(1)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('still exits even if store.close throws', async () => {
    closeMock.mockRejectedValueOnce(new Error('redis went away'))
    registerLifecycle()
    process.emit('SIGTERM')
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('a second signal during shutdown is a no-op (does not double-close)', async () => {
    registerLifecycle()
    process.emit('SIGTERM')
    process.emit('SIGINT')
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
    expect(closeMock).toHaveBeenCalledTimes(1)
  })
})
