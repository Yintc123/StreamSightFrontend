import 'server-only'
import { getSessionStore } from '@/lib/session/store'
import { shutdownOtel } from '@/lib/observability/otel-sdk'
import { log } from '@/lib/log'
import { SHUTDOWN_DEADLINE_MS } from '@/lib/api/constants'

let shuttingDown = false
let registered = false

function handleSignal(signal: NodeJS.Signals): void {
  if (shuttingDown) return
  shuttingDown = true
  log.info({ signal }, 'bff.shutdown.begin')

  const deadline = setTimeout(() => {
    log.warn({}, 'bff.shutdown.force')
    process.exit(0)
  }, SHUTDOWN_DEADLINE_MS).unref()

  ;(async () => {
    try {
      // Spec 001h §7 — flush OTel spans before exit so Cloud Run scale-to-zero
      // doesn't drop the tail (no-op if tracing was never started).
      await shutdownOtel()
      const store = getSessionStore()
      await store.close()
      log.info({}, 'bff.shutdown.clean')
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'bff.shutdown.error')
    } finally {
      clearTimeout(deadline)
      process.exit(0)
    }
  })()
}

export function registerLifecycle(): void {
  if (registered) return
  registered = true
  process.on('SIGTERM', handleSignal)
  process.on('SIGINT', handleSignal)
}

/** Test-only: reset module state so tests run independently. */
export function _resetLifecycleForTest(): void {
  shuttingDown = false
  registered = false
}
