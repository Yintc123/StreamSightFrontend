'use client'
import { useMemo, useState } from 'react'
import { TopNav } from '@/components/ui/TopNav'
import { FilterButton } from '@/components/ui/FilterButton'
import { CategoryMenu } from '@/components/ui/CategoryMenu'
import { SearchBar } from '@/components/ui/SearchBar'
import { TabsRow } from '@/components/ui/TabsRow'
import { BrandFooter } from '@/components/ui/BrandFooter'
import { CharityCard } from '@/components/ui/CharityCard'
import { DonationProjectCard } from '@/components/ui/DonationProjectCard'
import { SaleItemCard } from '@/components/ui/SaleItemCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import { useUrlSync } from '@/lib/hooks/useUrlSync'
import { getCategoryLabel, type CategoryKey } from '@/lib/schemas/categories'
import type {
  Charity,
  Donation,
  Item,
  ResourceKey,
} from '@/lib/schemas/list'
import { CHARITY_FIXTURES } from '@/lib/mock/charity-fixtures'
import { DONATION_FIXTURES } from '@/lib/mock/donation-fixtures'
import { ITEM_FIXTURES } from '@/lib/mock/item-fixtures'

type PreviewShellProps = {
  initialQ: string
  initialTab: ResourceKey
  initialCategory: CategoryKey | null
}

/**
 * Preview Shell — 用 useState + 本地 fixtures，**不**打 API。
 *
 * 本元件是「臨時 demo」，用於在 BFF / TanStack Query / MSW 完成前
 * 視覺驗證所有 003 UI 元件。下一批 spec 002 §6/§7 完成後會被真正的
 * `CharityListShell` (003i) + `ResourceInfiniteList` (003j) 取代。
 *
 * URL 持久化（spec 002 §7.2）：透過 `useUrlSync` 把 tab/q/category 寫入
 * URL searchParams。返回詳情頁時 page.tsx 解析 URL 還原 initialState，
 * browser history 還原 scrollY，達成「記住上一頁的 tab + 位置」。
 */
export function PreviewShell({
  initialQ,
  initialTab,
  initialCategory,
}: PreviewShellProps) {
  const [draft, setDraft] = useState(initialQ)
  const [activeTab, setActiveTab] = useState<ResourceKey>(initialTab)
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(
    initialCategory,
  )
  const [isMenuOpen, setMenuOpen] = useState(false)
  const q = useDebouncedValue(draft.trim().toLowerCase(), 300)

  useUrlSync({
    q: q || undefined,
    tab: activeTab === 'charity' ? undefined : activeTab,
    category: selectedCategory ?? undefined,
  })

  const filteredCharities = useFilter(CHARITY_FIXTURES, q, selectedCategory)
  const filteredDonations = useFilter(DONATION_FIXTURES, q, selectedCategory)
  const filteredItems = useFilter(ITEM_FIXTURES, q, selectedCategory)

  return (
    <div className="min-h-dvh bg-surface-page flex flex-col">
      <TopNav title="所有捐款項目" />
      <div className="px-[15px] pt-[15px] flex items-center gap-3">
        <FilterButton
          label={getCategoryLabel(selectedCategory)}
          onClick={() => setMenuOpen((o) => !o)}
          isOpen={isMenuOpen}
        />
        <SearchBar
          value={draft}
          onChange={setDraft}
          onCancel={() => setDraft('')}
        />
      </div>
      <CategoryMenu
        isOpen={isMenuOpen}
        selectedCategory={selectedCategory}
        onSelect={setSelectedCategory}
        onClose={() => setMenuOpen(false)}
      />
      <div className="mt-[6px]">
        <TabsRow active={activeTab} onTabChange={setActiveTab} />
      </div>
      <div className="flex-1">
        <ListPanel resource="charity" active={activeTab === 'charity'} items={filteredCharities} q={q} />
        <ListPanel resource="donation" active={activeTab === 'donation'} items={filteredDonations} q={q} />
        <ListPanel resource="item" active={activeTab === 'item'} items={filteredItems} q={q} />
      </div>
      <BrandFooter />
    </div>
  )
}

function ListPanel<T extends Charity | Donation | Item>({
  resource,
  active,
  items,
  q,
}: {
  resource: ResourceKey
  active: boolean
  items: T[]
  q: string
}) {
  if (!active) return <div hidden aria-hidden />

  if (items.length === 0) {
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
      ? 'grid grid-cols-2 gap-2 px-[15px] pt-[15px] pb-6'
      : 'flex flex-col gap-3 px-[15px] pt-[15px] pb-6'

  return (
    <div className={listClass}>
      {items.map((it) => {
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
  )
}

const DEFAULT_EMPTY_TITLE: Record<ResourceKey, string> = {
  charity: '目前沒有公益團體',
  donation: '目前沒有捐款專案',
  item: '目前沒有義賣商品',
}

function useFilter<T extends { name: string; description: string; categories?: CategoryKey[] }>(
  list: T[],
  q: string,
  category: CategoryKey | null,
): T[] {
  return useMemo(() => {
    return list.filter((it) => {
      if (category && !(it.categories ?? []).includes(category)) return false
      if (q) {
        const blob = `${it.name}\n${it.description}`.toLowerCase()
        if (!blob.includes(q)) return false
      }
      return true
    })
  }, [list, q, category])
}
