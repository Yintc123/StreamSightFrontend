# Spec 016 — CMS 左側側邊欄導覽 + Streamlit 連結整合

狀態：**已實作（2026-07-18）**（v0.3）

把 CMS 的**頂部橫向導覽列**改為**左側直向側邊欄**（對齊 Streamlit 前端的版面觀感），
並在側邊欄下半段以**外部連結**掛入 Streamlit app 的五個頁面，讓兩端（Next.js CMS 與
Streamlit）在單一導覽入口下形成統一體驗。

> 兩端共用同一 ALB（見 [spec 015](./015-streamlit-auth-bridge.md) 與 terraform `ecs.tf`）；
> 本規格只處理**前端導覽入口**，不涉認證橋接（認證已由 015 完成）。

> 本功能改造既有 `CmsNav.tsx` / `cms/layout.tsx`，屬 [spec 013b](./013b-admin-management-ui.md)
> §1 導覽殼層的後續演進。013b 的 super_admin 入口可見性契約**原封保留**。

---

## 1. 背景與目標

- **現況（改造前）**：`CmsNav` 為頂部橫向 `<nav>`，僅兩項：`管理員管理`（super_admin 才顯示）、`設定`。
- **目標**：
  1. 導覽改為**左側直向側邊欄**，視覺排列比照 Streamlit 專案的多頁面側欄。
  2. 側邊欄項目順序由使用者指定：**管理員管理 → 設定 → （分隔）→ 儀表板 → 資料管理 → 即時監控 → 資料分析 → 系統管理**。
  3. 後五項（Streamlit 頁面）為**外部連結**，指向部署中的 Streamlit app。

## 2. 範圍

### 2.1 在範圍內
- `CmsNav.tsx`：頂部橫欄 → 左側直欄；新增 Streamlit 外部連結區塊；新增 `streamlitBaseUrl` prop。
- `cms/layout.tsx`：版面由 `flex-col`（nav 在上）改為 `flex`（側欄在左、內容在右）；從 server config 讀 URL 傳入。
- `config.ts`：新增選填環境變數 `STREAMLIT_BASE_URL`。
- `cms/page.tsx`：文案「上方導覽列」→「左側導覽列」。
- `.env.example` / `.env.local`：記錄 / 設定 `STREAMLIT_BASE_URL`。

### 2.2 不在範圍內
- **不**在 Next.js 內重建 Streamlit 任一頁面（儀表板 / 資料管理 / …）；它們是外部連結。
- **不**改動認證、session、CSRF、登出流程（登出邏輯原封保留）。
- **不**改 Streamlit 端任何程式碼。
- 側邊欄 RWD（行動版收合 / 漢堡選單）本期不做，見 OQ-2。

---

## 3. 導覽規格

### 3.1 項目與順序

| # | 標籤 | 類型 | 目的地 | 可見性 |
|---|---|---|---|---|
| 1 | 管理員管理 | 內部 `next/link` | `/cms/admins` | **僅 `adminRole==='super_admin'`** |
| 2 | 設定 | 內部 `next/link` | `/cms/settings` | 所有已登入 admin |
| — | （分隔線 `<hr>`） | — | — | — |
| 3 | 儀表板 | 外部 `<a>` | `{base}`（Streamlit 根） | 所有已登入 admin |
| 4 | 資料管理 | 外部 `<a>` | `{base}/data_management` | 同上 |
| 5 | 即時監控 | 外部 `<a>` | `{base}/realtime_monitor` | 同上 |
| 6 | 資料分析 | 外部 `<a>` | `{base}/analytics` | 同上 |
| 7 | 系統管理 | 外部 `<a>` | `{base}/admin` | 同上（Streamlit 端自行 role gate） |

`{base}` = `STREAMLIT_BASE_URL`。

### 3.2 可見性契約（沿用 013b §1）

- `管理員管理` 只在 `super_admin` 顯示——**UX affordance only**；真正權限邊界仍是
  `/cms/admins` 上的 `requireSuperAdminSession()`（[013a §2](./013a-admin-management-logic.md)）。
- `系統管理`（Streamlit）在 CMS 側邊欄**對所有 admin 顯示**；因 CMS 全員皆為 admin，
  對齊 Streamlit「admin role 才註冊系統管理頁」的行為。實際存取控制由 Streamlit 端負責。

### 3.3 Streamlit URL path 慣例

Streamlit `st.navigation` 的 url path 預設取**頁面檔名 stem**；預設頁（`dashboard`, `default=True`）
服務於 app 根路徑。故 path 對照：

| Streamlit 頁 | 檔案 | path |
|---|---|---|
| 儀表板 | `pages/dashboard.py`（default）| `''`（根）|
| 資料管理 | `pages/data_management.py` | `data_management` |
| 即時監控 | `pages/realtime_monitor.py` | `realtime_monitor` |
| 資料分析 | `pages/analytics.py` | `analytics` |
| 系統管理 | `pages/admin.py` | `admin` |

> ⚠️ 此為依 Streamlit 慣例之推斷；若實際部署路徑不同（子路徑掛載 / 自訂 `url_path` slug），
> 需同步修正 `CmsNav.tsx` 的 `STREAMLIT_LINKS`。見 OQ-1。

### 3.4 href 組法

`streamlitHref(base, path)`：
- 去除 `base` 尾斜線。
- `path === ''` → 回 `base`（或 `base` 為空時回 `'/'`）。
- `path` 非空 → `base` 有值回 `` `${base}/${path}` ``；`base` 為空回 `` `/${path}` ``（同源根相對退回）。

---

## 4. 版面

```
┌──────────────┐──────────────────────────────┐
│ StreamSight  │                              │
│         CMS   │                              │
│              │                              │
│ 管理員管理     │        {children}            │
│ 設定          │   （右側內容區，flex-1）        │
│ ──────────── │                              │
│ 儀表板         │                              │
│ 資料管理       │                              │
│ 即時監控       │                              │
│ 資料分析       │                              │
│ 系統管理       │                              │
│              │                              │
│ Alice  🌓     │  ← footer 靠底（mt-auto）      │
│ 登出          │                              │
└──────────────┴──────────────────────────────┘
```

- 外層 `cms/layout.tsx`：`min-h-dvh bg-surface-page flex`（row）。
- 側欄 `<nav>`：`w-56 shrink-0 border-r border-line bg-surface-card flex flex-col`。
- 內容區：`flex-1 min-w-0 flex flex-col`，包住 `{children}`（子頁的 `<main flex-1 max-w-… mx-auto>` 於其中置中）。
- footer（帳號 / `ThemeToggle` / 登出）以 `mt-auto` 推至側欄底部。
- 樣式沿用既有語義 token（`brand`/`brand-overlay`/`ink-*`/`surface-*`/`line`），不寫 hex；
  active 態 `bg-brand-overlay text-brand`（比照原橫欄）。

### 4.1 背景配色與 Streamlit 一致（淺色模式）

> **決策（2026-07-18）**：前端**深色為預設**（觀測台品牌識別，不動）；**只把淺色模式**
> （`[data-theme="light"]`）的調色盤對齊 Streamlit，讓使用者切到淺色時兩端視覺一致。
> 色值改動落在 `globals.css`，明細見 [spec 014b §5](./014b-theme-ui.md)。

| 用途 | Streamlit（固定淺色） | 前端 淺色（對齊後） |
|---|---|---|
| 主內容背景 `surface-page` | `#ffffff` | `#ffffff` ✅ |
| 側欄 / 卡片 `surface-card` | `#f1f5f9` | `#f1f5f9` ✅ |
| 文字 `ink-AAA` | `#0f172a` | `#0f172a` ✅ |
| 主色 `brand` | `#2563eb` | `#2563eb` ✅ |

- 此改動**同時修正**了原淺色「側欄白 / 內容灰」與 Streamlit「側欄灰 / 內容白」**明暗對調**的問題。
- **深色模式維持不變**：Streamlit 無深色主題，故深色時兩端不對齊為預期（見 OQ-5）。

### 4.2 側邊欄項目 hover 特效與尺寸（對齊 Streamlit）

> **來源**：以 Playwright 實測 Streamlit（`localhost:8501`）`[data-testid="stSidebarNav"] a` 的 computed style（2026-07-18）。
> Streamlit nav item 為 emotion runtime CSS，靜態檔無法 grep，故以實測為準。

**Streamlit 實測值（單一 nav item）：**

| 屬性 | Streamlit 值 | 對應 Tailwind |
|---|---|---|
| padding | `0 8px` | `px-2` |
| height | `28px` | `h-7` |
| border-radius | `8px` | `rounded-lg` |
| icon/label gap | `8px` | `gap-2` |
| font-size | `16px` | `text-base` |
| font-weight（inactive / active）| `400` / `600` | `font-normal` / `font-semibold` |
| **hover 背景（inactive）** | **`rgba(141,173,206,.15)`** | `hover:bg-nav-hover` |
| hover 文字色 | **不變** | （不加 `hover:text-*`）|
| active 背景 | `rgba(141,173,206,.25)` | `bg-nav-active` |
| active 文字 | `#0f172a`（全不透明）| `text-ink-AAA` |

**關鍵行為差異（改造重點）**：Streamlit 的 hover 是**加背景填色、文字色不變**；
前端原本是**文字變色、無背景**——本規格改為對齊 Streamlit。

**新增 token（`globals.css`，中性 overlay 填色）**：

| Token | dark（預設） | light（= Streamlit） |
|---|---|---|
| `--color-nav-hover` | `rgba(230,237,246,.08)` | `rgba(141,173,206,.15)` |
| `--color-nav-active` | `rgba(230,237,246,.14)` | `rgba(141,173,206,.25)` |

- 於 `@theme` 定義 dark base、`html[data-theme="light"]` 覆寫為 Streamlit 精確值（同 D4 token 架構）。
- 產生 `bg-nav-hover` / `hover:bg-nav-hover` / `bg-nav-active` 工具類（已用 Tailwind v4 編譯驗證）。
- `CmsNav` 的 `itemClass`（CMS 連結 + Streamlit 連結）與登出按鈕統一採此互動語言。
- **深色**無 Streamlit 對照，採等效中性淺色 overlay，維持「hover 填色、文字不變」的一致行為。

---

## 5. 設定（env）

| 變數 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `STREAMLIT_BASE_URL` | URL 字串 | 否 | Streamlit app base URL。**留空時**側邊欄退回同源根相對路徑（`/data_management` …），適用兩端同源部署。 |

- `config.ts`：`z.string().url().optional()`——提供則須為合法 URL，否則 parse 失敗（fail-fast）。
- **server-only**：`config.ts` 帶 `import 'server-only'`；由 RSC `cms/layout.tsx` 讀取後**當 prop 傳入** client 元件 `CmsNav`，故**不需** `NEXT_PUBLIC_` 前綴。
- Local 值：`.env.local` = `http://localhost:8501`（改後需重啟 dev server 生效）。

---

## 6. 跨檔契約

1. **`CmsNav` prop**：新增必填 `streamlitBaseUrl: string`（可為空字串）。`cms/layout.tsx` 傳 `env.STREAMLIT_BASE_URL ?? ''`。
2. **`STREAMLIT_LINKS`**：`CmsNav.tsx` 內模組級常數（`{ path, label }[]`），為 Streamlit 頁清單單一事實來源。
3. **可見性**：`管理員管理` gating 邏輯與 013b 完全一致（`adminRole==='super_admin'`）。

---

## 7. TDD / 測試

強制 TDD（導覽邏輯屬邏輯類，不豁免）。紅 → 綠 → 重構全程執行。

### 7.1 `config.test.ts`（+2）
- `STREAMLIT_BASE_URL` 為選填（未設 → `undefined`）。
- 提供非法 URL → throw；提供合法 URL → 原值回傳。

### 7.2 `CmsNav.test.tsx`（+6）
- `super_admin`：`管理員管理`→`/cms/admins`、`設定`→`/cms/settings`。
- 非 super_admin：不顯示 `管理員管理`，仍顯示 `設定`。
- 5 個 Streamlit 外部連結 href 對應 `streamlitBaseUrl`（含根路徑 `儀表板`）。
- `streamlitBaseUrl` 為空 → 退回根相對路徑（`/`、`/data_management`）。
- 順序：管理員管理 → 設定 → 儀表板 → 資料管理 → 即時監控 → 資料分析 → 系統管理。
- 既有登出流程 4 案（取 CSRF → POST logout → push('/')、例外 / 非 2xx → toast.error）**全數保留通過**。

### 7.3 迴歸
- 全套件 `pnpm test` 綠（改造後 558 passed）、`pnpm lint`、`pnpm typecheck` 皆過。

### 7.4 未覆蓋（可延伸）
- 側邊欄**純視覺**（版面 / active 態外觀）未加 Playwright e2e；如需關鍵畫面 e2e 可補一支 `tests/e2e/cms-nav.spec.ts`。見 OQ-3。

---

## 8. 決策總表

| 決策 | 內容 | 出處 |
|---|---|---|
| D1 版面 | 頂部橫欄 → 左側直欄（`w-56` 固定寬 + 內容 `flex-1`） | §4 |
| D2 Streamlit 頁 | 以**外部連結**掛入，不在 Next.js 重建頁面 | §2 / §3 |
| D3 URL 來源 | server-only `STREAMLIT_BASE_URL` → layout 讀取 → prop 傳入 client `CmsNav`（免 `NEXT_PUBLIC_`） | §5 / §6 |
| D4 空值退回 | `STREAMLIT_BASE_URL` 留空 → 根相對路徑（同源部署） | §3.4 / §5 |
| D5 可見性 | `管理員管理` 保留 super_admin gating；`系統管理` 對所有 admin 顯示，Streamlit 端 gate | §3.2 |
| D6 path 慣例 | 依 Streamlit `st.navigation` 檔名 stem 推斷 | §3.3 |
| D7 背景配色 | 淺色調色盤對齊 Streamlit（`#ffffff`/`#f1f5f9`/`#0f172a`/`#2563eb`）；深色不變 | §4.1 |
| D8 nav 互動 | hover / active 改為**背景填色、文字色不變**；尺寸 `px-2 h-7 rounded-lg gap-2 text-base`，對齊 Streamlit 實測值；新增 `--color-nav-hover/active` token | §4.2 |

---

## 9. 變更檔案清單

| 檔案 | 變更 |
|---|---|
| `src/lib/config.ts` | +`STREAMLIT_BASE_URL`（optional URL）|
| `src/lib/config.test.ts` | +2 測試 |
| `src/app/cms/CmsNav.tsx` | 改寫為側邊欄；+`streamlitBaseUrl` prop；+`STREAMLIT_LINKS` / `streamlitHref` |
| `src/app/cms/CmsNav.test.tsx` | +6 測試；setup 傳 `streamlitBaseUrl` |
| `src/app/cms/layout.tsx` | 版面 `flex`；讀 env 傳 prop；內容區包 `flex-1` |
| `src/app/cms/page.tsx` | 文案「上方」→「左側」 |
| `.env.example` | +`STREAMLIT_BASE_URL` 說明區塊 |
| `.env.local` | +`STREAMLIT_BASE_URL=http://localhost:8501` |
| `src/app/globals.css` | 淺色調色盤對齊 Streamlit（§4.1 / 014b §5）；+`--color-nav-hover/active` token（§4.2）|
| `src/app/cms/CmsNav.tsx` | `itemClass` + 登出鈕改對齊 Streamlit hover/尺寸（§4.2）|

---

## 10. Open Questions

- **OQ-1（Streamlit 實際 url path）**：§3.3 為慣例推斷；部署後以實際網址驗證，若不符則修 `STREAMLIT_LINKS`。
- **OQ-2（RWD / 行動版）**：側欄目前固定 `w-56`，未做窄螢幕收合 / 漢堡；未來可加。
- **OQ-3（e2e）**：側邊欄視覺未有 Playwright 覆蓋；如列為關鍵畫面可補。
- **OQ-4（active 態 for 外部連結）**：Streamlit 頁在 Next.js 端無法得知目前是否停留其上，外部連結恆非 active；可接受。
- **OQ-5（深色模式一致性）**：Streamlit 無深色主題；前端深色時與 Streamlit 不對齊為預期。若未來要全對齊，需 Streamlit 端補深色主題或 CMS 進 Streamlit 時強制淺色。

---

## 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-07-18 | 初版並標記**已實作**：CMS 頂欄改左側側邊欄；掛入 5 個 Streamlit 外部連結；新增 server-only `STREAMLIT_BASE_URL`（空值退回根相對）；super_admin gating 沿用 013b。config +2、CmsNav +6 測試，全套件綠。決策 D1–D6 定案；OQ-1~4 待決不阻塞。 |
| 0.2 | 2026-07-18 | +§4.1 背景配色對齊 Streamlit（僅淺色模式）：`globals.css` light 調色盤採 Streamlit 精確色值（`#ffffff`/`#f1f5f9`/`#0f172a`/`#2563eb`），同時修正側欄/內容明暗對調；深色不變。細節見 [014b §5 v0.3](./014b-theme-ui.md)。+OQ-5（深色一致性）。 |
| 0.3 | 2026-07-18 | +§4.2 側邊欄 hover 特效與尺寸對齊 Streamlit（Playwright 實測）：hover/active 改為**背景填色、文字色不變**；item 尺寸 `px-2 h-7 rounded-lg gap-2 text-base`、active `font-semibold`；新增 `--color-nav-hover/active` token（dark 中性 overlay、light = `rgba(141,173,206,·)`）；Tailwind v4 編譯驗證工具類生成。決策 +D7/+D8。 |

---

最後更新：2026-07-18（v0.3，標記已實作；+§4.2 nav hover/尺寸對齊 Streamlit）
