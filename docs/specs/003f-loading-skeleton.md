# Spec 003f：LoadingSkeleton

- **狀態**：Draft（v0.3 — 修正 item variant 的 list 容器為 2 欄 grid，對齊 003j success layout）
- **路徑**：`src/components/ui/LoadingSkeleton.tsx`
- **依賴**：[003a Design System](./003a-design-system.md)、[003e Cards (index)](./003e-charity-card.md)、[003j ResourceInfiniteList §4.1](./003j-charity-list.md#41-per-resource-list-layout)
- **Figma 對應**：（無對應 frame；Figma 雖有 `shimmer` component `1:1017` 但無 skeleton layout — 本 spec 自定）
- **複用性**：**中** — 接 `variant: ResourceKey` 對應三種卡片 shape；要更通用可抽 `<SkeletonBox className />` 原子 + 各 variant 組合

---

## 1. 職責

提供「卡片骨架」站位，視覺 mirror 對應 resource 的卡片元件。出現時機由消費者控（first paint 多顆、fetch-next-page 少顆）。

v0.4 補件後三 tab 卡片 shape 顯著不同（row vs column vs column+ribbon），skeleton 必須 mirror 對應 shape 才能避免 hydration 時的 layout shift。

---

## 2. Props

```ts
import type { ResourceKey } from '@/lib/schemas/list'

type LoadingSkeletonProps = {
  /** 對應卡片 shape；charity 是 row 排版、donation / item 是 column 排版 */
  variant: ResourceKey
  /** 渲染骨架卡片數量，預設 6 */
  count?: number
}
```

> v0.1 沒有 `variant`；v0.2 改為必填（無 default）— 避免「忘給 variant 直接用 charity row 結果 donation tab 抖一下」。

---

## 3. Anatomy

三種 variant 對應 [003e1](./003e1-charity-card.md) / [003e2](./003e2-donation-project-card.md) / [003e3](./003e3-sale-item-card.md) 的 layout。

### 3.1 容器（list 層，per variant 切換）

> v0.3 修正：item variant 必須與 [003j success state](./003j-charity-list.md#41-per-resource-list-layout) 的 `grid grid-cols-2` layout 對齊，避免 first-paint 與 success 的 layout shift。

| variant | Container className |
|---|---|
| `'charity'` / `'donation'` | `flex flex-col gap-3 px-[15px] pt-[15px]` |
| `'item'` | `grid grid-cols-2 gap-2 px-[15px] pt-[15px]` |

| 元素 | 規格 |
|---|---|
| `bg` placeholder（共用原子） | `bg-line animate-pulse motion-reduce:animate-none rounded` |

> `bg-line` 對齊 [003a v0.3](./003a-design-system.md#9-變更紀錄) 新增 token（`rgba(0,0,0,0.10)`）。v0.2 用 `bg-line` 違反「禁 hex」原則，v0.3 改為 token。

### 3.2 `variant='charity'` — mirror 003e1（row）

| 元素 | 規格 |
|---|---|
| Card | `flex items-center gap-3 w-full max-w-[345px] mx-auto px-3 py-[9px] bg-surface-card rounded-xl` |
| Logo placeholder | `w-16 h-16 rounded-[9px] bg-line animate-pulse shrink-0` |
| Title placeholder | `h-6 w-[60%] rounded bg-line animate-pulse` |
| Description placeholder | `h-5 w-[80%] rounded bg-line animate-pulse` |

### 3.3 `variant='donation'` — mirror 003e2（column with cover image）

| 元素 | 規格 |
|---|---|
| Card | `flex flex-col w-full max-w-[345px] mx-auto bg-surface-card rounded-xl overflow-hidden` |
| Cover image placeholder | `w-full aspect-[16/9] bg-line animate-pulse` |
| Body padding | `px-3 py-3 flex flex-col gap-2` |
| OrganizerLabel placeholder | `h-4 w-[40%] rounded bg-line animate-pulse` |
| Title placeholder | `h-6 w-[80%] rounded bg-line animate-pulse` |
| Description placeholder | `h-5 w-full rounded bg-line animate-pulse` |
| Categories tag row placeholder | `h-6 w-[60%] rounded bg-line animate-pulse` |

### 3.4 `variant='item'` — mirror 003e3（column with ribbon + price）

| 元素 | 規格 |
|---|---|
| Card | `flex flex-col w-full max-w-[345px] mx-auto bg-surface-card rounded-xl overflow-hidden` |
| Cover image placeholder | `w-full aspect-square bg-line animate-pulse` |
| Body padding | `px-3 py-3 flex flex-col gap-2` |
| OrganizerLabel placeholder | `h-4 w-[40%] rounded bg-line animate-pulse` |
| Title placeholder | `h-5 w-[70%] rounded bg-line animate-pulse` |
| Price placeholder | `h-7 w-[35%] rounded bg-line animate-pulse` |

> 不繪「公益義賣」絲帶骨架（節省複雜度；絲帶本身是 ribbon overlay，不會影響 layout shift）。

```tsx
'use client'
import type { ResourceKey } from '@/lib/schemas/list'

const CONTAINER_CLASS: Record<ResourceKey, string> = {
  charity:  'flex flex-col gap-3 px-[15px] pt-[15px]',
  donation: 'flex flex-col gap-3 px-[15px] pt-[15px]',
  item:     'grid grid-cols-2 gap-2 px-[15px] pt-[15px]',
}

export function LoadingSkeleton({
  variant,
  count = 6,
}: { variant: ResourceKey; count?: number }) {
  const safeCount = Math.max(0, count)
  return (
    <div className={CONTAINER_CLASS[variant]} aria-hidden>
      {Array.from({ length: safeCount }).map((_, i) => {
        switch (variant) {
          case 'charity':  return <CharityCardSkeleton key={i} />
          case 'donation': return <DonationCardSkeleton key={i} />
          case 'item':     return <ItemCardSkeleton key={i} />
        }
      })}
    </div>
  )
}

function CharityCardSkeleton() {
  return (
    <div className="flex items-center gap-3 w-full max-w-[345px] mx-auto px-3 py-[9px] bg-surface-card rounded-xl">
      <div className="w-16 h-16 rounded-[9px] bg-line animate-pulse shrink-0" />
      <div className="flex-1 flex flex-col gap-[3px] min-w-0">
        <div className="h-6 w-[60%] rounded bg-line animate-pulse" />
        <div className="h-5 w-[80%] rounded bg-line animate-pulse" />
      </div>
    </div>
  )
}

function DonationCardSkeleton() {
  return (
    <div className="flex flex-col w-full max-w-[345px] mx-auto bg-surface-card rounded-xl overflow-hidden">
      <div className="w-full aspect-[16/9] bg-line animate-pulse" />
      <div className="px-3 py-3 flex flex-col gap-2">
        <div className="h-4 w-[40%] rounded bg-line animate-pulse" />
        <div className="h-6 w-[80%] rounded bg-line animate-pulse" />
        <div className="h-5 w-full rounded bg-line animate-pulse" />
        <div className="h-6 w-[60%] rounded bg-line animate-pulse" />
      </div>
    </div>
  )
}

function ItemCardSkeleton() {
  // item variant 在 2 欄 grid 內，移除 mx-auto / max-w-[345px]（由 grid 控寬）
  return (
    <div className="flex flex-col w-full bg-surface-card rounded-xl overflow-hidden border border-line">
      <div className="w-full aspect-square bg-line animate-pulse motion-reduce:animate-none" />
      <div className="px-2 py-2 flex flex-col gap-1">
        <div className="h-[18px] w-[80%] rounded bg-line animate-pulse motion-reduce:animate-none" />
        <div className="h-[18px] w-[50%] rounded bg-line animate-pulse motion-reduce:animate-none" />
        <div className="h-4 w-[40%] rounded bg-line animate-pulse motion-reduce:animate-none" />
        <div className="h-6 w-[45%] rounded bg-line animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  )
}
```

> item skeleton 移除 `mx-auto max-w-[345px]`：在 grid 內由 grid cell 控寬，否則卡片無法填滿格子。新增 `border border-line` 對齊 [003e3](./003e3-sale-item-card.md#3-anatomy)。新增 `motion-reduce:animate-none` 對 `prefers-reduced-motion` 友善。

> 用內部 3 個 sub-component 比 inline switch case 容易讀；3 個 component 不對外 export，只給 variant dispatch 用。

---

## 4. 使用情境

| 來源 | 渲染 |
|---|---|
| [003j ResourceInfiniteList](./003j-charity-list.md) status === `pending` | `<LoadingSkeleton variant={resource} count={6} />` |
| 同上 isFetchingNextPage | `<LoadingSkeleton variant={resource} count={2} />` |
| `src/app/donation/loading.tsx` | `<LoadingSkeleton variant="charity" count={6} />`（default tab 是 charity）|

---

## 5. 變體

`variant` 三選一；無其他變體（顏色、shape、animation 都不可配）。

---

## 6. 測試（colocated `LoadingSkeleton.test.tsx`）

| # | 案例 | 期望 |
|---|---|---|
| 1 | `variant='charity' count=3` | 渲染 3 張 row-layout skeleton；外層 className 含 `flex flex-col` |
| 2 | `variant='donation' count=3` | 渲染 3 張 column-with-cover skeleton；含 `aspect-[16/9]`；外層 `flex flex-col` |
| 3 | `variant='item' count=3` | 渲染 3 張 column-with-square skeleton；含 `aspect-square`；**外層 className 含 `grid grid-cols-2`** |
| 4 | `count=0` | 渲染 0 張（不爆） |
| 5 | `count=-1`（防呆） | 渲染 0 張（不爆；內部 `Math.max(0, count)` 鉗位） |
| 6 | 三 variant 整片都 `aria-hidden` | 外層 `<div>` 含 `aria-hidden` 屬性 |
| 7 | `motion-reduce` | 每個 placeholder 含 `motion-reduce:animate-none` class |

---

## 7. a11y

- `aria-hidden` 整片標記（避免 SR 讀「灰底矩形」雜訊）
- screen reader 等到實際資料載入後才開始讀（list semantic 由 [003j ResourceInfiniteList](./003j-charity-list.md) 提供）
- 視覺上 `animate-pulse` 對某些低視力使用者可能太刺激；可加 `motion-reduce:animate-none`

---

## 8. 開放問題

- **shimmer vs pulse**：Tailwind 預設 pulse 是 fade in/out。shimmer 是 gradient 從左滑到右，視覺更精緻但需要 custom keyframe
- **prefers-reduced-motion**：要不要主動 `motion-reduce:animate-none` 改善 a11y？建議加但不強制
- **count 的「智慧」預設**：一屏約 6 張 charity card，但 donation / item 因為高度大，4 張可能就滿屏；可未來 per-variant default

---

## 9. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-13 | 初版（mirror CharityCard row 結構） |
| 0.2 | 2026-06-14 | 加 `variant: ResourceKey` 必填 prop；三種 sub-skeleton（charity / donation / item）對應 003e1/e2/e3 shape |
| 0.3 | 2026-06-14 | item variant 容器改 `grid grid-cols-2` 對齊 003j success layout，避免 first-paint layout shift；item card skeleton 拿掉 `mx-auto max-w-[345px]`（由 grid 控寬）、加 `border border-line` 對齊 003e3；統一 `bg-gray-200` → `bg-line` token；加 `motion-reduce:animate-none`；`count` 內部 `Math.max(0, count)` 鉗位避免負數 throw |
