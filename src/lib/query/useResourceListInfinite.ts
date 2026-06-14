// Spec 002 §6 — generic infinite-query hook for the three list tabs.
//
// One hook drives all three (charity / donation / item) — the resource
// discriminator picks the BFF path. Each tab page mounts the hook with
// its own `enabled` flag so inactive tabs cost zero network (spec 002
// §1.3 lazy fetch).
//
// Cache semantics inherited from `Providers`:
//   - staleTime 30s → switching back to a same-q tab within 30s reuses
//     the cached pages, no spinner.
//   - gcTime 5min → detail → back navigation is instant within window.
//
// `queryKey` includes `resource + q + category` so:
//   - Different tabs hold separate cache entries (don't collide).
//   - Changing q or category produces a fresh cache key (TanStack
//     auto-resets pages — no stale page 2 leaking into a new search).
//
// `getNextPageParam` returns `nextCursor` from the BFF envelope or
// `undefined` to signal "no more pages" (TanStack convention).

import { useInfiniteQuery } from '@tanstack/react-query'

import type { CategoryKey } from '@/lib/schemas/categories'
import {
  type AnyResourceItem,
  RESOURCE_TO_PATH,
  type ResourceKey,
  type ViewportHint,
} from '@/lib/schemas/list'

interface BffListPage {
  items: AnyResourceItem[]
  nextCursor: string | null
}

interface BffListEnvelope {
  data: BffListPage
}

export interface UseResourceListInfiniteOptions {
  resource: ResourceKey
  q?: string
  category?: CategoryKey | null
  enabled?: boolean
  /** Spec 002 §1.3 v0.6 — passed to BFF as `?viewport=`; lets server pick
   * per-tab desktopLimit (currently only item: 4 / 12). */
  viewport?: ViewportHint
}

export interface UseResourceListInfiniteResult {
  items: AnyResourceItem[]
  fetchNextPage: () => Promise<unknown>
  refetch: () => void
  hasNextPage: boolean
  isFetching: boolean
  isFetchingNextPage: boolean
  isLoading: boolean
  isError: boolean
  error: Error | null
}

export function useResourceListInfinite(
  opts: UseResourceListInfiniteOptions,
): UseResourceListInfiniteResult {
  const { resource, q, category, enabled = true, viewport } = opts
  const path = RESOURCE_TO_PATH[resource]
  // Normalise empty / null inputs so the queryKey is stable
  // ('' and undefined produce the same cache slot).
  const normalisedQ = q && q.length > 0 ? q : undefined
  const normalisedCategory = category ?? undefined

  const query = useInfiniteQuery<BffListPage, Error>({
    queryKey: [
      'resource-list',
      resource,
      normalisedQ ?? '',
      normalisedCategory ?? '',
      viewport ?? '',
    ],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const url = buildUrl(path, {
        q: normalisedQ,
        category: normalisedCategory,
        cursor: pageParam as string | undefined,
        viewport,
      })
      const res = await fetch(url, { signal })
      if (!res.ok) {
        throw new Error(`Failed to fetch ${path}: HTTP ${res.status.toString()}`)
      }
      const body = (await res.json()) as BffListEnvelope
      return body.data
    },
    // `lastPage.nextCursor` of `null` → no more pages.
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const items = query.data?.pages.flatMap((p) => p.items) ?? []

  return {
    items,
    fetchNextPage: query.fetchNextPage,
    refetch: () => void query.refetch(),
    hasNextPage: query.hasNextPage,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

function buildUrl(
  base: string,
  params: {
    q?: string
    category?: string
    cursor?: string
    viewport?: ViewportHint
  },
): string {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.category) search.set('category', params.category)
  if (params.cursor) search.set('cursor', params.cursor)
  if (params.viewport) search.set('viewport', params.viewport)
  const qs = search.toString()
  return qs ? `${base}?${qs}` : base
}
