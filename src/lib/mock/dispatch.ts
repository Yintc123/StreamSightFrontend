import 'server-only'

export type MockHandler = (opts: {
  query?: Record<string, unknown>
  body?: unknown
  /** HTTP method, so one path handler can branch GET vs POST etc. */
  method?: string
}) => unknown

interface PatternEntry {
  segments: readonly string[]
  handler: MockHandler
}

const literals = new Map<string, MockHandler>()
const patterns: PatternEntry[] = []

/**
 * Register a mock handler for an exact path (`/admin/admins`) or a pattern
 * with one or more `:param` segments in ANY position (spec 013a §3.3):
 *   - trailing:    `/admin/admins/:id`
 *   - mid-segment: `/admin/admins/:id/role`
 *
 * A captured param value is forwarded to the handler as `query.__<paramName>`
 * (double-underscored to avoid collision with real query params).
 */
export function registerMock(path: string, handler: MockHandler): void {
  if (path.includes(':')) {
    patterns.push({ segments: path.split('/'), handler })
    return
  }
  literals.set(path, handler)
}

export function resolveMock(path: string): MockHandler | undefined {
  const literal = literals.get(path)
  if (literal) return literal

  const pathSegments = path.split('/')
  for (const p of patterns) {
    if (p.segments.length !== pathSegments.length) continue
    const captured: Record<string, string> = {}
    let matched = true
    for (let i = 0; i < p.segments.length; i++) {
      const pat = p.segments[i]!
      const seg = pathSegments[i]!
      if (pat.startsWith(':')) {
        if (seg.length === 0) {
          matched = false
          break
        }
        captured[`__${pat.slice(1)}`] = seg
      } else if (pat !== seg) {
        matched = false
        break
      }
    }
    if (!matched) continue
    return (opts) =>
      p.handler({ ...opts, query: { ...opts.query, ...captured } })
  }
  return undefined
}

export function _resetMockRegistry(): void {
  literals.clear()
  patterns.length = 0
}
