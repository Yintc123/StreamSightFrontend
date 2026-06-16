export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerLifecycle } = await import('./lib/lifecycle')
    registerLifecycle()
    // Spec 002 §4.5 — eager mock-handler registration. Side-effect of the
    // import: every /user/v1/donation/* path the BFF might hit becomes
    // resolvable through resolveMock(), so dev mode (USE_MOCK=1) and the
    // e2e suite run against a deterministic fixture set without a live
    // backend.
    if (process.env.USE_MOCK === '1') {
      await import('./lib/mock/register')
    }
  }
}
