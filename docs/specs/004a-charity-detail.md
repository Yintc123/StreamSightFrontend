# Spec 004a：公益團體介紹頁

- **狀態**：Draft（v0.2 — Figma IMG_4881 對齊：CTA 進卡、Related 改真 card 列表、Description 加展開、TopNav 補 share）
- **路由**：`/charities/:id`
- **路徑**：
  - `src/app/charities/[id]/page.tsx`（RSC）
  - `src/app/charities/[id]/RelatedProjects.tsx`（async RSC，v0.2）
  - `src/components/ui/ExpandableText.tsx` + `.test.tsx`（v0.2）
  - `src/components/ui/ShareIconButton.tsx`（v0.2，UI only）
  - `src/lib/api/getRelated.ts`（v0.2，RSC fetcher）
- **依賴**：[004 index](./004-detail-pages.md)、[003e2 DonationProjectCard](./003e2-donation-project-card.md)（cross-link 區重用）、[003b TopNav](./003b-topnav.md) v0.3 含 `accessory` slot
- **Figma 對應**：IMG_4881（v0.2 修正：v0.1 寫 IMG_4876 是錯的）
- **Backend endpoints**：
  - `GET /v1/donation/charities/:id`（spec 017，charity detail）
  - `GET /v1/donation/donation-projects?charityId=:id&limit=10`（spec 016 v0.5，donation list with charityId filter）

---

## 1. 職責

呈現單一公益團體完整資料 + 該團體底下捐款專案的 cross-link 列表。

---

## 2. Anatomy（對齊 IMG_4881）

```
┌─ TopNav: ← 公益團體介紹              [📤 share] ┐  紅底
├─ 紅底 hero：                                    │  紅底延伸
│   - logo 圓形 96×96（白底圓框）                │
│   - 團體名稱（白字置中，h1）                    │
├─ 白色 panel（rounded-2xl, -mt-6 覆蓋 hero 底）┐
│   ┌─ 基本資料                                   │
│   │   - 聯絡電話：02-66040024  (tel:)           │
│   │   - 聯絡信箱：serv.accofroc@...  (mailto:)  │
│   │   - 官方網站：https://accofroc.org (外連)   │
│   │   - 核准字號：台內團字第111...號             │
│   │── 簡介（line-clamp-3 + 「更多」展開）       │  ← ExpandableText
│   │── Categories tag pills（兒少照護 弱勢扶貧 身障）│
│   └─ 「直接捐款給團體」CTA 紅色 pill 按鈕       │  ← v0.2 從 sticky 改 in-card
└────────────────────────────────────────────────┘
│ 捐款專案 section                                │  cross-link 區
│ ┌─ <DonationProjectCard> 垂直列出（最多 10 筆） │  ← v0.2 真實 cards
│ └─ 0 筆 → 整段不渲染                            │
└────────────────────────────────────────────────┘
```

> **v0.1 vs v0.2 結構差異**：v0.1 的「Sticky CTA bar 紅底全寬」（`fixed inset-x-0 bottom-0`）改為**卡內 pill 按鈕**，符合 IMG_4881 — 整張白色 panel 內含 CTA。**捐款專案區**從「文字 + 一個 link」改為**真實 card 列表**。

---

## 3. 資料流

```tsx
// src/app/charities/[id]/page.tsx
export default async function Page({ params }) {
  const { id } = await params
  const charity = await fetchCharityDetail(id)     // BFF → backend (spec 004 §3)
  if (!charity) notFound()
  return (
    <div>
      <TopNav title="公益團體介紹" accessory={<ShareIconButton />} />
      <Hero ... />
      <div className="panel">
        <ContactInfo ... />
        <ExpandableText text={charity.description} />
        <CategoryTags ... />
        <DirectDonateCta />                         // in-card 直接 render
      </div>
      <RelatedProjects charityId={charity.id} />    // async RSC，自己 await
    </div>
  )
}
```

```tsx
// src/app/charities/[id]/RelatedProjects.tsx (async RSC)
export async function RelatedProjects({ charityId }) {
  const donations = await fetchDonationsByCharity(charityId)  // src/lib/api/getRelated.ts
  if (donations.length === 0) return null
  return (
    <section>
      <h2>捐款專案</h2>
      <div className="flex flex-col gap-3">
        {donations.map(d => <DonationProjectCard key={d.id} item={d} />)}
      </div>
    </section>
  )
}
```

`fetchDonationsByCharity`：直接 `backendFetch('/v1/donation/donation-projects', { query: { charityId, limit: 10 }})`、重用既有 `BackendDonationListItem` schema + `toClientDonation` mapper，**不**經 BFF route。對齊 `fetchCharityDetail` 同套路。

> **平行 fetch**：目前 `charity = await fetchCharityDetail(id)` 再 `<RelatedProjects>` 內部 await 另一個 fetcher — 是 sequential（嚴格說有兩段 waterfall）。優化方案是把兩個 fetch 提到 page 頂層 `Promise.all`，但這需要 props drill 或 Suspense；本 v0.2 不做（demo 場景對 ~100ms 額外延遲不敏感）。

---

## 4. 元件結構

| 區塊 | 元件 | 備註 |
|---|---|---|
| TopNav | [003b TopNav](./003b-topnav.md) v0.3 | 標題「公益團體介紹」，accessory = `<ShareIconButton />`（UI only） |
| Hero | inline 在 page.tsx | logo（CharityLogo 模式：有則 img、無則初字塊）+ h1 |
| 基本資料 | inline `<ContactInfo>` | server only 純展示，tel/mailto/外連；任一欄缺 → 該行不渲染；全缺 → 整 section 不渲染 |
| 簡介 + 更多 | `<ExpandableText>` v0.2 | `'use client'`；text 長度 > threshold (default 100) 顯示「更多」/「收起」toggle；短文不渲染按鈕 |
| Categories tags | inline `<CategoryTags>` | tag pills（charity 不用 heart icon，跟 [003e2 donation chip](./003e2-donation-project-card.md#3-anatomy) 不同） |
| In-card CTA | inline `<DirectDonateCta>` v0.2 | `<button>` UI only 不導向；不再 sticky |
| Cross-link 區 | `<RelatedProjects charityId>` v0.2 | async RSC fetch + map `<DonationProjectCard>` |

---

## 5. 邊界

- 任一聯絡欄位 optional：缺 → 該行不渲染
- 全部聯絡欄位都缺 → 「基本資料」section 整段不渲染
- 簡介 ≤ threshold（預設 100 字）→ 不顯示「更多」按鈕（[ExpandableText §3](../../src/components/ui/ExpandableText.tsx) 規格）
- categories 為空陣列 → 不渲染 tag 區
- Related 0 筆 → 該區整段不渲染（無「沒有專案」空狀態）
- backend 404 → `notFound()` → Next 404 page

---

## 6. 測試

### 6.1 ExpandableText（colocated `ExpandableText.test.tsx`）

| # | 案例 | 期望 |
|---|---|---|
| 1 | text < threshold | 只渲染文字、無按鈕 |
| 2 | text > threshold | 渲染按鈕「更多」、預設 collapsed |
| 3 | 預設 line-clamp-3 | `<p>` 含 line-clamp-3 class |
| 4 | 點「更多」展開 | line-clamp 拿掉、按鈕變「收起」 |
| 5 | 點「收起」收回 | 按鈕變回「更多」 |
| 6 | text === threshold | 不顯示按鈕（嚴格大於） |
| 7 | 預設 threshold = 100 | OK |

### 6.2 charity detail page（既有 e2e + 待補）

- ✅ Server fetch 404 → 顯示 `not-found.tsx`
- ✅ 缺 contactEmail → 該行不出現
- 🆕 描述短 → 「更多」不出現
- 🆕 描述長 + 點「更多」→ 顯示完整簡介
- ✅ 點 tel/mailto/website → 對應 protocol
- ✅ CTA 按鈕只 UI 不導向
- 🆕 Related 0 筆 → cross-link 區不渲染
- 🆕 Related N 筆 → 渲染 N 張 `<DonationProjectCard>`
- 🆕 ShareIconButton 出現在 TopNav 右側 + aria-label="分享"

> e2e 部分需 backend mock dispatcher 或 page.route() 提供穩定的 charity 與其 related donation。本 v0.2 沒新增 e2e，已用 live backend manual smoke 驗過。

---

## 7. 開放問題

- **CTA 在 sticky 還是 in-card**：IMG_4881 是 in-card；v0.2 跟設計走。若使用者測試後反映「捲很長才看到捐款按鈕」，可改回 sticky 或加「滑到底再黏底」混合策略
- **Related cards 排列**：v0.2 vertical stack；spec v0.1 寫「horizontal scroll」但 IMG_4881 看不太出來。橫向 scroll 對行動裝置 UX 不佳，目前先 vertical；之後設計確認再調
- **share icon 功能**：UI only，點擊 `console.log`。實作需決定 web share API（`navigator.share`）vs 自製分享 menu，目前無設計
- **平行 fetch 優化**：charity + related 兩段 await sequential；可重構為 Promise.all 或 Suspense streaming，但對 demo 不關鍵
- **Related 翻頁**：v0.2 fetch limit=10，沒有「看更多」按鈕；超過 10 筆團體無法看完所有專案。要的話可加「跳到 `/donation?tab=donation&charityId=...`」link（charity filter 還沒實作於 list 頁，scope 外）

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-14 | 初版：Figma 對應誤標 IMG_4876；CTA sticky；Related 只放 text + link |
| 0.2 | 2026-06-15 | 對齊 IMG_4881：(1) TopNav 加 `<ShareIconButton>` accessory；(2) 描述用 `<ExpandableText>`（line-clamp-3 + 更多 toggle、7 個 test case）；(3) CTA 從 sticky 改 **in-card**（白色 panel 底部紅色 pill 按鈕）；(4) 「捐款專案」cross-link 區改 async RSC `<RelatedProjects>`，呼叫新 `fetchDonationsByCharity` 並渲染 `<DonationProjectCard>` 列表；(5) 修正 Figma 對應為 IMG_4881。新檔：`ExpandableText.tsx`、`ShareIconButton.tsx`、`getRelated.ts`、`RelatedProjects.tsx` |
