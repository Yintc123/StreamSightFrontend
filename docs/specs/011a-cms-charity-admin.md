# Spec 011a：CMS 公益團體（charity）資源管理

- **狀態**：Draft（v0.2 — 對齊 011 v0.2 audit 修正：BFF 改 `createAdminRoute`、edit fetch 改 admin GET endpoint、新增 `fetchAdminCharityDetail` / `fetchCategories` helper）
- **路徑（規劃）**：
  - `src/app/cms/charities/page.tsx`（list；RSC + admin gate）
  - `src/app/cms/charities/CharityListClient.tsx`（list 互動 UI）
  - `src/app/cms/charities/new/page.tsx`（create form）
  - `src/app/cms/charities/[id]/edit/page.tsx`（edit form；RSC fetch + admin gate）
  - `src/app/cms/charities/CharityForm.tsx`（create / edit 共用純 UI form）
  - `src/app/cms/charities/useCharityForm.ts` + `.test.ts`（reducer + isValid + handleSubmit + buildPayload）
  - `src/app/api/cms/charities/route.ts`（list GET + create POST）+ `.test.ts`
  - `src/app/api/cms/charities/[id]/route.ts`（detail GET + edit PATCH）+ `.test.ts`
- **依賴**：
  - [011 index](./011-cms-resource-admin.md) — routing / auth / BFF / 共同決策
  - [011d admin UI primitives](./011d-cms-admin-ui-primitives.md) — `<AdminPageShell>` / `<AdminTable>` / `<FormField>` / `<Input>` / `<Textarea>` / `<NumberInput>` / `<DateTimeInput>` / `<MultiSelectChips>`
  - [BE 020 §4 §5 §6 §7](../../../backend/docs/specs/020-donation-write-api.md) — charity create / patch / delete / lifecycle
  - [BE 015 §3](../../../backend/docs/specs/015-charity-data-model.md) — Charity Prisma model
  - 既有 `createRoute` / `createAdminRoute`（[011 §3.6](./011-cms-resource-admin.md#36-createadminroute-bff-wrapper)）/ `okResponse` / `backendFetch` / `ContractViolationError`
- **前置條件（hard prerequisites）**：011a 開工前必須完成：
  1. **[011 §3.2~3.4](./011-cms-resource-admin.md#32-session-role-擴展型別與-helper)** session role 擴展 + 既存 session 清空 + 登入路徑更新（dev/login / OAuth / password 都帶 role）
  2. **[011 §3.5~3.6](./011-cms-resource-admin.md#35-requireadminsession-helper-rsc-用)** `requireAdminSession()` + `createAdminRoute()` + `ForbiddenError` 三條 helper / class
  3. **BE 補 admin GET endpoint**（[BE spec 026](../../../backend/docs/specs/026-donation-admin-read-api.md) v0.1 規劃 6 條）：`GET /cms/donation/charities` + `GET /cms/donation/charities/:id`（v0.1 charity 部分必須先 ship；project / item 等 v0.2+）；FE 端對應 `BackendAdminCharityDetail` Zod schema（[011 §5.4](./011-cms-resource-admin.md#54-be-硬依賴backendcharitydetail-缺欄位)）
  4. **新增 helper**：`src/lib/api/getAdminCharityDetail.ts`（[§5.1](#51-rsc-結構)）+ `src/lib/api/getCategories.ts`（[011 §5.5](./011-cms-resource-admin.md#55-fetchcategories-rsc-helper-v02-補)）
  5. **`AuthRedirectToast` 新 reason** `cms-not-admin`：「需要管理員權限」（[010 §3.3](./010-cms-auth-gate.md)）
- **Figma 對應**：無（admin 內部工具、無設計稿）

---

## 1. 職責

公益團體（charity）的後台 CRUD。v0.1 MVP 範圍：

1. **List**（`/cms/charities`）— 表格顯示所有 live charity，每 row 有「編輯」入口
2. **Create**（`/cms/charities/new`）— 多欄 form 建一筆 charity
3. **Edit**（`/cms/charities/[id]/edit`）— 預填一筆 charity 既有資料、partial-update PATCH

排 v0.2+：lifecycle UI（archive / unarchive / delete / restore）、image upload (logoKey)、i18n 雙語欄位（nameEn / descriptionEn）。詳見 [011 §4 共同決策](./011-cms-resource-admin.md#4-共同決策跨-charity--project--item) 與 §8 OQ。

---

## 2. Routes & 元件結構

```
/cms/charities            (RSC list)
   └─ page.tsx
        ├─ requireAdminSession()       ← 011 §3.4
        ├─ fetch list（直接 backendFetch；不必 BFF round-trip）
        └─ <CharityListClient items=… />（'use client'）
                └─ <AdminPageShell title="公益團體" backHref="/cms" actions={…}>
                     ├─ <AdminTable columns=… rows=items rowKey=…>
                     └─ <Link href="/cms/charities/new">新增</Link>

/cms/charities/new        (RSC shell + client form)
   └─ page.tsx
        ├─ requireAdminSession()
        ├─ fetch categories（候選清單）
        └─ <CharityForm mode="create" categories=… />（'use client'）
                └─ uses useCharityForm() + 011d primitives

/cms/charities/[id]/edit  (RSC fetch + client form)
   └─ page.tsx
        ├─ requireAdminSession()
        ├─ fetch charity by id + fetch categories
        ├─ 404 → notFound()
        └─ <CharityForm mode="edit" initial=charity categories=… />
                └─ uses useCharityForm({ initial }) + 011d primitives
```

CharityForm v0.1 mode-aware 但共用一份元件（create / edit 欄位完全相同，只差初始值與 submit endpoint）。

---

## 3. List view（`/cms/charities`）

### 3.1 Layout

```
┌─────────────────────────────────────────┐
│ ←   公益團體                           │  ← TopNav backHref="/cms"
├─────────────────────────────────────────┤
│  [+ 新增]                                │  ← sticky actions（v0.1：只「新增」）
│                                          │
│  名稱        類別        排序   操作      │  ← AdminTable header
│  ─────────────────────────────────────  │
│  ACC 中華耆… 老人/兒少    0     [編輯]   │
│  財團法人菩… 教育         0     [編輯]   │
│  …                                       │
└─────────────────────────────────────────┘
```

### 3.2 AdminTable columns

| Column | Width | Align | Cell render |
|---|---|---|---|
| 名稱 | `flex-1` | left | `{row.name}` |
| 類別 | `w-32` | left | `{row.categories.map(c => c.displayName).join(' / ')}` 或 `'—'` |
| 排序 | `w-16` | right | `{row.displayOrder}` |
| 操作 | `w-16` | right | `<Link href={`/cms/charities/${row.id}/edit`} className="text-ink-link">編輯</Link>` |

### 3.3 List endpoint 與分頁

v0.2 規格修正：list 走**新加的 admin endpoint** `/cms/donation/charities`（BE 020 §5 待補；列為前置條件 #3）。FE 透過 [`GET /api/cms/charities`](#62-api-cms-charities-listcreate-route) BFF 轉發，傳 `limit=100`（demo 量 << 100；admin 一頁顯示完）。

> Admin endpoint vs user endpoint 差異：admin 可選 `includeArchived` / `includeDeleted` 參數看全集（v0.2 lifecycle UI 用）；v0.1 暫不傳此參數，等同只回 live。

未來 lifecycle / pagination chrome 上線時（v0.2）：

- 加 `[ 全部 | 已上架 | 已封存 | 已刪除 ]` tabs（query 帶 includeArchived/Deleted）
- `<AdminTable>` 加 prev / next + page 資訊

### 3.4 「新增」入口

`<Link href="/cms/charities/new">` 放在 `<AdminPageShell>` 的 `actions` 區（sticky 底部）。對齊行動裝置一手可達的位置 — 雖 admin 主要在 desktop 用，視覺一致性優先。

---

## 4. Create form（`/cms/charities/new`）

### 4.1 欄位表（對齊 BE 020 §4 / spec 015 §3）

| Field | Component | Required | 範圍 | Note |
|---|---|---|---|---|
| `name` | `<Input>` | ✅ | 1-120 字、trim | h1 標題 |
| `description` | `<Textarea>` | ✅ | 1-500 字 | rows=4 |
| `contactPhone` | `<Input type="tel">` | — | 1-40 字 / nullable | 不驗格式（國際號碼多樣）|
| `contactEmail` | `<Input type="email">` | — | RFC 5321 / ≤254 / nullable | client 用 Zod `.email()` 軟驗 |
| `officialWebsite` | `<Input type="url">` | — | http(s) URL / ≤2048 / nullable | client 用 Zod `.url()` 軟驗 |
| `approvalNo` | `<Input>` | — | 1-100 字 / nullable | 不驗格式 |
| `displayOrder` | `<NumberInput>` | — | int -1000 ~ 1000 / 預設 0 | min/max 在 NumberInput |
| `publishStartAt` | `<DateTimeInput>` | — | ISO datetime / nullable | 空 = 立即生效 |
| `publishEndAt` | `<DateTimeInput>` | — | ISO datetime / nullable / > publishStartAt | 空 = 永久 |
| `categoryIds` | `<MultiSelectChips>` | — | 最多 16 個；UUID array | 候選 = `/user/v1/donation/categories` |

v0.1 **不收**：`logoKey`（image upload v0.3）、`nameEn` / `descriptionEn`（i18n v0.5）。

### 4.2 Form state（reducer，對齊 [008b §3.2](./008b-donation-settings-sheet.md) / [009a §5.4](./009a-donation-confirm.md)）

```ts
interface FormState {
  name: string
  description: string
  contactPhone: string                  // '' = nullable null
  contactEmail: string
  officialWebsite: string
  approvalNo: string
  displayOrder: number
  publishStartAt: string                // '' = null
  publishEndAt: string
  categoryIds: string[]
}

const DEFAULT_FORM: FormState = {
  name: '', description: '', contactPhone: '', contactEmail: '',
  officialWebsite: '', approvalNo: '',
  displayOrder: 0,
  publishStartAt: '', publishEndAt: '',
  categoryIds: [],
}

type Action =
  | { type: 'SET_NAME'; value: string }
  | { type: 'SET_DESCRIPTION'; value: string }
  | { type: 'SET_CONTACT_PHONE'; value: string }
  | { type: 'SET_CONTACT_EMAIL'; value: string }
  | { type: 'SET_OFFICIAL_WEBSITE'; value: string }
  | { type: 'SET_APPROVAL_NO'; value: string }
  | { type: 'SET_DISPLAY_ORDER'; value: number }
  | { type: 'SET_PUBLISH_START_AT'; value: string }
  | { type: 'SET_PUBLISH_END_AT'; value: string }
  | { type: 'SET_CATEGORY_IDS'; value: string[] }
  | { type: 'HYDRATE'; value: FormState }  // edit mode 初次餵 BE 資料

function reducer(s: FormState, a: Action): FormState {
  switch (a.type) {
    case 'SET_NAME': return { ...s, name: a.value }
    // ... 一一對映
    case 'HYDRATE': return a.value
  }
}
```

### 4.3 Validation（client-side、軟攔截）

```ts
function isValid(s: FormState): boolean {
  if (s.name.trim().length === 0 || s.name.length > 120) return false
  if (s.description.length === 0 || s.description.length > 500) return false
  if (s.contactEmail && !isLikelyEmail(s.contactEmail)) return false
  if (s.officialWebsite && !isLikelyUrl(s.officialWebsite)) return false
  if (s.displayOrder < -1000 || s.displayOrder > 1000) return false
  if (s.publishStartAt && s.publishEndAt && s.publishEndAt <= s.publishStartAt) return false
  if (s.categoryIds.length > 16) return false
  return true
}
```

`isLikelyEmail` / `isLikelyUrl` 用簡單 regex（不引 Zod 來算 isValid，避免 client bundle 增加；BE Zod 是 source of truth）。

### 4.4 `buildPayload` — FormState → BE 020 body

對齊 BE 020 §4：optional 欄位空字串 → omit（不送 null；BE TypeBox `Type.Optional(Type.Union([Type.Null(), Type.String(...)]))` 允許 omit 或 null 任一）。

```ts
function buildPayload(s: FormState): CharityCreatePayload {
  return {
    name: s.name.trim(),
    description: s.description,
    ...(s.contactPhone && { contactPhone: s.contactPhone }),
    ...(s.contactEmail && { contactEmail: s.contactEmail }),
    ...(s.officialWebsite && { officialWebsite: s.officialWebsite }),
    ...(s.approvalNo && { approvalNo: s.approvalNo }),
    displayOrder: s.displayOrder,
    ...(s.publishStartAt && { publishStartAt: s.publishStartAt }),
    ...(s.publishEndAt && { publishEndAt: s.publishEndAt }),
    categoryIds: s.categoryIds,
  }
}
```

> 為何用 `...(value && { key: value })` 模式 vs `value ?? undefined`：spread 條件式可確保 key 完全不出現在 payload 上（vs `key: undefined` 仍會走 JSON.stringify 變沒值的 key，BE 視為「明示要清空」）。**partial-update 語意嚴格要求區分「未動」與「設成 null」**，spread 是最乾淨表達。

### 4.5 `useCharityForm` hook（container 邏輯）

```ts
// useCharityForm.ts
export function useCharityForm(opts?: { initial?: FormState; id?: string }) {
  const [form, dispatch] = useReducer(reducer, opts?.initial ?? DEFAULT_FORM)
  const router = useRouter()
  const valid = isValid(form)

  const handleSubmit = useCallback(async () => {
    if (!valid) return
    const payload = buildPayload(form)
    const endpoint = opts?.id
      ? `/api/cms/charities/${opts.id}`
      : '/api/cms/charities'
    const method = opts?.id ? 'PATCH' : 'POST'
    try {
      const res = await fetch(endpoint, {
        method,
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) throw new Error('non-2xx')
      toast.success(opts?.id ? '已更新' : '已建立')
      router.replace('/cms/charities')
    } catch {
      toast.error('操作失敗，請稍後再試')
    }
  }, [form, valid, opts?.id, router])

  return { form, dispatch, isValid: valid, handleSubmit }
}
```

對齊 [009a §5.6 useDonorInfoForm](./009a-donation-confirm.md#56-usedonorinfoform-hookv02--container-邏輯抽出) 三層 pattern：reducer pure / hook 整合 / form 純 UI。

### 4.6 完整 `<CharityForm>` reference（簡化）

JSX 範例見 [011d §5](./011d-cms-admin-ui-primitives.md#5-使用範例compose-起來)；charity 一份 完整 form 含 10 個欄位、約 80 行 JSX，全部 compose 11d primitive，無自製 className。

---

## 5. Edit form（`/cms/charities/[id]/edit`）

### 5.1 RSC 結構（v0.2 — 用 admin detail helper）

```tsx
// src/app/cms/charities/[id]/edit/page.tsx
import { notFound } from 'next/navigation'
import { requireAdminSession } from '@/lib/session/requireAdmin'
import { fetchAdminCharityDetail } from '@/lib/api/getAdminCharityDetail'
import { fetchCategories } from '@/lib/api/getCategories'
import { NotFoundError } from '@/lib/errors/NotFoundError'
import { CharityForm } from '../../CharityForm'

export default async function EditPage({ params }: {
  params: Promise<{ id: string }>
}) {
  await requireAdminSession()                  // 011 §3.5
  const { id } = await params

  let charity, categories
  try {
    ;[charity, categories] = await Promise.all([
      fetchAdminCharityDetail(id),             // 新 helper；走 admin endpoint（前置條件 #3 + #4）
      fetchCategories(),                       // 新 helper（011 §5.5）
    ])
  } catch (e) {
    if (e instanceof NotFoundError) notFound()
    throw e                                    // ContractViolation / network → Next error page
  }

  const initial: FormState = {
    name: charity.name,
    description: charity.description,
    contactPhone: charity.contactPhone ?? '',
    contactEmail: charity.contactEmail ?? '',
    officialWebsite: charity.officialWebsite ?? '',
    approvalNo: charity.approvalNo ?? '',
    displayOrder: charity.displayOrder,                 // admin only
    publishStartAt: charity.publishStartAt ?? '',       // admin only
    publishEndAt: charity.publishEndAt ?? '',           // admin only
    categoryIds: charity.categories.map((c) => c.id),
  }

  return (
    <CharityForm
      mode="edit"
      id={id}
      initial={initial}
      categories={categories}
    />
  )
}
```

新 helper（前置條件 #4，需 BE 020 v0.5 上線後實作）：

```ts
// src/lib/api/getAdminCharityDetail.ts（新）
import 'server-only'
import { backendFetch } from './backend'
import { BackendAdminCharityDetail } from '@/lib/schemas/admin-detail'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import { NotFoundError } from '@/lib/errors/NotFoundError'

export async function fetchAdminCharityDetail(id: string) {
  const res = await backendFetch<unknown>(`/cms/donation/charities/${id}`)
  if (!res.ok) throw new NotFoundError(`charity ${id} not found`)
  const parsed = BackendAdminCharityDetail.safeParse(res.data)
  if (!parsed.success) {
    throw new ContractViolationError(
      `Admin charity detail schema mismatch: ${parsed.error.message}`,
    )
  }
  return parsed.data
}
```

> `backendFetch` 對 4xx response 是否 throw 還是回 `{ ok: false }`？以既有 [`getDetail.ts` pattern](../../src/lib/api/getDetail.ts) 為準；若 backendFetch 直接 throw 404，把 try/catch 收掉即可。實作時看 helper 行為決定（spec 不重寫 backendFetch 介面）。

### 5.2 Submit → PATCH vs POST

`useCharityForm({ id, initial })` 內部依 `id` 存在切換 endpoint：
- `id` 有 → `PATCH /api/cms/charities/{id}`（partial-update）
- `id` 無 → `POST /api/cms/charities`

### 5.3 Partial-update 與 dirty tracking（v0.1 簡化 / v0.2 加強）

**v0.1 簡化策略**：editions 一律送完整 form payload（buildPayload 結果含所有有值欄位）。BE PATCH 接受「重複設成原值」、不會出錯，只是 cache invalidation 比預期多。

**v0.2 dirty tracking 升級**：reducer 加 `dirtyFields: Set<keyof FormState>`，buildPayload 只 spread dirty 欄位，避免無意義的 PATCH key。屆時還可在 form 標示「未儲存變更」（unsaved-changes guard on navigation）。

> 為何 v0.1 不做 dirty tracking：MVP 焦點是「整套 admin infra 走通」（auth / BFF / form / list / route），dirty tracking 屬優化、charity 場景 admin 改一筆通常都動好幾欄、額外 PATCH key 影響極小。

### 5.4 Edit 模式的 read-only 顯示

底部加一個 footer 區塊顯示：

```
建立時間   2026-06-15 14:32
更新時間   2026-06-16 09:10
ID         00000000-0000-4000-8000-000000000001
```

純文字、無編輯 UI；目的是讓 admin 知道這筆 record metadata，並有 ID 可以告知 BE debug。

---

## 6. BFF route handler

v0.2 規格修正：全部用 [`createAdminRoute`](./011-cms-resource-admin.md#36-createadminroute-bff-wrapper)（自動 auth + CSRF + body Zod + Cache-Control + session touch + logging）；BE response 一律 Zod 驗證以對齊 [009 v0.8 audit pattern](./009-checkout-confirm.md)。

### 6.1 共享 Zod schema

```ts
// src/app/api/cms/charities/schemas.ts（同檔 export 給 create + edit 兩條 route 用）
import { z } from 'zod'

const publishWindowRefine = (v: { publishStartAt?: string; publishEndAt?: string }) =>
  !v.publishStartAt || !v.publishEndAt || v.publishEndAt > v.publishStartAt

export const CharityCreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().min(1).max(500),
  contactPhone: z.string().trim().min(1).max(40).optional(),
  contactEmail: z.string().email().max(254).optional(),
  officialWebsite: z.string().url().max(2048).optional(),
  approvalNo: z.string().min(1).max(100).optional(),
  displayOrder: z.number().int().min(-1000).max(1000).default(0),
  publishStartAt: z.string().datetime().optional(),
  publishEndAt: z.string().datetime().optional(),
  categoryIds: z.array(z.string().uuid()).max(16).default([]),
}).refine(publishWindowRefine, {
  message: 'publishEndAt must be > publishStartAt',
  path: ['publishEndAt'],
})

export const CharityPatchBody = CharityCreateBody._def.schema
  .partial()
  .refine(publishWindowRefine, {
    message: 'publishEndAt must be > publishStartAt',
    path: ['publishEndAt'],
  })

export const CharityIdParams = z.object({ id: z.string().uuid() })
```

> `_def.schema.partial()` 是 Zod 對 ZodEffects 取內層 ZodObject 做 partial 的 idiom（refine 後得自己加回；refine 對 partial 也有效）。

### 6.2 `src/app/api/cms/charities/route.ts`（list + create）

```ts
import 'server-only'

import { createAdminRoute } from '@/lib/api/createAdminRoute'
import { backendFetch } from '@/lib/api/backend'
import { okResponse } from '@/lib/api/responses'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import { BackendAdminCharityDetail } from '@/lib/schemas/admin-detail'
import { CharityCreateBody } from './schemas'

export const POST = createAdminRoute({
  bodySchema: CharityCreateBody,
  handler: async ({ body, requestId }) => {
    const { data } = await backendFetch<unknown>('/cms/donation/charities', {
      method: 'POST',
      body,
      requestId,
    })
    const parsed = BackendAdminCharityDetail.safeParse(data)
    if (!parsed.success) {
      throw new ContractViolationError(
        `Upstream POST /cms/donation/charities response failed schema: ${parsed.error.message}`,
      )
    }
    return okResponse(parsed.data)
  },
})

export const GET = createAdminRoute({
  handler: async ({ req, requestId }) => {
    const url = new URL(req.url)
    const limit = url.searchParams.get('limit') ?? '100'
    const { data } = await backendFetch<unknown>(
      `/cms/donation/charities?limit=${limit}`,
      { requestId },
    )
    // v0.2 list response shape 暫不在本層 Zod 驗證（demo 階段 trust）；
    // v0.3 lifecycle / pagination UI 上線時補完整 schema
    return okResponse(data)
  },
})
```

### 6.3 `src/app/api/cms/charities/[id]/route.ts`（detail + patch）

```ts
import 'server-only'

import { createAdminRoute } from '@/lib/api/createAdminRoute'
import { backendFetch } from '@/lib/api/backend'
import { okResponse } from '@/lib/api/responses'
import { ContractViolationError } from '@/lib/errors/ContractViolationError'
import { BackendAdminCharityDetail } from '@/lib/schemas/admin-detail'
import { CharityIdParams, CharityPatchBody } from '../schemas'

export const PATCH = createAdminRoute({
  paramsSchema: CharityIdParams,
  bodySchema: CharityPatchBody,
  handler: async ({ params, body, requestId }) => {
    const { data } = await backendFetch<unknown>(
      `/cms/donation/charities/${params.id}`,
      { method: 'PATCH', body, requestId },
    )
    const parsed = BackendAdminCharityDetail.safeParse(data)
    if (!parsed.success) {
      throw new ContractViolationError(
        `Upstream PATCH /cms/donation/charities/${params.id} response failed schema: ${parsed.error.message}`,
      )
    }
    return okResponse(parsed.data)
  },
})

export const GET = createAdminRoute({
  paramsSchema: CharityIdParams,
  handler: async ({ params, requestId }) => {
    const { data } = await backendFetch<unknown>(
      `/cms/donation/charities/${params.id}`,
      { requestId },
    )
    const parsed = BackendAdminCharityDetail.safeParse(data)
    if (!parsed.success) {
      throw new ContractViolationError(
        `Upstream GET /cms/donation/charities/${params.id} response failed schema: ${parsed.error.message}`,
      )
    }
    return okResponse(parsed.data)
  },
})
```

> RSC 端 `fetchAdminCharityDetail` 直接吃 BE（[§5.1](#51-rsc-結構v02--用-admin-detail-helper)）；此 GET BFF 給 **client-side** 用（refetch / 更新 form 顯示等場景）。v0.1 form submit 後 `router.replace` 回 list 不需要 client GET；保留以利 v0.2 lifecycle action 後重 load 同筆。若決定 v0.1 不需要可暫不實作，BE PATCH response 就夠 client 用。

### 6.4 Error envelope

依 [011 §5.3](./011-cms-resource-admin.md#53-error-envelope-統一) — `createRoute` + `toErrorResponse` 自動處理（UNAUTHENTICATED / FORBIDDEN / VALIDATION_FAILED / CONTRACT_VIOLATION）；BE 4xx passthrough。FE 攔截依 `error.code` 行為。

---

## 7. 測試（colocated `.test.ts(x)`，**強制 TDD**）

三層 pattern 對齊 009a / 008b。

### 7.1 Reducer pure unit tests（`useCharityForm.test.ts`，§ R）

| # | 案例 | 期望 |
|---|---|---|
| R1 | DEFAULT_FORM 是 immutable const、字串欄都空、displayOrder=0、categoryIds=[] | sanity |
| R2 | reducer SET_NAME → s.name 更新、其他不變 | pure |
| R3 | 同上對其他 8 個 SET_* action 各 1 case | pure |
| R4 | reducer HYDRATE → 回傳 a.value 整個換掉 | edit init 路徑 |
| R5 | isValid: name 空 → false | required |
| R6 | isValid: name 121 字 → false | maxLength |
| R7 | isValid: publishEnd <= publishStart → false | refine |
| R8 | isValid: categoryIds 17 個 → false | max |
| R9 | isValid: 必填齊 + optional 空 → true | happy |
| R10 | isValid: email 非 email 格式 → false（contactEmail 有給才驗）| soft validation |
| R11 | buildPayload: optional 空字串 → key omit；有值 → key 帶 | spread pattern |
| R12 | buildPayload: name trim 後再放 | trim |

### 7.2 Hook integration tests（`useCharityForm.test.ts`，§ H）— 用 `renderHook` + mock fetch

| # | 案例 | 期望 |
|---|---|---|
| H1 | 初始 state = DEFAULT_FORM；isValid=false（name 空）| init |
| H2 | dispatch SET_NAME / SET_DESCRIPTION 後 isValid=true（其他必填本來就沒）| valid 流程 |
| H3 | handleSubmit invalid 時 → fetch 不被叫 | gate |
| H4 | handleSubmit valid + create → fetch POST `/api/cms/charities` + body 對 + toast.success + router.replace `/cms/charities` | create happy |
| H5 | handleSubmit valid + edit（`opts.id` 有）→ fetch PATCH `/api/cms/charities/{id}` | edit happy |
| H6 | handleSubmit BFF 500 → toast.error + 不導頁 | error |
| H7 | handleSubmit fetch throw → toast.error + 不導頁 | network error |
| H8 | HYDRATE 後 isValid 立刻反映 init 資料 | edit init |

### 7.3 Component / page integration（`CharityForm.test.tsx`，§ C）

| # | 案例 | 期望 |
|---|---|---|
| C1 | render mode="create" → 10 個欄位 label 都在 + 「建立」button disabled（name 空） | init |
| C2 | 填 name + description → submit enabled；click submit → fetch POST | happy |
| C3 | 選 categoryIds 兩個 chip → form.categoryIds 有兩值；payload categoryIds 有兩值 | chip integration |
| C4 | render mode="edit" + initial → 欄位預填；submit → fetch PATCH | edit |
| C5 | publishEnd 早於 publishStart → submit disabled + error 顯示 | refine UI |

### 7.4 BFF route tests（`route.test.ts`，§ B）— 用 MSW

| # | 案例 | 期望 |
|---|---|---|
| B1 | POST 無 admin session → 401 | auth gate |
| B2 | POST admin + invalid body → 400 VALIDATION_FAILED | Zod |
| B3 | POST admin + valid body → forward `/cms/donation/charities` 含相同 body + 回 BE 201 | forward |
| B4 | PATCH 無 admin → 401 | auth gate |
| B5 | PATCH partial body（只送 name）→ 通過 + forward | partial |
| B6 | PATCH publishEnd <= publishStart → 400 | refine |
| B7 | GET list 無 admin → 401 | auth gate |
| B8 | GET list admin → forward `/user/v1/donation/charities` + qs 透傳 | forward |

### 7.5 Page-level e2e（可選）

`/cms/charities` flow：admin 登入 → 列表頁 → 「新增」→ 填資料 → 送出 → 回列表頁看到新增的 row。v0.1 列為 nice-to-have；charity-first thin slice 走通後再加。

---

## 8. 開放問題

- **Admin-side `GET /cms/donation/charities` endpoint**：BE 020 v0.4 尚未列入；list 暫時 forward user-side。屆時可考慮加 admin-only filter 參數（`includeArchived=true`）
- **partial-update dirty tracking**：v0.1 一律送完整 payload；v0.2 加 `dirtyFields` 集合 + payload spread 只 dirty 欄
- **PATCH 同時改 categoryIds vs 「未改」**：spec 020 §6 — categoryIds 出現 = 全替換；省略 = 不動。v0.1 一律送，所以一律「全替換」（與原值相同也送）。Dirty tracking 上線後改成「真改才送」
- **403 vs 401 區分**：BE 020 §2.3 — JWT 缺 → 401；JWT 在但 role !== 0 → 403。FE BFF v0.1 全部回 401（簡化）；v0.2 對應 403 顯示不同 toast（『權限不足』vs『請重新登入』）
- **Date / time picker UX**：v0.1 用 native `<input type="datetime-local">`；行動 / 桌面瀏覽器體驗有差。若想統一 → 引入 react-datepicker（增加 ~20kb），權衡
- **Form 未儲存變更 guard**：admin 改一半切走頁面 → 沒提醒。v0.2 加 `beforeunload` + `useEffect` cleanup 提醒
- **categoriesRes 載入失敗 fallback**：v0.1 假設 categories 一定能載入（fail 整頁 500）；v0.2 加 try/catch + 顯示「載入類別失敗，請重整」
- **手機 admin 體驗**：表格在窄螢幕需 horizontal scroll；MVP 可接受，v0.3+ 視使用情況優化
- **權限細分（owner-of-charity vs super-admin）**：BE 目前 god-mode 單一 admin；FE 不規劃
- **批次 import（CSV）**：產品需求未定；不規劃

---

## 9. 變更紀錄

| 版本 | 日期 | 變更 |
|---|---|---|
| 0.1 | 2026-06-16 | 初版：MVP charity-first thin slice。完整 spec 含 routes（/cms/charities + /new + /[id]/edit）、AdminTable column 表、10 欄 create form 含 Zod schema、reducer FormState + 12 Action、isValid + buildPayload + useCharityForm hook、edit RSC fetch 流程、BFF route 2 條（list+create / detail+patch）含 `readAdminSession` gate。三層 TDD plan：reducer R1-R12 / hook H1-H8 / component C1-C5 / BFF B1-B8。Image upload / lifecycle / i18n / dirty tracking / pagination chrome / admin-side BE GET endpoint / 權限細分 全列開放問題、待 v0.2+ |
| 0.2 | 2026-06-16 | **隨 011 v0.2 audit 修正全套對齊**：(a) header 加「前置條件」清單 5 點，明文要求 011 §3.2-3.6 + BE 020 admin GET endpoint + 兩個新 fetch helper + AuthRedirectToast 新 reason 都先就位；(b) §3.3 list 改走 admin endpoint `/cms/donation/charities` 而非 user-side（原計畫 forward user list 會看不到 admin-only metadata）；(c) §5.1 EditPage RSC 改 `fetchAdminCharityDetail`（新 helper、含 displayOrder / publishStartAt/End），不再用 `fetchCharityDetail`；新增 helper 程式碼 reference + NotFoundError try/catch；(d) §6.1 / §6.2 / §6.3 BFF route 全部改用 `createAdminRoute` + `okResponse` + `backendFetch` + `ContractViolationError`，取代 v0.1 自寫 NextResponse + readAdminSession 的範例；(e) §6 新增「共享 Zod schema」次節（CharityCreateBody / CharityPatchBody / CharityIdParams 三件抽 `schemas.ts` 同檔 export）；(f) §6 BE response Zod 驗證從「v0.2 加 audit」升級為「v0.1 就驗」（既然要實作就一次到位）；(g) §6.4 簡化 error envelope 段（細表移到 011 §5.3 統一）。Reducer / form state / isValid / buildPayload / hook 邏輯與 TDD plan **不變動**——上述修正只動 BFF 層 + RSC fetch 層的 wiring |
