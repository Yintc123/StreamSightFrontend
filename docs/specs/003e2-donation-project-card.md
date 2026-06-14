# Spec 003e2：DonationProjectCard

- **狀態**：Draft（v0.3 — cover image fallback 改為本地 mock SVG，封裝在共用 hook）
- **路徑**：`src/components/ui/DonationProjectCard.tsx`
- **依賴**：[003a Design System](./003a-design-system.md)、[002 §3.2 `Donation` schema](./002-list-data.md#3-schemas--srclibschemaslistts)、[003e Cards (index)](./003e-charity-card.md) §4 共同約定、[003e4 Image Fallback](./003e4-image-fallback.md)
- **Figma 對應**：IMG_4875（捐款專案 tab 列表卡片）
- **複用性**：中

---

## 1. 職責

捐款專案卡片：寬幅 cover image（top）+ **圖片底部疊紅色半透明 overlay 顯示主辦團體名**（白字）+ 標題 + 描述 + categories tag bar。整張卡可點跳 `/donation-projects/:id`。

---

## 2. Props

```ts
import type { Donation } from '@/lib/schemas/list'

type DonationProjectCardProps = { item: Donation }
```

`Donation` shape（spec 002 §3.2）：

```ts
{
  id, name, description, logoUrl?,
  charityId, charityName,
  coverImageUrl?,
  categories?: CategoryKey[],
}
```

---

## 3. Anatomy

對齊 IMG_4875。**修正 v0.1**：主辦團體名不是另起一條淺色 banner，而是**疊在 cover image 底部的紅色半透明 overlay（白字）**。

```
┌────────────────────────────────────┐
│                                    │
│        cover image                 │
│        (aspect-[16/9])             │
│                                    │
├────────────────────────────────────┤  ← 紅色 brand.overlay
│ 財團法人宜蘭縣私立柏拉圖復康之家     │  ← 白字 charityName line-clamp-1
├────────────────────────────────────┤
│                                    │
│ 【安居．專業．愛】── 守護身障弱勢   │  ← h2 title line-clamp-1
│                                    │
│ 共築安全專業家園勸募活動            │  ← description line-clamp-2
│                                    │
│  ♥ 心身障礙服務   ♥ 弱勢扶貧        │  ← categories chips（前 3）
└────────────────────────────────────┘
```

| 元素 | Tag | className |
|---|---|---|
| Container（`<Link>`） | `<article>` 外、`<Link>` 內 | `<article>` `bg-surface-card rounded-xl overflow-hidden shadow-sm hover:shadow-md`<br>`<Link>` `flex flex-col w-full max-w-[345px] mx-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand rounded-xl` |
| Image wrap | `<div>` | `relative w-full aspect-[16/9]` |
| Cover image | `<img>` | `w-full h-full object-cover`；src 由 [003e4 `useImageWithFallback`](./003e4-image-fallback.md#31-useimagewithfallbackprimary-fallback) 決定（缺/載入失敗 → 本地 mock SVG） |
| **CharityName overlay** | `<div>` | `absolute inset-x-0 bottom-0 bg-brand-overlay text-white text-[13px] leading-5 px-3 py-1 truncate` |
| Body | `<div>` | `flex flex-col gap-1 px-3 py-3` |
| Title | `<h2>` | `text-base font-semibold text-ink-AAA leading-6 line-clamp-1` |
| Description | `<p>` | `text-[13px] leading-5 text-ink-AA line-clamp-2` |
| Categories container | `<ul>` | `flex flex-wrap gap-2 mt-2` |
| Each chip | `<li>` | `inline-flex items-center gap-1 px-2 py-[2px] rounded-full bg-black/5 text-[12px] leading-5 text-ink-AA`；前置 `<HeartGlyph className="w-3 h-3 text-brand" aria-hidden />` |
| 「+N」chip | `<li>` | 同上但無 icon、`text-ink-A`；文字 `+{N}` |

> `bg-brand-overlay` = 003a §2 v0.3 新增 token（`rgba(201,25,29,0.78)`）。

> Heart glyph 可用 inline SVG（heart fill）或 emoji（`'❤'`）；建議 inline SVG 對應 003a `text-brand` 著色。

### 3.1 `<img>` 與 fallback

cover image 永遠渲染 `<img>` —— src 缺失或 onError 時，hook 自動切到本地 mock SVG（漸層 + 愛心 glyph），詳見 [003e4](./003e4-image-fallback.md)。

```tsx
const { src, onError } = useImageWithFallback(
  item.coverImageUrl,
  pickFallbackImage('donation', item.id),
)

return (
  <div className="relative w-full aspect-[16/9]">
    <img
      src={src}
      alt=""                          /* 標題已表達主題 */
      loading="lazy"
      decoding="async"
      onError={onError}
      className="w-full h-full object-cover"
    />
    <div className="absolute inset-x-0 bottom-0 bg-brand-overlay text-white
                    text-[13px] leading-5 px-3 py-1 truncate">
      {item.charityName}
    </div>
  </div>
)
```

> 不再需要 `useState(imgFailed)` + conditional render；`<img>` 永遠在 DOM，src 由 hook 切換。

### 3.2 Categories `+N` 渲染規則

| `categories.length` | 渲染 |
|---|---|
| `undefined` / `[]` | 不渲染 `<ul>` |
| 1 ~ 3 | 全部渲染為 chip |
| ≥ 4 | 前 3 個渲染為 chip，第 4 個位置渲染 `<li>+{length - 3}</li>`（不重複文字「個分類」） |

例：`categories = ['disability', 'poverty', 'environment', 'animal_protection', 'children']` → 渲染 `♥ 身心障礙服務` `♥ 弱勢扶貧` `♥ 環境保護` `+2`。

```tsx
{item.categories && item.categories.length > 0 && (
  <ul className="flex flex-wrap gap-2 mt-2">
    {item.categories.slice(0, 3).map((key) => (
      <li
        key={key}
        className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full
                   bg-black/5 text-[12px] leading-5 text-ink-AA"
      >
        <HeartGlyph className="w-3 h-3 text-brand" aria-hidden />
        {CATEGORY_LABELS[key]}
      </li>
    ))}
    {item.categories.length > 3 && (
      <li
        className="inline-flex items-center px-2 py-[2px] rounded-full
                   bg-black/5 text-[12px] leading-5 text-ink-A"
      >
        +{item.categories.length - 3}
      </li>
    )}
  </ul>
)}
```

> `CATEGORY_LABELS` 來自 [002 §3.1](./002-list-data.md#3-schemas--srclibschemaslistts)。

---

## 4. 變體 / 邊界

| 條件 | 行為 |
|---|---|
| `coverImageUrl` `undefined` / 空字串 | `<img src>` 直接用 mock SVG（[003e4](./003e4-image-fallback.md)）；overlay 依然疊在 img 底部 |
| `coverImageUrl` 載入失敗（404/CORS/network） | `<img onError>` → src 切到 mock SVG |
| `charityName` 超長 | overlay 內 `truncate`（單行） |
| `name`（title）超長 | `line-clamp-1` |
| `description` 超長 | `line-clamp-2` |
| `categories` `undefined` / `[]` | tag bar 不渲染（不留空白） |
| `categories.length > 3` | 顯示前 3 + `+{N}` chip |
| 點擊整張卡 | router push `/donation-projects/:id`（[spec 004b](./004b-donation-project-detail.md)） |

---

## 5. a11y

- 卡片唯一 h2 為 `item.name`
- 圖片 `alt=""`（裝飾，title 已表達主題）
- `charityName` overlay 是 `<div>` 純文字（非 link）；詳情頁有「查看團體 ›」獨立 link，避免列表頁卡片內巢狀 link
- categories 用 `<ul><li>` semantic；HeartGlyph `aria-hidden`
- focus-visible `outline-brand`

---

## 6. 測試（colocated `DonationProjectCard.test.tsx`）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 cover image | `<img src={coverImageUrl} alt="">` 在 DOM |
| 2a | `coverImageUrl` `undefined` | `<img>` 仍渲染；src 為 `/mock-images/donation/[1-6].svg` |
| 2b | `coverImageUrl` `onError` | src 切到 `/mock-images/donation/[1-6].svg` |
| 3 | 渲染 charityName overlay | overlay `<div>` 內含 `item.charityName`；`bg-brand-overlay text-white` |
| 4 | charityName 超長 | overlay `<div>` 含 `truncate` class |
| 5 | 渲染 h2 title | `screen.getByRole('heading', { level: 2 })` 為 `item.name` |
| 6 | 渲染 description | p 內含 description；`line-clamp-2` |
| 7 | `categories` 為 0 | 不渲染 `<ul>` |
| 8 | `categories.length === 3` | 渲染 3 個 chip；無 `+N` |
| 9 | `categories.length === 5` | 渲染 3 個 chip + 1 個 `+2` chip；總共 4 個 li |
| 10 | `+N` chip 文字 | textContent === `+2`（無「個分類」） |
| 11 | category chip 文字 | textContent 為 `CATEGORY_LABELS[key]`（如 `身心障礙服務`） |
| 12 | 整卡點擊 | `<a href="/donation-projects/{id}">` 包整卡 |
| 13 | a11y：卡片唯一 h2 | 只一個 h2 |

---

## 7. 開放問題

- **HeartGlyph 來源**：是否要 import 統一 icon 元件 vs inline SVG。建議 inline SVG（無 dep）；若多處用再抽
- **`<img>` 改 `next/image`**：cover image 偏大、可能是 LCP；可考慮 `next/image priority` 給 first paint 前幾張，但要小心 cumulative layout shift（已用 aspect-ratio 預留空間，OK）
- **overlay 透明度**：v0.2 用 `brand.overlay`（0.78 alpha）；視覺評審若反映「太遮圖」，可調 0.6~0.7

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-14 | 初版：誤判 charityName 為圖片下方淺色 banner（`bg-brand-soft`） |
| 0.2 | 2026-06-14 | 截圖 IMG_4875 重新判讀：charityName 是**圖片底部紅色半透明 overlay 白字**；banner 規格改為 `absolute inset-x-0 bottom-0 bg-brand-overlay text-white`；補 `+N` chip 完整渲染規則與文字（純 `+{N}`）；補 HeartGlyph category chip 前置 icon；補完整 13 個測試案例；撤回 `bg-brand-soft`（[003a v0.3](./003a-design-system.md#9-變更紀錄)） |
| 0.3 | 2026-06-14 | cover image fallback 由「conditional `<div>` + HeartGlyph」改為「`<img>` 永遠渲染、src 由 [003e4 `useImageWithFallback`](./003e4-image-fallback.md) 切到本地 mock SVG」；移除 `useState(imgFailed)` + conditional render，hook 封裝；測試 #2 拆 2a / 2b 涵蓋缺值與 onError 兩條路徑 |
