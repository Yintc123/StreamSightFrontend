# Spec 003i：CharityListShell（feature）

- **狀態**：Draft（v0.12 — search 模式空輸入也 Spinner + 藏 items（user 視為 no-result 變體）；TabsRow 規則不變）
- **路徑**：`src/components/features/CharityListShell.tsx`
- **依賴**：
  - [003a Design System](./003a-design-system.md)
  - [003b TopNav](./003b-topnav.md) / [003c SearchBar](./003c-searchbar.md) / [003d TabsRow](./003d-tabsrow.md) / [003k FilterButton](./003k-filter-button.md) / [003l BrandFooter](./003l-brand-footer.md) / [003m CategoryMenu](./003m-category-menu.md)
  - [003j ResourceInfiniteList](./003j-charity-list.md)
  - [002 Data §7.1 useDebouncedValue](./002-list-data.md#71-usedebouncedvalue) / [§7.2 useUrlSync](./002-list-data.md#72-useurlsyncq--tab-同步) / [§3 ResourceKey + CategoryKey](./002-list-data.md#3-schemas)
- **Figma 對應**：整體頁面（`1:2226` / `1:2247` / `1:2213`）的 chrome + composition
- **複用性**：**低**（feature） — orchestrate 業務 state 流（draft / debounced / activeTab / URL）。模式可仿造別的列表頁，但本元件不複用

---

> **v0.6 preview 階段暫代**：spec 002 §6 BFF / hooks 接上前，本 spec 描述的 Shell **尚未實作為元件**。實際運行的暫代版 `src/app/donation/PreviewShell.tsx` 用本地 fixtures + useState 串元件，對外契約（`initialQ / initialTab / initialCategory` props + `useUrlSync` 行為）一致；BFF 完成後將以本 spec §3 為準改寫並搬到 `src/components/features/CharityListShell.tsx`。

## 1. 職責

Orchestrate chrome 元件（TopNav / FilterButton / CategoryMenu / SearchBar / TabsRow）+ 三個 `ResourceInfiniteList`（per tab） + BrandFooter，管理：

- `draft` state（即時打字）
- `debouncedQ`（300ms 後送下去）
- `activeTab` state（charity / donation / item）
- `selectedCategory` state（null = 「全部」）
- `isMenuOpen` state（CategoryMenu 開合）
- URL `?q=` + `?tab=` + `?category=` 同步

本元件**不**直接呼叫 BFF — 只負責 state + composition + 把對應的 `enabled` / `category` 傳給三個 list。

---

## 2. Props

```ts
import type { ResourceKey } from '@/lib/schemas/list'
import type { CategoryKey } from '@/lib/schemas/categories'

type CharityListShellProps = {
  /** 由 RSC（spec 002 §5）從 searchParams 傳入；hydrate 後本元件接管 */
  initialQ: string
  initialTab: ResourceKey
  initialCategory: CategoryKey | null
}
```

> 命名保留 `CharityListShell` 是因「捐款項目列表」整頁的 Shell；不限 charity tab。

---

## 3. Anatomy

```tsx
'use client'
import { useState } from 'react'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import { useUrlSync } from '@/lib/hooks/useUrlSync'
import { TopNav } from '@/components/ui/TopNav'
import { FilterButton } from '@/components/ui/FilterButton'
import { CategoryMenu } from '@/components/ui/CategoryMenu'
import { SearchBar } from '@/components/ui/SearchBar'
import { TabsRow } from '@/components/ui/TabsRow'
import { BrandFooter } from '@/components/ui/BrandFooter'
import { ResourceInfiniteList } from './ResourceInfiniteList'
import type { ResourceKey } from '@/lib/schemas/list'
import { type CategoryKey, getCategoryLabel } from '@/lib/schemas/categories'

export function CharityListShell({
  initialQ,
  initialTab,
  initialCategory,
}: CharityListShellProps) {
  const [draft, setDraft] = useState(initialQ)
  const [activeTab, setActiveTab] = useState<ResourceKey>(initialTab)
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(initialCategory)
  const [isMenuOpen, setMenuOpen] = useState(false)
  const debouncedQ = useDebouncedValue(draft.trim(), 300)

  useUrlSync({
    q: debouncedQ,
    tab: activeTab === 'charity' ? undefined : activeTab,
    category: selectedCategory ?? undefined,
  })

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
      {/* CategoryMenu (003m v0.4) 是 bottom-sheet modal — fixed inset-x-0 bottom-0；
          無需 anchor 在 FilterButton 旁，渲染在頁面層級即可 */}
      <CategoryMenu
        isOpen={isMenuOpen}
        selectedCategory={selectedCategory}
        onSelect={setSelectedCategory}
        onClose={() => setMenuOpen(false)}
      />
      <div className="mt-[6px]">
        <TabsRow active={activeTab} onTabChange={setActiveTab} />
      </div>
      {/* 三個 list 同時 mount；非 activeTab 的 hook enabled=false 不打網路 */}
      <div className="flex-1">
        <ResourceInfiniteList resource="charity"  q={debouncedQ} category={selectedCategory} active={activeTab === 'charity'}  />
        <ResourceInfiniteList resource="donation" q={debouncedQ} category={selectedCategory} active={activeTab === 'donation'} />
        <ResourceInfiniteList resource="item"     q={debouncedQ} category={selectedCategory} active={activeTab === 'item'}     />
      </div>
      <BrandFooter />
    </div>
  )
}
```

| Layout 區域 | 規格 |
|---|---|
| Page wrapper | `min-h-dvh bg-surface-page flex flex-col`（讓 footer 黏底） |
| TopNav | 自帶 chrome |
| Top row（FilterButton + SearchBar） | `px-[15px] pt-[15px] flex items-center gap-3`（對齊 Figma frame `1:2339` 的 layout `5EY9TI`） |
| CategoryMenu 位置 | **頁面層級渲染**（bottom-sheet modal，自己 `fixed inset-x-0 bottom-0`）；不需 anchor 在 row 內 |
| TabsRow 上邊距 | `mt-[6px]` |
| 三個 ResourceInfiniteList | `flex-1` wrapper 推 footer 到底；各自管內邊距；非 active 的渲染 `display:none`（保留 scroll position） |
| BrandFooter | 自帶 padding；自然出現在 list 下方（內容短時 `flex-1` 推到底） |

### 3.4 Browse vs Search 兩模式 layout（v0.7 新增）

對齊 Figma IMG_4875。Shell 多一個 `isSearching: boolean` state 控制 chrome 區排版：

#### Browse 模式（預設 / `isSearching=false`）

```
[ TopNav ]
[ TabsRow ]                       ← 上面（Figma 對齊）
[ FilterButton  ......  🔍 icon ] ← 下面
[ list ...                       ]
```

#### Search 模式（`isSearching=true`）

```
[ TopNav ]
[ SearchBar 全寬 autoFocus    取消 ]  ← 上面（FilterButton 完全消失）
[ TabsRow ]                          ← 下面
[ list ...                          ]
```

#### Transition

| 動作 | 結果 |
|---|---|
| 點放大鏡 icon (browse) | `setIsSearching(true)` → SearchBar mount + autoFocus；FilterButton 從 DOM 消失；藍色「取消」按鈕**立即出現**（[003c v0.3](./003c-searchbar.md#5-變體) 取消鈕顯示規則） |
| 點「取消」(search) | onCancel：`setDraft('')` + `setIsSearching(false)` → 回 browse 模式 |
| `initialQ.length > 0`（URL 有 `?q=`） | `useState(initialQ.length > 0)` → 直接以 search 模式啟動，input 帶值 |
| 切 tab | 兩模式都允許切 tab（tab 在 search 模式仍可見、可點） |
| 開 CategoryMenu | 僅 browse 模式可達（search 模式無 FilterButton） |

#### Search 模式的 layout 狀態（v0.11 對齊 Figma）

對應 Figma + v0.12 user 補充規則：

| 狀態 | 條件 | TabsRow | list 區 | Figma 對應 |
|---|---|---|---|---|
| **空輸入** | `isSearching && !q && !isPending` | 顯示 | [`<Spinner />`](./003n-spinner.md) 24×24 居中（**藏 items**）| v0.12 user spec（無 Figma frame；視為 no-result 變體）|
| **搜尋中** | `isSearching && isPending` | **隱藏** | Spinner（藏 items） | Figma `1:2247` |
| **無結果** | `isSearching && !isPending && q && items.length === 0` | 顯示 | folder `<EmptyState title="查無相關資料" subtitle="請調整關鍵字再重新搜尋" />` | Figma `1:2213` |
| **有結果** | `isSearching && !isPending && q && items.length > 0` | 顯示 | 渲染 cards | （Figma 未繪）|
| **browse** | `!isSearching` | 顯示 | 渲染 cards | （正常 list 頁）|

```tsx
const normalizedDraft = draft.trim().toLowerCase()
const isPending = isSearching && normalizedDraft !== q
// v0.12 拿掉 length>0 guard：清空 input 時也走 spinner 直到 q 跟上

// chrome 層
{isSearching ? (
  <>
    <SearchBar ... />
    {/* Figma 1:2247：debounce 進行中時藏 TabsRow */}
    {!isPending && <TabsRow ... />}
  </>
) : (
  <>
    <TabsRow ... />
    <FilterRow ... />
  </>
)}

// list 層（per ListPanel）— v0.12 統一規則
if (isSearching && (isPending || !q)) {
  return <div className="flex justify-center mt-16"><Spinner label="搜尋中…" /></div>
}
if (items.length === 0) {
  return <EmptyState illustration="…" title="查無相關資料" subtitle="…" />
}
return <Cards ... />
```

**為什麼空輸入也 Spinner**（v0.12）：

- user 補規則「打開搜尋列、沒任何字串時要出現 spinner 並且不能顯示底下物件，相當於沒搜尋到結果的狀態」
- 統一視覺：search 模式只要尚未產出結果（不論是空輸入 or debounce 進行中），都顯示同一個 spinner、藏 items
- 跟 Figma `1:2247`（typing 狀態的 spinner）視覺一致，只差 TabsRow 是否顯示（空輸入時 user 仍可切 tab、所以 TabsRow 顯示）
- 對 user 而言「在搜尋模式」= 「準備搜尋 / 搜尋中」，items 不該干擾

**為什麼 isPending 時藏 TabsRow**：
- Figma frame `1:2247` 結構**完全沒有** Tabs node — 設計師明確要 user 在 typing 過程中專注於 search bar + 結果，不被 tab 切換干擾
- debounce 落定後（`!isPending`）→ Tabs 重新出現（frame `1:2213` 含 Tabs），user 可切換看別 tab

**為什麼移除「請輸入關鍵字搜尋」文字**：
- Figma 沒畫；改成統一 Spinner（v0.12）

**`isPending` 推導（v0.12 簡化）**：
- `draft` = SearchBar 即時 value（每 keystroke 更新）
- `q` = `useDebouncedValue(draft.trim().toLowerCase(), 300)`（300ms 後才同步）
- `isPending = isSearching && normalizedDraft !== q`
- v0.10 原本有 `normalizedDraft.length > 0` guard 為了避免空 input 顯示 spinner；v0.12 user 要空 input **也**顯示 spinner，guard 移除。清空 input → debounce 進行中也走 spinner → 落定後 `!q` 仍走 spinner，視覺無斷層

#### 為什麼 SearchBar 不持有 isSearching state

SearchBar 本身永遠是「展開的輸入欄」表現。「collapsed icon-button」是 Shell 為了節省畫面空間自繪的小 `<button>`（[003c §1](./003c-searchbar.md#1-職責)）。讓 Shell 管 isSearching 符合 lifted state pattern — Shell 同時也是 q / tab / category 的容器，避免 SearchBar 跟 Shell 雙方都管「我有沒有展開」這份狀態。

#### `<SearchIconButton>` 規格

```tsx
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
      <img src="/figma/icon-magnifier.svg" alt="" width={20} height={20}
           className="w-5 h-5 opacity-50" />
    </button>
  )
}
```

放大鏡 SVG 跟 SearchBar 內共用（`/figma/icon-magnifier.svg`），`opacity-50` 對齊。`ml-auto` 把 icon 推到 row 最右。

---

### 3.5 RWD container（v0.9 新增）

整個內容區（chrome rows + list panels）包在響應式 `<main>` 容器內，按 [003a §5 v0.4](./003a-design-system.md#5-rwdv04-3-tier) 三 tier 縮放：

```tsx
<div className="min-h-dvh bg-surface-page flex flex-col">
  <TopNav ... />  {/* full-width 紅底 */}
  <main className="mx-auto w-full max-w-[480px] md:max-w-3xl lg:max-w-5xl
                   flex-1 flex flex-col">
    {chrome rows + ListPanels}
  </main>
  <CategoryMenu ... />  {/* fixed positioning，自己處理 RWD（003m §3）*/}
  <BrandFooter />
</div>
```

| 容器 | mobile | tablet | desktop |
|---|---|---|---|
| `<main>` max-w | 480 | 768 (3xl) | 1024 (5xl) |
| 內層 padding | `px-[15px]` | `md:px-6` | `lg:px-8` |
| `ListPanel` grid 切換 | 見 [003a §5.2](./003a-design-system.md#52-list-gridper-resource) per resource | 同左 | 同左 |

CategoryMenu 不放在 `<main>` 內，渲染在頁面層級 — 因為 `fixed` positioning 不需要繼承容器 max-w；sheet 自己處理 `md+` 限寬置中（[003m §3](./003m-category-menu.md#3-anatomy)）。

---

### 3.1 「三個 list 同時 mount」的取捨

兩種選擇：

| 方式 | 利 | 弊 |
|---|---|---|
| **三 list 同 mount + `active` prop 控顯隱**（本 spec v0.2 採用） | 切 tab scroll position 保留；切回 cache 仍在 | DOM 略大（三個 list 的 wrapper） |
| **conditional render**（只 mount active） | DOM 簡潔 | 切回 tab 滾回頂端；對 user 體感差 |

scroll position 保留比 DOM 大小重要（mobile 體感）。3 個 list 的非 active wrapper 用 `display: none` 隱藏（不 unmount），DOM 成本可控。

---

## 4. State 流

```
RSC (spec 002 §5)
  └─ initialQ, initialTab, initialCategory = searchParams.{q, tab, category}
        ↓
<CharityListShell initialQ initialTab initialCategory>
  ├─ useState draft = initialQ                  ← 即時打字
  ├─ useState activeTab = initialTab            ← 哪個 tab 顯示
  ├─ useState selectedCategory = initialCategory ← 篩選分類
  ├─ useState isMenuOpen = false                ← CategoryMenu 開合
  ├─ useState isSearching = initialQ.length > 0 ← search 模式（v0.7）
  ├─ debouncedQ = useDebouncedValue(draft.trim(), 300)
  ├─ useUrlSync({ q, tab, category })
  └─ <FilterButton label={getCategoryLabel(category)} onClick={toggleMenu} isOpen />
  └─ {isMenuOpen && <CategoryMenu selectedCategory onSelect={setCategory} onClose />}
  └─ <SearchBar value={draft} onChange={setDraft} onCancel={() => setDraft('')} />
  └─ <TabsRow active={activeTab} onTabChange={setActiveTab} />
  └─ 3 × <ResourceInfiniteList resource q={debouncedQ} category={selectedCategory} active={resource === activeTab} />
        其中 active=false 的 list：
          - wrapper 套 `hidden` (display:none)
          - hook enabled=false 不打網路（由 list 元件處理）
```

### 4.1 draft / debouncedQ / activeTab / selectedCategory / URL

- **draft**：鍵盤敲擊更新，反映 SearchBar 顯示
- **debouncedQ**：300ms 沒新打字才更新；傳給三個 list
- **activeTab**：點 tab 即時更新（無 debounce）
- **selectedCategory**：點 CategoryMenu option 即時更新（無 debounce）；null = 「全部」
- **isMenuOpen**：FilterButton 點擊 toggle、CategoryMenu 點選 / 點外 / Esc 設 false
- **URL**：跟著 debouncedQ + activeTab + selectedCategory 變動；default 值（charity / null）不寫入 URL

### 4.2 「取消」按鈕

```
SearchBar onCancel
  ↓
setDraft('')
  ↓
useDebouncedValue 300ms → debouncedQ === ''
  ↓
useUrlSync drop ?q=
  ↓
三個 list queryKey 變 ['list', resource, { q: '' }]
  ↓
active 那個 list 自動 refetch；其他兩個 hook 仍 enabled=false 不動
```

### 4.3 切 tab 流

```
TabsRow onTabChange('donation')
  ↓
setActiveTab('donation')
  ↓
useUrlSync 把 ?tab=donation 寫入 URL
  ↓
<ResourceInfiniteList resource="donation" active={true}>  ← hook enabled 切 true
       enabled=true 第一次 → fetchListPage(/api/donations) → render
<ResourceInfiniteList resource="charity"  active={false}> ← wrapper hidden，hook idle
```

> 切回 charity 30s 內：TanStack cache hit → 不打網路、立即顯示。

### 4.4 切 category 流

```
FilterButton onClick → setMenuOpen(true) → <CategoryMenu> 渲染
  ↓
user 點「動物保護」option
  ↓
CategoryMenu onSelect('animal_protection') → setSelectedCategory('animal_protection') → onClose() → setMenuOpen(false)
  ↓
useUrlSync 把 ?category=animal_protection 寫入 URL
  ↓
FilterButton label 更新為「動物保護 ▼」
  ↓
三 list queryKey 含 category 都變動；但只 active 那個 enabled=true → 重新 fetch
  其他兩 tab 換 category 的 cache（30s 內切過去命中）
```

點「全部」→ `setSelectedCategory(null)` → URL drop `?category=` → 同 flow。

---

## 5. 變體

無：本元件純 orchestration。所有差異來自子元件或資料層狀態。

---

## 6. 測試（colocated `CharityListShell.test.tsx`）

> Test 屬 integration 性質 — 渲染整個 shell，mock `useResourceListInfinite`、`useUrlSync`、`useRouter`。

- 初始：`initialQ="foo" initialTab="donation" initialCategory="animal_protection"` → SearchBar 顯示 "foo"、TabsRow active="donation"、FilterButton label="動物保護"
- 打字「bar」→ draft 變 "foobar"；300ms 後 list q 收到 "foobar"
- 連續打 10 字 → debouncedQ 只更新 1 次（spy call count）
- 按取消 → 300ms 後 list q 收到 ""；URL params 不含 `q`
- 點 TabsRow charity → activeTab state 變 'charity'；URL `?tab=` 被 drop（default tab）
- 點 TabsRow item → activeTab state 變 'item'；URL `?tab=item`
- 切 tab 時 debouncedQ 與 selectedCategory 不被洗
- 點 FilterButton → setMenuOpen(true) → CategoryMenu 渲染
- 在 menu 點「環境保護」→ selectedCategory='environment'、isMenuOpen=false、URL `?category=environment`
- 在 menu 點「全部」→ selectedCategory=null、URL drop `?category=`
- 三個 ResourceInfiniteList 都被 mount；只有 active 那個 `active=true`；三個都收 `category={selectedCategory}`

---

## 7. a11y

- `<TopNav>` 提供 `<h1>` 層級
- `<TabsRow>` 提供 tab + tablist semantic
- SearchBar input 有 placeholder + `type="search"`
- 可改 `<main className="min-h-dvh ...">` 強化 landmark（目前 `<div>`，[開放問題 §8](#8-開放問題)）

---

## 8. 開放問題

- **`<main>` 還是 `<div>`**：landmark 完整度 vs 簡潔；建議 `<main>` 但本 spec 用 `<div>` 是現狀
- **Cancel 是否清空 draft**：[003c SearchBar §9](./003c-searchbar.md#9-開放問題) — 目前 Shell 端做 `setDraft('')`
- **initialQ 為 80 字超長**：Shell 接，BFF route 在 q.trim() 後 reject 超 80 字。視覺要不要主動 truncate？目前不做
- **切 tab 時是否清空 draft**：目前不清，跨 tab 共用 q。spec 002 §11 列為開放問題
- **三 list 同 mount 的 DOM 成本**：未 active 的 list wrapper `display:none` 但仍 mount。若評審反映「打開頁面卡頓」可改成 conditional render（犧牲 scroll restore）

---

## 9. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-13 | 初版（單 tab，hardcode `active="charity"`，無 tab state） |
| 0.2 | 2026-06-14 | 三 tab + `activeTab` state + `useUrlSync` + 三 list 同 mount active prop |
| 0.3 | 2026-06-14 | 加 `selectedCategory` + `isMenuOpen` state + 串 [003k FilterButton](./003k-filter-button.md) / [003m CategoryMenu](./003m-category-menu.md)；三 list 收 `category` prop；`initialCategory` 由 RSC 預載 |
| 0.4 | 2026-06-14 | 配合 003m v0.4 改 bottom-sheet：拿掉 FilterButton wrapper 的 `relative`、CategoryMenu 渲染上提到頁面層級（不再嵌在 row 內） |
| 0.5 | 2026-06-14 | 文案校正：所有 category key 範例從 `'animal'` 改為 [002 v0.4](./002-list-data.md) 的 `'animal_protection'`，label 範例「流浪動物」改「動物保護」對齊 002 §3.1 `CATEGORY_LABELS` |
| 0.6 | 2026-06-14 | 新增 §10「上一頁狀態還原」設計：URL 持久化 tab/q/category + browser 自動 scroll restore；preview 階段以 `src/app/donation/PreviewShell.tsx` 暫代本元件，spec 002 §6 hooks 完成後改寫為本 spec 規格 |
| 0.7 | 2026-06-14 | 加 browse vs search 兩模式 layout 對齊 Figma IMG_4875：(1) browse 模式 TabsRow 提到 FilterButton + 搜尋 icon 之上；(2) 點放大鏡 icon 進 search 模式 — FilterButton 完全消失、SearchBar 全寬 autoFocus 在 TabsRow 之上；(3) 取消按鈕回 browse + 清空 q；(4) `useState(initialQ.length > 0)` 讓 URL `?q=` 直接以 search 模式啟動；(5) 新 `<SearchIconButton>` 元件規格放 §3.4；(6) [003c v0.2](./003c-searchbar.md) SearchBar 加 `autoFocus` prop |
| 0.8 | 2026-06-14 | (1) §3.4 Transition 表標注「進 search 模式後藍色取消按鈕**立即**出現」，對齊 [003c v0.3](./003c-searchbar.md#5-變體) 取消鈕顯示規則修正；(2) 新 §3.4「Search 模式 + 空 q 的 list 行為」— search 模式且 `q===''` 時 list 不渲染卡片、顯示 `<EmptyState title="請輸入關鍵字搜尋" />`，對齊 iOS Mail / Apple HIG search behavior；(3) `<ListPanel>` 多接 `isSearching` prop 控分支 |
| 0.9 | 2026-06-14 | 新 §3.5 RWD container：chrome + list 包在響應式 `<main>` 內（mobile/tablet/desktop max-w = 480/768/1024）；CategoryMenu 留在頁面層級不受 main 容器限制（fixed positioning 自處理 [003m §3](./003m-category-menu.md#3-anatomy) 限寬置中）。對齊 [003a §5 v0.4 3-tier](./003a-design-system.md#5-rwdv04-3-tier) |
| 0.10 | 2026-06-14 | §3.4 「Search 模式 + 空 q 的 list 行為」改寫為 3 狀態：(1) debounce 進行中 → `<Spinner label="搜尋中…" />`（[003n 新規格](./003n-spinner.md)）；(2) 尚未輸入 → 純文字「請輸入關鍵字搜尋」（**移除 folder 圖示**，因為實際沒在 load 用 folder 語意誤導）；(3) 確認無結果 → 維持 folder「查無相關資料」。`<ListPanel>` 多接 `isPending` prop；`isPending = draft.trim().toLowerCase() !== q && draft.trim().length > 0` 在 Shell 計算 |
| 0.11 | 2026-06-14 | 對齊 Figma 兩 frame：(1) `1:2247` 搜尋中 → search 模式 `isPending` 時**藏 TabsRow**（v0.7 把 tab 放下面是錯的，Figma 是 hidden）；(2) `1:2213` no result → debounce 落定 + q 有值 + 0 筆時 TabsRow 顯示 + folder EmptyState；(3) **移除**「請輸入關鍵字搜尋」純文字（Figma 不畫；q='' 不過濾、items 自然全顯）。對應 [003n v0.2](./003n-spinner.md) Spinner 改 iOS 8-spoke 樣式 |
| 0.12 | 2026-06-14 | user 補規則：「打開搜尋列但沒任何字串時要出現 spinner 並且不能顯示底下物件」。改 ListPanel：`isSearching && (isPending \|\| !q)` → Spinner（v0.11 的 `q='' → 全顯 items` 被覆蓋）。`isPending` 拿掉 `length > 0` guard 讓清空 input 也走 spinner。TabsRow 規則不變（只 isPending 隱藏） |

---

## 10. 上一頁狀態還原（v0.6 新增）

從列表頁點卡片進詳情，使用者按返回時應回到「同一個 tab、同一個位置、同一個搜尋字、同一個篩選分類」。最佳實踐拆兩層：

### 10.1 Tab / q / category — URL 持久化

URL 是 server-side hydration 的單一資料來源（spec 002 §5 RSC pattern）：

```
/donation                            charity tab、無 q、無 category
/donation?tab=item                   義賣商品 tab
/donation?q=魚油                     charity tab 搜尋「魚油」
/donation?tab=donation&category=animal_protection&q=毛孩
```

寫入：`useUrlSync` 用 `router.replace({ scroll: false })`（[002 §7.2](./002-list-data.md#72-useurlsyncq--tab-同步)）。
- `replace` 而非 `push` — tab 切換不污染 history stack
- `scroll: false` — 切 tab / 改搜尋字不 scroll-to-top（user 仍在當前位置）

讀取：page.tsx（Server Component）解析 `searchParams` 得 `initialQ / initialTab / initialCategory` 傳給 Shell，Shell 用 `useState(initial...)` 接管。

### 10.2 ScrollY — 交給 browser

App Router 對 **forward** navigation（卡片 `<Link>`）會把當前 URL + `window.scrollY` 寫入 history entry。**back** navigation 觸發時 Next.js 自動 `window.scrollTo(0, savedY)`。

兩個前提：
1. Shell 必須 **同步**渲染相同 DOM 高度，scroll restore 才會落在原位（preview 階段 fixtures 是 sync OK；真實 API 階段需 RSC SSR 第一頁、Hydrate 後不能再洗）
2. Shell **不能 unmount**（spec §3.1 三 list 同 mount + `display:none` 已滿足）

### 10.3 為什麼不用 sessionStorage / Activity

| 選項 | 評估 |
|---|---|
| **sessionStorage** | 多此一舉：URL 已是 source of truth、可深連結、可分享、refresh 不丟。sessionStorage 沒有 URL 持久化的好處 |
| **Next 16 `cacheComponents: true`** | 用 React `<Activity>` 把整頁 state + scroll + DOM 全部 cache。**更強**但要遷移 `dynamic` / `revalidate` → `use cache`，是更大的架構動作。本作業 v0.6 不開；BFF 上線後評估 |
| **手動 scroll restore（useEffect + sessionStorage）** | 重複造輪：browser + Next 已內建。除非 URL hash 跳到特定卡片需求才需要 |

### 10.4 已知限制

- 直接開啟 `/sale-items/:id` 後按返回：瀏覽器無前一頁歷史 → `router.back()` 無作用（停留原頁）。設計上可加 fallback `router.push('/donation?tab=item')`，但會違反「回上頁」直覺，本 spec 不做（[003b §9 也記載](./003b-topnav.md#9-開放問題)）
- 直接訪問 `/donation?tab=item` 後切到 `donation` tab：URL 變 `/donation?tab=donation`，按返回會回到 `/donation?tab=item`（history stack 自然行為，可接受）
- scroll restore 需 list height **同步可計算**：若未來改非同步資料（TanStack Query `pending`），首次 paint 高度可能不足 → 落空。屆時可用 RSC SSR 保證高度，或記下 prevPagesItemCount 補渲染。本 spec 不預先處理
