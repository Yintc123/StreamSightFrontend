# Spec 012 — Backend Auth 契約與 BFF 對接重規劃（索引）

狀態：**已實作（2026-07-18）**（索引 v0.6）— 子檔 [012a](./012a-backend-auth-logic.md) / [012b](./012b-backend-auth-ui.md) 皆已落地並對齊
取代：本組規格為 **BFF ↔ 後端 auth 對接的權威契約**，覆寫 spec 005 / 007 / 010 中對「舊 JKODonation
後端」的過時假設（欄位名、`/auth/me`、role 值、token 形狀）。

> **v0.5 變更**：依「業務邏輯 / UI 元件」拆分為兩個子檔，本檔轉為**索引**（範圍、依賴、實作總順序、
> 跨切決策、章節重定向）。原內容分流至：
> - **[spec 012a — 業務邏輯](./012a-backend-auth-logic.md)**：後端契約、Gap Analysis、BFF adapter、
>   role 對齊、`backendFetch` 修正、refresh、schemas、邏輯 TDD/驗收。
> - **[spec 012b — UI 面向](./012b-backend-auth-ui.md)**：移除公開自助註冊、登入表單維持不變。

---

## 1. 目的與範圍

前端定位為 **BFF**（隱藏後端、做欄位裁切與聚合）。後端（StreamSight FastAPI，`/StreamSightBackend`）
已改寫為 **principal/role + admin username 登入 + JWT 帶 role/grade + refresh rotation** 架構。
現行 BFF auth bridge 仍照**舊 JKODonation 契約**寫，與後端多處不相容且 refresh 會反噬。

本組規格：
1. 把後端實際契約釘死為 source of truth（[012a §2](./012a-backend-auth-logic.md)，2026-07-18 對原始碼驗證）。
2. 列出與現行 BFF 的落差（[012a §3](./012a-backend-auth-logic.md)）。
3. 重規劃 BFF 對接設計（[012a §4](./012a-backend-auth-logic.md)），核心是 `backendFetch` 加一層 auth
   adapter 吸收 snake↔camel / 單位 / 欄位差異，並校正 role 值。
4. 移除公開自助註冊、確認登入表單不變（[012b](./012b-backend-auth-ui.md)）。
5. 給出實作順序與驗收清單（§4 本檔 + 各子檔）。

**不在範圍**：後端本身的修改（本組假設後端契約固定，由 BFF 貼合）。**無新增後端端點需求**
（原公開註冊端點需求已作廢，見 §OQ-Q3）。

---

## 2. 子檔與章節重定向表

外部規格（010 / 011 / 013）常以「spec 012 §X」引用本檔舊章節。拆分後對照如下：

| 舊 spec 012 §X | 主題 | 現位置 |
|---|---|---|
| §2 名詞 | principal/role/grade/token/family | [012a §1](./012a-backend-auth-logic.md) |
| §3（§3.1–3.8） | 後端契約（端點/JWT/refresh/TokenResponse/AdminResponse/錯誤/id 模型/建 admin） | [012a §2](./012a-backend-auth-logic.md)（子節號沿用，如 §3.8→012a §2.8） |
| §4 | Gap Analysis（C1–C9 / M1–M8） | [012a §3](./012a-backend-auth-logic.md) |
| §5.0–5.2, 5.4–5.8, 5.10 | BFF 邏輯設計（分流/映射/role/refresh/adminRole/錯誤契約） | [012a §4](./012a-backend-auth-logic.md)（子節號沿用，如 §5.8→012a §4.8、§5.10→012a §4.10） |
| §5.3 | 移除公開註冊 | [012b §1](./012b-backend-auth-ui.md) |
| §5.9 | 對外 BFF 契約（不變）+ LoginCard | 邏輯部分→[012a §4.9](./012a-backend-auth-logic.md)；UI→[012b §2](./012b-backend-auth-ui.md) |
| §6 後端相依 | 無新端點 + 建議 | [012a §5](./012a-backend-auth-logic.md) |
| §7 實作順序 | 逐步 TDD | 邏輯步驟→[012a §6](./012a-backend-auth-logic.md)；UI 步驟→[012b §3](./012b-backend-auth-ui.md)；總順序見本檔 §4 |
| §8 驗收清單 | Contract Tests | 邏輯→[012a §7](./012a-backend-auth-logic.md)；UI→[012b §4](./012b-backend-auth-ui.md) |
| §9 Open Questions | 產品/技術決策 | 本檔 §5 |

---

## 3. 依賴與順序約束

- **spec 010（CMS Auth Gate）**：`/cms*` proxy + RSC 登入守門；本組修正 role 值後，其 admin gate 自動正確。
- **spec 013（Admin 管理頁面）硬依賴本組**：`adminRole` 存 session（[012a §4.8](./012a-backend-auth-logic.md)）、
  `backendFetch` 401→refresh 修正（[012a §4.10](./012a-backend-auth-logic.md)）、Role 翻正——**spec 013 排在本組之後**。
- ⚠️ **Role 翻轉的順序依賴**：常數 `Role` 由 `{ADMIN:0,USER:1}` 翻正為 `{USER:0,ADMIN:1}`，所有比對
  `Role.ADMIN`/`Role.USER` 的既有測試/mock 需同批更新（[012a §4.6](./012a-backend-auth-logic.md)）。

---

## 4. 實作總順序（跨子檔）

> 全部不依賴後端新端點，可立即開工。詳細每步見各子檔。

1. schemas（`BackendTokenResponse` + `adaptTokenResponse` + `BackendAdminMeResponse`）— [012a §6.1](./012a-backend-auth-logic.md)
2. Role 對齊（常數 + `resolveRole` + `adminRole?` 欄位 + 更新測試/mock）— [012a §6.2](./012a-backend-auth-logic.md)
3. `backendFetch` 錯誤契約修正（扁平碼 + 401 refresh 策略）— [012a §6.3](./012a-backend-auth-logic.md)
4. login route（`/admin/auth/login` + `/admin/me` + adapter + 存 adminRole）— [012a §6.4](./012a-backend-auth-logic.md)
5. refresh path（snake body + Zod + adapter + `REFRESH_LOCK_TTL_MS`→15s）— [012a §6.5](./012a-backend-auth-logic.md)
6. mock 對齊新契約 — [012a §6.6](./012a-backend-auth-logic.md)
7. **（UI）淘汰 register** — [012b §3](./012b-backend-auth-ui.md)
8. e2e happy path（登入→`/cms`；refresh 不掉登入）— [012a §6.8](./012a-backend-auth-logic.md) + [012b §4](./012b-backend-auth-ui.md)

---

## 5. 待決策（Open Questions；跨切）

- **Q1（登入識別）**：✅ **已決**——admin 以 **username** 登入（後端無 email），登入表單維持 username，不改 Email。
- **Q2（refresh 到期）**：後端不回 refresh 到期。BFF 用固定 **14d fallback** 推算（暫採），或請後端加
  `refresh_expires_in`。（[012a §4.4](./012a-backend-auth-logic.md)）
- **Q3（註冊定位）**：✅ **最終定案（2026-07-18）**——**移除首頁公開自助註冊；新增 admin 一律由已登入
  SUPER_ADMIN 在 CMS 內建立**（對接既有 `POST /admin/admins`）。對齊後端「受保護 root」安全模型。
  Admin 管理頁面另立 **[spec 013](./013-admin-management-page.md)**。（[012b §1](./012b-backend-auth-ui.md)）
- **Q4（多 session）**：refresh cache/lock 以 userId 為鍵，與後端 per-family rotation 在「同 user 多裝置」
  下會互踩。單一 admin demo 可暫緩；要否本期改成 per-session 鍵？（[012a §4.7](./012a-backend-auth-logic.md)）
- **Q5（登入分流）**：✅ **已決**——本專案**不碰一般 user**，只做後台 admin 線。
- **Q6（admin_role UI）**：✅ **已釘為本期必做**——`adminRole` 存 session（[012a §4.8](./012a-backend-auth-logic.md)），供
  spec 013 gate。
- **Q7（admin refresh token 核發）**：⚠️ **後端待補**——`POST /admin/auth/login` 目前回傳 `refresh_token: null`，
  admin session 壽命受限於 access token（預設 30 分），到期即強制重登。
  **後端需補實作**：admin 登入應同 user 登入一樣核發 opaque refresh token，使 BFF 現有的
  rotation / reuse-detection / lock 機制得以啟動（[012a §2.3](./012a-backend-auth-logic.md) 已完整設計）。
  BFF 已做完整防禦處理，後端補發後**不需改 BFF**，自動生效：
  - `BackendTokenResponse.refresh_token` 宣告 `.nullable()`；`StoredSession.refreshToken: string | null`。
  - `service.refresh()` 無 token 時直接回傳現有 session（no-op guard）。
  - `backendFetch` 401 handler 偵測 no-op refresh（`refresh()` 回傳 token 未變）→ 跳過重試，直接 destroy + logout。

---

## 6. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-07-17 | 初版（對舊 admin 契約假設，後被 v0.2 修正）。 |
| 0.2 | 2026-07-18 | 對 2026-07-18 後端原始碼重新驗證：admin username 登入、`/admin/me` 形狀、`grade` claim、註冊最終定案（移除公開自助）。 |
| 0.3 | 2026-07-18 | dev-ready 修訂：補 C9/M8（`backendFetch` 舊巢狀錯誤契約）→ §5.10；`adminRole` 存 session 升為本期必做。 |
| 0.4 | 2026-07-18 | 補 OQ-Q7：後端 `/admin/auth/login` 回 `refresh_token: null` 缺口；記錄 BFF 防禦處理（nullable + guard）與後端補發需求。 |
| 0.4 | 2026-07-18 | §5.7 `REFRESH_LOCK_TTL_MS` 定死 15s；校正 header/footer 版號。 |
| 0.5 | 2026-07-18 | **依「業務邏輯 / UI 元件」拆分**為 [012a](./012a-backend-auth-logic.md)（邏輯）+ [012b](./012b-backend-auth-ui.md)（UI）；本檔轉索引（範圍/依賴/總順序/決策/章節重定向表）。內容不變，僅重組。 |
| 0.6 | 2026-07-18 | OQ-Q7 補 BFF 完整防禦行為（no-op refresh 偵測，跳過無效重試）；同步更新 [001c §2.3/§4/§5.1.7](./001c-session-service.md)、[001e §1/§4/§5/§7](./001e-backend-fetch.md)、[012a §4.10/§7](./012a-backend-auth-logic.md)。 |

---

最後更新：2026-07-18（v0.5，拆分為 012a 邏輯 + 012b UI，本檔轉索引）
