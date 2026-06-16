# Spec 011a：CMS 公益團體（charity）資源管理

- **狀態**：Draft（v0.1 — MVP charity-first thin slice：list + create + edit；無 lifecycle / image / i18n）
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
  - 既有 `/user/v1/donation/charities` (list) / `/user/v1/donation/charities/:id` (detail) — read 路徑暫複用
  - 既有 `/user/v1/donation/categories` — categoryIds 候選清單
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

v0.1 直接呼 `/user/v1/donation/charities`（已存在的 user-side list），參數 `limit=100`（demo 量 << 100）。Lifecycle filter：BE 已預設只回 `whereLive`，admin 看到的等同公開列表。

v0.2 lifecycle / admin filter / pagination chrome 上線時：

- 切換 BE endpoint 到 admin-side 對應 list（待 BE 020 補；目前 BE 020 列為待加）
- 加 `[ 全部 | 已上架 | 已封存 | 已刪除 ]` tabs
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

### 5.1 RSC 結構

```tsx
// src/app/cms/charities/[id]/edit/page.tsx
export default async function EditPage({ params }: {
  params: Promise<{ id: string }>
}) {
  await requireAdminSession()
  const { id } = await params

  // v0.1 直接 fetch user-side detail（同 read 路徑；admin-side GET 待 BE 補）
  const [charity, categoriesRes] = await Promise.all([
    fetchCharityDetail(id),         // 既有 helper
    fetchCategories(),               // 既有 helper
  ])
  if (!charity) notFound()

  const initial: FormState = {
    name: charity.name,
    description: charity.description,
    contactPhone: charity.contactPhone ?? '',
    contactEmail: charity.contactEmail ?? '',
    officialWebsite: charity.officialWebsite ?? '',
    approvalNo: charity.approvalNo ?? '',
    displayOrder: charity.displayOrder,
    publishStartAt: charity.publishStartAt ?? '',
    publishEndAt: charity.publishEndAt ?? '',
    categoryIds: charity.categories.map((c) => c.id),
  }

  return (
    <CharityForm
      mode="edit"
      id={id}
      initial={initial}
      categories={categoriesRes}
    />
  )
}
```

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

### 6.1 `src/app/api/cms/charities/route.ts`

```ts
import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { readAdminSession } from '@/lib/session/requireAdmin'
import { backendFetch } from '@/lib/api/backendFetch'

const CharityBody = z.object({
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
}).refine(
  (v) => !v.publishStartAt || !v.publishEndAt || v.publishEndAt > v.publishStartAt,
  { message: 'publishEndAt must be > publishStartAt', path: ['publishEndAt'] },
)

export async function POST(req: NextRequest) {
  if (!(await readAdminSession())) {
    return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const parsed = CharityBody.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const res = await backendFetch('/cms/donation/charities', {
    method: 'POST',
    body: JSON.stringify(parsed.data),
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.json()
  return NextResponse.json(body, { status: res.status })
}

// GET list — v0.1 直接 forward 給 user-side endpoint（避免 BE admin GET 待補擋住 FE）
export async function GET(req: NextRequest) {
  if (!(await readAdminSession())) {
    return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const url = new URL(req.url)
  const qs = url.searchParams.toString()
  const res = await backendFetch(
    `/user/v1/donation/charities${qs ? `?${qs}` : ''}`,
  )
  return NextResponse.json(await res.json(), { status: res.status })
}
```

### 6.2 `src/app/api/cms/charities/[id]/route.ts`

```ts
const CharityPatchBody = CharityBody.partial()
  .refine(
    (v) => !v.publishStartAt || !v.publishEndAt || v.publishEndAt > v.publishStartAt,
    { message: 'publishEndAt must be > publishStartAt', path: ['publishEndAt'] },
  )

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await readAdminSession())) {
    return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const { id } = await ctx.params
  const parsed = CharityPatchBody.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const res = await backendFetch(`/cms/donation/charities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(parsed.data),
    headers: { 'Content-Type': 'application/json' },
  })
  return NextResponse.json(await res.json(), { status: res.status })
}

// GET detail — v0.1 也 forward user-side
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await readAdminSession())) {
    return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 })
  }
  const { id } = await ctx.params
  const res = await backendFetch(`/user/v1/donation/charities/${id}`)
  return NextResponse.json(await res.json(), { status: res.status })
}
```

### 6.3 BE response Zod 驗證

對齊 [009 v0.8 audit pattern](./009-checkout-confirm.md)：BE 回應後**用 Zod 驗 shape** 再 return；非預期 shape → 502 ContractViolationError。MVP 簡化版可先 trust（demo 階段），v0.2 加 audit 同 009。

### 6.4 Error envelope

依 [011 §5.3](./011-cms-resource-admin.md#53-error-envelope-統一) — BFF passthrough BE error；FE 攔截看 `error.code`。

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
