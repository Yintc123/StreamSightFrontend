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
export const ListQuery = z.object({
  q: z.string().max(80).optional(),
  cursor: z.string().max(512).optional(),
  category: CategoryKeyEnum.optional(),
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

// —— Backend response shape ——
// BFF 從 backend 取 raw shape 帶 createdAt / updatedAt，BFF 轉發給前端時 strip。
export const BackendCharityListItem = Charity.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
})
export const BackendDonationListItem = Donation.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
})
export const BackendItemListItem = Item.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
})
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
