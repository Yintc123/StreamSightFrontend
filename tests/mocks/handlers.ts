import type { HttpHandler } from 'msw'

// Shared MSW handlers for unit + e2e tests. The domain endpoints were
// removed with the feature layer; add per-feature handlers here as new
// verticals land.
export const handlers: HttpHandler[] = []
