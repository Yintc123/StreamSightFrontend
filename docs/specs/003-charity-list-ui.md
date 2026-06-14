# Spec 003：捐款項目列表 — UI（Overview / Index）

- **狀態**：Draft（v0.5 — 文案校對 + 對齊截圖補件後的子 spec 修正）
- **建立日期**：2026-06-13（v0.1）/ 2026-06-14（v0.2 / v0.3 / v0.4 / v0.5）
- **拆分結構**：1 overview + 1 design system + 11 元件（含 003e1/e2/e3）+ 2 features
- **依賴**：
  - [Spec 002 捐款項目列表 — 業務 / 資料層](./002-list-data.md)（型別 / hooks / 狀態 shape / 三 tab generic factory）
  - Figma file `0kx2Ne2rvndhfVr3uVUwad`：frames `1:2226`、`1:2247`、`1:2213`（**僅 charity tab**；donation / item tab 沿用同 layout，見 [brief §2](../brief.md#2-設計畫面盤點)）
- **下游**：無

> 本檔為**索引總覽**。完整規格分散在 10 份子 spec。實作前請依下表逐份閱讀。

---

## 1. 目的

定義 `/donation` 頁面的 UI 層：頁面組合、13 個元件 anatomy（design system + 11 UI + 2 features）、設計 token、RWD、e2e。**不**處理任何 schema / fetch / hook 邏輯（屬 [spec 002](./002-list-data.md)）。

---

## 2. 子 spec 索引

| 子 spec | 範圍 | 複用性 |
|---|---|---|
| [003a Design System](./003a-design-system.md) | Tailwind colors / typography token、Figma assets、RWD breakpoint 策略 | 全域 |
| [003b TopNav](./003b-topnav.md) | 紅底 nav：返回 + 標題 + 右側 accessory | **高** |
| [003c SearchBar](./003c-searchbar.md) | 灰底圓角輸入欄 + 放大鏡 + 「取消」按鈕 | **高** |
| [003d TabsRow](./003d-tabsrow.md) | 三個 tab + active underline；**三 tab 皆 active 可互動**（v0.2） | 中 |
| [003e Cards (index)](./003e-charity-card.md) | 卡片總覽；v0.5 補件後三 tab 卡片 layout 差異化，拆出 003e1/e2/e3 | 中 |
| [003e1 CharityCard](./003e1-charity-card.md) | 公益團體卡片：小 logo + name + description（row） | 中 |
| [003e2 DonationProjectCard](./003e2-donation-project-card.md) | 捐款專案卡片：cover image (top) + 主辦團體名 + 標題 + 描述 + categories tags | 中 |
| [003e3 SaleItemCard](./003e3-sale-item-card.md) | 義賣商品卡片：商品圖 + 公益義賣絲帶 banner + name + 主辦團體 + TWD 價格 | 中 |
| [003f LoadingSkeleton](./003f-loading-skeleton.md) | mirror Card shape 的 pulse 骨架 | 中 |
| [003g EmptyState](./003g-empty-state.md) | 144×144 插畫 + 標題 + 副標 | **高** |
| [003h InlineError](./003h-inline-error.md) | 錯誤訊息 + 重試按鈕 | **高** |
| [003i CharityListShell](./003i-charity-list-shell.md) | feature：chrome + state 流（draft / debouncedQ / **activeTab** / URL `?q=&tab=`） | 低（feature） |
| [003j ResourceInfiniteList](./003j-charity-list.md) | feature：useResourceListInfinite 消費 + sentinel + 狀態切換 + `active` lazy 控制 | 中（v0.2 抽 generic） |
| [003k FilterButton](./003k-filter-button.md) | 灰底 pill「全部 ▼」filter trigger；點擊展開 CategoryMenu | 中 |
| [003l BrandFooter](./003l-brand-footer.md) | 底部品牌標語「── 愛心沒有底線 ──」 | **高** |
| [003m CategoryMenu](./003m-category-menu.md) | FilterButton 展開的 **bottom-sheet modal**（全部 + 16 categories，共 17 個 option）；backdrop click / Esc / X 關閉 | 中 |

### 2.1 推薦實作順序

```
003a (design system)
   ├── 003b TopNav
   ├── 003c SearchBar
   ├── 003d TabsRow
   ├── 003e1 CharityCard / 003e2 DonationProjectCard / 003e3 SaleItemCard
   ├── 003f LoadingSkeleton            ← 依賴 003e1/e2/e3 shape mirror
   ├── 003g EmptyState
   ├── 003h InlineError
   ├── 003k FilterButton
   ├── 003l BrandFooter
   └── 003m CategoryMenu (bottom-sheet)
            └── 003j ResourceInfiniteList (feature)  ← 依賴 003e1/e2/e3 + f + g + h
                     └── 003i CharityListShell (feature)  ← 依賴 003b/c/d/j/k/l/m
                              └── 003 (本檔 §3 頁面組合)
```

> 修正 v0.4 順序樹圖：003m 由 003i Shell 渲染（非 003j），所以正確依賴鏈是 003m → 003i，不再掛在 003j 下。

### 2.2 複用性說明

- **高**：純 props 驅動、無業務字眼。直接在新頁面 import 使用
- **中**：已用 generic prop 接收（`ResourceKey` / `ResourceListItem`），三 tab 共用同元件
- **低（feature）**：綁業務 hook + tab 狀態流；不複用，但模式可仿造

---

## 3. 頁面組合（page composition）

`/` 重導 `/donation`；`/donation` 用 spec 002 §5 的 RSC prefetch + HydrationBoundary 包 shell：

```tsx
// src/app/page.tsx
import { redirect } from 'next/navigation'
export default function Home() { redirect('/donation') }
```

```tsx
// src/app/donation/page.tsx  （資料邊界詳見 spec 002 §5）
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { fetchListPage } from '@/lib/api/client'
import { RESOURCE_KEYS, type ResourceKey } from '@/lib/schemas/list'
import { CATEGORY_KEYS, type CategoryKey } from '@/lib/schemas/categories'
import { CharityListShell } from '@/components/features/CharityListShell'

function parseTab(raw?: string): ResourceKey {
  return RESOURCE_KEYS.includes(raw as ResourceKey) ? (raw as ResourceKey) : 'charity'
}
function parseCategory(raw?: string): CategoryKey | null {
  return CATEGORY_KEYS.includes(raw as CategoryKey) ? (raw as CategoryKey) : null
}

export default async function Page({
  searchParams,
}: { searchParams: Promise<{ q?: string; tab?: string; category?: string }> }) {
  const { q = '', tab, category } = await searchParams
  const activeTab = parseTab(tab)
  const activeCategory = parseCategory(category)
  const queryClient = new QueryClient()
  await queryClient.prefetchInfiniteQuery({
    queryKey: ['list', activeTab, { q: q.trim(), category: activeCategory }],
    queryFn: ({ pageParam }) =>
      fetchListPage({
        resource: activeTab,
        q: q.trim(),
        cursor: pageParam,
        category: activeCategory ?? undefined,
      }),
    initialPageParam: undefined,
  })
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CharityListShell initialQ={q} initialTab={activeTab} initialCategory={activeCategory} />
    </HydrationBoundary>
  )
}
```

```
<HydrationBoundary>
└─ <CharityListShell initialQ initialTab initialCategory>          (003i)
   ├─ <TopNav title="所有捐款項目" />                                (003b)
   ├─ row [
   │     <FilterButton label={getCategoryLabel(selectedCategory)} onClick isOpen />   (003k)
   │     <SearchBar value onChange onCancel />                                        (003c)
   │   ]
   ├─ <CategoryMenu isOpen selectedCategory onSelect onClose />    (003m  ← bottom-sheet modal, top-level)
   ├─ <TabsRow active={activeTab} onTabChange={setActiveTab} />    (003d)
   ├─ <ResourceInfiniteList resource="charity"  q category active />   (003j)
   ├─ <ResourceInfiniteList resource="donation" q category active />   (003j)
   ├─ <ResourceInfiniteList resource="item"     q category active />   (003j)
   └─ <BrandFooter />                                              (003l)

        每個 ResourceInfiniteList:
        ├─ !active → <div hidden>  （wrapper 隱藏，hook enabled=false）
        ├─ pending  → <LoadingSkeleton variant={resource} count={6}/>   (003f)
        ├─ empty    → <EmptyState />                                    (003g)
        ├─ success  → list of <CardForResource resource item />         (dispatch 003e1/e2/e3)
        ├─ fetch-next  → 列尾 <LoadingSkeleton variant={resource} count={2}/>
        ├─ error    → <InlineError onRetry />                           (003h)
        └─ scroll-percent sentinel ≤10% → fetchNextPage                (from spec 002 §7.3 hook)
```

### 3.1 `loading.tsx` / `error.tsx`

- `src/app/donation/loading.tsx`：渲染 `<TopNav />` + `<SearchBar value="" disabled />` + `<TabsRow active="charity" onTabChange={()=>{}} />` + `<LoadingSkeleton count={6} />`，避免 layout shift
- `src/app/donation/error.tsx`：渲染 page chrome + `<InlineError onRetry={reset} />`

---

## 4. 狀態組合（整頁角度）

詳細元件層的狀態見 [003j ResourceInfiniteList §4](./003j-charity-list.md#4-狀態組合)。整頁觀感：

| 場景 | 觀感 |
|---|---|
| 首次載入（無 q + default tab） | RSC SSR 第一屏 10 張卡片 hydrated 後立刻可見 |
| 首次載入（`?tab=donation`） | RSC 預載 donation 第一頁 |
| 輸入新 q（debounce 中） | 舊資料保持顯示，300ms 內看不到變化 |
| 輸入新 q（debounce 觸發後） | active tab 列表替換為新結果；其他 tab 30s 內 cache stay；queryKey 變動跨 tab 都套用 |
| 切換 tab | 立即顯示新 tab；首次切換打網路（pending → skeleton），切回 30s 內 cache hit |
| 點 FilterButton | 展開 CategoryMenu（**bottom-sheet modal**，由頁底滑上）；caret 旋轉 180° |
| 點 category 選項 | menu 立即關閉；FilterButton label 更新；URL `?category=` 更新；active tab 列表 refetch；其他 tab 同 category 用 cache（30s 內） |
| 點「全部」option | 同上但 URL drop `?category=`、label 變「全部」 |
| 點 menu 外區域 / Esc | menu 關閉，不改 category |
| 列表為空 | `<EmptyState />` 取代列表，chrome 保留 |
| 滑到距底 5–10% | scroll-percent sentinel 觸 fetchNextPage → 列尾 2 張 skeleton → 下一頁卡片接後面（每次 10 筆） |
| 到底 | sentinel 不再觸；不顯示「沒有更多」（Figma 無設計） |
| 網路 / backend 錯 | 整片變 InlineError；retry 觸 refetch |
| fetch-next-page 錯 | 卡片不洗掉，sentinel 處變 InlineError |

---

## 5. e2e 測試

集中 `tests/e2e/list.spec.ts`：

| # | 案例 | 期望 |
|---|---|---|
| 1 | 載入 `/` | 跳 `/donation`；第一屏看到至少 5 張 charity row card（含 logo 縮圖 + 名稱 + 描述） |
| 2 | 輸入「動物保護」 | 等 ~400ms 後 URL 變 `?q=動物保護`、卡片只剩相關 |
| 3 | 輸入「zxq」 | 顯示「查無相關資料」illustration + 副標 |
| 4 | 按「取消」 | URL 回乾淨 `/donation`、卡片回完整列表 |
| 5 | 捲動到距底 ≤10% | 第二頁 10 張卡片接在後面（fixture 至少 25 筆） |
| 6 | 重新整理 `?q=動物保護` | 仍顯示過濾後的卡片（refresh 保留搜尋） |
| 7 | 點擊「捐款專案」tab | URL 變 `?tab=donation`；顯示 donation 列表；charity 那組 hook 不再打網路（spy network） |
| 8 | 切回「公益團體」tab（30s 內） | 不打網路（cache hit）；列表狀態保留（scroll position 不變） |
| 9 | `?tab=item` refresh | 直接進入義賣商品 tab，預載完成 |
| 10 | 點 FilterButton | CategoryMenu **bottom-sheet** 由底部滑上、17 個 option 可見（全部 + 16 categories） |
| 11 | 在 menu 選「動物保護」 | URL `?category=animal_protection`；列表全部 `category === 'animal_protection'` |
| 12 | 點 backdrop（menu 外區域） | menu 關閉、category 不變 |
| 13 | `?category=animal_protection` refresh | 直接顯示已篩選列表 |
| 14 | 切到「捐款專案」tab | 看到 donation card（cover image 在上、主辦團體名疊在圖片底部紅色 overlay、tags）— 與 charity row card 視覺不同 |
| 15 | 切到「義賣商品」tab | 看到 **2 欄 grid** 排版的 item card（商品圖、左上「公益標籤」ribbon、紅色 TWD 價格） |
| 16 | 視覺：375 / 480 / 1280 viewport | 三種 card 各自不變形、收斂在 `max-w-[480px]` |

> e2e 走 `USE_MOCK=1` + [spec 002 §4 mock fixtures](./002-list-data.md#4-mock-fixture--srclibmock)（三組 fixture），不打真 backend。

---

## 6. 整體驗收

當以下都成立，spec 003 系列視為**已實作**：

### 6.1 子 spec 完成度

- [ ] **003a Design System** 驗收通過（tokens + assets + RWD）
- [ ] **003b TopNav** 驗收通過
- [ ] **003c SearchBar** 驗收通過
- [ ] **003d TabsRow** 驗收通過（三 tab 皆 active 可互動）
- [ ] **003e Cards (index)** + 三個子 spec 驗收通過：
  - [ ] **003e1 CharityCard**（row + logo + line-clamp + fallback）
  - [ ] **003e2 DonationProjectCard**（column + cover image + 主辦團體名 + categories tags）
  - [ ] **003e3 SaleItemCard**（column + 公益義賣 ribbon + TWD 價格 + 主辦團體名）
- [ ] **003j 內 `<CardForResource>` dispatch** 依 `resource` 正確分派
- [ ] **003f LoadingSkeleton** 驗收通過（**三 variant** mirror 003e1/e2/e3）
- [ ] **003g EmptyState** 驗收通過
- [ ] **003h InlineError** 驗收通過
- [ ] **003i CharityListShell** 驗收通過（state 流 + 三 list composition + URL `?q=&tab=`）
- [ ] **003j ResourceInfiniteList** 驗收通過（狀態切換 + scroll-percent sentinel + active lazy）
- [ ] **003k FilterButton** 驗收通過（pill + caret 旋轉 + 對 [003m CategoryMenu](./003m-category-menu.md) 開合）
- [ ] **003l BrandFooter** 驗收通過（「── 愛心沒有底線 ──」黏底）
- [ ] **003m CategoryMenu** 驗收通過（**bottom-sheet modal** 列出 17 個選項、紅框選中態、X 關閉 / backdrop / Esc、body scroll lock）

### 6.2 整合

- [ ] `/` → `/donation` 跳轉
- [ ] `/donation` 預設顯示 charity tab；`/donation?tab=donation` 直接顯示 donation tab
- [ ] SSR 預載 activeTab 第一頁，hydrate 後不重打網路（用 spec 002 prefetch）
- [ ] 視覺對齊 Figma `1:2226`（all）/ `1:2247`（searching）/ `1:2213`（no result）
- [ ] 切 tab 行為符合 §5 case 7-9（lazy fetch、cache hit、URL sync）
- [ ] iPhone X 寬度（375）顯示一致；桌面收斂 `max-w-[480px]`
- [ ] §5 e2e 10 case 全綠
- [ ] `pnpm exec playwright test` 綠

---

## 7. 共通約定

### 7.1 Client / Server boundary

- 純展示元件（003b–003h、003e1/e2/e3、003k/l/m）：默認 server-renderable。`<SearchBar>` 與三個卡片元件（內部 state：input ref / image errored）+ `<FilterButton>` / `<CategoryMenu>` / `<TabsRow>`（互動 handler）需 `'use client'`
- features（003i、003j）：一律 `'use client'`（hook 消費）
- Page (`src/app/donation/page.tsx`)：Server Component，做 RSC prefetch

### 7.2 元件 vs feature 命名

- `src/components/ui/*` — 純展示，無 hook 依賴（除小範圍 input ref / image error state）
- `src/components/features/*` — 帶業務組合（消費 spec 002 hooks）

### 7.3 樣式約定

- 所有元件用 Tailwind utility class
- 顏色 / 字級用 [003a token](./003a-design-system.md) 名稱（`bg-brand`、`text-ink-AAA`），**禁止寫 hex** 在元件內
- 間距用 Figma 對應值（`px-[15px]`、`gap-3` 等）— Tailwind 預設沒有的就用 arbitrary value `[15px]`

### 7.4 a11y 基線

每個元件 spec 的 §a11y 列了該元件責任。整頁基線：
- 唯一 `<h1>`：TopNav title
- `<h2>`：CharityCard / DonationProjectCard / SaleItemCard 內標題，或 EmptyState.title
- `<TabsRow>` 用 `role="tablist"` + `role="tab"` + `aria-selected`
- alt 文字：裝飾性 svg `alt=""`、有訊息的圖片用語意 alt
- 完整 ARIA tab pattern（含 `aria-controls`）/ virtualized list / pull-to-refresh 屬增強，本作業 v0.1 不做

### 7.5 動效

- skeleton 用 Tailwind `animate-pulse`
- 無其他預設動效；framer-motion 可後續引入但非必要

---

## 8. 範圍邊界

### 8.1 範圍內但設計缺失（對應 brief §3，本 spec 留 slot 等補設計）

| 議題 | slot 狀態 |
|---|---|
| ~~三 tab 個別卡片特化欄位~~ | ✅ v0.5 完成：截圖補件揭露 cover image / price / 主辦團體 / categories tags；拆分為 [003e1](./003e1-charity-card.md) / [003e2](./003e2-donation-project-card.md) / [003e3](./003e3-sale-item-card.md) |
| ~~Filter dropdown（「全部」下拉**展開內容**）~~ | ✅ v0.5 修正：截圖揭露為 **bottom-sheet modal**（3 欄 grid，17 options），[003m CategoryMenu](./003m-category-menu.md) v0.4 改寫 |

### 8.2 明確 out of scope（brief 範圍外，本作業不做）

| 議題 | 原因 |
|---|---|
| ~~Resource 詳細頁 `/<resource>/[id]`~~ | ✅ v0.5 移入範圍內：詳見 [004 系列 detail pages](./004-detail-pages.md)（IMG_4876 / 4883 / 4882 揭露 3 個詳情頁） |
| 真實金流 / 會員 / 捐款流程 | brief §3 非範圍 |
| Dark mode | Figma 無設計 |
| 多語 i18n | Figma 無設計 |
| 完整 ARIA 審查（含 tab pattern `aria-controls`） | 基本語意 OK；完整審查超 7 天工時 |
| Pull-to-refresh / virtualized list | enhancement，本作業資料量不需要 |
| Search bar collapsed icon-button 狀態 + searching 切態（tabs 隱藏） | 本 spec 簡化為「永遠展開」；[003c §1](./003c-searchbar.md#1-職責) 已說明 |
| TopNav 右側「紀錄」按鈕 | Figma 有元素但作業範圍外功能；[003b §1](./003b-topnav.md#1-職責) 保留 `accessory` prop 但不接 |

---

## 9. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-13 | 初版（單 tab、CharityCard、CharityList、IntersectionObserver rootMargin） |
| 0.2 | 2026-06-14 | 三 tab：TabsRow 全 active + Shell 管 activeTab/URL + ResourceCard generic + ResourceInfiniteList generic + scroll-percent sentinel |
| 0.3 | 2026-06-14 | Figma 對齊補件：003k FilterButton + 003l BrandFooter；Shell composition 加 filter row + footer；§8 「不在本 spec」拆「範圍內留 slot」vs「out of scope」對齊 brief §3 結構 |
| 0.4 | 2026-06-14 | 補 user 口述功能：[003m CategoryMenu](./003m-category-menu.md)（dropdown 列 6 個 categories）+ FilterButton 啟用點擊 + Shell 加 selectedCategory/isMenuOpen state + 三 list 收 category prop |
| 0.5 | 2026-06-14 | 截圖補件 (IMG_4875/4877/4879/4880/4881) 配套：(a) 003e 拆 003e1/e2/e3（三 tab 卡片 layout 顯著不同）；(b) 003m 改 bottom-sheet modal（17 options）；(c) 003f Skeleton 加 `variant` 對應三種 shape；(d) 003i Shell 拿掉 dropdown anchor，CategoryMenu 渲染上提；(e) 003j `<ResourceCard>` → `<CardForResource>` switch dispatch；(f) overview composition 樹、page.tsx prefetch、acceptance、e2e 同步 |
| 0.5 | 2026-06-14 | 截圖補件 IMG_4875-4883：(1) §2 003e 拆 003e1/e2/e3 三種卡片 layout；(2) §8.1 categories filter 改 bottom-sheet modal（003m v0.4）；(3) §8.2 詳情頁從 out-of-scope 移入範圍內 → 新增 [004 系列](./004-detail-pages.md) |
| 0.6 | 2026-06-14 | 全面對齊 ground truth（IMG_4875-4883 + Figma file）：(a) §1「9 元件」→「13 元件」；(b) §2 003m 描述「6 categories dropdown」→「17 options bottom-sheet」；(c) §2.1 順序樹：003m 由 003j 下移到 003i 下（dependency 修正）；(d) §4 點 FilterButton 描述「dropdown」→「bottom-sheet」；(e) §5 e2e case 10-13 category key `'animal'` → `'animal_protection'`、label「動物保護」→「動物保護」；(f) e2e case 15 item ribbon 「公益義賣」→「公益標籤」；(g) e2e case 14 donation 主辦團體名 banner 描述為「圖片底部紅色 overlay」 |
