# Spec 013 — Admin 管理頁面（CMS）（索引）

狀態：**已實作（2026-07-18）**（索引 v0.5）— 子檔 [013a](./013a-admin-management-logic.md) / [013b](./013b-admin-management-ui.md) 皆已落地並對齊
取代：**覆寫 spec 011「使用者管理」的資料模型假設**。spec 011 假設 CMS 管理的是「User 帳號」
（`email` + `isActive`）；**本專案不碰一般 user**（見 [spec 012a §2.1 名詞 / 012 §OQ-Q5](./012-backend-auth-integration.md)），
CMS 實際管理的是**其他 admin 帳號**（`username` + `name` + `admin_role` + 封存/軟刪除生命週期 + 受保護 root）。
本組規格為 **admin 管理頁面的權威規格**，spec 011 的 `/cms/users` 靜態 UI 需依本組重構。

> **v0.4 變更**：依「業務邏輯 / UI 元件」拆分為兩個子檔，本檔轉為**索引**（範圍、依賴、待決策、章節重定向）。
> 原內容分流至：
> - **[spec 013a — 業務邏輯](./013a-admin-management-logic.md)**：後端契約、授權模型（雙層 gate）、
>   `createAdminRoute`、BFF 路由表、mock 分層、Zod 契約、mutation/錯誤映射、邏輯 TDD。
> - **[spec 013b — UI 元件](./013b-admin-management-ui.md)**：CMS layout/nav（待建）、頁面/元件結構、
>   列表/表單/升降權/生命週期/自助設定 UI、與靜態 UI 遷移、UI/e2e 測試。

---

## 1. 目的與範圍

讓已登入的 **SUPER_ADMIN** 在 CMS 內管理其他 admin 帳號的完整生命週期，對接後端既有 `/admin/admins/...`
端點（見 [013a §1](./013a-admin-management-logic.md)）。

**範圍（本期）**：
- Admin 列表（狀態篩選 全部/啟用(active)/已封存(archived)、搜尋）
  > v0.5（2026-07-18）：列表**不含已刪除**——移除「已刪除」tab 且前端濾除軟刪除列；軟刪除/復原能力保留，
  > 復原入口改置他處（待定）。後端 `status` 仍支援 `deleted|all`（[013a §1.1](./013a-admin-management-logic.md)）。詳見 [013b §2.1/§2.4](./013b-admin-management-ui.md)。
- 新增 admin（username + name + password + admin_role）／明細檢視／更新顯示名／升降權
- 生命週期：封存 / 解除封存 / 軟刪除 / 復原
- 自助改密碼（`/cms/settings`，改自己密碼）
- **CMS layout + nav**（本期新建的隱性交付項，見 [013b §1](./013b-admin-management-ui.md)）

**不在範圍**：一般 user 管理（本專案無 user）；重設他人密碼（後端不提供）；改 username / transfer ownership /
切換 `is_protected`（後端不開放）；公開自助註冊（[spec 012 §OQ-Q3](./012-backend-auth-integration.md) 已否決）。

---

## 2. 依賴與順序約束

### 2.1 硬前置（**必須先落地**，否則本頁無法正確運作）

1. **[spec 012a](./012a-backend-auth-logic.md) 核心 auth bridge**（login 改打 `/admin/auth/login`、Role 對齊、refresh 修正）——否則登不進 CMS。
2. **[012a §4.8](./012a-backend-auth-logic.md)**：session 帶 **`adminRole`**——SUPER_ADMIN gate（頁面 + BFF）直接依賴。
3. **[012a §4.10](./012a-backend-auth-logic.md)**：`backendFetch` 扁平錯誤碼解析 + 401 refresh 策略修正——本頁每個 `/admin/admins` 呼叫皆為已登入呼叫。

> 上述 1–3 全在 spec 012 範圍。**spec 013 的開發排在 spec 012 完成之後。**

### 2.2 一般依賴

- **[spec 012a](./012a-backend-auth-logic.md)**（後端 auth 契約，權威）：欄位命名 / role 值 / 端點 / adapter 一律以此為準。
- **spec 010（CMS Auth Gate）**：`/cms*` proxy + RSC 登入守門；本頁掛 `/cms` 底下。
- 既有 `createRoute`、`backendFetch`、iron-session/Redis session、CSRF（spec 001b/c/d）、spec 006（錯誤處理）。
- UI primitives：`BottomSheet`、`EmptyState`、`InlineError`、`Spinner`、`Toggle`（既有）。

---

## 3. 子檔與章節重定向表

| 舊 spec 013 §X | 主題 | 現位置 |
|---|---|---|
| §1 目的與範圍 | — | 本檔 §1 |
| §2 依賴 | 硬前置 / 一般依賴 | 本檔 §2 |
| §3（§3.1–3.2） | 後端契約、DTO、業務規則 | [013a §1](./013a-admin-management-logic.md) |
| §4 授權模型 | 雙層 gate | 邏輯→[013a §2](./013a-admin-management-logic.md)；導覽可見性(UI)→[013b §1](./013b-admin-management-ui.md) |
| §5（§5.1–5.3） | createAdminRoute / 路由表 / mock 分層 | [013a §3](./013a-admin-management-logic.md) |
| §6 Zod 契約 | schemas/admin.ts | [013a §4](./013a-admin-management-logic.md) |
| §7 頁面與元件結構 | page / table / form / lifecycle | [013b §2](./013b-admin-management-ui.md) |
| §8 資料抓取與 mutation | TanStack Query / 錯誤映射 | [013a §5](./013a-admin-management-logic.md) |
| §9 TDD 測試計畫 | — | 邏輯→[013a §6](./013a-admin-management-logic.md)；UI/e2e→[013b §4](./013b-admin-management-ui.md) |
| §10 與靜態 UI 遷移 | /cms/users→/cms/admins | [013b §3](./013b-admin-management-ui.md) |
| §11 Open Questions | Q1–Q6 | 本檔 §4 |

---

## 4. 待決策（Open Questions；全定案）

- **Q1（路由命名）**：✅ 採 **`/cms/admins`**，`/cms/users` → redirect（[013b §2/§3](./013b-admin-management-ui.md)）。
- **Q2（CMS 對非 super_admin）**：✅ gate 在**頁面層**——`/cms/admins` 只有 SUPER_ADMIN 進得去；非 super
  仍可登入 CMS、只是導覽不顯示入口，直打 `/cms/admins` → `redirect('/cms?reason=not-super-admin')`。不把整個 CMS 鎖成 super-only。
- **Q3（分期）**：✅ **本期一次做完整生命週期**（列表+新增+改名+升降權+封存/解封存+軟刪除/復原+自助改密碼）。後端端點皆已就緒。
- **Q4（自助改密碼歸屬）**：✅ 放**獨立 `/cms/settings` 頁**（任何已認證 admin 皆可用）。
- **Q5（依賴 012 adminRole）**：✅ 已釘——`adminRole` 存 session 納入 [012a §4.8](./012a-backend-auth-logic.md) 本期必做。
- **Q6（執行期 mock harness 擴充）**：✅ **本期一併擴充** `registerMock`/`resolveMock`（`dispatch.ts`）支援
  **中段 `:param`**，讓生命週期端點可跑 `USE_MOCK=1` happy-path e2e。仍維持「錯誤/守衛用 MSW、執行期 mock 只保
  happy path」（[013a §3.3](./013a-admin-management-logic.md)）。

> **所有決策已定案**——本組 spec 進入 dev-ready，可於 spec 012 前置完成後開工。

---

## 5. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-07-18 | 初版：admin 管理頁面權威規格，取代 spec 011 資料模型。 |
| 0.2 | 2026-07-18 | §11 五項決策全定案 + dev-ready 修訂。 |
| 0.3 | 2026-07-18 | dev-ready 收尾：時間戳定 ISO 字串、`/api/cms/me*` 用 `createRoute`、標註 CMS layout/nav 為待建交付項。 |
| 0.4 | 2026-07-18 | **依「業務邏輯 / UI 元件」拆分**為 [013a](./013a-admin-management-logic.md)（邏輯）+ [013b](./013b-admin-management-ui.md)（UI）；本檔轉索引。內容不變，僅重組。 |
| 0.5 | 2026-07-18 | **設計修訂**：Admin 列表移除「已刪除」狀態 tab、前端濾除軟刪除列（§1 範圍）；軟刪除/復原能力保留，復原入口改置他處（待定）。同步 [013b v0.5](./013b-admin-management-ui.md)。 |

---

最後更新：2026-07-18（v0.5，列表移除「已刪除」tab；軟刪除/復原保留但入口改置他處。同步 013b v0.5）
