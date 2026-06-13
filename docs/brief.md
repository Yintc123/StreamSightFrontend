# 作業需求書

來源：Figma 設計稿《2026 全端面試作業 - web》
File key：`0kx2Ne2rvndhfVr3uVUwad`

---

## 1. 作業需求（原文）

### 🧰 開發限制
- 前端：React or NextJS
- 後端：NodeJS（Express 或 Fastify）
- 全程 TypeScript

### ✅ 功能需求

**前端**
1. 完成「捐款項目列表」刻板（依 Figma 設計）
2. 實現**無限滾動**載入更多卡片
3. **搜尋框關鍵字搜尋**
4. 不確定實作方式可參考「街口 App > 公益捐款項目 > 搜尋」

**後端**
1. 依畫面想像自定義 API Spec
2. 實作 API（列表、分頁查詢） — 可用 Mock Data

### ⭐ 加分項
1. 使用 TailwindCSS
2. 使用 TypeORM 或 Prisma
3. Auto Testing（unit / e2e）
4. 自由發揮
5. 建立 Database，存放設計好的 Mock Data
6. 使用 ORM 操作 SQL

### 📤 繳交方式
1. 信件附 GitHub 連結
2. **必附 demo 連結** ✅
3. 七天內繳交

> 盡情展現最擅長的部分，若因時間關係無法完善不會扣分。

### 🤖 AI 使用要求
- README 加 `## AI 使用聲明`（工具 / AI 範圍 / 我負責範圍）
- `/docs/decisions/` 至少 3 個 ADR
- `/docs/prompts/` 或 README 內 2–3 個代表性 Prompt 紀錄

---

## 2. 設計畫面盤點

設計寬度 **375px（iPhone X）** → 行動裝置優先設計。
2026-06-14 收到截圖補件（`docs/images/IMG_4875-4883.PNG`），畫面數量與規格從原 Figma 4 frame 擴展。

### 2.1 列表頁（3 個 tab，1 個共用 modal）

| # | 畫面 | 狀態 | 對應截圖 |
|---|---|---|---|
| 1 | 公益團體列表 | active | IMG_4875、IMG_4881 |
| 2 | 捐款專案列表 | active（補件） | IMG_4880、IMG_4879 |
| 3 | 義賣商品列表 | active（補件） | IMG_4877 |
| 4 | 類別選擇 modal（bottom-sheet）| active（補件） | IMG_4879、IMG_4881 |
| 5 | 搜尋 - No Result（沿用 v0.1） | 推測 | Figma frame |

### 2.2 詳情頁（3 個，**2026-06-14 補件後從 out-of-scope 移入範圍內**）

| # | 畫面 | 對應截圖 | 入口 |
|---|---|---|---|
| 6 | 公益團體介紹 | IMG_4876 | 公益團體卡片點擊 |
| 7 | 捐款專案介紹 | IMG_4883 | 捐款專案卡片點擊 |
| 8 | 義賣商品介紹 | IMG_4882 | 義賣商品卡片點擊 |

詳細規格見 [frontend spec 004 系列](./specs/004-detail-pages.md) 與 [backend spec 017](../../backend/docs/specs/017-detail-apis.md)。

### 2.3 共同元素

- 上方：iOS Status Bar + 自訂 Navigation Bar（紅底）
  - 列表頁：返回 + 標題「所有捐款項目」+ 右側放大鏡 icon
  - 詳情頁：返回 + 標題（「公益團體介紹」/「捐款專案介紹」/「義賣商品介紹」）+ 右側「分享」icon（作業範圍外不接功能）
- 底部品牌 marker：`── 愛心沒有底線 ──`

### 2.4 列表頁元素

- Tabs：`公益團體` / `捐款專案` / `義賣商品`（**三個 tab 皆需實作**列表 + 搜尋 + 無限滾動）
- Filter：`全部 ▼` pill 按鈕；點擊展開 **bottom-sheet modal**（IMG_4879/4881），含 16 個 category + 「全部」共 17 項，3 欄 grid，右上 X 關閉
  - 選中態：紅框 outline（IMG_4879 中「全部」option）
- Search bar
- Card 形態 **per-tab 不同**（先前 spec v0.5 推測「三 tab 同 shape」**錯誤**，補件後修正）：
  - 公益團體：小 logo + 名稱 + 簡介（row 排版） — IMG_4875
  - 捐款專案：**大 cover image（top）+ 主辦團體名 + 標題 + 描述 + categories tags** — IMG_4880
  - 義賣商品：**商品圖（top）+「公益義賣」絲帶 banner + 商品名 + 主辦團體 + TWD 價格** — IMG_4877

### 2.5 詳情頁元素

- 公益團體介紹（IMG_4876）：紅底 hero（logo + 名稱）+ 白底卡片：基本資料（聯絡電話 / 聯絡信箱 / 官方網站 / 核准字號）+ 簡介（含「更多」展開）+ categories tags + **「直接捐款給團體」CTA**；下方有「捐款專案」cross-link 區（該團體底下的專案卡片）
- 捐款專案介紹（IMG_4883）：cover image + 標題 + 勸募立案核准字號 + 衛部救字號 + **主辦團體卡片（含「查看團體」連結）** + categories tags + 專案內容 + **「立即捐款」CTA**（sticky）
- 義賣商品介紹（IMG_4882）：商品 cover + 「公益義賣 SHOP FOR CHANGE」絲帶 + 商品名 + **TWD 價格** + 勸募立案核准字號 + 衛部救字號 + 主辦團體卡片 + categories tags + 商品說明 + **「立即捐款」CTA**

### 2.6 Category 清單（16 項，2026-06-14 截圖揭露）

對齊 IMG_4879 / IMG_4881 模態：

| 順序 | displayName | 暫定 key |
|---|---|---|
| 1 | 兒少照護 | `child_care` |
| 2 | 動物保護 | `animal_protection` |
| 3 | 特殊醫病 | `special_medical` |
| 4 | 老人照護 | `elderly_care` |
| 5 | 身心障礙服務 | `disability_service` |
| 6 | 婦女關懷 | `women_care` |
| 7 | 運動發展 | `sports_development` |
| 8 | 教育議題提倡 | `education_advocacy` |
| 9 | 環境保護 | `environmental_protection` |
| 10 | 多元族群 | `diversity` |
| 11 | 媒體傳播 | `media` |
| 12 | 公共議題 | `public_issue` |
| 13 | 文教藝術 | `arts_culture` |
| 14 | 社區發展 | `community_development` |
| 15 | 弱勢扶貧 | `poverty_relief` |
| 16 | 國際救援 | `international_aid` |

加上「全部」(null) 共 17 options。M:N 關聯設計（Charity ↔ Category 多對多、DonationProject / SaleItem 繼承主辦團體分類）保留不變 — 詳見 backend ADR 002 與 spec 015 / 016 v0.6。

---

## 3. 範圍與非範圍

**本次實作（v0.6 後）**
- 桌面 + 行動 RWD（以 375px 為設計基準，向上適配）
- **列表頁**（三個 tab：公益團體 / 捐款專案 / 義賣商品） — 各自列表、搜尋、無限滾動、無結果空狀態
  - **三 tab 卡片 layout 不同**（補件後修正，見 §2.4）— 對應前端 003e 系列三個 card component
- **詳情頁**（3 個，v0.6 補件後移入範圍） — 公益團體 / 捐款專案 / 義賣商品介紹（IMG_4876 / 4883 / 4882）
  - 路由：`/charities/:id` / `/donation-projects/:id` / `/sale-items/:id`
  - 詳細規格：[frontend spec 004 系列](./specs/004-detail-pages.md)
- **無限滾動規格**：每個 tab 一開始抓 10 筆；scroll bar 距底剩 5%–10% 觸發再向 backend 要 10 筆
- **Tab 切換**：URL `?tab=charity|donation|item` 同步，refresh 保留；切到該 tab 才打網路（TanStack `enabled`），cache 保留
- **Category bottom-sheet modal**：17 options（16 + 全部），3 欄 grid；URL `?category=<key>` 同步

**非範圍**
- 真實金流、會員、捐款流程（詳情頁的「立即捐款」/「直接捐款給團體」CTA **只刻 UI 不接金流**）
- i18n、a11y 進階（基本語意 OK，不做完整 ARIA 審查）
- 詳情頁的「分享」icon button（Figma 有元素，作業範圍外不接功能）

**範圍內但設計缺失（需補設計或先用合理假設）**
- ~~「捐款專案」/「義賣商品」tab 的卡片欄位與排版~~ → ✅ 2026-06-14 截圖補件揭露（§2.4）
- ~~Filter dropdown 展開後的分類選項~~ → ✅ 2026-06-14 截圖揭露 16 + 1 = 17 options（§2.6）+ bottom-sheet modal 形態
- ~~詳情頁設計~~ → ✅ 2026-06-14 截圖補件揭露 3 個詳情頁（§2.5）
- 捐款專案的「狀態」（進行中 / 已結束 / 暫停）：截圖未明示，暫不處理
- 義賣商品庫存：截圖未明示，暫不處理
- 「核准字號」/「衛部救字號」的格式驗證：截圖僅示例（如「衛部救字第1151361613號」），暫接純字串

---

最後更新：2026-06-14（v0.6 — 補件 IMG_4875-4883 截圖：3 個詳情頁納入範圍、category 6 → 16 + bottom-sheet modal、三 tab 卡片 layout 差異化、新欄位（聯絡資訊、核准字號、price、coverImage、content）；v0.5 補 filter dropdown 分類規格(M:N + 子表繼承)；v0.4 修正「分享」→「紀錄」對齊 Figma；v0.3 補無限滾動 10 筆 / 5–10% 觸發 + tab URL sync + lazy fetch）
