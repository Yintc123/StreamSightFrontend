# Spec 003e4：Image Fallback（共用基礎建設）

- **狀態**：Draft（v0.1 — 初版）
- **路徑**：
  - `src/components/ui/useImageWithFallback.ts`
  - `src/lib/mock/fallback-images.ts`
  - `public/mock-images/{donation,item}/{1..6}.svg`
- **依賴**：[003e Cards (index)](./003e-charity-card.md)、[003e2](./003e2-donation-project-card.md)、[003e3](./003e3-sale-item-card.md)
- **建立日期**：2026-06-14

---

## 1. 職責

當 `coverImageUrl` 缺失或載入失敗（404、CORS、DNS fail、5xx、network error 等）時，**自動切換到本地 mock 圖**作為視覺占位。

範圍：

| Tab | Fallback 策略 | 為何 |
|---|---|---|
| 公益團體 | **首字母縮寫**（`getCharityInitial`，見 [003e1 §3.1](./003e1-charity-card.md#31-logo--fallback-dom)） | logo 為品牌識別，泛用 mock 圖反而干擾辨識；首字塊更符合「占位」直覺 |
| 捐款專案 | **本地 mock SVG**（漸層 + 愛心 glyph） | cover image 為情境圖（活動氛圍），無圖時用裝飾性占位較自然 |
| 義賣商品 | **本地 mock SVG**（同上） | product image 缺失時用裝飾占位；ribbon「公益標籤」仍在 |

---

## 2. 決策

### 2.1 選「全部 load 失敗一律 fallback」而非「只在 404 fallback」

`<img onError>` 不暴露 HTTP status code。要精準辨別「404 vs CORS vs 5xx vs network」必須：

- (B) BFF 端 HEAD 探測再改寫 URL — 多一次 round trip、上游不一定支援 HEAD、防盜鏈會假 404
- (C) client `fetch` HEAD 探測 — 比 `<img onError>` 慢、CORS 更嚴、列表並發瀑布

**選 A**：把所有 load 失敗當「沒圖」處理。理由：

- 使用者體驗無差別（`<img>` 區塊都是顯示替代圖）
- 不增加 request 數、不卡 SSR
- picsum 等 placeholder 服務本來就會偶爾 5xx，全部 fallback 反而體驗一致

> 若未來改 BFF 端探測（選 B），本 hook 介面不需改 — primary URL 由 BFF 改寫即可，前端仍只負責「load 失敗 → fallback」。

### 2.2 Mock 圖選擇：deterministic by id

不用真亂數，理由：

- SSR / CSR hydration mismatch（server render 與 client render 拿到同一張）
- 列表 re-render（filter / 切 tab 回來）保持同張圖，不閃
- 測試可預測

用 djb2 hash → mod 6 → `1..6.svg`。同筆資料每次拿同一張。

### 2.3 不用 `next/image`

`next/image` 的 image optimizer 對外部 URL 預設要 allowlist；mock SVG 雖在 `public/`，但為了 hook 介面統一（`<img>` 可直接綁 src + onError），目前統一用 `<img>`。

未來若改 `next/image`：

- `onError` API 相同
- Mock SVG 可加 `loader={() => src}` 跳過 optimizer

---

## 3. API

### 3.1 `useImageWithFallback(primary, fallback)`

```ts
// src/components/ui/useImageWithFallback.ts
'use client'

export type ImageWithFallback = {
  src: string
  onError: () => void
}

export function useImageWithFallback(
  primary: string | undefined,
  fallback: string,
): ImageWithFallback
```

**契約**：

| 情境 | `src` 回傳 |
|---|---|
| `primary` 為有效字串、未觸 `onError` | `primary` |
| `primary` 為 `undefined` / 空字串 | `fallback`（不等到 onError，直接用） |
| `primary` 為有效字串、已觸 `onError` | `fallback` |
| `primary` 在 onError 後被換成新 URL | 重置 failed state，再次嘗試新 `primary` |

`onError` 是穩定 reference（`useCallback` 無依賴），可直接綁到 `<img onError>`。

**內部實作**（render 中比較 prop 並 setState，避開 `react-hooks/refs` 規則 — 不在 render 期間讀寫 `ref.current`）：

```ts
const [prevPrimary, setPrevPrimary] = useState(primary)
const [failed, setFailed] = useState(false)
if (primary !== prevPrimary) {
  setPrevPrimary(primary)
  setFailed(false)
}
```

### 3.2 `pickFallbackImage(kind, id)`

```ts
// src/lib/mock/fallback-images.ts
export type FallbackKind = 'donation' | 'item'
export const FALLBACK_POOL_SIZE = 6

export function pickFallbackImage(kind: FallbackKind, id: string): string
```

**契約**：

- 回傳 `/mock-images/<kind>/<n>.svg`，`n ∈ {1..6}`
- 同 `(kind, id)` 必同結果（deterministic）
- 空字串 id 仍回有效 path（hash 出 1，不 throw）

**為何不收 `'charity'`**：CharityCard 的 fallback 是首字塊（見 §1），不需要 mock SVG。避免 `pickFallbackImage('charity', ...)` 返回 404 死路。

**Hash 函式**：djb2（`h = h * 33 ^ ch.charCodeAt(i)`）；UUID 長度 ≥ 32，分佈足夠。

---

## 4. Mock 資產

```
public/mock-images/
├── donation/
│   ├── 1.svg  (rose,    640×360)
│   ├── 2.svg  (amber,   640×360)
│   ├── 3.svg  (emerald, 640×360)
│   ├── 4.svg  (sky,     640×360)
│   ├── 5.svg  (violet,  640×360)
│   └── 6.svg  (pink,    640×360)
└── item/
    ├── 1.svg  (rose,    400×400)
    ├── 2.svg  (amber,   400×400)
    ├── 3.svg  (emerald, 400×400)
    ├── 4.svg  (sky,     400×400)
    ├── 5.svg  (violet,  400×400)
    └── 6.svg  (pink,    400×400)
```

每張：

- `<rect>` 填 linear-gradient（淺 → 中）
- 居中 lucide-style heart path，`fill-opacity="0.55"`
- 尺寸對齊 [003e2 §3](./003e2-donation-project-card.md#3-anatomy)（16:9）、[003e3 §3](./003e3-sale-item-card.md#3-anatomy)（1:1）

> 真實上線時可用真照片覆蓋同名檔，前端介面不需改。

---

## 5. 使用方式（card 整合）

[003e2](./003e2-donation-project-card.md) / [003e3](./003e3-sale-item-card.md) 內：

```tsx
const { src, onError } = useImageWithFallback(
  item.coverImageUrl,
  pickFallbackImage('donation', item.id), // or 'item'
)

return (
  <img
    src={src}
    alt=""
    loading="lazy"
    decoding="async"
    onError={onError}
    className="w-full h-full object-cover"
  />
)
```

> 不再需要 `useState(imgFailed)` + conditional render — `<img>` 永遠渲染，src 由 hook 決定。

---

## 6. 測試

### 6.1 `pickFallbackImage`（colocated `fallback-images.test.ts`）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 回傳路徑格式 | `/mock-images/donation/[1-6].svg` |
| 2 | 支援 `donation` / `item` | 對應 subdir |
| 3 | deterministic | 同 (kind, id) → 同結果 |
| 4 | 分佈 | 30 個不同 id → ≥ 3 張不同圖 |
| 5 | 空字串 id | 不 throw、回有效 path |
| 6 | `FALLBACK_POOL_SIZE === 6` | 與 public 檔案數同步 |

### 6.2 `useImageWithFallback`（colocated `useImageWithFallback.test.ts`）

| # | 案例 | 期望 |
|---|---|---|
| 1 | `primary` 有值 | `src === primary` |
| 2 | `primary` undefined | `src === fallback` |
| 3 | `primary` 空字串 | `src === fallback` |
| 4 | 觸 `onError` | `src` 切到 fallback |
| 5 | `onError` 穩定 reference | 同 prop re-render → `onError` 不變 |
| 6 | `primary` 換 URL → 重置 | 已 onError 後換 prop，新 `src` = 新 primary |

### 6.3 整合測試（card spec 各自 colocated）

見 [003e2 §6](./003e2-donation-project-card.md#6-測試)、[003e3 §6](./003e3-sale-item-card.md#6-測試)。

---

## 7. 開放問題

- **mock SVG 美感**：v0.1 為純色漸層 + 愛心 glyph，足以辨識「占位中」但缺主題性。視覺評審若反映「太假」可換真實插畫
- **`next/image` 遷移**：若 LCP 優化需要，可整批換 `next/image`；hook 介面不變
- **BFF 端 HEAD 探測（選 B）**：若 PM 反映「上線後 404 圖太多影響轉換率」，可在 BFF route handler 加 HEAD probe + cache，把 primary URL 在送 client 前改寫為 mock。hook 介面不需動

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-14 | 初版：抽出 `useImageWithFallback` + `pickFallbackImage` + 12 張 mock SVG（donation 6 / item 6）；charity 維持首字母 fallback |
