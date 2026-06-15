# Spec 004b：捐款專案介紹頁

- **狀態**：Draft（v0.1）
- **路由**：`/donation-projects/:id`
- **路徑**：`src/app/donation-projects/[id]/page.tsx` + `src/components/features/DonationProjectDetail.tsx`
- **依賴**：[004 index](./004-detail-pages.md)
- **Figma 對應**：IMG_4883
- **Backend endpoint**：`GET /v1/donation/donation-projects/:id`（spec 017）

---

## 1. 職責

呈現單一捐款專案完整資料，含主辦團體 cross-link + 完整專案內容。

---

## 2. Anatomy（對齊 IMG_4883）

```
┌─ TopNav: ← 捐款專案介紹 [分享 icon] ────┐  紅底
├─ Cover image（寬幅，aspect ~4:3）       │
├─ 白底 panel ──────────────────────────┤
│   - 專案標題（h1，重）                  │
│   - 勸募立案核准字號（小字 grey）        │
│   - 衛部救字號                           │
│   ┌─ 主辦團體卡片                       │  ← clickable
│   │   logo + 名稱 +「查看團體 ›」link   │  → /charities/{charityId}
│   └─                                    │
│   - Categories tag pills                │
├─ 專案內容（heading「專案內容」+ 長文）   │
├─ Sticky CTA：「立即捐款」               │  UI only
└────────────────────────────────────────┘
```

---

## 3. 資料流

```tsx
// src/app/donation-projects/[id]/page.tsx
export default async function Page({ params }) {
  const { id } = await params
  const data = await fetchDonationProjectDetail(id)
  if (!data) notFound()
  return <DonationProjectDetail project={data} />
}
```

`DonationProjectDetail` schema 含 nested `charity`（spec 004 §5）：

```ts
{
  id, name, description, content,
  coverImageUrl?,
  raisingApprovalNo?, reliefApprovalNo?,
  charity: { id, name, logoUrl? },
  categories: CategoryKey[],
}
```

> 用 nested embed 避免 N+1（前端不再多打一次 `/v1/donation/charities/:charityId`）。Backend spec 017 對應提供。

---

## 4. 元件結構

| 區塊 | 元件 |
|---|---|
| TopNav | [003b](./003b-topnav.md)，accessory = 分享 icon |
| Cover | `<FallbackImage primary={coverImageUrl} fallback={pickFallbackImage('donation', id)} alt={name} className="w-full aspect-[4/3] object-cover" />`；缺 / onError → picsum（[003e4 §4](./003e4-image-fallback.md#4-使用方式card-整合)） |
| Title block | `<h1>` + 字號（grey） |
| 主辦團體 card | `<CharityChip charity />` — logo（[`<CharityLogo>`](./003e4-image-fallback.md#43-charity-logo初始字塊-fallback--charitylogo)：缺/onError → `getCharityInitial(name)` 首字塊）+ 名稱 + 「查看團體 ›」`<Link href={`/charities/${charity.id}`} replace>` ([§lateral nav 規則 004 §3.1](./004-detail-pages.md#31-橫向關聯導航策略v02-新增)) |
| Categories tags | `<CategoryTags categories />` |
| 專案內容 | `<section><h2>專案內容</h2><div className="prose">{content}</div></section>` |
| Sticky CTA | `<StickyCta label="立即捐款" />` |

---

## 5. 邊界

- coverImageUrl 缺 / 載入失敗 → Picsum 真照片（與列表 [003e2](./003e2-donation-project-card.md) 共用 [003e4](./003e4-image-fallback.md) `FallbackImage`，seed = `donation-<id>`，640×360）
- approvalNo 任一缺 → 該行不渲染
- content 為空字串 → 不渲染「專案內容」section（但通常 backend 會保證有）
- categories 空 → tag 區不渲染

---

## 6. 測試

- 404 → not-found
- 缺 raisingApprovalNo → 該行不出現
- 點主辦團體 chip → 跳 `/charities/:id`
- CTA only `console.log`
- coverImageUrl onError → 切到 picsum URL（同列表卡片行為）
