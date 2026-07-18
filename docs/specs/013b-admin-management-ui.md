# Spec 013b — Admin 管理：UI 元件（頁面 / 元件 / 視覺 / 遷移 / e2e）

狀態：Draft **v0.1**（2026-07-18，自 spec 013 v0.3 拆出）
關係：本檔為 [spec 013（索引）](./013-admin-management-page.md) 的**UI 半**。
契約 / 授權 / BFF / mutation 等業務邏輯見 [spec 013a](./013a-admin-management-logic.md)。

> 章節號對照（供引用定位）：本檔 §2＝原 013 §7、§3＝原 §10（遷移）、§1＝原 §4 導覽可見性（UI 部分）、
> §4＝原 §9 的 UI/e2e 部分。

> **依賴**：本檔所有動作可用性、狀態呈現皆依 [013a §1.2 業務規則](./013a-admin-management-logic.md) 與
> [013a §5 mutation](./013a-admin-management-logic.md)。UI 只做 affordance，**權威是後端 422**。
> UI primitives（既有）：`BottomSheet`、`EmptyState`、`InlineError`、`Spinner`、`Toggle`。
> 設計系統：深色 observability 主題（deep-slate 底 + electric cyan accent），token 見 `src/app/globals.css`
> （語義 token：`brand`/`ink-*`/`surface-*`/`line`/`ok`·`warn`·`danger`，不寫 hex）。

---

## 0. 復用對照（既有資產，開發前先讀）

> 2026-07-18 盤點結果。**多數 UI 積木已存在**；本頁大多是「改造既有靜態 UI」而非從零刻。

### 0.1 直接複用（as-is）

| 既有檔 | 用途 | 用在 |
|---|---|---|
| `src/components/ui/BottomSheet.tsx` | portal 抽屜(focus trap/Esc/scroll lock) | 表單 sheet、刪除/生命週期確認 |
| `src/components/ui/Spinner.tsx` | 載入 spinner | query/mutation pending |
| `src/components/ui/EmptyState.tsx` | 空狀態圖+文案 | 列表無資料 |
| `src/components/ui/InlineError.tsx` | 區塊錯誤+重試鈕 | 列表 query error |
| `src/lib/hooks/useDebouncedValue.ts` | debounce | 搜尋輸入 |
| `src/lib/hooks/useUrlSync.ts` | 狀態同步到 URL `?key=` | 狀態 tab / 搜尋字串 |
| `src/lib/hooks/useViewport.ts` | RWD 斷點 | 卡片↔表格切換 |
| `src/lib/hooks/useSmartBack.ts` | 智慧返回 | sheet 關閉鈕 |
| `src/lib/client/csrf.ts` `getCsrfToken()` | client 取 CSRF token | **所有 mutation 前呼叫**(已存在，勿新造) |
| `src/app/providers.tsx` | Toaster(sonner) + QueryClient 已掛載 | `toast.success/error()`、`useQuery/useMutation` |
| `src/lib/errors/globalQueryError.ts` | 5xx 自動 toast | 免手動處理 mutation 5xx |
| `src/app/globals.css` | 設計 token `brand`/`ink-*`/`surface-*`/`line`/`ok`/`warn`/`danger` | 全部樣式 |

### 0.2 複用為模板（複製 + 改欄位）

| 既有檔 | → 新檔 | 改什麼 |
|---|---|---|
| `src/app/cms/users/page.tsx` | `cms/admins/page.tsx` | 掛 `requireSuperAdminSession()` |
| `src/app/cms/users/UsersTable.tsx` | `AdminsTable.tsx` | 欄位 `{name,email,isActive}`→`{username,name,adminRole,生命週期}`；搜尋/狀態 tab/RWD/確認流程照用 |
| `src/app/cms/users/UserFormSheet.tsx` | `AdminFormSheet.tsx` | 加 `username`/`password`/`adminRole` 欄；驗證骨架照用 |
| `src/app/cms/users/mock-users.ts` | （靜態階段可留，接資料後移除） | — |
| `src/app/LoginCard.tsx`（表單+`useTransition`+inline error+POST 流程） | `ProfileForm`（改密碼） | 換欄位/端點 `/api/cms/me/password` |
| `src/app/register/RegisterCard.tsx`（多欄驗證 + **409 衝突處理**） | `AdminFormSheet` username 409 UX | ⚠️ RegisterCard 即將淘汰([012b §1](./012b-backend-auth-ui.md))，**刪它前先把 409 pattern 搬走** |

### 0.3 建議順手抽成共用 primitive（目前寫死在 UserFormSheet/UsersTable 內）

- `FormField`（label+input+inline error）→ `src/components/ui/FormField.tsx`
- `Toggle`（role=switch）→ `src/components/ui/Toggle.tsx`
- `StatusBadge` → `src/components/ui/StatusBadge.tsx`（active/archived/deleted 由 prop 驅動）
- `formatDate(iso)` → `src/lib/date.ts`

> 抽出後 `AdminsTable`/`AdminFormSheet` 與既有 `/cms/users`（遷移前）共用，減少重複。屬重構、非新功能。

### 0.4 真正新建（無現成）

`AdminRoleControl`（role `select`：super_admin/editor/viewer）、`AdminLifecycleMenu`、
`cms/layout.tsx` + `CmsNav.tsx`（§1）、`ProfileForm`（可從 LoginCard 改）。

---

## 1. CMS 導覽（**本期待建的隱性交付項**）

- **現況缺口（2026-07-18 查證）**：`src/app/cms/` 底下**目前只有 `users/` 單頁，無 `layout.tsx`、無任何
  CMS nav 元件、無指向 `/cms` 的連結**。
- **本期需新建**：
  - `src/app/cms/layout.tsx`（RSC 外殼）：取 session，交給 `CmsNav` 決定入口可見性。
  - `src/app/cms/CmsNav.tsx`（client）：依 session `adminRole` 條件渲染——**只在 `adminRole==='super_admin'`
    顯示「管理員管理」入口**（editor/viewer 登入 CMS 看不到此入口）。
- **定位**：導覽可見性**純 UX、非安全邊界**。真 gate 是 [013a §2](./013a-admin-management-logic.md) 的
  `requireSuperAdminSession()`（頁面）+ `createAdminRoute`（BFF）。即使 nav 未建好或被繞過，直打 `/cms/admins`
  仍會被頁面 gate 導回 `/cms?reason=not-super-admin`。故 nav 可與功能並行、**非硬前置**。

---

## 2. 頁面與元件結構

路徑：**`/cms/admins`**（語意正確；`/cms/users` 靜態 UI 遷移至此並重構，見 §3）。

```
src/app/cms/
├── layout.tsx               # 新：CMS 外殼（RSC）；取 session 交給 CmsNav（§1）
├── CmsNav.tsx               # 新：client 導覽；adminRole===super_admin 才顯示「管理員管理」入口（§1）
src/app/cms/admins/
├── page.tsx                 # RSC 外殼：await requireSuperAdminSession()，首屏列表交給 client
├── AdminsTable.tsx          # client：列表 + 搜尋 + 狀態 tab + 分頁 + 開 sheet / 動作
├── AdminFormSheet.tsx       # client：新增（username+name+password+role）/ 改名 共用
├── AdminRoleControl.tsx     # client：升降權（select super_admin/editor/viewer）
├── AdminLifecycleMenu.tsx   # client：封存/解封存/軟刪除/復原 + 確認對話
└── *.test.tsx               # 邏輯類（篩選、動作可用性、mutation）強制 TDD（§4）
src/app/cms/settings/
├── page.tsx                 # 自助：改自己密碼（POST /api/cms/me/password）
└── ProfileForm.tsx
```

### 2.1 列表 UI（AdminsTable）

- 欄位：`name` / `username`（取代舊 email）、`adminRole` 徽章、狀態徽章（active / archived / deleted，取自
  `isActive`/`archivedAt`/`deletedAt`）、`createdAt`、操作。
- 狀態 tab：全部 / 啟用(active) / 已封存(archived) / 已刪除(deleted) → 對映 `status` 查詢參數。
- 搜尋：先做前端 client 過濾（admin 量少）；分頁用 `limit/offset`（預設 50）。
- **每列動作依業務規則動態呈現**（[013a §1.2](./013a-admin-management-logic.md)）：
  - `isProtected` → 顯示「root」標記，所有變更動作禁用。
  - `adminRole==='super_admin'`（非 root）→ 不顯示直接封存/刪除，只顯示「先降級」。
  - 「自己那列」（`row.id === myAdminId`，`myAdminId` 來自 `/api/cms/me`）→ 禁用危險動作。
  - 一般列：改名 / 升降權 / 封存(或已封存→解封存) / 刪除(或已刪→復原)。

### 2.2 表單（AdminFormSheet）

- 新增：`username`（唯一、可 normalize）、`name`、`password`、`adminRole`（select，預設 viewer）。
- 改名：只 `name`（username 唯讀、role 走 `AdminRoleControl`）。
- 掛既有 `BottomSheet`，沿用 spec 011 表單結構但改欄位；409/400/422 inline（碼/訊息來源見 [013a §1.2](./013a-admin-management-logic.md)）。

### 2.3 升降權（AdminRoleControl）

- `select` 三值（super_admin / editor / viewer），送 `PUT /api/cms/admins/[id]/role`。
- 對受保護 root、對自己提權 → 後端 422，UI 依規則預先禁用（[013a §1.2](./013a-admin-management-logic.md)）並以 toast 顯示後端 message。

### 2.4 生命週期（AdminLifecycleMenu）

- 封存 / 解除封存 / 軟刪除 / 復原，各帶確認對話（`BottomSheet`；破壞性用 `bg-danger` 確認鈕）。
- 動作可用性依當前狀態與規則呈現（archived 顯示「解除封存」、deleted 顯示「復原」等）。

### 2.5 自助設定（/cms/settings）

- **改自己密碼**：`ProfileForm` 送 `POST /api/cms/me/password`（`{ currentPassword, newPassword }`）。
- 成功(204)後：後端已撤所有 refresh token → 前端 **destroy session + 導登入**，提示重登（[013a §5](./013a-admin-management-logic.md)）。
- 任何已認證 admin 皆可用（非 super 也行）；日後好擴充其他自助設定。

---

## 3. 與既有靜態 UI 的遷移

spec 011 的 `/cms/users` 靜態 UI（`UsersTable`/`UserFormSheet`/`mock-users`）：
- 欄位模型 `{ name, email, isActive }` → `{ username, name, adminRole, isProtected, isActive, archivedAt, deletedAt }`。
- 「刪除=永久」改為「軟刪除(可復原) + 封存」兩種生命週期。
- 新增「升降權」與「受保護 root/兩步移除」的 UX 規則。
- 移至 `src/app/cms/admins/`；**`/cms/users` → `/cms/admins` redirect**（Q1 已定案）。

---

## 4. UI / e2e 測試

**強制 TDD（元件邏輯類）**：
- `AdminsTable`：動作可用性矩陣（protected / super_admin / self / archived / deleted 各情境顯示對的按鈕）；
  狀態 tab 切換打對的 query；mutation 後 invalidate。
- `AdminFormSheet`：新增必填擋 submit、username 格式 inline、409 inline「帳號已被使用」、成功關 sheet + invalidate。
- `AdminRoleControl` / `AdminLifecycleMenu`：依狀態/規則呈現對的選項與確認流程。

**可後補（視覺類，e2e 兜底）**：純排版、徽章樣式、`CmsNav` 呈現。

**E2E（PR 前，`USE_MOCK=1`，只 happy path）**：super_admin 登入→進 `/cms/admins`→建立 viewer→升為 editor→
封存→解封存→軟刪除→復原；非 super_admin 進 `/cms/admins` 被導回 `/cms`。
（前置：`admin-mock` handlers + 擴充 harness 支援中段參數，[013a §3.3](./013a-admin-management-logic.md)；Q6 已定案本期做。）
- 錯誤/守衛路徑（受保護 root、兩步移除、409、422）**不進 `USE_MOCK=1` e2e**，由 MSW 單元/整合測試覆蓋
  （[013a §3.3-2](./013a-admin-management-logic.md)、[013a §6](./013a-admin-management-logic.md)）。

---

最後更新：2026-07-18（v0.2，自 spec 013 v0.3 拆出 UI 半；+§0 復用對照）
