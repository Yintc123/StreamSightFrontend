import 'server-only'

export type MockHandler = (opts: {
  query?: Record<string, unknown>
  body?: unknown
}) => unknown

interface PatternEntry {
  prefix: string
  paramKeys: readonly string[]
  handler: MockHandler
}

const literals = new Map<string, MockHandler>()
const patterns: PatternEntry[] = []

/**
 * Register a mock handler for an exact path (`/v1/donation/charities`)
 * or a single-param pattern (`/v1/donation/charities/:id`). The captured
 * param value is forwarded to the handler as `query.__<paramName>`
 * (double-underscored to avoid collision with real query params).
 */
export function registerMock(path: string, handler: MockHandler): void {
  if (path.includes(':')) {
    const segments = path.split('/')
    const paramIdx = segments.findIndex((s) => s.startsWith(':'))
    if (paramIdx === -1 || paramIdx !== segments.length - 1) {
      throw new Error(
        `registerMock: only trailing single :param patterns are supported (got ${path})`,
      )
    }
    const paramName = segments[paramIdx]!.slice(1)
    const prefix = segments.slice(0, paramIdx).join('/')
    patterns.push({ prefix, paramKeys: [paramName], handler })
    return
  }
  literals.set(path, handler)
}

export function resolveMock(path: string): MockHandler | undefined {
  const literal = literals.get(path)
  if (literal) return literal
  for (const p of patterns) {
    if (!path.startsWith(`${p.prefix}/`)) continue
    const rest = path.slice(p.prefix.length + 1)
    if (rest.length === 0 || rest.includes('/')) continue
    const paramValue = rest
    return (opts) =>
      p.handler({
        ...opts,
        query: { ...opts.query, [`__${p.paramKeys[0]!}`]: paramValue },
      })
  }
  return undefined
}

export function _resetMockRegistry(): void {
  literals.clear()
  patterns.length = 0
}
