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
import { Spinner } from '@/components/ui/Spinner'
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
  // URL ?q= 有值代表上一次正在搜尋；保留搜尋模式（iOS Mail / Apple HIG 慣例）
  const [isSearching, setIsSearching] = useState(initialQ.length > 0)
  const q = useDebouncedValue(draft.trim().toLowerCase(), 300)
  // isPending：draft 跟 q 不一致（debounce 進行中）
  // 拿掉 length guard：清空 input 時也走 spinner 直到 q 跟上
  const normalizedDraft = draft.trim().toLowerCase()
  const isPending = isSearching && normalizedDraft !== q

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
      {/* spec 003a §5 RWD container：
            < md  (手機) max-w-[480px]
            md   (平板) max-w-3xl  (=768)
            lg+  (桌機) max-w-5xl  (=1024) */}
      <main className="mx-auto w-full max-w-[480px] md:max-w-3xl lg:max-w-5xl flex-1 flex flex-col">
        {/* spec 003i §3 兩模式 layout（對齊 Figma IMG_4875）：
              browse — TabsRow ↑ / [FilterButton .. SearchIconButton] ↓
              search — [SearchBar 全寬] ↑ / TabsRow ↓ / FilterButton 隱藏 */}
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
            {/* Figma 1:2247 「搜尋中」狀態：debounce 進行中時藏 TabsRow。
                debounce 落定 → TabsRow 重新出現（1:2213「no result」狀態）。*/}
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
        <div className="flex-1">
          <ListPanel
            resource="charity"
            active={activeTab === 'charity'}
            items={filteredCharities}
            q={q}
            isSearching={isSearching}
            isPending={isPending}
          />
          <ListPanel
            resource="donation"
            active={activeTab === 'donation'}
            items={filteredDonations}
            q={q}
            isSearching={isSearching}
            isPending={isPending}
          />
          <ListPanel
            resource="item"
            active={activeTab === 'item'}
            items={filteredItems}
            q={q}
            isSearching={isSearching}
            isPending={isPending}
          />
        </div>
      </main>
      {/* CategoryMenu 渲染在 main 之外、頁面層級（fixed positioning）；
          sheet 內部處理 md+ 限寬置中（spec 003m §3）*/}
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

/**
 * Collapsed 模式的搜尋觸發 — 純 icon button，無輸入欄。
 * 點擊後 PreviewShell 切到 search 模式，渲染 SearchBar autoFocus 開鍵盤。
 */
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

function ListPanel<T extends Charity | Donation | Item>({
  resource,
  active,
  items,
  q,
  isSearching,
  isPending,
}: {
  resource: ResourceKey
  active: boolean
  items: T[]
  q: string
  isSearching: boolean
  isPending: boolean
}) {
  if (!active) return <div hidden aria-hidden />

  // search 模式 list 規則（spec 003i §3.4）：
  //   isPending OR !q → Spinner（不渲染卡片）
  //                       isPending  : 對齊 Figma 1:2247 typing 狀態
  //                       !q (空輸入): 「相當於沒搜尋到結果」— 用 spinner 表示「等候輸入」
  //   q && 0 筆       → folder no-data（Figma 1:2213）
  //   q && >0 筆      → 渲染 cards
  if (isSearching && (isPending || !q)) {
    return (
      <div className="flex justify-center mt-16">
        <Spinner label="搜尋中…" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        illustration="/figma/empty-no-data.png"
        title={q ? '查無相關資料' : DEFAULT_EMPTY_TITLE[resource]}
        subtitle={q ? '請調整關鍵字再重新搜尋' : undefined}
      />
    )
  }

  // spec 003a §5 / 003j §4.1 RWD 欄數：
  //   item:            mobile 2 / tablet 3 / desktop 4
  //   charity/donation: mobile 1 / tablet 2 / desktop 3
  const listClass =
    resource === 'item'
      ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4 px-[15px] md:px-6 lg:px-8 pt-[15px] pb-6'
      : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 px-[15px] md:px-6 lg:px-8 pt-[15px] pb-6'

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
