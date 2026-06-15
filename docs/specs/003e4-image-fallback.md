# Spec 003e4：Image Fallback（共用基礎建設）

- **狀態**：Draft（v0.5 — 詳細頁 CharityChip 套 `CharityLogo` 對齊列表）
- **路徑**：
  - `src/components/ui/useImageWithFallback.ts`
  - `src/components/ui/FallbackImage.tsx`（v0.4 新增）
  - `src/components/ui/CharityLogo.tsx`（v0.5 新增）
  - `src/components/ui/charity-initial.ts`
  - `src/lib/mock/fallback-images.ts`
- **依賴**：[003e Cards (index)](./003e-charity-card.md)、[003e2](./003e2-donation-project-card.md)、[003e3](./003e3-sale-item-card.md)
- **建立日期**：2026-06-14（v0.1）/ 2026-06-15（v0.2、v0.3、v0.4、v0.5）

---

## 1. 職責

當 `coverImageUrl` 缺失或載入失敗（404、CORS、DNS fail、5xx、network error 等）時，**自動切換到 Picsum 真實照片**作為視覺占位，其餘卡片資料（名稱、描述、主辦團體、價格）仍取自原本資料源。

範圍：

| Tab | Fallback 策略 | 為何 |
|---|---|---|
| 公益團體 | **首字母縮寫**（`getCharityInitial`，見 [003e1 §3.1](./003e1-charity-card.md#31-logo--fallback-dom)） | logo 為品牌識別，泛用占位圖反而干擾辨識；首字塊更符合「占位」直覺 |
| 捐款專案 | **Picsum 真實照片**（16:9） | cover image 為情境圖，缺圖時用真實風景照比抽象漸層更接近真實使用場景 |
| 義賣商品 | **Picsum 真實照片**（1:1） | product image 缺失時用真實物品照保持卡片視覺品質 |

### 1.1 圖片資料來源（per tab × per mode）

每個 tab 的卡片有兩條圖片路徑：**primary**（backend / fixture 給的 URL）與 **fallback**（primary 缺失或載入失敗時的代替）。primary 的實際來源依 `USE_MOCK` 模式而異。

| Tab | `USE_MOCK=1` primary | `USE_MOCK=0` primary | Primary 失敗 / 缺失時的 fallback |
|---|---|---|---|
| 公益團體 (charity) | fixture 不給 `logoUrl` 欄位 → 直接走 fallback | backend → BFF → client `logoUrl`；目前 backend seed 塞 1×1 PNG 到 LocalStack S3 | 首字塊（`getCharityInitial(name)` → `AC` / `財` / `🌱`） |
| 捐款專案 (donation) | fixture `coverImageUrl: 'https://picsum.photos/seed/donation01..08/640/360'`（picsum 真照片） | backend → BFF → client `coverImageUrl`；部分為 `null`、部分指向 LocalStack S3 placeholder | Picsum seed URL（`pickFallbackImage('donation', id)`，640×360，§3.2） |
| 義賣商品 (item) | fixture `coverImageUrl: 'https://picsum.photos/seed/item01..08/400/400'`（picsum 真照片） | 同上但 S3 路徑為 `donation/sale-items/<id>/cover.jpg` | Picsum seed URL（`pickFallbackImage('item', id)`，400×400，§3.2） |

**Backend / LocalStack 細節（`USE_MOCK=0`）**

[LocalStack](https://localstack.cloud/) 跑在 docker（container 名 `jko-localstack`），於 `localhost:4566` 模擬 AWS S3。Bucket 名 `local-dev-assets`，URL pattern：

```
charity : http://localhost:4566/local-dev-assets/donation/charities/<uuid>/logo.png
donation: http://localhost:4566/local-dev-assets/donation/donation-projects/<uuid>/cover.jpg
item    : http://localhost:4566/local-dev-assets/donation/sale-items/<uuid>/cover.jpg
```

Backend seed (`backend/prisma/seed.ts` 的 `uploadAsset()`) 只塞 1×1 placeholder（PNG 71 bytes / JPEG 349 bytes），**不是真圖**。Prod 上線時應替換為真實 CDN / S3 物件（host 換成 `s3.amazonaws.com` 或 CloudFront），URL pattern 不變。

**已知問題 → 詳見 §2.5**：1×1 placeholder 對 `<img>` 是「成功載入」→ `onError` 不觸發 → fallback 不啟動 → 卡片視覺空白。臨時 workaround：

```bash
docker exec jko-localstack awslocal s3 rm s3://local-dev-assets --recursive
```

（容器重啟 / `prisma db seed` 會復原 placeholders）

---

## 2. 決策

### 2.1 選「全部 load 失敗一律 fallback」而非「只在 404 fallback」

`<img onError>` 不暴露 HTTP status code。要精準辨別「404 vs CORS vs 5xx vs network」必須：

- (B) BFF 端 HEAD 探測再改寫 URL — 多一次 round trip、上游不一定支援 HEAD、防盜鏈會假 404
- (C) client `fetch` HEAD 探測 — 比 `<img onError>` 慢、CORS 更嚴、列表並發瀑布

**選 A**：把所有 load 失敗當「沒圖」處理。理由：

- 使用者體驗無差別（`<img>` 區塊都顯示替代圖）
- 不增加 request 數、不卡 SSR

> 若未來改 BFF 端探測（選 B），本 hook 介面不需改 — primary URL 由 BFF 改寫即可，前端仍只負責「load 失敗 → fallback」。

### 2.2 為何用 Picsum 而非本地 SVG（v0.2）

v0.1 走「本地 SVG 池（6 張漸層 + 愛心）」，hash by id deterministic。實際試跑後發現問題：

- 漸層 SVG 看起來明顯「占位」感太重，跟真實 cover image 視覺差太多
- 評審 / 使用者一看就知道是 placeholder，影響 demo 觀感

v0.2 改用 [Picsum Photos](https://picsum.photos)：

- 公開、免費、無 API key
- `https://picsum.photos/seed/<seed>/<w>/<h>` — seed 相同永遠回相同照片，達成 deterministic
- 真實風景 / 物品照，視覺品質高
- 唯一缺點：依賴外部服務（picsum 偶爾 5xx）；但 `<img onError>` 對 fallback 自身失敗無進一步保護 — 真有需要可未來再加 secondary fallback

### 2.3 Deterministic by id（沿用）

- SSR / CSR hydration 一致（server render 與 client render 拿到同一張）
- 列表 re-render（filter / 切 tab 回來）保持同張圖，不閃
- 測試可預測

URL 直接把 `id` 當 picsum seed：`https://picsum.photos/seed/<kind>-<id>/<w>/<h>`。前綴 `<kind>-` 是為了讓 donation/item 同 id 不撞同張。

### 2.4 不用 `next/image`

`next/image` 的 image optimizer 對外部 URL 預設要 allowlist；目前統一用 `<img>` 保持 hook 介面單純（`<img>` 可直接綁 src + onError）。

未來若改 `next/image`：

- `onError` API 相同
- Picsum domain 加進 `next.config.ts` 的 `images.remotePatterns`

### 2.5 已知不足：1×1 placeholder 不會觸發 fallback

Backend（透過 LocalStack S3）目前用 1×1 透明 PNG 當 placeholder（`backend/prisma/seed.ts`）。對 `<img>` 而言這是「成功載入」，`onError` 不會觸發 → fallback 不會啟動 → 卡片視覺空白。

要處理這個 case 需要在 `useImageWithFallback` 內補一個 `onLoad` handler 檢查 `naturalWidth/Height` 是否異常小（例如 ≤16px）。本 v0.2 暫不加；待真實 backend 開始給正常尺寸圖後優先級會降低。

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

export function pickFallbackImage(kind: FallbackKind, id: string): string
```

**契約**：

- 回傳 `https://picsum.photos/seed/<kind>-<id>/<w>/<h>`
- 同 `(kind, id)` 必同結果（picsum seed 行為保證）
- donation 用 `640/360`，item 用 `400/400`（對齊各卡 image slot 比例）
- 空字串 id 仍回有效 URL（picsum 會給一張預設圖）

**為何不收 `'charity'`**：CharityCard 的 fallback 是首字塊（見 §1），不需要圖片 URL。避免無意義 API。

---

## 4. 使用方式（card 整合）

### 4.1 列表卡片（Client Component）

[003e2](./003e2-donation-project-card.md) / [003e3](./003e3-sale-item-card.md) 是 client component，直接用 hook：

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

### 4.2 詳細頁 Cover（RSC）

[004b](./004b-donation-project-detail.md) / [004c](./004c-sale-item-detail.md) 是 RSC，不能直接用 hook（`useState` 只能在 client）。包一層 `<FallbackImage>` client wrapper：

```tsx
// src/components/ui/FallbackImage.tsx ('use client')
export function FallbackImage({ primary, fallback, alt, className, width, height }) {
  const { src, onError } = useImageWithFallback(primary, fallback)
  return <img src={src} alt={alt} onError={onError} loading="lazy" decoding="async" className={className} width={width} height={height} />
}
```

RSC 端：

```tsx
// donation-projects/[id]/page.tsx
<FallbackImage
  primary={donation.coverImageUrl}
  fallback={pickFallbackImage('donation', donation.id)}
  alt={donation.name}
  className="w-full aspect-[4/3] object-cover"
/>

// sale-items/[id]/page.tsx
<FallbackImage
  primary={item.coverImageUrl}
  fallback={pickFallbackImage('item', item.id)}
  alt={item.name}
  className="w-full h-full object-cover"
/>
```

> `pickFallbackImage` 是 pure function、可在 RSC 預先算好 URL 後當 prop 傳給 client wrapper，picsum URL 選擇仍在 server-side。Client wrapper 只負責 failed-state flip。

### 4.3 charity logo（初始字塊 fallback）— `<CharityLogo>`

charity logo（列表 [003e1](./003e1-charity-card.md) + 詳細頁 Hero + 詳細頁 `<CharityChip>`）fallback 走「首字塊」而非 URL，不接 `FallbackImage`。為了讓 RSC 也能 onError swap，抽出 `<CharityLogo>` client component（v0.5）：

```tsx
// src/components/ui/CharityLogo.tsx ('use client')
export function CharityLogo({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const [imgFailed, setImgFailed] = useState(false)
  const hasLogo = !!logoUrl && !imgFailed
  return hasLogo ? (
    <img src={logoUrl} alt="" loading="lazy" decoding="async"
         onError={() => setImgFailed(true)}
         className="w-full h-full object-cover" />
  ) : (
    <>{getCharityInitial(name)}</>
  )
}
```

只渲染內容（img 或 initial 文字），**外層容器（尺寸 / 背景 / flex 置中）由 caller 提供**——保留 64×64（card）/ 40×40（chip）/ 96×96（hero）的尺寸彈性。

| Caller | 外層 | 用途 |
|---|---|---|
| [003e1 CharityCard](./003e1-charity-card.md) | `w-16 h-16 rounded-[9px] border bg-brand/10 ...` | 列表 64×64 |
| [004a charity detail Hero](./004a-charity-detail.md) | `w-24 h-24 rounded-full bg-white ...` | 詳細頁 96×96（_v0.5 待 CharityCard / Hero 改用_） |
| [004b](./004b-donation-project-detail.md) / [004c](./004c-sale-item-detail.md) `<CharityChip>` | `w-10 h-10 rounded-md bg-brand/10 ...` | 詳細頁關聯團體 chip 40×40（_v0.5 已套用_） |

> v0.5 範圍：只把 `CharityChip`（在 donation/item 詳細頁內定義）的 logo 改用 `CharityLogo`。CharityCard / Hero 維持原 inline 實作（功能已等價，重構是 cosmetic，暫不動）。

---

## 5. 測試

### 5.1 `pickFallbackImage`（colocated `fallback-images.test.ts`）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 回傳 picsum.photos seed URL | match `https://picsum.photos/seed/...` |
| 2 | donation 用 16:9 | URL 結尾 `/640/360` |
| 3 | item 用 1:1 | URL 結尾 `/400/400` |
| 4 | deterministic | 同 (kind, id) → 同 URL |
| 5 | seed 含 kind 前綴 | donation/item 同 id 不撞同張 |
| 6 | 不同 id → 不同 URL | OK |
| 7 | 空字串 id | 不 throw、回有效 URL |

### 5.2 `useImageWithFallback`（colocated `useImageWithFallback.test.ts`）

| # | 案例 | 期望 |
|---|---|---|
| 1 | `primary` 有值 | `src === primary` |
| 2 | `primary` undefined | `src === fallback` |
| 3 | `primary` 空字串 | `src === fallback` |
| 4 | 觸 `onError` | `src` 切到 fallback |
| 5 | `onError` 穩定 reference | 同 prop re-render → `onError` 不變 |
| 6 | `primary` 換 URL → 重置 | 已 onError 後換 prop，新 `src` = 新 primary |

### 5.3 整合測試（card spec 各自 colocated）

見 [003e2 §6](./003e2-donation-project-card.md#6-測試)、[003e3 §6](./003e3-sale-item-card.md#6-測試)。卡片 test 用 regex 對應 `^https:\/\/picsum\.photos\/seed\/(donation|item)-/`。

---

## 6. 開放問題

- **`next/image` 遷移**：若 LCP 優化需要，可整批換 `next/image`；hook 介面不變；picsum domain 要加進 `next.config.ts`
- **BFF 端 HEAD 探測（選 B）**：若 PM 反映「上線後 404 圖太多影響轉換率」，可在 BFF route handler 加 HEAD probe + cache，把 primary URL 在送 client 前改寫為 picsum。hook 介面不需動
- **1×1 placeholder 偵測**：見 §2.5；待 backend 給正常尺寸真圖後優先級會降低
- **picsum 5xx 二級 fallback**：picsum 偶爾失敗，目前無進一步保護；可在 hook 加 `fallbackOfFallback`（例如 data URI 純色塊）

---

## 7. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-14 | 初版：抽出 `useImageWithFallback` + `pickFallbackImage` + 12 張本地 mock SVG（donation 6 / item 6，djb2 hash 池）；charity 維持首字母 fallback |
| 0.2 | 2026-06-15 | Fallback 來源改 Picsum Photos seed URL（`/seed/<kind>-<id>/W/H`）：視覺品質高 / 無限不撞圖 / 仍 deterministic；移除本地 SVG 池 + `FALLBACK_POOL_SIZE` + hash 函式；補 §2.5 已知不足（1×1 placeholder 不觸發 fallback） |
| 0.3 | 2026-06-15 | 補 §1.1「圖片資料來源（per tab × per mode）」：列出三 tab 在 `USE_MOCK=1` / `USE_MOCK=0` 下的 primary URL 來源 + fallback 對應、LocalStack S3 URL pattern、placeholder workaround；前面只描述 fallback 策略，缺 primary 來源說明 |
| 0.4 | 2026-06-15 | 詳細頁 Cover 套同款 fallback：新增 `<FallbackImage>` client wrapper（thin `<img>` + `useImageWithFallback`），donation/item 詳細頁的 `Cover` / `CoverWithRibbon` 改用之；`pickFallbackImage` 在 RSC 預算 URL 後當 prop 傳入；charity Hero / CharityChip 維持首字塊（範圍 user-confirmed）；§4 拆 4.1 列表 / 4.2 詳細 / 4.3 charity 例外 |
| 0.5 | 2026-06-15 | 新增 `<CharityLogo>` client component（內含 onError handler，fallback 為 `getCharityInitial(name)`），donation/item 詳細頁的 `<CharityChip>` 內聯 logo 邏輯改用之，對齊 [003e1 CharityCard](./003e1-charity-card.md) 處理方式（原本 chip 是 `charity.name[0]` 取單字、無 onError）。CharityCard / 詳細頁 Hero 雖等價但未重構（行為已正確、cosmetic refactor 留待後續）；§4.3 更新並列出三個 caller 的容器規格 |
