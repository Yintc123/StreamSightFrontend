# Spec 003e：Cards（index）

- **狀態**：Draft（v0.4 — dispatch code 收斂到 003j 為唯一 source；本檔僅文字描述分派契約）
- **建立日期**：2026-06-13（v0.1 `CharityCard`）/ 2026-06-14（v0.2 抽 generic `ResourceCard`）/ 2026-06-14（v0.3 截圖補件後再拆三 component）
- **依賴**：[003a Design System](./003a-design-system.md)、[002 Data §3 per-resource schema](./002-list-data.md#3-schemas--srclibschemaslistts)

---

## 1. 為什麼拆 3 個 component（v0.3）

v0.2 假設「三 tab 卡片 shape 相同，只是內容不同」 — 該假設源於 Figma 只給 charity tab 的 card 視覺，作 brief §3 「範圍內但設計缺失」條目處理。

2026-06-14 截圖補件（IMG_4875 / 4880 / 4877）揭露三 tab 卡片 layout 實際**顯著不同**：

| Tab | 主軸排版 | 主視覺 | 必有 metadata | 截圖 |
|---|---|---|---|---|
| 公益團體 | row（logo 左、文字右） | 64×64 小 logo | 無 | IMG_4875 |
| 捐款專案 | column（image top、文字 bottom） | 寬幅 cover image | 主辦團體名 + categories tags | IMG_4880 |
| 義賣商品 | column + ribbon overlay | 商品圖 + 「公益義賣」絲帶 banner | 主辦團體 + **TWD 價格**（紅色加重） | IMG_4877 |

共用元件加 `variant` prop 會把 layout 分支、optional 欄位、樣式選擇全部塞在同一檔案。拆成三個 component：

- 各自 layout / props 收斂、樣式簡單
- 對應 spec 002 v0.4 per-resource schema（`Charity` / `Donation` / `Item`），型別端到端清楚
- skeleton（003f）對應拆 3 個或 mirror shape per variant

---

## 2. 三 component 對照

| Component | 路徑 | Props 來源 | 子 spec |
|---|---|---|---|
| `<CharityCard />` | `src/components/ui/CharityCard.tsx` | `Charity`（002 §3.2） | [003e1](./003e1-charity-card.md) |
| `<DonationProjectCard />` | `src/components/ui/DonationProjectCard.tsx` | `Donation`（002 §3.2） | [003e2](./003e2-donation-project-card.md) |
| `<SaleItemCard />` | `src/components/ui/SaleItemCard.tsx` | `Item`（002 §3.2） | [003e3](./003e3-sale-item-card.md) |

共用基礎建設：

| Spec | 內容 |
|---|---|
| [003e4 Image Fallback](./003e4-image-fallback.md) | `useImageWithFallback` hook + `pickFallbackImage` helper + `public/mock-images/` 池；donation / item 卡共用 |

---

## 3. 分派（dispatch）契約

`<ResourceInfiniteList resource={...} />`（[003j](./003j-charity-list.md)）內部依 `resource` 渲染對應 component：

| `resource` | 渲染 |
|---|---|
| `'charity'` | `<CharityCard item={item as Charity} />` |
| `'donation'` | `<DonationProjectCard item={item as Donation} />` |
| `'item'` | `<SaleItemCard item={item as Item} />` |

> **唯一 source of truth**：dispatch `switch` 程式碼定義在 [003j §3 `CardForResource`](./003j-charity-list.md#3-渲染分支)；本檔僅描述契約，不重複 code，避免雙 source 漂移。
>
> 型別 cast 是因 `AnyResourceItem` 為 union；分派處 resource discriminator 已決定具體 shape，cast 安全。也可用 zod discriminated union 收斂掉 cast。

---

## 4. 共同約定

- 每個 card：本作業**有**詳情頁（v0.5 起，spec 004 系列），整張卡片包 `<Link href={...}>`：
  - 公益團體 → `/charities/:id`
  - 捐款專案 → `/donation-projects/:id`
  - 義賣商品 → `/sale-items/:id`
- 共用樣式 token：見 [003a Design System](./003a-design-system.md)
- 卡片內**不**呈現分頁狀態 / 載入 spinner，由 ResourceInfiniteList 統籌
- a11y：
  - `<article>` 包裝；卡片內唯一 `<h2>` 為標題
  - 商品圖 / cover image 的 `alt`：標題本身（不裝飾）
- 圖片 fallback 分流（v0.5）：

  | Tab | 缺/載入失敗時 | Spec |
  |---|---|---|
  | 公益團體 | 首字塊（`AC` / `財` / `🌱`） | [003e1 §3.1](./003e1-charity-card.md#31-logo--fallback-dom) |
  | 捐款專案 | 本地 mock SVG（漸層） | [003e2 §3.1](./003e2-donation-project-card.md#31-img-與-fallback) + [003e4](./003e4-image-fallback.md) |
  | 義賣商品 | 本地 mock SVG（漸層） | [003e3 §3](./003e3-sale-item-card.md#3-anatomy) + [003e4](./003e4-image-fallback.md) |

---

## 5. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-13 | 初版 `CharityCard`（charity 領域綁定） |
| 0.2 | 2026-06-14 | 抽 generic `ResourceCard` 接 `ResourceListItem`，三 tab 共用 |
| 0.3 | 2026-06-14 | 截圖補件後改回三 component（CharityCard + DonationProjectCard + SaleItemCard），本檔變索引；分派邏輯下放到 ResourceInfiniteList |
| 0.4 | 2026-06-14 | 移除本檔的 dispatch `switch` code（仍在 003j），改用「契約表格」描述；避免 003e / 003j 雙 source 漂移 |
| 0.5 | 2026-06-14 | 新增 [003e4](./003e4-image-fallback.md) 共用基礎建設（hook + helper + mock 池）；§4 補圖片 fallback 分流表（charity 首字塊；donation/item mock SVG） |
