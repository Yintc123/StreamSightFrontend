/**
 * Spec 002 §3.2 — List schemas (charity / donation / item)
 *
 * v0.4：補件後三 tab 卡片 layout 差異化，schema 對應拆分：
 *   - Charity        — 小 logo + name + description
 *   - Donation       — cover image + 主辦團體 + 標題 + 描述 + categories tags
 *   - Item           — 商品圖 + 「公益標籤」絲帶 + 名稱 + 主辦團體 + TWD 價格
 *
 * 三 tab 共用最小 shape 用 `ResourceListItem`，per-tab 擴充欄位由各自 schema `.extend()`。
 *
 * BFF / fetch / hook 由 spec 002 後續批次補上（本檔目前只 export schemas + types）。
 */
import { z } from 'zod'
import { CategoryKeyEnum } from './categories'

// —— Resource discriminator ——
export const RESOURCE_KEYS = ['charity', 'donation', 'item'] as const
export type ResourceKey = (typeof RESOURCE_KEYS)[number]

export const RESOURCE_TO_PATH: Record<ResourceKey, string> = {
  charity: '/api/charities',
  donation: '/api/donations',
  item: '/api/items',
}

// —— BFF inbound (client → BFF) ——
//
// `cursor.max(1024)` matches backend 016 v0.13 §4.2 / §12 (the three-segment
// base64url payload). Anything the backend emits as `nextCursor` must round-
// trip through this validator unchanged — opaque to us.
/** Viewport hint from client — BFF maps to per-resource limit (spec 002 §1.3 v0.6).
 *  Buckets align with Tailwind breakpoints used by card grids:
 *  - mobile : < 768px        (item grid 2 cols)
 *  - tablet : 768 ~ 1023px   (item grid `md:grid-cols-3`)
 *  - desktop: ≥ 1024px       (item grid `lg:grid-cols-4`) */
export const ViewportHint = z.enum(['mobile', 'tablet', 'desktop'])
export type ViewportHint = z.infer<typeof ViewportHint>

export const ListQuery = z.object({
  q: z.string().max(80).optional(),
  cursor: z.string().max(1024).optional(),
  category: CategoryKeyEnum.optional(),
  viewport: ViewportHint.optional(),
})
export type ListQuery = z.infer<typeof ListQuery>

// —— BFF response (BFF → client) generic shape ——
export const ResourceListItem = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  logoUrl: z.string().url().optional(),
})
export type ResourceListItem = z.infer<typeof ResourceListItem>

// —— Per-resource refined types ——
export const Charity = ResourceListItem.extend({
  categories: z.array(CategoryKeyEnum).optional(),
})
export type Charity = z.infer<typeof Charity>

/** 捐款專案：cover image + 主辦團體 + categories tags 在卡片上呈現 */
export const Donation = ResourceListItem.extend({
  charityId: z.string().uuid(),
  charityName: z.string(),
  coverImageUrl: z.string().url().optional(),
  categories: z.array(CategoryKeyEnum).optional(),
})
export type Donation = z.infer<typeof Donation>

/** 義賣商品：商品圖 + 主辦團體 + TWD 價格（必有） */
export const Item = ResourceListItem.extend({
  charityId: z.string().uuid(),
  charityName: z.string(),
  coverImageUrl: z.string().url().optional(),
  priceTwd: z.number().int().nonnegative(),
  categories: z.array(CategoryKeyEnum).optional(),
})
export type Item = z.infer<typeof Item>

/** 聯集；卡片 component 依 resource 分派渲染（spec 003e1/e2/e3、003j CardForResource） */
export const AnyResourceItem = z.union([Charity, Donation, Item])
export type AnyResourceItem = z.infer<typeof AnyResourceItem>

export const ListPage = z.object({
  items: z.array(AnyResourceItem),
  nextCursor: z.string().nullable(),
})
export type ListPage = z.infer<typeof ListPage>

// —— Backend response shape (spec 016 v0.13 §4.3 / §4.4) ——
//
// Backend differences from the client-facing schemas above:
//   - `logoUrl` / `coverImageUrl` are `string | null` (key always present;
//     spec 009 §4.4 v0.2 null semantics). BFF maps null → omit before
//     sending to client.
//   - `categories` is `InflatedCategory[]` (spec 016 §4.4 v0.13). BFF
//     extracts `.key` to send `string[]` to client.
//   - `createdAt` / `updatedAt` are present on every row and are stripped
//     by the BFF — clients don't render them and they bloat the response.
//
// These schemas drive Zod validation in `createListRoute` — any drift
// from the real backend response trips a ContractViolationError at the
// BFF before reaching the client.

export const InflatedCategory = z.object({
  id: z.string(),
  key: CategoryKeyEnum,
  displayName: z.string(),
})
export type InflatedCategory = z.infer<typeof InflatedCategory>

export const BackendCharityListItem = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  logoUrl: z.string().url().nullable(),
  categories: z.array(InflatedCategory),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type BackendCharityListItem = z.infer<typeof BackendCharityListItem>

export const BackendDonationListItem = z.object({
  id: z.string().uuid(),
  charityId: z.string().uuid(),
  charityName: z.string(),
  name: z.string(),
  description: z.string(),
  logoUrl: z.string().url().nullable(),
  coverImageUrl: z.string().url().nullable(),
  categories: z.array(InflatedCategory),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type BackendDonationListItem = z.infer<typeof BackendDonationListItem>

export const BackendItemListItem = z.object({
  id: z.string().uuid(),
  charityId: z.string().uuid(),
  charityName: z.string(),
  name: z.string(),
  description: z.string(),
  logoUrl: z.string().url().nullable(),
  coverImageUrl: z.string().url().nullable(),
  priceTwd: z.number().int().nonnegative(),
  categories: z.array(InflatedCategory),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type BackendItemListItem = z.infer<typeof BackendItemListItem>

export const BackendListItem = z.union([
  BackendCharityListItem,
  BackendDonationListItem,
  BackendItemListItem,
])
export const BackendListResponse = z.object({
  items: z.array(BackendListItem),
  pageInfo: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
})
export type BackendListResponse = z.infer<typeof BackendListResponse>

// —— BFF mappers (backend item → client item) ——
//
// Drop createdAt/updatedAt, drop null logoUrl/coverImageUrl, flatten
// inflated categories to key arrays. Each mapper is the corresponding
// per-route `toClientItem` for `createListRoute`.

function logoUrlEntry(url: string | null): { logoUrl?: string } {
  return url ? { logoUrl: url } : {}
}

function coverUrlEntry(url: string | null): { coverImageUrl?: string } {
  return url ? { coverImageUrl: url } : {}
}

function categoryKeys(
  arr: { key: z.infer<typeof CategoryKeyEnum> }[],
): z.infer<typeof CategoryKeyEnum>[] {
  return arr.map((c) => c.key)
}

export function toClientCharity(b: BackendCharityListItem): Charity {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    ...logoUrlEntry(b.logoUrl),
    categories: categoryKeys(b.categories),
  }
}

export function toClientDonation(b: BackendDonationListItem): Donation {
  return {
    id: b.id,
    charityId: b.charityId,
    charityName: b.charityName,
    name: b.name,
    description: b.description,
    ...logoUrlEntry(b.logoUrl),
    ...coverUrlEntry(b.coverImageUrl),
    categories: categoryKeys(b.categories),
  }
}

export function toClientItem(b: BackendItemListItem): Item {
  return {
    id: b.id,
    charityId: b.charityId,
    charityName: b.charityName,
    name: b.name,
    description: b.description,
    ...logoUrlEntry(b.logoUrl),
    ...coverUrlEntry(b.coverImageUrl),
    priceTwd: b.priceTwd,
    categories: categoryKeys(b.categories),
  }
}
