// Spec 002 §4.1 — Generic list handler factory.
//
// Wraps a client-shape fixture array + an adapter and returns a
// `MockHandler` that mimics the backend `/user/v1/donation/<resource>` list
// endpoint (q + category + cursor + limit):
//
//   - `q` lowercase contains match against name + description.
//   - `category` checked against the fixture's `categories` array (key
//     match; emits 200 + empty list if no match, per spec 016 §5.2).
//   - `cursor` is an opaque offset (the integer index encoded as
//     base64url); when missing, starts at 0.
//   - `limit` defaults to 10. The handler honours the upper bound but
//     does not clamp below 1.
//
// Returns `{ items, pageInfo: { nextCursor, hasMore } }` shape — exactly
// what backend emits and what `BackendListResponse` validates.

import 'server-only'

import type { CategoryKey } from '@/lib/schemas/categories'
import type { MockHandler } from './dispatch'

interface FixtureBase {
  name: string
  description: string
  categories?: readonly CategoryKey[]
}

export function makeListHandler<TFixture extends FixtureBase, TBackend>(
  fixtures: readonly TFixture[],
  adapter: (f: TFixture) => TBackend,
  opts: { defaultLimit?: number } = {},
): MockHandler {
  const defaultLimit = opts.defaultLimit ?? 10

  return ({ query }) => {
    const q = typeof query?.q === 'string' ? query.q.toLowerCase() : ''
    const category =
      typeof query?.category === 'string' ? (query.category as CategoryKey) : undefined
    const limit = clamp(asInt(query?.limit, defaultLimit), 1, 50)
    const start = decodeCursor(query?.cursor)

    let filtered: readonly TFixture[] = fixtures
    if (category) {
      filtered = filtered.filter((f) => (f.categories ?? []).includes(category))
    }
    if (q) {
      filtered = filtered.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q),
      )
    }

    const pageEnd = start + limit
    const page = filtered.slice(start, pageEnd)
    const hasMore = pageEnd < filtered.length
    return {
      items: page.map(adapter),
      pageInfo: {
        nextCursor: hasMore ? encodeCursor(pageEnd) : null,
        hasMore,
      },
    }
  }
}

function asInt(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64url')
}

function decodeCursor(raw: unknown): number {
  if (typeof raw !== 'string' || raw.length === 0) return 0
  try {
    return asInt(Buffer.from(raw, 'base64url').toString('utf8'), 0)
  } catch {
    return 0
  }
}
