import { describe, it, expect, beforeEach, vi } from 'vitest'
import { registerOtelSdk, shutdownOtel, _resetOtelSdkForTest } from './otel-sdk'

beforeEach(() => {
  _resetOtelSdkForTest()
})

describe('shutdownOtel', () => {
  it('no-op when no SDK registered (OTLP endpoint unset)', async () => {
    await expect(shutdownOtel()).resolves.toBeUndefined()
  })

  it('calls SDK.shutdown() once when registered', async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined)
    registerOtelSdk({ shutdown })
    await shutdownOtel()
    expect(shutdown).toHaveBeenCalledTimes(1)
  })

  it('is idempotent — second call does not re-shutdown', async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined)
    registerOtelSdk({ shutdown })
    await shutdownOtel()
    await shutdownOtel()
    expect(shutdown).toHaveBeenCalledTimes(1)
  })
})
