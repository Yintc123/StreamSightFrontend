# Spec 019 — 側欄寬度 cookie 持久化（跨 app 共用）

狀態：**已實作（2026-07-19）**（v0.3）
姊妹規格：Streamlit 端 [`StreamSightStreamlit/docs/specs/sidebar-width-sync.md`](../../../StreamSightStreamlit/docs/specs/sidebar-width-sync.md)
前置規格：[`016-cms-sidebar-streamlit-nav.md`](./016-cms-sidebar-streamlit-nav.md)（§4.3 左欄可調寬）、[`014a-theme-logic.md`](./014a-theme-logic.md)（cookie 持久化前例）

CMS 左欄寬度目前存 `localStorage['cms.sidebar']`（016 §4.3），Streamlit 原生側欄寬度存
自己 origin 的 `localStorage['sidebarWidth']`——**各自記得住，但互不相通**（localStorage
以 origin 為界，`localhost:3000` 與 `localhost:8501` 是不同 origin）。本規格把**寬度**的
持久化改走 **`sidebar_width` cookie**（同 `theme` cookie 的手法），讓兩個 app 共用同一個值。

---

## 1. 目的與範圍

### 範圍（本規格）

- **持久化搬遷**：左欄「寬度」由 `localStorage['cms.sidebar'].width` 改為獨立 `sidebar_width` cookie。
- **跨 repo cookie 契約**：名稱 / 值域 / 屬性與 Streamlit 端規格完全一致（§3.1，兩份規格互為鏡像）。
- **收合態不動**：`collapsed` 續存 `localStorage['cms.sidebar']`（Streamlit 原生收合不持久化，無共用對象）。
- **遷移**：既有使用者的 `cms.sidebar.width` 作為 cookie 缺省時的讀取退路（§3.4）。

### 不在範圍

- Streamlit 端的注入 JS 與同步機制 → 姊妹規格。
- SSR 直出寬度（first paint 即正確寬）→ OQ-1，本期維持現狀（首繪預設 256、hydration 後套用）。
- 雲端不同子網域下的共用（host-only cookie 限制，同 `theme` cookie 既有取捨）→ OQ-2。

---

## 2. 依賴與現況（實查 2026-07-19）

| 事實 | 位置 | 對本規格的意義 |
|---|---|---|
| 寬度 + 收合存 `localStorage['cms.sidebar']`，`useSyncExternalStore` 讀取 | `src/app/cms/useSidebarPanel.ts` | 改動集中於此 hook 的儲存層；介面 `SidebarPanel` 不變 → `CmsSideNav` 免改 |
| 界限 `[200, 600]`、預設 `256`（量自 Streamlit stSidebar） | 同上（`SIDEBAR_MIN/MAX/DEFAULT_WIDTH`） | 與 Streamlit 原生側欄同值域 → cookie 值兩端通用，免換算 |
| `theme` cookie 前例：`Max-Age` 1 年、`Path=/`、`SameSite=Lax`、prod `Secure`、host-only | `src/lib/theme/schema.ts`（`buildThemeCookieString`） | `sidebar_width` cookie 屬性照抄；host-only 限制一併繼承 |
| Streamlit 1.50 原生把側欄寬存 `localStorage['sidebarWidth']`（拖曳結束 / 雙擊重設時寫入） | Streamlit bundle 實查（姊妹規格 §2） | 兩端「值域相同、儲存介面不同」→ cookie 為共用中介 |
| 本機拓撲：Next.js `localhost:3000`、Streamlit `localhost:8501` | 根 `docker-compose.yml` | 同 host 異 port：localStorage 隔離、cookie 共用 → cookie 是唯一免改架構的共用儲存 |
| `CmsSideNav` 掛載時以 `localStorage['cms.sidebar']` 是否存在決定窄視窗自動收合 | `src/app/cms/CmsSideNav.tsx`（auto-collapse effect） | 寬度搬走後「存在與否」語義變窄（見 §I-2） |

---

## 3. 設計決策

### 3.1 跨 repo cookie 契約（與 Streamlit 端規格逐字一致）

| 項目 | 值 |
|---|---|
| 名稱 | `sidebar_width` |
| 值 | 整數 px 的十進位字串（如 `"320"`），值域 `[200, 600]` |
| 屬性 | `Max-Age=31536000`（1 年）、`Path=/`、`SameSite=Lax`、prod 加 `Secure`；`httpOnly:false`（client 讀寫）；**不設 `Domain`**（host-only，同 `theme`） |
| 缺省 / 非法值 | 各 app 走自己的退路（本端 §3.4；Streamlit 端不動原生行為），**不寫回修正** |
| 衝突解決 | last-write-wins（最後拖曳的一端蓋前值；無合併語義） |
| 登出 | **不清**（同 `theme`：偏好獨立於 session） |

### 3.2 儲存拆分：寬度進 cookie、收合留 localStorage

| 狀態 | 儲存 | 理由 |
|---|---|---|
| `width` | `sidebar_width` cookie | 跨 app 共用（本規格目的） |
| `collapsed` | `localStorage['cms.sidebar']`（`{ collapsed }`） | Streamlit 原生收合不持久化、無共用對象；留在 localStorage 保住既有跨分頁即時同步（storage event） |

### 3.3 讀取架構：維持 `useSyncExternalStore`，快照改複合 primitive

- 快照字串改為 `` `${extractSidebarWidthRaw(document.cookie) ?? ''}|${localStorage 原始值}` ``
  （primitive 值比較，沿用 016 v0.5 避免無限重繪 / hydration mismatch 的架構；server snapshot
  仍回 `''` → 首繪預設值）。
- **只放抽出的 `sidebar_width` 原始值，不放整串 `document.cookie`**：否則任何無關 cookie
  變動（如 ThemeToggle 寫 `theme`）都會產生新快照觸發重繪。抽取用與解析同一條 regex（§I-3）。
- cookie **沒有變更事件**：同分頁寫入後靠既有 `emit()` 通知；**跨分頁 / 跨 app** 改於
  `window` `focus` 時 `emit()` 重讀（subscribe 加掛 `focus` listener）——涵蓋主要情境
  「在 Streamlit 分頁拖完 → 切回 CMS 分頁」。`storage` listener 保留（服務 `collapsed`）。
- 代價：寬度的跨分頁同步從「即時」退化為「回到分頁時」；`collapsed` 不受影響。可接受。

### 3.4 讀取優先序與遷移

```
width  = parseSidebarWidthCookie(document.cookie)   // ① cookie（新常態）
      ?? legacy cms.sidebar 的 width（若為合法數字） // ② 舊資料退路（遷移期）
      ?? SIDEBAR_DEFAULT_WIDTH                       // ③ 256
```

- `setWidth()` 只寫 cookie（clamp 後）；**不再**把 width 寫進 `cms.sidebar`。
- `toggleCollapsed()` 寫 `cms.sidebar`，**且保留既存的 legacy `width` 欄位**（讀出 → 合併 →
  寫回 `{ width?, collapsed }`）：否則「有舊寬度、cookie 尚缺省」的使用者一收合，②的退路
  就被蓋掉、下次載入寬度跳回 256（§I-4）。持久化型別改 `{ width?: number; collapsed: boolean }`。
- 不做主動遷移（首載即寫 cookie）：拖過一次自然轉正；沒拖過的人走 ②→③ 也正確。

---

## 4. 檔案與元件清單

| 檔案 | 動作 | 職責 |
|---|---|---|
| `src/app/cms/sidebarCookie.ts` | 新增 | 純函式層：`SIDEBAR_COOKIE`（`'sidebar_width'`）、`SIDEBAR_COOKIE_MAX_AGE`、`extractSidebarWidthRaw(cookieHeader): string \| null`（§I-3 regex 抽原始值，供快照）、`parseSidebarWidthCookie(cookieHeader): number \| null`（抽值 → 整數 → 值域外 / 非法 → `null`）、`buildSidebarWidthCookieString(width, isProd)`（對齊 `buildThemeCookieString` 形狀）。皆為純函式、以 `document.cookie` 字串為參數。**不可 `import 'server-only'`**（client hook 要用，同 014a §I-2） |
| `src/app/cms/useSidebarPanel.ts` | 改 | 儲存層照 §3.2–3.4 改寫；對外介面 `SidebarPanel`、`clampWidth`、`SIDEBAR_*_WIDTH` 常數**均不變**；**新增 export** `hasCollapsedPreference(): boolean`（讀 `cms.sidebar`，JSON 內含 boolean `collapsed` 欄位 → `true`；缺 key / 毀損 / 無該欄位 → `false`，供 §I-2） |
| `src/app/cms/CmsSideNav.tsx` | 改（一處） | auto-collapse 判斷由「`localStorage.getItem(SIDEBAR_STORAGE_KEY)` 存在與否」改為 `!hasCollapsedPreference() && window.innerWidth < 768`（§I-2）；其餘不動 |

> 不新增 Route Handler、不動 `cms/layout.tsx`。

### 實作註記（§I）

- **§I-1 — `Secure` 判斷**：client 寫 cookie 用 `process.env.NODE_ENV === 'production'`，
  勿 import server-only `@/lib/config`（同 014a §I-1）。
- **§I-2 — auto-collapse 語義**：現行為「`cms.sidebar` 不存在＝沒有偏好 → 窄視窗自動收合」。
  寬度搬走後，拖曳調寬不再建立該 key；判斷改綁 `hasCollapsedPreference()`（§4），行為更精準
  （拖過寬度不代表表態過收合；legacy `{ width }`-only 記錄也視為「無收合偏好」）。補測試固定此語義。
- **§I-3 — 解析 regex 與防禦**：抽值統一用 `/(?:^|;\s*)sidebar_width=(\d+)(?:;|$)/`
  （與 Streamlit 端 JS 同一條，錨定行尾 / 分號 → `"320.5"` 不部分匹配）。
  `parseSidebarWidthCookie` 對缺 key、非數字、越界（`<200`、`>600`）一律回 `null`
  （交由退路鏈處理），不丟例外、不寫回、**不 clamp**（clamp 只發生在寫入路徑 `setWidth`）。
- **§I-4 — 收合寫入保留 legacy width**：`toggleCollapsed` 的寫回必須合併既存 `width` 欄位
  （見 §3.4）；直接覆寫 `{ collapsed }` 會斷掉遷移退路，屬回歸。
- **§I-5 — 測試環境**：happy-dom 的 `document.cookie` 讀寫已由 `ThemeProvider.test.tsx`
  實證可用；各測試間以 `document.cookie = 'sidebar_width=; Max-Age=0; Path=/'` 清理
  （同 `ThemeProvider.test.tsx` 既有 pattern）。localStorage 的 Map-backed polyfill 已在
  `vitest.setup.ts`，免再處理。

---

## 5. 資料流

```
CMS 拖曳結束 / 鍵盤 ←→
   └─ setWidth(px) → clamp → document.cookie = 'sidebar_width=320; …' → emit() → 即時重繪

Streamlit 分頁拖曳結束（姊妹規格：storage event → 寫同一 cookie）
   └─ 使用者切回 CMS 分頁 → focus → emit() → 重讀 cookie → 側欄套用 320

重新整理 / 硬導覽
   └─ 首繪預設 256（server snapshot）→ hydration 後讀 cookie 套用（現狀相同，見 OQ-1）
```

---

## 6. TDD 測試計畫（強制 TDD 範圍，紅 → 綠 → 重構）

| 目標 | 工具 | 關鍵案例 |
|---|---|---|
| `extractSidebarWidthRaw` / `parseSidebarWidthCookie` | Vitest | happy：`'sidebar_width=320'` → `320`；多 cookie 中取值（前後夾雜 `theme=dark; …`）；邊界 `200`/`600` 通過；edge：缺 key → `null`、`'abc'`、`'320.5'`（不部分匹配）、`199`/`601` → `null`、空字串 → `null` |
| `buildSidebarWidthCookieString` | Vitest | 含 `sidebar_width=<n>`、`Max-Age=31536000`、`Path=/`、`SameSite=Lax`；prod 含 `Secure`、dev 不含（對齊 `schema.test.ts` 形狀） |
| `useSidebarPanel`（改寫既有 9 案） | Vitest + Testing Library | `setWidth` 寫 cookie（clamp 後）且**不寫** localStorage；讀取優先序 ①②③（cookie 勝出 / 退 legacy width / 退 256）；`toggleCollapsed` 寫 `{ width?, collapsed }` 且**保留 legacy width**（§I-4，收合後再載入寬度不變）；毀損 cookie / 毀損 JSON 安全退回；focus 事件觸發重讀（模擬他分頁改 cookie → dispatch `focus` → 寬度更新） |
| `hasCollapsedPreference` | Vitest | 含 boolean `collapsed` → `true`；缺 key / 毀損 JSON / legacy `{ width }`-only → `false` |
| `CmsSideNav`（§I-2） | Vitest + Testing Library | 有 legacy width 但無 collapsed 記錄 → 窄視窗仍自動收合；有 collapsed 記錄 → 不自動收合 |

- cookie 清理：各測試 `beforeEach` 以 `Max-Age=0` 清 `sidebar_width`（§I-5）。
- 迴歸：`pnpm lint`、`pnpm test` 全綠後才 commit（現 574 案不得變紅）。
- e2e 不加（純儲存層搬遷，視覺無變）；跨 app 實際同步以手動驗收（雙分頁拖曳互看）。

---

## 7. 決策紀錄與 Open Questions

- **D1 儲存媒介**：✅ cookie（唯一在「同 host 異 port」拓撲下兩 app 共用、且免改部署架構的儲存）。
  localStorage 跨 origin 共用**不可行**（瀏覽器強制隔離）；反向代理收斂同 origin 影響面過大，不採。
- **D2 只同步寬度**：✅ 收合態留 local（無共用對象、保跨分頁即時性）。
- **D3 缺省不寫回**：✅ cookie 缺省 / 非法時各走退路，不主動建立——避免兩端啟動時互寫預設值。

### Open Questions（不阻塞開工）

- **OQ-1（SSR 直出寬度）**：`cms/layout.tsx`（RSC，本就動態）可讀 cookie 直出 `initialWidth`，
  消除首繪 256 → 實寬的跳動（同 014a 防閃爍思路）。本期不做：跳動幅度小且既有行為相同。
- **OQ-2（雲端子網域）**：host-only cookie 在 `frontend.streamsight.local` / `streamlit.streamsight.local`
  下不共用（`theme` cookie 同此限制）。若要共用需 `Domain=.streamsight.local`，屬 `theme` + `sidebar_width`
  一起決定的跨域議題，另案處理。
- **OQ-3（寬度即時跨分頁同步）**：如需即時（非 focus 補償），可評估 `cookieStore.addEventListener('change')`
  （Chromium only）漸進增強。本期不做。

---

## 8. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-07-19 | 初版規劃：寬度持久化由 `localStorage['cms.sidebar']` 改 `sidebar_width` cookie（跨 app 共用）；收合留 localStorage；讀取優先序 cookie → legacy → 256；focus 補償同步；TDD 計畫。與 Streamlit 端 `sidebar-width-sync.md` 互為鏡像。 |
| 0.2 | 2026-07-19 | 實作前完整性校對，補 3 個會卡實作的缺口：①§3.4/§I-4 `toggleCollapsed` 改**合併保留 legacy `width`**（原「只寫 `{collapsed}`」會蓋掉遷移退路，屬回歸）；②§3.3 快照明確為**抽出的 `sidebar_width` 原始值**（非整串 `document.cookie`，防無關 cookie 觸發重繪），新增 `extractSidebarWidthRaw`；③§I-2/§4 新增 `hasCollapsedPreference()` 契約供 auto-collapse 判斷。另：§I-3 統一抽值 regex（與 Streamlit 端同條）、§I-5 測試環境實查（happy-dom cookie 可用、清理 pattern）、§6 測試計畫對應擴充。 |
| 0.3 | 2026-07-19 | **已實作**（TDD 紅→綠→重構×3 輪）：`sidebarCookie.ts`（+21 測試）、`useSidebarPanel` 儲存層改寫（hook 測試改寫為 14 案，含 §I-4 保留 legacy width、focus 重讀）、`CmsSideNav` auto-collapse 改 `hasCollapsedPreference()`（+1 測試、既有 10 案不變）。實作註記：快照的 cookie 部分實作為 `parseSidebarWidthCookie` 的合法值（非法值與缺省同視為 `''`，語義同 §3.3 且連非法值變動的重繪都免了）；`SIDEBAR_MIN/MAX_WIDTH` 常數移至 `sidebarCookie.ts` 定義、`useSidebarPanel` 再匯出（避免循環 import，公開介面不變）。檢查：`pnpm lint`、`pnpm typecheck` 過；cms 套件 83 綠；全套件 623 綠 + 2 紅為 main 既有 `config.test.ts` 失敗（stash 驗證與本變更無關）。 |

---

最後更新：2026-07-19（v0.3，已實作）
