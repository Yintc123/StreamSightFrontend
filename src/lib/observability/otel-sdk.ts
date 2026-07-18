import 'server-only'

// Spec 001h §7 — holds the started OTel NodeSDK handle so graceful shutdown
// (001g `lifecycle.ts`) can flush spans on SIGTERM. Decoupled here (a tiny
// registry, no heavy OTel import) so lifecycle needn't import the SDK bootstrap
// and risk re-running its start side-effect.

type ShutdownableSdk = { shutdown(): Promise<void> }

let sdk: ShutdownableSdk | null = null

export function registerOtelSdk(instance: ShutdownableSdk): void {
  sdk = instance
}

/**
 * Flush + shut down OTel. `NodeSDK.shutdown()` flushes every span processor
 * (a Cloud Run scale-to-zero / SIGTERM would otherwise drop the tail spans of
 * a BatchSpanProcessor). No-op + idempotent when the SDK never started (no
 * OTLP endpoint configured).
 */
export async function shutdownOtel(): Promise<void> {
  if (!sdk) return
  const instance = sdk
  sdk = null
  await instance.shutdown()
}

/** Test-only reset. */
export function _resetOtelSdkForTest(): void {
  sdk = null
}
