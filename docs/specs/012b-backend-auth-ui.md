# Spec 012b — Backend Auth：UI 面向（註冊面移除 / 登入表單）

狀態：Draft **v0.1**（2026-07-18，自 spec 012 v0.4 拆出）
關係：本檔為 [spec 012（索引）](./012-backend-auth-integration.md) 的**UI 半**。
契約 / BFF / adapter 等業務邏輯見 [spec 012a](./012a-backend-auth-logic.md)。

> **本檔刻意較薄**：spec 012 幾乎全是後端契約與 BFF 邏輯；面向瀏覽器的 UI 變更只有兩塊——
> **移除公開自助註冊**、**登入表單維持不變**。兩者皆屬「純視覺 / user flow」，依 CLAUDE.md
> 可後補測試、由 e2e 兜底。

> 章節號對照（供外部引用定位）：本檔 §1＝原 012 §5.3、§2＝原 §5.9（UI 部分）。

---

## 1. 移除首頁公開自助註冊（最終決策，2026-07-18）

**決策（[索引 §OQ-Q3](./012-backend-auth-integration.md) 最終反轉）**：**新增 admin 一律由已登入的 SUPER_ADMIN
建立**，不做首頁匿名自助註冊。理由：後端既有 admin 建立途徑（[012a §2.8](./012a-backend-auth-logic.md)）
皆需 SUPER_ADMIN 或 seed，開放公開註冊會違背「受保護 root」安全模型。

### 1.1 淘汰清單（UI + 對接）

| 檔案 | 現況 | 處置 |
|---|---|---|
| `src/app/register/RegisterCard.tsx` | 存在（公開註冊表單） | **淘汰**（刪除，或整段移除） |
| `src/app/register/page.tsx` | 存在（`/register` 頁） | **淘汰**，或改 `redirect('/login')`（擇一，見 §1.2） |
| `src/app/api/auth/register/route.ts` | 存在（對接 `/auth/register` 一般 user） | **淘汰**（本專案不碰一般 user） |
| 首頁「建立帳號」入口連結 | （若有）指向 `/register` | 移除 |
| register 相關 mock / 測試 | 存在 | 一併移除，避免殘留失敗 |

> ♻️ **淘汰前先搬走可複用 pattern**：`RegisterCard.tsx` 的**多欄驗證骨架 + 409 衝突處理**（client+server
> 錯誤分離）是 [spec 013b](./013b-admin-management-ui.md) `AdminFormSheet`（新增 admin，username 409）的好範本；
> `src/app/auth/Field.tsx`（label+input+aria）可續用。**刪 RegisterCard 之前先把這兩者的 pattern 移過去**，別直接連同範本一起刪。

### 1.2 `/register` 的處置：刪除 vs redirect

- **建議**：`page.tsx` 改為 `redirect('/login')`（保留 URL 不 404，對舊書籤友善），並刪 `RegisterCard`。
- 或整條路由刪除（`/register` → 404）。二擇一，屬視覺/路由決策，e2e 覆蓋「訪 `/register` 的結果」即可。

### 1.3 Admin 帳號從哪裡建

- Admin 建立/管理移到 **CMS 內、限 SUPER_ADMIN**，對接後端既有 `POST /admin/admins` 等端點 → 見 **[spec 013b（Admin 管理 UI）](./013b-admin-management-ui.md)** 的 `AdminFormSheet`（新增 admin）。

---

## 2. 登入表單：維持不變

- **登入表單「帳號」欄位維持 username 語意**（**不改 Email**——後端 admin 無 email，以 username 登入；v0.1 的「改 Email」提案作廢）。
- `LoginCard` **行為不變**：欄位維持 username / password，送 BFF `/api/auth/login`（BFF 內部欄位映射 `identifier→username` 由 [012a §4.2](./012a-backend-auth-logic.md) 吸收，UI 無感）。
- BFF 對外回應形狀不變（[012a §4.9](./012a-backend-auth-logic.md)），故 LoginCard **無需改動**。
- 憑證錯 → 顯示「帳號或密碼錯誤」（後端 401 統一模糊訊息）。

---

## 3. 實作步驟（UI）

> 對應 [012a §6](./012a-backend-auth-logic.md) 實作順序的 step 7（可與邏輯步驟並行，建議排在邏輯 login/refresh 綠之後，避免同時動太多）。

1. 移除 `RegisterCard` / `register/route.ts` / 首頁註冊入口 / 相關 mock 與測試（§1.1）。
2. `/register/page.tsx` 改 `redirect('/login')` 或刪路由（§1.2）。
3. 確認 `LoginCard` 無需改動（§2），只跑既有測試確保綠。

## 4. 驗收（UI / e2e）

- [ ] register 相關檔案（`RegisterCard`/`/register`/`register/route.ts`/mock）已淘汰、無殘留測試失敗。
- [ ] 訪 `/register` 依 §1.2 決策：redirect 到 `/login`（或 404），不再顯示註冊表單。
- [ ] 首頁無「建立帳號」公開入口。
- [ ] LoginCard 以 username/password 登入成功 → 進 `/cms`（沿用 [012a](./012a-backend-auth-logic.md) 的 e2e happy path）。

---

最後更新：2026-07-18（v0.2，自 spec 012 v0.4 拆出 UI 半；+§1 RegisterCard pattern 搬移提醒）
