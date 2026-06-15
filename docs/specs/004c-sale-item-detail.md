# Spec 004c：義賣商品介紹頁

- **狀態**：Draft（v0.1）
- **路由**：`/sale-items/:id`
- **路徑**：`src/app/sale-items/[id]/page.tsx` + `src/components/features/SaleItemDetail.tsx`
- **依賴**：[004 index](./004-detail-pages.md)
- **Figma 對應**：IMG_4882
- **Backend endpoint**：`GET /v1/donation/sale-items/:id`（spec 017）

---

## 1. 職責

呈現單一義賣商品完整資料，含主辦團體 cross-link + TWD 價格 + 商品說明。

---

## 2. Anatomy（對齊 IMG_4882）

```
┌─ TopNav: ← 義賣商品介紹 [分享 icon] ────┐  紅底
├─ 商品圖（aspect ~1:1）                  │  含「公益義賣 SHOP FOR CHANGE」絲帶
├─ 商品名（粗體 sm 字）                    │  「北歐天然 | 小型寵物魚油 2oz」
├─ TWD 價格（紅色加重 lg）                 │  「TWD 920」
├─ 勸募立案核准字號（小字 grey）           │
├─ 衛部救字號                              │
├─ 主辦團體卡片：logo + 名稱 + 查看團體 › │
├─ Categories tag pills                  │
├─ 商品說明（heading「商品說明」+ 長文）   │
├─ Sticky CTA：「立即捐款」               │  UI only
└────────────────────────────────────────┘
```

---

## 3. 資料流

```tsx
// src/app/sale-items/[id]/page.tsx
export default async function Page({ params }) {
  const { id } = await params
  const data = await fetchSaleItemDetail(id)
  if (!data) notFound()
  return <SaleItemDetail item={data} />
}
```

`SaleItemDetail` schema：

```ts
{
  id, name, description, content,
  coverImageUrl?,
  priceTwd: number,                  // 必有
  raisingApprovalNo?, reliefApprovalNo?,
  charity: { id, name, logoUrl? },
  categories: CategoryKey[],
}
```

---

## 4. 元件結構

| 區塊 | 元件 |
|---|---|
| TopNav | [003b](./003b-topnav.md)，標題「義賣商品」（IMG_4882 標題列字樣），accessory = 分享 |
| Cover + ribbon | `<CoverWithRibbon coverImageUrl name fallback={pickFallbackImage('item', id)} />` — `<FallbackImage>` + 絲帶 banner overlay（「公益義賣 SHOP FOR CHANGE」）；缺 / onError → picsum（[003e4 §4](./003e4-image-fallback.md#4-使用方式card-整合)） |
| 商品名 + 價格 | `<div><h1 className="text-base font-semibold">{name}</h1><p className="text-lg font-bold text-red-500">TWD {千分位}</p></div>` |
| 字號區 | `<ApprovalNoList raisingApprovalNo reliefApprovalNo />` |
| 主辦團體 chip | 同 004b §4 `<CharityChip>`（logo 用 [`<CharityLogo>`](./003e4-image-fallback.md#43-charity-logo初始字塊-fallback--charitylogo)，缺/onError → 首字塊）；用 `<Link href replace>` ([004 §3.1 lateral nav](./004-detail-pages.md#31-橫向關聯導航策略v02-新增)) |
| Categories | `<CategoryTags />` |
| 商品說明 | `<section><h2>商品說明</h2><div className="prose">{content}</div></section>` |
| Sticky CTA | `<StickyCta label="立即捐款" />` |

---

## 5. 邊界

- coverImageUrl 缺 / 載入失敗 → Picsum 真照片（與列表 [003e3](./003e3-sale-item-card.md) 共用 [003e4](./003e4-image-fallback.md) `FallbackImage`，seed = `item-<id>`，400×400）
- 任一字號缺 → 該行不渲染
- `priceTwd = 0` → 顯示「TWD 0」（不擋）
- categories 空 → tag 區不渲染
- ribbon banner 永遠渲染（IMG_4882 為固定視覺）

---

## 6. 測試

- 404 → not-found
- 渲染 ribbon「公益義賣」+「SHOP FOR CHANGE」
- 價格千分位格式
- 主辦團體 chip → 跳 charity detail
- CTA only `console.log`
- 缺字號欄位不渲染
