// Spec 003i / spec 002 §6-§7 — production list shell.
//
// Replaces PreviewShell. The chrome (TopNav / TabsRow / SearchBar /
// FilterButton / CategoryMenu / BrandFooter) is identical; the difference
// is that lists are now driven by `useResourceListInfinite` per tab —
// inactive tabs cost zero network (spec 002 §1.3 lazy fetch).
//
// Search is server-side: the debounced `q` flows into the hook's queryKey,
// TanStack drops stale pages, and the BFF forwards to backend ILIKE. No
// local filter. The debounce keeps the request count down while the user
// types.
//
// Infinite scroll: `useScrollPercentSentinel` fires `fetchNextPage()` for
// the active tab when within 10% of the bottom (spec 002 §7.3). The
// callback is gated on `hasNextPage` + `!isFetchingNextPage` so it can't
// pile up requests.

'use client'

import { useCallback, useState } from 'react'

import { BrandFooter } from '@/components/ui/BrandFooter'
import { CategoryMenu } from '@/components/ui/CategoryMenu'
import { CharityCard } from '@/components/ui/CharityCard'
import { DonationProjectCard } from '@/components/ui/DonationProjectCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterButton } from '@/components/ui/FilterButton'
import { InlineError } from '@/components/ui/InlineError'
import { SaleItemCard } from '@/components/ui/SaleItemCard'
import { SearchBar } from '@/components/ui/SearchBar'
import { Spinner } from '@/components/ui/Spinner'
import { TabsRow } from '@/components/ui/TabsRow'
import { TopNav } from '@/components/ui/TopNav'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import { useScrollPercentSentinel } from '@/lib/hooks/useScrollPercentSentinel'
import { useUrlSync } from '@/lib/hooks/useUrlSync'
import { useResourceListInfinite } from '@/lib/query/useResourceListInfinite'
import { getCategoryLabel, type CategoryKey } from '@/lib/schemas/categories'
import type {
  Charity,
  Donation,
  Item,
  ResourceKey,
} from '@/lib/schemas/list'

type CharityListShellProps = {
  initialQ: string
  initialTab: ResourceKey
  initialCategory: CategoryKey | null
}

export function CharityListShell({
  initialQ,
  initialTab,
  initialCategory,
}: CharityListShellProps) {
  const [draft, setDraft] = useState(initialQ)
  const [activeTab, setActiveTab] = useState<ResourceKey>(initialTab)
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(
    initialCategory,
  )
  const [isMenuOpen, setMenuOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(initialQ.length > 0)

  // Trim + lower for server-side ILIKE; debounce 300ms to keep request
  // count down while typing. Backend NFC-normalises before its own trim
  // (spec 016 §4.2 v0.13).
  const q = useDebouncedValue(draft.trim().toLowerCase(), 300)
  const normalisedDraft = draft.trim().toLowerCase()
  const isPending = isSearching && normalisedDraft !== q

  useUrlSync({
    q: q || undefined,
    tab: activeTab === 'charity' ? undefined : activeTab,
    category: selectedCategory ?? undefined,
  })

  // One hook per tab. Only the active tab's `enabled` is true so the
  // other two pay nothing until the user switches. TanStack still keeps
  // their cached data (gcTime 5min) so a tab toggle within window is
  // instant.
  const charityList = useResourceListInfinite({
    resource: 'charity',
    q,
    category: selectedCategory,
    enabled: activeTab === 'charity',
  })
  const donationList = useResourceListInfinite({
    resource: 'donation',
    q,
    category: selectedCategory,
    enabled: activeTab === 'donation',
  })
  const itemList = useResourceListInfinite({
    resource: 'item',
    q,
    category: selectedCategory,
    enabled: activeTab === 'item',
  })

  const activeList =
    activeTab === 'charity'
      ? charityList
      : activeTab === 'donation'
        ? donationList
        : itemList

  // Spec 002 §7.3 — scroll-percent sentinel. Stable callback so the
  // effect dep array doesn't churn each render.
  const onTrigger = useCallback(() => {
    if (activeList.hasNextPage && !activeList.isFetchingNextPage) {
      void activeList.fetchNextPage()
    }
  }, [activeList])
  useScrollPercentSentinel({
    enabled: activeList.hasNextPage && !activeList.isLoading && !isPending,
    onTrigger,
  })

  return (
    <div className="min-h-dvh bg-surface-page flex flex-col">
      <TopNav title="所有捐款項目" />
      <main className="mx-auto w-full max-w-[480px] md:max-w-3xl lg:max-w-5xl flex-1 flex flex-col">
        {isSearching ? (
          <>
            <div className="px-[15px] md:px-6 lg:px-8 pt-[15px]">
              <SearchBar
                autoFocus
                value={draft}
                onChange={setDraft}
                onCancel={() => {
                  setDraft('')
                  setIsSearching(false)
                }}
              />
            </div>
            {!isPending && (
              <div className="mt-[6px]">
                <TabsRow active={activeTab} onTabChange={setActiveTab} />
              </div>
            )}
          </>
        ) : (
          <>
            <TabsRow active={activeTab} onTabChange={setActiveTab} />
            <div className="px-[15px] md:px-6 lg:px-8 pt-[15px] flex items-center gap-3">
              <FilterButton
                label={getCategoryLabel(selectedCategory)}
                onClick={() => setMenuOpen((o) => !o)}
                isOpen={isMenuOpen}
              />
              <SearchIconButton onClick={() => setIsSearching(true)} />
            </div>
          </>
        )}
        <div className="flex-1 flex flex-col">
          <ListPanel
            resource="charity"
            active={activeTab === 'charity'}
            list={charityList}
            q={q}
            isSearching={isSearching}
            isPending={isPending}
          />
          <ListPanel
            resource="donation"
            active={activeTab === 'donation'}
            list={donationList}
            q={q}
            isSearching={isSearching}
            isPending={isPending}
          />
          <ListPanel
            resource="item"
            active={activeTab === 'item'}
            list={itemList}
            q={q}
            isSearching={isSearching}
            isPending={isPending}
          />
        </div>
      </main>
      <CategoryMenu
        isOpen={isMenuOpen}
        selectedCategory={selectedCategory}
        onSelect={setSelectedCategory}
        onClose={() => setMenuOpen(false)}
      />
      <BrandFooter />
    </div>
  )
}

function SearchIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="開啟搜尋"
      className="ml-auto w-9 h-9 flex items-center justify-center
                 focus-visible:outline focus-visible:outline-2
                 focus-visible:outline-brand rounded"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/figma/icon-magnifier.svg"
        alt=""
        width={20}
        height={20}
        className="w-5 h-5 opacity-50"
      />
    </button>
  )
}

type ListLike = {
  items: (Charity | Donation | Item)[]
  isLoading: boolean
  isError: boolean
  isFetchingNextPage: boolean
  refetch: () => void
}

function ListPanel({
  resource,
  active,
  list,
  q,
  isSearching,
  isPending,
}: {
  resource: ResourceKey
  active: boolean
  list: ListLike
  q: string
  isSearching: boolean
  isPending: boolean
}) {
  if (!active) return <div hidden aria-hidden />

  // Spec 003i §3.4 search-mode 3-state: typing → spinner; empty input
  // in search → spinner; resolved → cards or empty.
  if (isSearching && (isPending || !q)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner label="搜尋中…" />
      </div>
    )
  }

  // Initial server fetch loading (no data yet).
  if (list.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner label="載入中…" />
      </div>
    )
  }

  if (list.isError) {
    return (
      <div className="px-[15px] md:px-6 lg:px-8 pt-[15px]">
        <InlineError
          message="載入失敗,請稍候再試"
          onRetry={list.refetch}
        />
      </div>
    )
  }

  if (list.items.length === 0) {
    return (
      <EmptyState
        illustration="/figma/empty-no-data.png"
        title={q ? '查無相關資料' : DEFAULT_EMPTY_TITLE[resource]}
        subtitle={q ? '請調整關鍵字再重新搜尋' : undefined}
      />
    )
  }

  const listClass =
    resource === 'item'
      ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4 px-[15px] md:px-6 lg:px-8 pt-[15px] pb-6'
      : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 px-[15px] md:px-6 lg:px-8 pt-[15px] pb-6'

  return (
    <>
      <div className={listClass}>
        {list.items.map((it) => {
          switch (resource) {
            case 'charity':
              return <CharityCard key={it.id} item={it as Charity} />
            case 'donation':
              return <DonationProjectCard key={it.id} item={it as Donation} />
            case 'item':
              return <SaleItemCard key={it.id} item={it as Item} />
          }
        })}
      </div>
      {/* Loading the next page below the grid — distinct from the
          initial-load spinner so the user keeps seeing already-rendered
          cards while page N+1 fetches. */}
      {list.isFetchingNextPage && (
        <div className="py-4 flex items-center justify-center">
          <Spinner label="載入更多…" />
        </div>
      )}
    </>
  )
}

const DEFAULT_EMPTY_TITLE: Record<ResourceKey, string> = {
  charity: '目前沒有公益團體',
  donation: '目前沒有捐款專案',
  item: '目前沒有義賣商品',
}
