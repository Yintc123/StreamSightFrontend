# Spec 003e1：CharityCard

- **狀態**：Draft（v0.3 — 確認 charity logo fallback 維持首字塊，不採用 mock SVG）
- **路徑**：`src/components/ui/CharityCard.tsx`
- **依賴**：[003a Design System](./003a-design-system.md)、[002 §3.2 `Charity` schema](./002-list-data.md#3-schemas--srclibschemaslistts)、[003e Cards (index)](./003e-charity-card.md) §4 共同約定
- **Figma 對應**：IMG_4880（公益團體 tab 卡片背景）
- **複用性**：中

---

## 1. 職責

公益團體卡片：小 logo（64×64，左）+ 名稱 + 一行 tagline（右）。row 排版。整張卡可點擊跳 `/charities/:id`。

---

## 2. Props

```ts
import type { Charity } from '@/lib/schemas/list'

type CharityCardProps = { item: Charity }
```

> 無 `onClick` prop — 整卡點擊由外層 `<Link>` 接管。

---

## 3. Anatomy

| 元素 | Tag | className |
|---|---|---|
| Container（`<Link href={`/charities/${item.id}`}>`） | `<a>`（Next `<Link>` 渲染）外套 `<article>` | `<article>` `bg-surface-card rounded-xl`<br>`<a>` `flex items-center gap-3 w-full max-w-[345px] mx-auto px-3 py-[9px] hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand` |
| Logo（`<img>` or fallback `<div>`） | 見 §3.1 | `w-16 h-16 rounded-[9px] border border-line object-cover shrink-0` |
| Text column | `<div>` | `flex-1 flex flex-col gap-[3px] min-w-0` |
| Title | `<h2>` | `text-base font-medium text-ink-AAA leading-6 line-clamp-1` |
| Tagline | `<p>` | `text-[13px] leading-5 text-ink-AA line-clamp-1` |

> 對應資料：title = `item.name`、tagline = `item.description ?? ''`。`description` 缺 / 空字串時 **不渲染** `<p>`（不留空白行）。

### 3.1 Logo / fallback DOM

> v0.3 註：CharityCard 不採用 [003e4](./003e4-image-fallback.md) 的 mock SVG 路線。理由：logo 屬品牌識別，泛用 mock 圖反而干擾辨識；首字塊（`AC` / `財` / `🌱`）視覺更接近「占位」直覺，也能保留 NPO 縮寫品牌感（IMG_4880 截圖中 ACC / ASGL 等本來就是字母縮寫風格）。

「fallback」啟動的兩條路徑：
- `item.logoUrl` 為 `undefined`、空字串、或不是有效 URL：**初始**就渲染 fallback `<div>`，不渲染 `<img>`
- `item.logoUrl` 為有效 URL 但 `<img>` `onError`：用 `useState<boolean>` 紀錄錯誤，切到 fallback `<div>`

fallback `<div>` 規格：

```tsx
<div
  className="w-16 h-16 rounded-[9px] border border-line shrink-0
             bg-brand/10 text-brand font-medium text-xl
             flex items-center justify-center select-none"
  aria-hidden  // title 已在 h2 / img alt 表達；裝飾性 fallback
>
  {initial(item.name)}
</div>
```

`initial(name)` 規則（純函式，建議 colocate 為 `getCharityInitial`）：

| 條件 | 回傳 |
|---|---|
| 第一個非空白字元為 ASCII 英文字母 / 數字 | 取**前 2 個** ASCII 字母 / 數字，轉大寫（例：`ACC 中華耆幼...` → `AC`、`ASGL ...` → `AS`） |
| 第一個非空白字元為非 ASCII（中 / 日 / 韓 / emoji） | 取**第 1 個** code-point grapheme（例：`財團法人...` → `財`） |
| `name` 為空字串 / undefined | 渲染空字串（fallback 變純色塊） |

> 兩字英文縮寫對齊 IMG_4880 顯示的 `ACC` / `ASGL` 樣式縮寫（雖然該圖實際 logo 是品牌設計圖，缺檔時用字母 fallback 觀感最接近）。

### 3.2 `<img>` 規格

```tsx
<img
  src={item.logoUrl}
  alt=""                              /* 標題已有 h2，logo 視為裝飾 */
  width={64}
  height={64}
  loading="lazy"
  decoding="async"
  onError={() => setImgFailed(true)}
  className="w-16 h-16 rounded-[9px] border border-line object-cover shrink-0"
/>
```

> `alt=""` 對齊 [003e §4](./003e-charity-card.md#4-共同約定) 共同約定（卡片唯一 h2 即標題）。

### 3.3 完整 component 範例

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Charity } from '@/lib/schemas/list'

export function CharityCard({ item }: { item: Charity }) {
  const [imgFailed, setImgFailed] = useState(false)
  const hasLogo = !!item.logoUrl && !imgFailed

  return (
    <article className="bg-surface-card rounded-xl">
      <Link
        href={`/charities/${item.id}`}
        className="flex items-center gap-3 w-full max-w-[345px] mx-auto px-3 py-[9px]
                   hover:bg-black/5 focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-brand rounded-xl"
      >
        {hasLogo ? (
          <img
            src={item.logoUrl}
            alt=""
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="w-16 h-16 rounded-[9px] border border-line object-cover shrink-0"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-[9px] border border-line shrink-0
                       bg-brand/10 text-brand font-medium text-xl
                       flex items-center justify-center select-none"
            aria-hidden
          >
            {getCharityInitial(item.name)}
          </div>
        )}
        <div className="flex-1 flex flex-col gap-[3px] min-w-0">
          <h2 className="text-base font-medium text-ink-AAA leading-6 line-clamp-1">
            {item.name}
          </h2>
          {item.description && (
            <p className="text-[13px] leading-5 text-ink-AA line-clamp-1">
              {item.description}
            </p>
          )}
        </div>
      </Link>
    </article>
  )
}

export function getCharityInitial(name: string): string {
  const trimmed = name.trimStart()
  if (!trimmed) return ''
  const first = trimmed[0]
  // ASCII 英文 / 數字 → 取前 2 個 ASCII alphanumeric，轉大寫
  if (/[A-Za-z0-9]/.test(first)) {
    return trimmed
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 2)
      .toUpperCase()
  }
  // 非 ASCII → 取第一個 grapheme（用 Array.from 處理多 code-point emoji）
  return Array.from(trimmed)[0] ?? ''
}
```

---

## 4. 變體 / 邊界

| 條件 | 行為 |
|---|---|
| `logoUrl` `undefined` / 空字串 | 直接渲染 fallback `<div>`（不渲染 `<img>`） |
| `logoUrl` 有值但載入失敗（`<img>` `onError`） | 切 fallback `<div>` |
| `description` `undefined` / 空字串 | 不渲染 `<p>`，title 行單獨顯示 |
| `name` 超長 | `line-clamp-1`，超出 ellipsis |
| `description` 超長 | `line-clamp-1`，超出 ellipsis |
| 點擊整張卡（含縮圖、文字） | router push `/charities/:id`（[spec 004a](./004a-charity-detail.md)） |

---

## 5. a11y

- 卡片唯一 h2 為 `item.name`（對齊 [003e §4](./003e-charity-card.md#4-共同約定)）
- logo `<img alt="">` 或 fallback `<div aria-hidden>`：title 已在 h2 表達，logo 視為裝飾
- `<Link>` 內含整卡 — SR 讀「{name} 連結」即可前往詳情頁
- focus-visible 用 `outline-2 outline-brand`：紅框聚焦提示（鍵盤可達）

---

## 6. 測試（colocated `CharityCard.test.tsx`）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 `name` 與 `description` | h2 內含 name；p 內含 description |
| 2 | `description` `undefined` | 不渲染 p |
| 3 | `description` 空字串 | 不渲染 p |
| 4 | `logoUrl` 有效 URL | 渲染 `<img src={logoUrl} alt="">`；不渲染 fallback |
| 5 | `logoUrl` `undefined` | 不渲染 `<img>`；渲染 fallback `<div aria-hidden>`；內含 `getCharityInitial(name)` |
| 6 | `<img>` 觸 onError | 切到 fallback `<div>`；`<img>` 不在 DOM |
| 7 | 整卡點擊 | `<Link>` 包整張：DOM 內含 `<a href="/charities/{id}">` 包整卡 |
| 8 | a11y：卡片唯一 h2 | `screen.getByRole('heading', { level: 2 })` 取得 h2.textContent === name |
| 9 | `name` 超長 → 行截斷 | h2 含 `line-clamp-1` class（斷言 class，視覺由 e2e 驗） |

### 6.1 `getCharityInitial` 測試（colocated 同檔案 export）

| 輸入 `name` | 期望輸出 |
|---|---|
| `'ACC 中華耆幼關懷協會'` | `'AC'` |
| `'ASGL 台灣霧後光聯盟'` | `'AS'` |
| `'財團法人宜蘭縣...'` | `'財'` |
| `'  財團法人...'`（前置空白） | `'財'` |
| `'🌱 環保協會'` | `'🌱'`（單一 emoji grapheme） |
| `''` | `''` |
| `'a'`（單字母） | `'A'` |
| `'a-b'` | `'AB'`（去掉非英數後取前 2） |

---

## 7. 開放問題

- **fallback 配色**：v0.2 用 `bg-brand/10 text-brand`（淺紅底 + 紅字）；若視覺評審反映「太搶眼」可改 `bg-black/5 text-ink-AA`
- **`<img>` 改 `next/image`**：未來若做 LCP 優化可改 `next/image`，但目前 logo 不是 LCP element，先用 `<img>` 簡潔
- **focus outline 顏色**：用 brand 紅或系統預設藍？v0.2 用 brand 紅對齊整體調性

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-13 | 初版（row + logo + 1 行 tagline；fallback 文字「首字母」未明） |
| 0.2 | 2026-06-14 | 截圖補件後補：fallback `<div>` 完整 DOM 與 className、`getCharityInitial` 純函式規格與 8 個測試案例、`description` 空字串不渲染 `<p>`、focus-visible 紅框、`<img>` 用 `loading="lazy"` |
| 0.3 | 2026-06-14 | 與 donation/item 卡的「mock SVG fallback」（[003e4](./003e4-image-fallback.md)）路線分流：CharityCard **維持首字塊**，理由補在 §3.1 開頭。實作 / 測試不變 |
