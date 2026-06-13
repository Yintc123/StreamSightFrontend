import 'server-only'

export type MockHandler = (opts: {
  query?: Record<string, unknown>
  body?: unknown
}) => unknown

const registry = new Map<string, MockHandler>()

export function registerMock(path: string, handler: MockHandler): void {
  registry.set(path, handler)
}

export function resolveMock(path: string): MockHandler | undefined {
  return registry.get(path)
}

export function _resetMockRegistry(): void {
  registry.clear()
}
