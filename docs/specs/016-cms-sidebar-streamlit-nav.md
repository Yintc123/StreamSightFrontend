# Spec 016 — CMS 兩層導覽（頂部系統切換 + 左欄功能）+ Streamlit 整合

狀態：**已實作（2026-07-19）**（v0.4.1）

CMS 採**兩層導覽**：**頂部列**切換「系統」（管理後台 CMS ⇄ 資料平台 Streamlit），
**左欄**只顯示**當前系統**的功能。跨系統唯一共用的 chrome 是那條**扁平頂部列**，
容易在 Next.js / Streamlit 兩端對齊；各 App 的左欄各自獨立、互不對色。

> 兩端共用同一 ALB（見 [spec 015](./015-streamlit-auth-bridge.md) 與 terraform `ecs.tf`）；
> 本規格只處理**前端導覽入口**，不涉認證橋接（認證已由 015 完成）。

> 本功能屬 [spec 013b](./013b-admin-management-ui.md) §1 導覽殼層的演進；013b 的 super_admin
> 入口可見性契約**原封保留**。

> **架構沿革**：v0.1–0.3 曾實作「單一左側欄 + 5 個 Streamlit 頁外部連結」；因**跨框架對齊左欄成本高**
> 且進入 Streamlit 後 CMS 左欄本就消失，v0.4 改為**兩層導覽**——把跨系統切換上移到扁平頂部列，
> 左欄退回「只放本系統功能」。詳見 §8 D9 與變更紀錄。

---

## 1. 背景與目標

- **痛點**：左欄是重型 chrome（hover / active / 間距 / 圖示），跨框架（Next.js ↔ Streamlit）
  對齊成本高、易失同步；且點進 Streamlit 後 CMS 左欄消失，維護「兩套假裝一樣的左欄」很脆弱。
- **目標**：
  1. **頂部列**＝系統切換層：`管理後台`（/cms）、`資料平台`（Streamlit）。唯一跨系統共用、易對齊。
  2. **左欄**＝當前系統功能：CMS 只留 `管理員管理` / `設定`；Streamlit 的 5 頁由 **Streamlit 自身左欄**呈現。
  3. `user / 主題切換 / 登出` 移至頂部列右側（跨系統一致）。

## 2. 範圍

### 2.1 在範圍內（本期：Next.js 端）
- 新增 `CmsTopBar.tsx`：品牌 + 系統切換（管理後台 / 資料平台）+ user / `ThemeToggle` / 登出。
- 新增 `CmsSideNav.tsx`：左欄，只含 `管理員管理`（super_admin）/ `設定`。
- `cms/layout.tsx`：改為「頂部列 + （左欄 + 內容）」的欄→列巢狀版面。
- `config.ts`：選填環境變數 `STREAMLIT_BASE_URL`（沿用）。
- `cms/page.tsx`：landing 文案改述兩層導覽。
- `.env.example` / `.env.local`：記錄 / 設定 `STREAMLIT_BASE_URL`。
- **移除** `CmsNav.tsx`（單一左欄 + 5 連結的舊模型）及其測試。

### 2.2 不在範圍內
- **Streamlit 端頂部列**（讓 Streamlit 也長出同一條系統切換列，回連 `管理後台`）：**本期未做**，見 OQ-6。
- **不**在 Next.js 重建 Streamlit 任一頁面。
- **不**改認證 / session / CSRF / 登出邏輯（登出流程原封搬移至 `CmsTopBar`）。
- RWD（行動版收合）本期不做，見 OQ-2。

---

## 3. 導覽規格

### 3.1 頂部列（系統切換）

| 標籤 | 類型 | 目的地 | active 判定 |
|---|---|---|---|
| StreamSight（品牌） | 內部 `next/link` | `/cms` | 品牌 chrome，不套 active 樣式（純文字 logo） |
| 管理後台 | 內部 `next/link` | `/cms` | `pathname` 為 `/cms` 或 `/cms/*` → active（brand 底強調） |
| 資料平台 | 外部 `<a>` | `STREAMLIT_BASE_URL`（Streamlit 根） | 外部連結，於 Next.js 端恆非 active（OQ-4） |

- 左起：品牌 logo（`StreamSight`）→ 系統切換（管理後台 / 資料平台）；右側 `ml-auto`：`user 名稱`、`ThemeToggle`、`登出`。
- **頂部列項目尺寸**（系統 tab 與登出鈕，屬橫向頂部列，**與左欄 §4.2 尺寸不同**）：
  `rounded-lg px-3 h-8 inline-flex items-center text-sm font-medium`。
- **active 態**：系統 tab 為 `bg-brand-overlay text-brand`（凸顯「哪個系統」）；**inactive / 登出鈕**走中性 `hover:bg-nav-hover`（hover 填色、文字色不變，同 §4.2 互動語言）。
- **資料平台只連 Streamlit 首頁**（單一入口）；Streamlit 的 5 頁不在 CMS 列出，改由 Streamlit 自身左欄。

### 3.2 左欄（當前系統功能）

| 標籤 | 目的地 | 可見性 |
|---|---|---|
| 管理員管理 | `/cms/admins` | **僅 `adminRole==='super_admin'`** |
| 設定 | `/cms/settings` | 所有已登入 admin |

- 項目樣式沿用 §4.2 的 Streamlit 對齊值（hover 填色、`px-2 h-7 rounded-lg gap-2 text-base`、active 粗體）。

### 3.3 可見性契約（沿用 013b §1）

- `管理員管理` 只在 `super_admin` 顯示——**UX affordance only**；真正邊界仍是 `/cms/admins` 上的
  `requireSuperAdminSession()`（[013a §2](./013a-admin-management-logic.md)）。

### 3.4 資料平台 href 組法

`streamlitHref(base)`＝去尾斜線後回 `base`；`base` 為空 → 回 `'/'`（同源根相對退回，適用兩端同源部署）。

> 附記：Streamlit 各頁 url path（`st.navigation` 檔名 stem：`data_management` / `realtime_monitor` /
> `analytics` / `admin`）現由 **Streamlit 自身左欄**處理，CMS 不再組這些路徑（v0.4 起）。

---

## 4. 版面

```
┌─────────────────────────────────────────────┐
│ StreamSight  [管理後台][資料平台]  Alice 🌓 登出 │ ← CmsTopBar（h-12，系統切換）
├──────────┬──────────────────────────────────┤
│ 管理員管理 │                                 │
│ 設定      │        {children}               │ ← CmsSideNav（w-56）＋ 內容區（flex-1）
│          │                                  │
└──────────┴──────────────────────────────────┘
```

- `cms/layout.tsx`：`min-h-dvh bg-surface-page flex flex-col` → 內含 `CmsTopBar` + `flex-1 min-h-0 flex`（列）。
- 列內：`CmsSideNav`（`w-56 shrink-0 border-r`）+ `flex-1 min-w-0 flex flex-col`（包 `{children}`）。
- 頂部列 `header`：`h-12 border-b bg-surface-card`，右側 chrome 以 `ml-auto` 靠右。
- 樣式沿用語義 token（`brand`/`brand-overlay`/`nav-hover`/`nav-active`/`ink-*`/`surface-*`/`line`），不寫 hex。

### 4.1 背景配色與 Streamlit 一致（淺色模式）

> **決策（2026-07-18）**：前端**深色為預設**（觀測台品牌識別，不動）；**只把淺色模式**
> （`[data-theme="light"]`）調色盤對齊 Streamlit。色值落在 `globals.css`，明細見 [spec 014b §5](./014b-theme-ui.md)。

| 用途 | Streamlit（固定淺色） | 前端 淺色（對齊後） |
|---|---|---|
| 主內容背景 `surface-page` | `#ffffff` | `#ffffff` ✅ |
| 側欄 / 卡片 `surface-card` | `#f1f5f9` | `#f1f5f9` ✅ |
| 文字 `ink-AAA` | `#0f172a` | `#0f172a` ✅ |
| 主色 `brand` | `#2563eb` | `#2563eb` ✅ |

- 同時修正原淺色「側欄白 / 內容灰」與 Streamlit「側欄灰 / 內容白」**明暗對調**的問題。
- **深色維持不變**：Streamlit 無深色主題，深色時兩端不對齊為預期（OQ-5）。

### 4.2 nav 項目 hover 特效與尺寸（對齊 Streamlit）

> **來源**：以 Playwright 實測 Streamlit（`localhost:8501`）`[data-testid="stSidebarNav"] a` computed style（2026-07-18）。

| 屬性 | Streamlit 值 | 對應 Tailwind |
|---|---|---|
| padding / height / radius / gap / font | `0 8px` / `28px` / `8px` / `8px` / `16px` | `px-2 h-7 rounded-lg gap-2 text-base` |
| font-weight（inactive / active）| `400` / `600` | `font-normal` / `font-semibold` |
| **hover 背景（inactive）** | **`rgba(141,173,206,.15)`**（文字色不變） | `hover:bg-nav-hover` |
| active 背景 / 文字 | `rgba(141,173,206,.25)` / `#0f172a` | `bg-nav-active` / `text-ink-AAA` |

**關鍵行為**：Streamlit hover ＝**加背景填色、文字不變**（前端原為文字變色、無背景，已改齊）。

**新增 token（`globals.css`）**：

| Token | dark（預設） | light（= Streamlit） |
|---|---|---|
| `--color-nav-hover` | `rgba(230,237,246,.08)` | `rgba(141,173,206,.15)` |
| `--color-nav-active` | `rgba(230,237,246,.14)` | `rgba(141,173,206,.25)` |

- `@theme` 定 dark base、`[data-theme="light"]` 覆寫（同 D4 架構）；產生 `bg-nav-hover`/`hover:bg-nav-hover`/`bg-nav-active`（Tailwind v4 編譯驗證）。
- **上表尺寸（`px-2 h-7 text-base`）僅適用 `CmsSideNav` 左欄項目**（量自 Streamlit sidebar）。
- **「互動語言」＝ hover 填色、文字色不變**——此**行為**由 `CmsSideNav` 項目、`CmsTopBar` 系統 tab（inactive）與登出鈕共用；
  但 `CmsTopBar` 屬橫向頂部列，**尺寸另為 `px-3 h-8 text-sm`（見 §3.1），不套上表左欄尺寸**。
- **深色**無 Streamlit 對照，採等效中性淺色 overlay，維持「hover 填色、文字不變」的一致行為。

---

## 5. 設定（env）

| 變數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `STREAMLIT_BASE_URL` | URL 字串 | 否 | Streamlit app base URL（頂部「資料平台」目的地）。**留空**→ 退回根相對 `'/'`（同源部署）。 |

- `config.ts`：`z.string().url().optional()`——提供則須為合法 URL（fail-fast）。
- **server-only**：由 RSC `cms/layout.tsx` 讀取後**當 prop 傳入** client `CmsTopBar`，**不需** `NEXT_PUBLIC_`。
- Local：`.env.local` = `http://localhost:8501`（改後需重啟 dev server）。

---

## 6. 跨檔契約

1. **`CmsTopBar` prop**：`{ name: string; streamlitBaseUrl: string }`（後者可為空字串）。
2. **`CmsSideNav` prop**：`{ adminRole?: AdminRole }`；`管理員管理` gating 與 013b 一致。
3. **`cms/layout.tsx`**（RSC）：取 session → 傳 `name` / `streamlitBaseUrl` 給 TopBar、`adminRole` 給 SideNav。

---

## 7. TDD / 測試

強制 TDD（導覽邏輯屬邏輯類，不豁免）。紅 → 綠 → 重構。

- **`config.test.ts`（+2）**：`STREAMLIT_BASE_URL` 選填 / 非法 URL throw。
- **`CmsSideNav.test.tsx`（+3）**：super_admin 顯示 `管理員管理`→`/cms/admins` + `設定`→`/cms/settings`；非 super_admin 隱藏前者；**不含** Streamlit 頁連結。
- **`CmsTopBar.test.tsx`（+8）**：`管理後台`→`/cms`、`資料平台`→`streamlitBaseUrl`、空值退回 `'/'`、顯示 user 名稱；登出流程 4 案（取 CSRF → POST logout → push('/')、例外 / 非 2xx → toast.error）。
- **迴歸**：全套件 `pnpm test` 綠（560 passed）、`pnpm lint`、`pnpm typecheck` 皆過。
- **未覆蓋**：兩層導覽**純視覺**未加 Playwright e2e（OQ-3）。

---

## 8. 決策總表

| 決策 | 內容 | 出處 |
|---|---|---|
| D1 版面 | **兩層導覽**：頂部列（系統切換）+ 左欄（本系統功能）+ 內容區 | §3 / §4 |
| D2 Streamlit 入口 | 頂部「資料平台」**單一外部連結**指向 Streamlit 首頁；5 頁由 Streamlit 自身左欄呈現（v0.4 起，取代舊「5 連結列於 CMS 左欄」） | §3.1 |
| D3 URL 來源 | server-only `STREAMLIT_BASE_URL` → layout 讀取 → prop 傳入 client `CmsTopBar`（免 `NEXT_PUBLIC_`） | §5 / §6 |
| D4 空值退回 | `STREAMLIT_BASE_URL` 留空 → `'/'`（同源部署） | §3.4 / §5 |
| D5 可見性 | `管理員管理` 保留 super_admin gating | §3.3 |
| D6 user chrome | `user / 主題 / 登出` 置頂部列右側（跨系統一致） | §3.1 |
| D7 背景配色 | 淺色調色盤對齊 Streamlit（`#ffffff`/`#f1f5f9`/`#0f172a`/`#2563eb`）；深色不變 | §4.1 |
| D8 nav 互動 | hover / active＝**背景填色、文字色不變**；尺寸對齊 Streamlit 實測；`--color-nav-hover/active` token | §4.2 |
| D9 為何兩層而非同步左欄 | 左欄跨框架對齊成本高、進 Streamlit 後即消失；改以**扁平頂部列**當唯一共用 chrome（易對齊），左欄各自獨立 | §1 |

---

## 9. 變更檔案清單

| 檔案 | 變更 |
|---|---|
| `src/lib/config.ts` / `config.test.ts` | `STREAMLIT_BASE_URL`（optional URL）+2 測試 |
| `src/app/cms/CmsTopBar.tsx`（新）/ `CmsTopBar.test.tsx`（新，+8） | 頂部列：系統切換 + user/主題/登出 |
| `src/app/cms/CmsSideNav.tsx`（新）/ `CmsSideNav.test.tsx`（新，+3） | 左欄：管理員管理 / 設定 |
| `src/app/cms/CmsNav.tsx` / `CmsNav.test.tsx` | **移除**（舊單一左欄 + 5 連結模型） |
| `src/app/cms/layout.tsx` | 頂部列 + （左欄 + 內容）巢狀版面；傳 props |
| `src/app/cms/page.tsx` | landing 文案改述兩層導覽 |
| `src/app/globals.css` | 淺色調色盤對齊 Streamlit（§4.1 / 014b §5）；`--color-nav-hover/active` token（§4.2） |
| `.env.example` / `.env.local` | `STREAMLIT_BASE_URL` |

---

## 10. Open Questions

- **OQ-2（RWD / 行動版）**：頂部列 + `w-56` 左欄未做窄螢幕收合 / 漢堡；未來可加。
- **OQ-3（e2e）**：兩層導覽視覺未有 Playwright 覆蓋；如列為關鍵畫面可補。
- **OQ-4（active 態 for 外部連結）**：`資料平台` 於 Next.js 端無法得知是否停留 Streamlit，恆非 active；可接受。
- **OQ-5（深色一致性）**：Streamlit 無深色主題；前端深色時與 Streamlit 不對齊為預期。
- **OQ-6（Streamlit 端頂部列）**：本期只做 Next.js 端；需在 Streamlit 注入**同一條系統切換列**（回連 `管理後台`）才算雙向完整。屬跨 repo，另行處理。

---

## 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-07-18 | 初版：CMS 頂欄改**左側側邊欄**；掛入 5 個 Streamlit 外部連結；server-only `STREAMLIT_BASE_URL`；super_admin gating 沿用 013b。config +2、CmsNav +6 測試。 |
| 0.2 | 2026-07-18 | +§4.1 背景配色對齊 Streamlit（僅淺色）：`globals.css` 採 Streamlit 精確色值，修正側欄/內容明暗對調。細節見 [014b §5](./014b-theme-ui.md)。 |
| 0.3 | 2026-07-18 | +§4.2 nav hover/尺寸對齊 Streamlit（Playwright 實測）：hover/active 改**背景填色、文字不變**；`--color-nav-hover/active` token。+D7/D8。 |
| 0.4 | 2026-07-19 | **架構轉向：兩層導覽**。頂部列切換系統（管理後台 / 資料平台）、左欄只放本系統功能；`CmsNav`（單一左欄 + 5 連結）**拆為** `CmsTopBar` + `CmsSideNav` 並移除；資料平台改**單一連結**（5 頁歸 Streamlit 自身左欄）；user/主題/登出上移頂部列。測試改 CmsSideNav +3 / CmsTopBar +8（取代 CmsNav +6），全套件 560 綠。+D6/D9、+OQ-6；移除已不適用的 OQ-1（5 頁 path）。本期僅 Next.js 端（Streamlit 端頂部列見 OQ-6）。 |
| 0.4.1 | 2026-07-19 | 文件對齊修訂（實作/規格核對後）：§3.1 補**品牌連結列**與**頂部列項目尺寸**（`px-3 h-8 text-sm font-medium`）；§4.2 釐清「互動語言」僅指 **hover 填色行為**，上表尺寸（`px-2 h-7 text-base`）僅適用 `CmsSideNav` 左欄、頂部列尺寸另屬 §3.1。無程式碼變更。 |

---

最後更新：2026-07-19（v0.4.1，標記已實作；文件對齊修訂：頂部列尺寸/品牌列、§4.2 措辭釐清）
