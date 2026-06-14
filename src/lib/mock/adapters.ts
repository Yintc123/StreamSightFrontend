// Spec 002 §4.5 — adapters from client-shape fixtures to backend-shape
// JSON. Used by `makeListHandler` and `makeDetailHandler` so the existing
// `CHARITY_FIXTURES` / `DONATION_FIXTURES` / `ITEM_FIXTURES` files
// (typed as client `Charity` / `Donation` / `Item`) don't have to be
// rewritten — the dispatcher transforms them at request time.
//
// Convention for placeholder detail-only fields:
// - approvalNo / contactPhone / etc. populated from a deterministic
//   recipe so e2e can assert specific strings without depending on
//   real seed data.

import 'server-only'

import { CATEGORY_LABELS, type CategoryKey } from '@/lib/schemas/categories'
import type { Charity, Donation, Item } from '@/lib/schemas/list'

const ISO = '2026-06-14T00:00:00.000Z'

function inflateCategoryKey(key: CategoryKey) {
  return {
    id: `cat-${key}`,
    key,
    displayName: CATEGORY_LABELS[key],
  }
}

function inflateCategories(keys: readonly CategoryKey[] | undefined) {
  return (keys ?? []).map(inflateCategoryKey)
}

// —— List item adapters (backend list-item shape) ——

export function adaptCharityList(c: Charity) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    logoUrl: c.logoUrl ?? null,
    categories: inflateCategories(c.categories),
    createdAt: ISO,
    updatedAt: ISO,
  }
}

export function adaptDonationList(d: Donation) {
  return {
    id: d.id,
    charityId: d.charityId,
    charityName: d.charityName,
    name: d.name,
    description: d.description,
    logoUrl: d.logoUrl ?? null,
    coverImageUrl: d.coverImageUrl ?? null,
    categories: inflateCategories(d.categories),
    createdAt: ISO,
    updatedAt: ISO,
  }
}

export function adaptItemList(i: Item) {
  return {
    id: i.id,
    charityId: i.charityId,
    charityName: i.charityName,
    name: i.name,
    description: i.description,
    logoUrl: i.logoUrl ?? null,
    coverImageUrl: i.coverImageUrl ?? null,
    priceTwd: i.priceTwd,
    categories: inflateCategories(i.categories),
    createdAt: ISO,
    updatedAt: ISO,
  }
}

// —— Detail adapters (backend detail shape) ——

export function adaptCharityDetail(c: Charity) {
  return {
    ...adaptCharityList(c),
    contactPhone: '02-1234-5678',
    contactEmail: `contact-${c.id.slice(0, 8)}@example.org`,
    officialWebsite: `https://example.org/${c.id.slice(0, 8)}`,
    approvalNo: `台內團字第 ${c.id.slice(-4)} 號`,
  }
}

export function adaptDonationDetail(d: Donation, parent: Charity | undefined) {
  return {
    ...adaptDonationList(d),
    content: `${d.description}\n\n（mock placeholder content）`,
    raisingApprovalNo: `衛部救字第 ${d.id.slice(-4)} 號`,
    reliefApprovalNo: null,
    charity: {
      id: d.charityId,
      name: parent?.name ?? d.charityName,
      logoUrl: parent?.logoUrl ?? null,
    },
  }
}

export function adaptItemDetail(i: Item, parent: Charity | undefined) {
  return {
    ...adaptItemList(i),
    content: `${i.description}\n\n（mock placeholder content）`,
    raisingApprovalNo: `衛部救字第 ${i.id.slice(-4)} 號`,
    reliefApprovalNo: null,
    charity: {
      id: i.charityId,
      name: parent?.name ?? i.charityName,
      logoUrl: parent?.logoUrl ?? null,
    },
  }
}
