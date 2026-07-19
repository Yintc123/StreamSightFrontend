# ADR 002：admin_role / grade 改用整數 rank 作為線協議

- **狀態**：Accepted
- **日期**：2026-07-19
- **影響範圍**：`src/lib/schemas/auth.ts`、`src/lib/schemas/admin.ts`、`src/lib/mock/`、`src/app/api/auth/login/route.ts`

---

## 背景

後端將 `admins.admin_role` 的對外型別從字串 enum（`"viewer"`/`"editor"`/`"super_admin"`）改為整數 rank（IntEnum），對應關係：

| rank | 內部字串 | 含義 |
|---|---|---|
| 0 | `viewer` | 唯讀 |
| 50 | `editor` | 編輯 |
| 100 | `super_admin` | 管理員 |
| 999 | `root` | 系統初始帳號（seed，不可刪除） |

同時，JWT `grade` claim 仍維持字串型別（後端未改 JWT payload 格式），與 `/admin/me` wire 格式不同。

## 決策

採用「**邊界轉譯（Boundary Translation）**」策略：

- **入境（inbound）**：`AdminRoleWire`（Zod union of literals）在 BFF 邊界將 int rank 轉為內部字串（`'viewer'` / `'editor'` / `'super_admin'` / `'root'`）。所有 session / UI / 比對邏輯維持字串，不感知 int。
- **出境（outbound）**：`toAdminRoleRank()` 在需要送後端時將內部字串轉回 int rank。
- **`AdminRoleInput`**（CMS UI 指派用）明確排除 `'root'`——root 只能透過後端 seed 腳本建立，不得由 CMS 指派。

## ROOT=999 的處理

- 登入時後端可能回傳 `admin_role: 999`（seed root 帳號）。
- `AdminRoleWire` 接受 999 並轉為 `'root'`（Phase 2 啟用，見 spec 012a §2.5）。
- `CmsSideNav` 的 `isSuperAdmin` gate 含 `'root'`（root 享有 super_admin 以上的 UI 可見性）。
- root 的 `adminRole` 不可透過 `/api/cms/admins/:id/role` 被指派（`AdminRoleInput` 排除）。

## 拒絕的替代方案

- **全程用字串**：後端已改，若 BFF 繼續發字串則每次呼叫都需手動轉換，且對齊成本持續累積。
- **全程用整數**：會讓 session / React 層的 `=== 'super_admin'` 比對全部換成數字，侵入性過高。

## 影響

- `AdminRole` enum 加 `'root'`（共 4 值）。
- `AdminRoleInput`（出境 schema）維持 3 值（排除 `'root'`）。
- mock 的 `RANK` 對應表需補 `root: 999`（若出現 root 帳號場景）。
- JWT `grade` claim 維持字串，不在本 ADR 範圍內。
