# Spec 005：首頁 + 後台入口

- **狀態**：Draft（v0.2 — 補 §4 smart back navigation hook 設計）
- **建立日期**：2026-06-15
- **路徑**：
  - `src/app/page.tsx`（首頁 RSC）
  - `src/app/LoginCard.tsx` / `.test.tsx`（登入卡 client component）
  - `src/app/admin/page.tsx`（建立帳號 placeholder）
  - `src/app/dashboard/page.tsx`（登入後 placeholder）
  - `src/lib/hooks/useInAppNav.tsx` / `.test.tsx`（§4 Context + Provider，v0.2）
  - `src/lib/hooks/useSmartBack.ts` / `.test.tsx`（§4 返回鈕智慧路由，v0.2）
- **依賴**：
  - 既有 `POST /api/dev/login`（`src/app/api/dev/login/route.ts`，限 `ENABLE_DEV_LOGIN=1` + 非 production，無需 payload）
  - Design system tokens（[003a](./003a-design-system.md)）

---

## 1. 職責

`/` 從「`redirect('/donation')` 直送公開列表」改為「先看到登入入口」。主要為作業展示用：示範 BFF 已有 session / cookie 機制（iron-session + Redis store）能跑通，順帶讓「公開頁」與「後台頁」在 routing 上分得開。

---

## 2. Layout

對齊 [/donation](./003i-charity-list-shell.md) 視覺風格：brand 紅 header（無 back 按鈕，因為這是 root）+ 卡片風內容區。

```
┌─────────────────────────────────┐
│       JKODonation (brand 紅)    │ ← h1，置中
├─────────────────────────────────┤
│                                 │
│      ┌─────────────────┐        │
│      │ 登入             │        │ ← h2
│      │ 帳號 [____]     │        │
│      │ 密碼 [____]     │        │
│      │ [   登入後台   ] │        │ ← bg-brand text-white
│      │ [   建立帳號   ] │        │ ← outline brand
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
| 兩欄都有值 + 按「登入後台」 | `POST /api/dev/login` → 200 → `router.push('/dashboard')`；非 200 → 顯示 inline `<p role="alert">登入失敗 (HTTP {code})</p>`、不跳轉 |
| 按「建立帳號」 | `router.push('/admin')`，**不**打 API |
| 按「demo」 | `<Link href="/donation">`，普通 navigate |
| 登入 in-flight | 按鈕文字「登入中…」、disabled，避免重複送出（`useTransition` 管 isPending） |

> **帳密目前是 cosmetic** — `/api/dev/login` 不收 payload，client 端只做「非空」前端驗證。未來若接真實登入，這支 endpoint / hook 換掉即可，UI 不需動。

---

## 4. /admin 與 /dashboard placeholder

兩頁都是最小可運行 RSC，視覺對齊首頁（brand 紅 header + 內容置中）。功能：

- `/admin`：placeholder 顯示「建立帳號功能尚未開發」+ 返回首頁 link。**準生產規格見 [spec 007 建立帳號頁](./007-register-page.md)**（UI / BFF route / backend contract 已設計，等 backend `POST /v1/auth/register` 實作後可整批替換 placeholder）
- `/dashboard`：顯示「歡迎進入後台」+ 提示 session cookie 已建立 + 連到 `/donation` link

> dashboard 真功能規劃未來再開 spec；admin 規劃已收斂於 007。

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

---

## 5. 測試

### 5.1 `LoginCard.test.tsx`（client，TDD 強制）

| # | 案例 | 期望 |
|---|---|---|
| 1 | 渲染 username + password input | `getByLabelText('帳號')` / `('密碼')` 都存在 |
| 2 | 渲染「登入後台」+「建立帳號」按鈕 | 兩顆都在 DOM |
| 3 | username 空 → 登入 disabled | OK |
| 4 | password 空 → 登入 disabled | OK |
| 5 | 兩欄都有值 → 登入 enabled | OK |
| 6 | 登入成功 → POST /api/dev/login + push('/dashboard') | mock fetch 200，assert call args + router push |
| 7 | 登入失敗 → 顯示 `role="alert"`、不 push | mock fetch 500 |
| 8 | 「建立帳號」→ push('/admin')、不打 API | OK |

### 5.2 e2e（`tests/e2e/smoke.spec.ts`）

| 測試 | 涵蓋 |
|---|---|
| `/ 顯示登入卡片 + skip link 可進 /donation` | header / 帳密欄 / 兩顆按鈕 / skip link → /donation |
| `/donation 直接訪問按返回 → 跳 /（smart back fallback）` | §4.2 + §4.4 「直接訪問」列 |
| `/ → demo → /donation 按返回 → 回 /（smart back via router.back）` | §4.2 + §4.4 「站內 nav」列 |

> 原本「`/` redirects to /donation」的 e2e 改寫，因為 redirect 不再發生。

### 5.3 `useInAppNav.test.tsx` / `useSmartBack.test.tsx`（v0.2）

- 無 Provider → `useHasInAppNavigated` 回 false
- Provider 內 pathname 未變 → false；pathname 變 → true
- 變動後再回到初始 pathname → 仍 true（不 reset）
- `useSmartBack`：hasNavigated false → push(fallback)；true → router.back()
- fallback 預設 `/`

---

## 6. 開放問題

- ~~**真實註冊 / 登入流程**：`/admin` 想接真註冊表單時要決定 `POST /api/auth/register` shape（backend 目前無此 endpoint）；本 spec 範圍只到 placeholder~~ → ✅ 已於 [spec 007](./007-register-page.md) 收斂（UI / BFF / backend contract 全套），等 backend 實作即可替換
- **session 過期**：dashboard 沒做 session check；現在進 `/dashboard` 不會驗證 cookie 是否還有效。可加 RSC `await getSessionService().get()` → 沒 session 就 `redirect('/')`
- **登入後 redirect 來源**：目前固定跳 `/dashboard`；如果想做「登入前嘗試訪問 X 頁，登入後跳回 X」，需要在 query 帶 `?next=`
- **「demo」UX**：底線連結比較像「skip link」風格；若評審覺得需要更明顯的「訪客模式」按鈕，可改成 outline button

---

## 7. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-15 | 初版：`/` 改首頁登入入口（取代 redirect），加 `LoginCard` + `/admin` / `/dashboard` placeholder；smoke e2e 同步改寫 |
| 0.2 | 2026-06-15 | 新增 §4 Smart Back Navigation：`useInAppNav` Context（pathname diff in-memory tracking）+ `useSmartBack(fallback)` hook；TopNav 預設改用之（[003b v0.3](./003b-topnav.md)）；CharityListShell 拿掉手動 `onBack`；補 §4.4 行為矩陣 + §5.2/§5.3 測試清單 |
| 0.3 | 2026-06-16 | skip link 文案「我不想登入」→「demo」（更直白表達訪客 / 展示模式；與作業繳交「附 demo 連結」的脈絡更一致）。`src/app/page.tsx`、`tests/e2e/smoke.spec.ts`、`docs/brief.md` §3、本 spec §2 ASCII + §3 行為表 + §4.4 / §6 行文同步 |
