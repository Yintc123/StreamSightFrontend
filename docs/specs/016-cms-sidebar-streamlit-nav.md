# Spec 016 — CMS 兩層導覽（頂部系統切換 + 左欄功能）+ Streamlit 整合

狀態：**已實作（2026-07-19）**（v0.5.1）

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
│ 設定      │        {children}               │ ← CmsSideNav（可調寬，預設 256）＋ 內容區（flex-1）
│          │                                  │
└──────────┴──────────────────────────────────┘
```

- `cms/layout.tsx`：`min-h-dvh bg-surface-page flex flex-col` → 內含 `CmsTopBar` + `flex-1 min-h-0 flex`（列）。
- 列內：`CmsSideNav`（`shrink-0`，**自管寬度 / 收合**，預設 256、無 border，見 §4.3）+ `flex-1 min-w-0 flex flex-col`（包 `{children}`）。
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
| padding / height / radius / gap | `0 8px` / `28px` / `8px` / `8px` | `px-2 h-7 rounded-lg gap-2` |
| 可見文字大小 | **14px**（`a` 為 16px，但 label 為項內 `span` 0.875rem —— v0.5.7 實測校正，v0.3 誤採 `a` 的 16px） | `text-sm` |
| 項左右內縮 / 項間距 | **23px**（ul x=23、w=210 @256）/ **6px**（v0.5.7 實測） | 容器 `px-3`(12) + 連結容器 `px-[11px]`(11)＝23；`gap-1.5` |
| font-weight（inactive / active）| `400` / `600` | `font-normal` / `font-semibold` |
| **hover 背景（inactive）** | **`rgba(141,173,206,.15)`**（文字色不變） | `hover:bg-nav-hover` |
| active 背景 / 文字 | `rgba(141,173,206,.25)` / `#0f172a` | `bg-nav-active` / `text-ink-AAA` |
| inactive 文字 | **`rgba(15,23,42,.8)`**（可見的 `span` 色；`a` 為 .66 —— v0.5.7 實測校正，原誤採 `a` 值＝`ink-AA`） | `text-nav-ink`（新 token） |
| 文字溢出 | `span` overflow hidden / ellipsis / nowrap | label 包 `span.truncate` |

**關鍵行為**：Streamlit hover ＝**加背景填色、文字不變**（前端原為文字變色、無背景，已改齊）。

**新增 token（`globals.css`）**：

| Token | dark（預設） | light（= Streamlit） |
|---|---|---|
| `--color-nav-hover` | `rgba(230,237,246,.08)` | `rgba(141,173,206,.15)` |
| `--color-nav-active` | `rgba(230,237,246,.14)` | `rgba(141,173,206,.25)` |
| `--color-nav-ink`（v0.5.7） | `rgba(230,237,246,.72)`（＝ink-AA，dark 無對照不變） | `rgba(15,23,42,.8)`（實測 span） |

- `@theme` 定 dark base、`[data-theme="light"]` 覆寫（同 D4 架構）；產生 `bg-nav-hover`/`hover:bg-nav-hover`/`bg-nav-active`（Tailwind v4 編譯驗證）。
- **上表尺寸（`px-2 h-7 text-base`）僅適用 `CmsSideNav` 左欄項目**（量自 Streamlit sidebar）。
- **「互動語言」＝ hover 填色、文字色不變**——此**行為**由 `CmsSideNav` 項目、`CmsTopBar` 系統 tab（inactive）與登出鈕共用；
  但 `CmsTopBar` 屬橫向頂部列，**尺寸另為 `px-3 h-8 text-sm`（見 §3.1），不套上表左欄尺寸**。
- **深色**無 Streamlit 對照，採等效中性淺色 overlay，維持「hover 填色、文字不變」的一致行為。

### 4.3 左欄可調寬 + 收合（對齊 Streamlit 側欄，v0.5）

> **需求**：對齊 Streamlit 左欄「右緣可拖曳調寬窄 + 一顆收放鈕」的操作手感。實作於 `CmsSideNav`
> 內部，`cms/layout.tsx` 不動（左欄自管寬度，內容區沿用 `flex-1` 自適應）。

> **來源**：以 Playwright 實測 Streamlit（`localhost:8501`）`section[data-testid="stSidebar"]` 及其
> resize handle / 收合鈕 computed style（2026-07-19）。下列尺寸與行為皆照實測值。

| 屬性 | Streamlit 實測 | 本實作 |
|---|---|---|
| 預設 / 最小 / 最大寬 | `256px` / `200px` / `600px` | 同（`SIDEBAR_DEFAULT/MIN/MAX_WIDTH`） |
| 邊框 | **無 border**（靠 `surface-card` vs `surface-page` 對比分隔） | 同（移除 `border-r`） |
| resize handle | `div` 8px 寬、`height:100%`、`right:-6px`（跨邊）、`cursor:col-resize`、`user-select:none`，內含一條 hover 才上色的細條 | `role="separator"` 8px hit 區、`-right-1` 跨邊、內 `w-px` hover/focus 顯示 `bg-brand` |
| 收合動畫 | `min/max-width→0` + `transform:translateX(-256px)`，`transition .3s` | **無動畫**（v0.5.2 依使用者偏好移除 transition，即時收合；此處刻意不對齊 Streamlit）；nav 轉 `aria-hidden`+`inert` |
| 收合鈕圖示 | Material Symbols Rounded `keyboard_double_arrow_left`，`DynamicIcon size="xl"` = **24px**（bundle 實查） | **官方 Material Symbols Rounded 24px 向量內嵌**（同 glyph、`w-6 h-6` 同 24px；v0.5.3） |
| 收合鈕位置 | **Playwright 實測（v0.5.5）**：鈕頂距側欄頂（＝其 48px 頂列下緣）**16px**、右緣內縮 **13px**（`max(gutter, 1.25rem−gutter)` 受 scrollbar gutter 抵扣，實測非 bundle 推算的 20px）；首個 nav 項起點 **92px** | header 列 `h-[3.75rem] items-center`（鈕頂 16px）+ 右內縮 `px-3`(12) + `mr-px`(1) = **13px**；header `mb-8` → nav 起點 60+32 = **92px**（v0.5.7 起連結另有獨立容器、nav 父層無 gap；v0.5.6 曾為 `mb-[30px]`+gap 補償） |
| 收合後控制 | 左上浮出 `stExpandSidebarButton`（`keyboard_double_arrow_right`，`size="xl"` 24px，鈕 28×28）：**Playwright 實測 (10, 8)**（相對頂列下緣） | 左上 `absolute left-2.5 top-2`＝**(10, 8)** 浮出展開鈕（同官方 24px 向量，鈕 `h-7 w-7` 28×28；v0.5.5） |

- **拖曳調寬**：右緣 8px 透明 `role="separator"`（`aria-orientation="vertical"`）hit 區，指標拖曳即時
  改寬（拖曳中 `transition:none`）；亦支援鍵盤 `←/→`（步進 16px，`aria-valuenow/min/max` 曝露現值）。
- **收合 / 展開**：側欄**常駐掛載**，收合＝寬度**即時**收到 0（無 transition，v0.5.2）並將 nav
  `aria-hidden`+`inert`（移出 a11y 樹、不可 focus）；左上浮出展開鈕。對齊 Streamlit「完全隱藏 +
  重開」（非收成 icon 軌）。
- **寬度界限**：`[200, 600]`，預設 `256`；`clampWidth` 夾住並取整、防 NaN。
- **持久化**：寬度 + 收合態存 `localStorage['cms.sidebar']`（`{ width, collapsed }`），跨重新整理 /
  跨分頁保留。以 `useSyncExternalStore`（非 `useEffect`+`setState`）讀取 → SSR 首繪用預設、
  避免 hydration mismatch 與 `react-hooks/set-state-in-effect`。
- **邏輯抽離**：`useSidebarPanel.ts`（`clampWidth` + hook）承載全部狀態邏輯，`CmsSideNav` 只綁
  拖曳 / 鍵盤 / 版面。屬**強制 TDD**（client 互動邏輯），紅→綠→重構。

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
- **`CmsSideNav.test.tsx`（+3；v0.5 +5＝8）**：super_admin 顯示 `管理員管理`→`/cms/admins` + `設定`→`/cms/settings`；非 super_admin 隱藏前者；**不含** Streamlit 頁連結。v0.5 增：收合→連結移出 a11y 樹 + 顯「展開側欄」鈕、展開還原、`localStorage` collapsed 掛載即收合、`separator` 預設 `aria-valuenow`、鍵盤 `←→` 調寬。
- **`useSidebarPanel.test.ts`（v0.5，+9）**：`clampWidth` 夾範圍 / 取整 / 防 NaN（4 案）；hook 預設值、還原 localStorage、`toggleCollapsed` / `setWidth` 寫回、毀損 JSON 安全退回（5 案）。
- **`CmsTopBar.test.tsx`（+8）**：`管理後台`→`/cms`、`資料平台`→`streamlitBaseUrl`、空值退回 `'/'`、顯示 user 名稱；登出流程 4 案（取 CSRF → POST logout → push('/')、例外 / 非 2xx → toast.error）。
- **迴歸**：全套件 `pnpm test` 綠（v0.5 起 **574 passed**）、`pnpm lint`、`pnpm typecheck` 皆過。
- **未覆蓋**：兩層導覽**純視覺** + 左欄拖曳/收合**動畫**未加 Playwright e2e（OQ-3）；拖曳的指標數學屬薄綁定，靠 hook 純邏輯 + 鍵盤路徑覆蓋。

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
| `src/app/cms/CmsSideNav.tsx`（新）/ `CmsSideNav.test.tsx`（新，+3；v0.5 +5＝8） | 左欄：管理員管理 / 設定；v0.5 加可調寬 + 收合 |
| `src/app/cms/useSidebarPanel.ts` / `useSidebarPanel.test.ts`（新，v0.5，+9） | 左欄寬度 / 收合狀態邏輯（clampWidth + useSyncExternalStore 持久化） |
| `vitest.setup.ts` | v0.5：補 Map-backed localStorage polyfill（Node 20 實驗性 Web Storage 遮蔽 happy-dom） |
| `src/app/cms/CmsNav.tsx` / `CmsNav.test.tsx` | **移除**（舊單一左欄 + 5 連結模型） |
| `src/app/cms/layout.tsx` | 頂部列 + （左欄 + 內容）巢狀版面；傳 props |
| `src/app/cms/page.tsx` | landing 文案改述兩層導覽 |
| `src/app/globals.css` | 淺色調色盤對齊 Streamlit（§4.1 / 014b §5）；`--color-nav-hover/active` token（§4.2） |
| `.env.example` / `.env.local` | `STREAMLIT_BASE_URL` |

---

## 10. Open Questions

- **OQ-2（RWD / 行動版）**：桌面版左欄**可拖曳調寬 + 收合**已於 v0.5 補上（見 §4.3）；
  惟窄螢幕**自動**收合 / 漢堡（依斷點自動切換）仍未做，未來可加。
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
| 0.5 | 2026-07-19 | **左欄可調寬 + 收合**（對齊 Streamlit）：右緣 8px 透明 `separator` 拖曳 / 鍵盤 `←→` 調寬；收合＝寬度動畫收 0 + nav `aria-hidden`/`inert`、左上浮出展開鈕；寬度/收合態存 `localStorage['cms.sidebar']`，以 `useSyncExternalStore` 讀取（SSR 安全）。新增 `useSidebarPanel.ts`（clampWidth + hook，+9 測試）、`CmsSideNav` +5 測試；`vitest.setup.ts` 補 localStorage polyfill（Node 20 實驗性 Web Storage 遮蔽 happy-dom）。全套件 574 綠。+§4.3、更新 OQ-2。`layout.tsx` 不變。 |
| 0.5.1 | 2026-07-19 | **實測校準**：以 Playwright 量 Streamlit `stSidebar` computed style，校正 §4.3 尺寸/行為——寬 `256/200/600`（原 224/180/480）、**去 border**、resize handle 改 8px 透明跨邊條（hover 顯示 brand 細條）、收合改**寬度動畫**（非卸載）、雙箭頭圖示、收合後左上浮出展開鈕。僅視覺/尺寸校準，測試契約不變（574 綠）。 |
| 0.5.2 | 2026-07-19 | **移除寬度動畫**（使用者偏好）：外層 `transition: width .3s` 拿掉，收合 / 展開與載入定位皆即時；連帶移除只為動畫存在的 `dragging` state。此處刻意不對齊 Streamlit（其收合仍有 .3s 動畫）。純樣式，測試契約不變。附帶效益：spec 019 後首繪 256 → cookie 寬的跳動不再帶滑動感（019 OQ-1 的體感問題減輕）。 |

| 0.5.3 | 2026-07-19 | **收合 / 展開 icon 完全對齊 Streamlit**：bundle 實查其渲染為 Material Symbols Rounded `keyboard_double_arrow_left/right`、`DynamicIcon size="xl"`＝1.5rem＝24px；原自繪 stroke 雙箭頭（16px）改為 **google/material-design-icons 官方 materialsymbolsrounded 24px 向量內嵌**（`viewBox 0 -960 960 960`、`fill:currentColor`、`w-6 h-6`），glyph 與尺寸皆一致。純視覺，測試契約不變。 |

| 0.5.4 | 2026-07-19 | **收合 / 展開鈕位置對齊 Streamlit**（bundle 實查 styled components）：收合鈕改置於 60px（`3.75rem`＝`sizes.headerHeight`）高、垂直置中的 header 列（原：`py-3` 後頂 12px），右緣內縮 20px（原 12px；＝其側欄水平 padding `max(gutter, 1.25rem−gutter)`），header `mb-4`（＝`marginBottom: spacing.lg`）後接 nav（nav 首項起點 76px，同 Streamlit）；展開鈕 `left-2 top-2`（8,8）→ `left-4 top-4`（16,16）（＝主 header `marginLeft: lg` + 60px 置中）。純視覺，測試契約不變。 |

| 0.5.5 | 2026-07-19 | **鈕位置改以 Playwright 實測校準**（mock 模式 :8503 量 rendered 幾何，修正 v0.5.4 的 bundle 推算誤差）：收合鈕右緣內縮 20px → **13px**（`mr-2`→`mr-px`；bundle 的 `max(gutter, 1.25rem−gutter)` 會被 scrollbar gutter 抵扣，實測 13）；展開鈕 (16,16) → **(10, 8)**（`left-2.5 top-2`）；首個 nav 項起點 76px → **92px**（`mb-4`→`mb-8`；v0.5.4 聲稱 76 同 Streamlit 有誤）。已知未對齊項：nav 項水平內縮 Streamlit 實測 23px、CMS 為 12px（`px-3`），另案評估。 |

| 0.5.6 | 2026-07-19 | 規格 / 實作核對修正：v0.5.5 的 nav 起點公式（`mb-8`＝60+32=92）**漏算 nav 容器 `gap-0.5`**（作用於 header 與首個連結之間），實際 rendered 為 94px。改 `mb-[30px]`（60+30+gap 2 = 92），與 Streamlit 實測一致。 |

| 0.5.7 | 2026-07-19 | **nav 項 CSS 以 Playwright 實測完全對齊**（mock :8503 量 computed style 與幾何）：①可見文字 **14px**（label 為項內 `span` 0.875rem；v0.3 誤採 `a` 的 16px）→ `text-sm`＋`span.truncate`（ellipsis 對齊）；②項左右內縮 12px → **23px**（新增連結容器 `px-[11px]`）；③項間距 2px → **6px**（`gap-1.5`；nav 父層 gap 移除，header 回 `mb-8`，起點仍 92）；④inactive 文字 `ink-AA`(.66) → 新 token **`--color-nav-ink`**（light `rgba(15,23,42,.8)`＝實測 span 色；dark 沿用 .72 不變）。已知未對齊項（nav 水平內縮）就此結案。 |

---

最後更新：2026-07-19（v0.5.7，nav 項 CSS 實測對齊）
