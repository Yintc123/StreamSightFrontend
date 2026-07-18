# Spec 005：首頁 + 後台入口

> ⚠️ **局部作廢（2026-07-18，spec 012 取代）**：本 spec 中所有與**公開自助註冊**相關的描述已作廢——
> 首頁「建立帳號」按鈕、`router.push('/register')` 入口、`/register` placeholder 皆**移除**
> （[spec 012b §1.1 淘汰清單](./012b-backend-auth-ui.md)）。LoginCard 只保留登入。新增 admin 改由
> [spec 013b](./013b-admin-management-ui.md) 的 CMS 內建立。**首頁本體、LoginCard 登入、`proxy.ts`、
> §4 smart-back 導覽等其餘內容仍有效。**

- **狀態**：Draft（v0.3 — §register 入口局部作廢，見上方橫幅；其餘有效）
- **建立日期**：2026-06-15
- **路徑**：
  - `src/app/page.tsx`（首頁 RSC）
  - `src/app/LoginCard.tsx` / `.test.tsx`（登入卡 client component）
  - `src/app/register/page.tsx`（建立帳號 placeholder；spec 007 v0.2 定義 contract，路徑 v0.4 從 `/admin` 改 `/register`）
  - `src/app/cms/page.tsx`（登入後 placeholder；v0.5 從 `/dashboard` 改 `/cms`，業務語意對齊 charity / project / sale-item 三套 CRUD；v0.6 改 async RSC 做 full session check）
  - `src/proxy.ts` / `src/proxy.test.ts`（v0.6 — Next.js 16 Proxy 對 `/cms` + `/cms/*` 做 optimistic cookie presence check，無 cookie redirect `/`）
  - `src/lib/hooks/useInAppNav.tsx` / `.test.tsx`（§4 Context + Provider，v0.2）
  - `src/lib/hooks/useSmartBack.ts` / `.test.tsx`（§4 返回鈕智慧路由，v0.2）
- **依賴**：
  - `POST /api/auth/login`（[`src/app/api/auth/login/route.ts`](../../src/app/api/auth/login/route.ts)，v0.3 — 原 `/api/dev/login`，現為真實帳密橋接 BE `/auth/login` + `/auth/me`，需 `{ identifier, password }` body）
  - Design system tokens（[003a](./003a-design-system.md)）

---

## 1. 職責

`/` 從「`redirect('/donation')` 直送公開列表」改為「先看到登入入口」。主要為作業展示用：示範 BFF 已有 session / cookie 機制（iron-session + Redis store）能跑通，順帶讓「公開頁」與「後台頁」在 routing 上分得開。

---

## 2. Layout

對齊 [/donation](./003i-charity-list-shell.md) 視覺風格：brand 紅 header（無 back 按鈕，因為這是 root）+ 卡片風內容區。

```
┌─────────────────────────────────┐
│       StreamSight (brand 紅)    │ ← h1，置中
├─────────────────────────────────┤
│                                 │
│      ┌─────────────────┐        │
│      │ 登入             │        │ ← h2
│      │ 帳號 [____]     │        │
│      │ 密碼 [____]     │        │
│      │ [   登入後台   ] │        │ ← bg-brand text-white
│      └─────────────────┘        │
│                                 │
│         demo              │ ← link → /donation
│                                 │
└─────────────────────────────────┘
```

---

## 3. 行為契約

| 互動 | 行為 |
|---|---|
| 進入 `/` | RSC 渲染 header + `<LoginCard />` + skip link |
| 帳號 / 密碼任一空 | 「登入後台」按鈕 `disabled` |
| 兩欄都有值 + 按「登入後台」 | `POST /api/auth/login` → 200 → `router.push('/cms')`；非 200 → 顯示 inline `<p role="alert">登入失敗 (HTTP {code})</p>`、不跳轉 |
| 按「demo」 | `<Link href="/donation">`，普通 navigate |
| 登入 in-flight | 按鈕文字「登入中…」、disabled，避免重複送出（`useTransition` 管 isPending） |

> **帳密是真實的** — `/api/auth/login` 接 `{ identifier, password }` 並橋接 BE `/auth/login` + `/auth/me`；client 端只做「非空」前端驗證，伺服端負責真實檢查（rate-limit、密碼比對、lock-out）。

---

## 4. /register 與 /cms placeholder（v0.5 — `/dashboard` → `/cms`、v0.4 — `/admin` → `/register`）

兩頁都是最小可運行 RSC，視覺對齊首頁（brand 紅 header + 內容置中）。功能：

- `/register`：[spec 007 v0.2](./007-register-page.md) 已實作 — 三欄表單 + BFF route `POST /api/auth/register`（兩段 `POST /auth/register` + `GET /auth/me` → iron-session），auto-login 成功跳 `/cms`
- `/cms`：顯示「歡迎進入後台」+ 提示 session cookie 已建立 + 連到 `/donation` link

> CMS 真功能（charity / project / sale-item 三套 CRUD）規劃未來再開 spec；register 規劃已收斂於 007。
>
> **為何 v0.5 改路徑（`/dashboard` → `/cms`）**：StreamSight 後台主要做「公益團體 / 募款專案 / 義賣商品」三類資料的 CRUD（對應 BE spec 020 charity / project / sale-item 三套 admin route），語意上是 content management，不是純 analytics dashboard。`/cms` 讓路徑與業務領域對齊，也避開 Grafana 等觀測 dashboard 的命名噪音。
>
> **為何 v0.4 改路徑（`/admin` → `/register`）**：BE spec 008 §10 有 `role=0=ADMIN` 與 `requireAdmin` preHandler 概念。把面向所有使用者的「建立帳號」掛在 `/admin` 會與「ADMIN role 限定區」概念衝突。`/register` 是公開註冊入口；`/admin` 留給未來真正的 admin 後台。

### 4a. `/cms` Auth Gate（v0.6 新增）

`/cms` + `/cms/*` 只允許登入使用者進入；沒登入 / cookie 過期 / 損壞一律 redirect `/`。雙層設計（`src/proxy.ts` cookie presence + `src/app/cms/page.tsx` RSC full validation），對齊 [Next.js 16 auth 指南](../../node_modules/next/dist/docs/01-app/02-guides/authentication.md) 「Optimistic checks with Proxy + DAL」pattern。

完整脈絡 / threat model / 行為矩陣 / 測試案例：**[spec 010 `/cms` Auth Gate](./010-cms-auth-gate.md)**。

---

## 4. Smart Back Navigation（v0.2 新增）

需求：列表頁 `/donation`（甚至詳細頁）的返回鈕——

- 如果使用者**站內走過來**（例：`/` → `/donation`），按返回該回上一頁
- 如果**直接訪問 URL**（typed / bookmark / refresh）或**從外站連進來**，按返回該回首頁 `/`，不要按了沒反應或跳到外站

### 4.1 為何 `document.referrer` 不夠

`document.referrer` 只在 document 首次 HTTP 載入時設定，**不會**因 Next.js App Router 的 SPA navigation 更新。所以 in-app nav 後 referrer 仍是「最初開檔的來源」，會誤判。

### 4.2 設計：in-memory pathname diff

`<InAppNavProvider>`（`src/lib/hooks/useInAppNav.tsx`）掛在 `app/providers.tsx`：

```tsx
'use client'
export function InAppNavProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const initial = useRef(pathname)
  const [hasNavigated, setHasNavigated] = useState(false)
  useEffect(() => {
    if (!hasNavigated && pathname !== initial.current) setHasNavigated(true)
  }, [pathname, hasNavigated])
  return <Ctx.Provider value={hasNavigated}>{children}</Ctx.Provider>
}
```

- 首次 mount 時 snapshot `pathname`；之後 `usePathname` 與 snapshot 不同 → flag 轉 `true`，**不會 reset**
- In-memory only（state，無 sessionStorage）：refresh 視為「新進站」是想要的語意

### 4.3 `useSmartBack(fallback = '/')`

```tsx
export function useSmartBack(fallback: string = '/'): () => void {
  const router = useRouter()
  const hasNavigated = useHasInAppNavigated()
  return useCallback(
    () => (hasNavigated ? router.back() : router.push(fallback)),
    [hasNavigated, router, fallback],
  )
}
```

呼叫端：`<TopNav title="..." />`（fallback 預設 `/`）。詳細頁可改 `fallback="/donation"` 若想無 history 時回列表，但目前統一回首頁。

### 4.4 行為矩陣

| 進站方式 | 後續操作 | `hasNavigated` | 按返回行為 |
|---|---|---|---|
| 直接打 `/donation` URL | 立即按返回 | false | `router.push('/')` |
| 從外站連 `/donation` | 立即按返回 | false | `router.push('/')` |
| `/donation` refresh | 按返回 | false（refresh 清 in-memory state） | `router.push('/')` |
| `/` → 點 skip → `/donation` | 在 `/donation` 按返回 | true | `router.back()` → `/` |
| `/donation` → 點 charity 卡 → detail | 在 detail 按返回 | true | `router.back()` → `/donation` |
| `/donation` → 切 tab（同 pathname `/donation?tab=item`） | 按返回 | **false**（pathname 沒變，只 query 變） | `router.push('/')` |

> 最後一列是設計取捨：tab 切換不算「換頁」，這樣行為跟「`?tab=` 同 pathname 不同 query」一致。若未來改用 path-based tab（`/donation/item`）則自動算 in-app nav。

### 4.5 caller 改動

- `<TopNav>` v0.3：新增 `fallback?: string` prop（預設 `/`）；未傳 `onBack` 時用 `useSmartBack(fallback)`
- `<CharityListShell>` 拿掉手動的 `onBack={() => router.push('/')}`，改用 TopNav 預設
- 詳細頁 3 條 RSC 完全不需改（已用 default TopNav）

### 4.6 Top-level landing 頁的 escape hatch（v0.3.1）

`<TopNav>` v0.5 加 `backHref?: string` prop，set 時**繞過** smart-back、`router.push(backHref)`。給 top-level landing 頁用（目前 `/donation`、`/cms`）：這些頁面語意上「返回 = 回首頁」、不該依賴 history。例：從 `/cms` 進 `/donation`，smart-back `router.back()` 會回 `/cms`，但 user 預期「返回首頁」，反直覺。

> 詳見 [003b TopNav §1 / §2 / §4](./003b-topnav.md#1-職責)。useSmartBack hook 本身**無變動**；backHref 是 TopNav 在 hook 之上的策略層 escape hatch。

---

## 5. 測試

### 5.1 `LoginCard.test.tsx`（client，TDD 強制）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 username + password input | `getByLabelText('帳號')` / `('密碼')` 都存在 |
| 2 | 只有「登入後台」按鈕，無「建立帳號」（spec 012b §1 移除公開自助註冊） | `getByRole('button',{name:'登入後台'})` 存在；無「建立帳號」按鈕 |
| 3 | username 空 → 登入 disabled | OK |
| 4 | password 空 → 登入 disabled | OK |
| 5 | 兩欄都有值 → 登入 enabled | OK |
| 6 | 登入成功 → POST /api/auth/login + push('/cms') | mock fetch 200，assert call args + router push |
| 7 | 登入失敗 → 顯示 `role="alert"`、不 push | mock fetch 500 |

### 5.2 e2e（`tests/e2e/smoke.spec.ts`）

| 測試 | 涵蓋 |
|---|---|
| `/ 顯示登入卡片 + skip link 可進 /donation` | header / 帳密欄 / 登入後台按鈕 / skip link → /donation |
| `/donation 直接訪問按返回 → 跳 /（smart back fallback）` | §4.2 + §4.4 「直接訪問」列 |
| `/ → demo → /donation 按返回 → 回 /（smart back via router.back）` | §4.2 + §4.4 「站內 nav」列 |

> 原本「`/` redirects to /donation」的 e2e 改寫，因為 redirect 不再發生。

### 5.3a `proxy.test.ts`（v0.6 — `/cms` auth gate）

詳見 **[spec 010 §6.1](./010-cms-auth-gate.md#61-srcproxytestts強制-tdd--邏輯類)** — 6 個 case 涵蓋 cookie 存在 / 缺 / 不相關 cookie / query string / matcher 設定。

### 5.3 `useInAppNav.test.tsx` / `useSmartBack.test.tsx`（v0.2）

- 無 Provider → `useHasInAppNavigated` 回 false
- Provider 內 pathname 未變 → false；pathname 變 → true
- 變動後再回到初始 pathname → 仍 true（不 reset）
- `useSmartBack`：hasNavigated false → push(fallback)；true → router.back()
- fallback 預設 `/`

---

## 6. 開放問題

- ~~**真實註冊 / 登入流程**：`/admin` 想接真註冊表單時要決定 `POST /api/auth/register` shape（backend 目前無此 endpoint）；本 spec 範圍只到 placeholder~~ → ✅ v0.4 起：[spec 007 v0.2](./007-register-page.md) 對齊 [backend spec 008 v0.6](../../../backend/docs/specs/008-auth-flow-password.md) 既有 `POST /auth/register`（**BE 已實作**，不再「未實作」）；路徑也由 `/admin` 改為 `/register` 解 BE `role=ADMIN` 命名衝突。FE hook / BFF route 待補
- ~~**session 過期**：CMS 頁沒做 session check~~ → ✅ v0.6：[spec 010 `/cms` Auth Gate](./010-cms-auth-gate.md) 雙層 gate 落地
- **登入後 redirect 來源 / `?next=`**：見 [spec 010 §7](./010-cms-auth-gate.md#7-開放問題) 第一條 OQ（同議題在 010 集中討論）
- **「demo」UX**：底線連結比較像「skip link」風格；若評審覺得需要更明顯的「訪客模式」按鈕，可改成 outline button

---

## 7. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 初版：`/` 改首頁登入入口（取代 redirect），加 `LoginCard` + `/admin` / `/dashboard` placeholder；smoke e2e 同步改寫 |
| 0.2 | 2026-06-15 | 新增 §4 Smart Back Navigation：`useInAppNav` Context（pathname diff in-memory tracking）+ `useSmartBack(fallback)` hook；TopNav 預設改用之（[003b v0.3](./003b-topnav.md)）；CharityListShell 拿掉手動 `onBack`；補 §4.4 行為矩陣 + §5.2/§5.3 測試清單 |
| 0.3 | 2026-06-16 | skip link 文案「我不想登入」→「demo」（更直白表達訪客 / 展示模式；與作業繳交「附 demo 連結」的脈絡更一致）。`src/app/page.tsx`、`tests/e2e/smoke.spec.ts`、`docs/brief.md` §3、本 spec §2 ASCII + §3 行為表 + §4.4 / §6 行文同步 |
| 0.4 | 2026-06-16 | **`/admin` 路徑 → `/register`**（隨 [spec 007 v0.2](./007-register-page.md) 重寫對齊 [BE spec 008 v0.6](../../../backend/docs/specs/008-auth-flow-password.md)）：原本「建立帳號」placeholder 掛在 `/admin`，與 BE `role=0=ADMIN` 概念衝突（BE 有 `requireAdmin` preHandler）。把公開註冊入口拆到 `/register`，`/admin` 留給未來真正的 admin 後台。`src/app/admin/` 整目錄移到 `src/app/register/`；LoginCard `router.push('/register')` + 對應 component test；spec 005 §1 路徑、§3 行為表、§4 placeholder 章節（標題從「/admin 與 /dashboard」改為「/register 與 /dashboard」+ 新增「為何 v0.4 改路徑」段落）、§5.1 client test row、§6 OQ 同步 |
| 0.5 | 2026-06-16 | **`/dashboard` 路徑 → `/cms`**：後台主要做 charity / project / sale-item 三類資料 CRUD（對應 BE spec 020 三套 admin route），語意上是 content management 而非 analytics dashboard；改名讓路徑與業務領域對齊，也避開 Grafana 等觀測 dashboard 的命名噪音。`src/app/dashboard/` 整目錄移到 `src/app/cms/`、component 改名 `DashboardPage` → `CmsPage`；LoginCard `router.push('/cms')` + 對應 test、spec 007 RegisterCard `router.push('/cms')` + 對應 test 同步；spec 005 §1 路徑、§3 行為表、§4 placeholder 章節（標題改「/register 與 /cms」+ 新增「為何 v0.5 改路徑」段落）、§5.1 client test row、§6 OQ 同步；spec 007 §1 / §2 / §4 / §5.2 / §6 / §7.1 / §7.3 同步；brief.md §3 同步 |
| 0.6 | 2026-06-16 | **`/cms` Auth Gate 上線**（Next.js 16 Proxy + RSC 雙層）：(a) 新 `src/proxy.ts`（Next 16 把 Middleware 改名 Proxy）matcher `['/cms', '/cms/:path*']`、edge runtime 做 `streamsight_session` cookie presence optimistic check，無 cookie → 307 `/`；(b) `src/app/cms/page.tsx` 改 async RSC、`await getSessionService().get()` 做 full validation（iron-session decrypt + Redis lookup），`null` → `redirect('/')`、render 改顯示 `session.user.name`；(c) 對齊 [Next.js 16 auth 指南](../../node_modules/next/dist/docs/01-app/02-guides/authentication.md) 「Optimistic checks with Proxy + Data Access Layer」雙層 pattern；本 spec §4a / §5.3a 為 stub，完整脈絡 / threat model / 行為矩陣 / OQ 抽到新 **[spec 010 `/cms` Auth Gate](./010-cms-auth-gate.md) v0.1** |
| 0.7 | 2026-06-17 | **登入路徑改名 `/api/dev/login` → `/api/auth/login`**：原 dev-only 命名隨 v0.3 接真實 BE `/auth/login` 已不再貼切；本版同步搬到 `src/app/api/auth/login/`、移除 `ENABLE_DEV_LOGIN` env gate 與 `DEV_ADMIN_USERNAME / PASSWORD` body fallback，body schema 變成 required `{ identifier, password }`。`LoginCard.tsx` fetch URL + comment + `LoginCard.test.tsx` 第 6 case 斷言同步；本 spec §3、§5.1 同步 |
| 0.8 | 2026-07-18 | **規格測試案例與實作對齊**（spec 012b §1 移除公開自助註冊後的落差補正）：§2 Layout 移除「建立帳號」按鈕；§3 行為表移除「按建立帳號」列；§5.1 case 2 改為「無建立帳號按鈕」斷言、刪除 case 8；§5.2 e2e 修正「兩顆按鈕」描述。 |
