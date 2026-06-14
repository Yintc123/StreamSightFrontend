import type { Metadata } from 'next'
import { CharityListShell } from './CharityListShell'
import { RESOURCE_KEYS, type ResourceKey } from '@/lib/schemas/list'
import { CATEGORY_KEYS, type CategoryKey } from '@/lib/schemas/categories'

export const metadata: Metadata = {
  title: '所有捐款項目 | JKODonation',
  description: '捐款項目列表：公益團體 / 捐款專案 / 義賣商品',
}

type SearchParams = Promise<{
  q?: string
  tab?: string
  category?: string
}>

function parseTab(raw?: string): ResourceKey {
  return RESOURCE_KEYS.includes(raw as ResourceKey)
    ? (raw as ResourceKey)
    : 'charity'
}

function parseCategory(raw?: string): CategoryKey | null {
  return CATEGORY_KEYS.includes(raw as CategoryKey)
    ? (raw as CategoryKey)
    : null
}

/**
 * Spec 002 §5 RSC pattern — parses searchParams into initial state and
 * hands it to the client shell. URL persistence (tab/q/category) is the
 * "remember last page state" mechanism:
 *  - card click → router push to detail page; this URL + scrollY join the
 *    history entry
 *  - detail back navigation → URL restored → this page re-parses searchParams
 *  - CharityListShell resumes the right tab; browser restores scrollY.
 *
 * Server-side prefetch is intentionally NOT done here: the BFF list routes
 * are `no-store` (spec 002) and `Cache-Control: no-store, private`, so
 * pre-fetching on the server would cost one round-trip without any
 * cacheable benefit. TanStack on the client fires the initial request
 * once the shell mounts.
 */
export default async function DonationListPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const sp = await searchParams
  return (
    <CharityListShell
      initialQ={sp.q ?? ''}
      initialTab={parseTab(sp.tab)}
      initialCategory={parseCategory(sp.category)}
    />
  )
}
