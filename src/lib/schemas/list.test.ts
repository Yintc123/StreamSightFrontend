import { describe, it, expect } from 'vitest'
import {
  RESOURCE_KEYS,
  RESOURCE_TO_PATH,
  ListQuery,
  ResourceListItem,
  Charity,
  Donation,
  Item,
  AnyResourceItem,
  ListPage,
  BackendListResponse,
} from './list'

const VALID_UUID = '00000000-0000-4000-8000-000000000001'
const VALID_UUID_2 = '00000000-0000-4000-8000-000000000002'

describe('list schemas', () => {
  describe('RESOURCE_KEYS', () => {
    it('三個 key：charity / donation / item', () => {
      expect(RESOURCE_KEYS).toEqual(['charity', 'donation', 'item'])
    })

    it('RESOURCE_TO_PATH 三個對應 /api/* 路徑', () => {
      expect(RESOURCE_TO_PATH.charity).toBe('/api/charities')
      expect(RESOURCE_TO_PATH.donation).toBe('/api/donations')
      expect(RESOURCE_TO_PATH.item).toBe('/api/items')
    })
  })

  describe('ListQuery', () => {
    it('空 object 可通過', () => {
      expect(() => ListQuery.parse({})).not.toThrow()
    })

    it('q 超 80 字 → 失敗', () => {
      expect(() => ListQuery.parse({ q: 'x'.repeat(81) })).toThrow()
    })

    it('q 剛好 80 字 → 通過', () => {
      expect(() => ListQuery.parse({ q: 'x'.repeat(80) })).not.toThrow()
    })

    it('cursor 超 1024 字 → 失敗（對齊 backend 016 v0.13 三段 cursor）', () => {
      expect(() => ListQuery.parse({ cursor: 'x'.repeat(1025) })).toThrow()
    })

    it('cursor 1024 字 → 通過', () => {
      expect(() => ListQuery.parse({ cursor: 'x'.repeat(1024) })).not.toThrow()
    })

    it('category 非白名單 → 失敗', () => {
      expect(() => ListQuery.parse({ category: 'animal' })).toThrow()
    })

    it('category 白名單 → 通過', () => {
      expect(() => ListQuery.parse({ category: 'animal_protection' })).not.toThrow()
    })

    it('viewport=mobile / tablet / desktop 通過', () => {
      expect(() => ListQuery.parse({ viewport: 'mobile' })).not.toThrow()
      expect(() => ListQuery.parse({ viewport: 'tablet' })).not.toThrow()
      expect(() => ListQuery.parse({ viewport: 'desktop' })).not.toThrow()
    })

    it('viewport 非白名單 → 失敗', () => {
      expect(() => ListQuery.parse({ viewport: 'wide' })).toThrow()
      expect(() => ListQuery.parse({ viewport: 'phone' })).toThrow()
    })

    it('viewport 省略 → 通過（optional）', () => {
      expect(() => ListQuery.parse({})).not.toThrow()
    })
  })

  describe('Charity schema', () => {
    it('最小有效 shape（id + name + description）', () => {
      const parsed = Charity.parse({
        id: VALID_UUID,
        name: 'ACC',
        description: '兒少關懷',
      })
      expect(parsed.name).toBe('ACC')
    })

    it('id 非 UUID → 失敗', () => {
      expect(() =>
        Charity.parse({ id: 'not-uuid', name: 'x', description: 'y' }),
      ).toThrow()
    })

    it('logoUrl 接受 URL', () => {
      expect(() =>
        Charity.parse({
          id: VALID_UUID,
          name: 'x',
          description: 'y',
          logoUrl: 'https://example.com/logo.png',
        }),
      ).not.toThrow()
    })

    it('logoUrl 非 URL → 失敗', () => {
      expect(() =>
        Charity.parse({
          id: VALID_UUID,
          name: 'x',
          description: 'y',
          logoUrl: 'not-a-url',
        }),
      ).toThrow()
    })

    it('categories 非白名單 → 失敗', () => {
      expect(() =>
        Charity.parse({
          id: VALID_UUID,
          name: 'x',
          description: 'y',
          categories: ['animal'],
        }),
      ).toThrow()
    })
  })

  describe('Donation schema', () => {
    it('完整 shape（含 charityId + charityName + cover + categories）', () => {
      const parsed = Donation.parse({
        id: VALID_UUID,
        name: '專案 A',
        description: '描述',
        charityId: VALID_UUID_2,
        charityName: '財團法人',
        coverImageUrl: 'https://example.com/c.jpg',
        categories: ['animal_protection', 'poverty_relief'],
      })
      expect(parsed.charityName).toBe('財團法人')
      expect(parsed.categories).toHaveLength(2)
    })

    it('charityId 必填', () => {
      expect(() =>
        Donation.parse({
          id: VALID_UUID,
          name: 'x',
          description: 'y',
          charityName: '財團法人',
        }),
      ).toThrow()
    })
  })

  describe('Item schema', () => {
    it('priceTwd 為正整數通過', () => {
      const parsed = Item.parse({
        id: VALID_UUID,
        name: '商品',
        description: '描述',
        charityId: VALID_UUID_2,
        charityName: '財團法人',
        priceTwd: 1330,
      })
      expect(parsed.priceTwd).toBe(1330)
    })

    it('priceTwd === 0 通過（schema 允許）', () => {
      expect(() =>
        Item.parse({
          id: VALID_UUID,
          name: 'x',
          description: 'y',
          charityId: VALID_UUID_2,
          charityName: 'C',
          priceTwd: 0,
        }),
      ).not.toThrow()
    })

    it('priceTwd 負值 → 失敗', () => {
      expect(() =>
        Item.parse({
          id: VALID_UUID,
          name: 'x',
          description: 'y',
          charityId: VALID_UUID_2,
          charityName: 'C',
          priceTwd: -1,
        }),
      ).toThrow()
    })

    it('priceTwd 小數 → 失敗', () => {
      expect(() =>
        Item.parse({
          id: VALID_UUID,
          name: 'x',
          description: 'y',
          charityId: VALID_UUID_2,
          charityName: 'C',
          priceTwd: 1.5,
        }),
      ).toThrow()
    })

    it('priceTwd 必填', () => {
      expect(() =>
        Item.parse({
          id: VALID_UUID,
          name: 'x',
          description: 'y',
          charityId: VALID_UUID_2,
          charityName: 'C',
        }),
      ).toThrow()
    })
  })

  describe('AnyResourceItem union', () => {
    it('Charity shape 通過', () => {
      expect(() =>
        AnyResourceItem.parse({ id: VALID_UUID, name: 'x', description: 'y' }),
      ).not.toThrow()
    })

    it('Item shape 通過', () => {
      expect(() =>
        AnyResourceItem.parse({
          id: VALID_UUID,
          name: 'x',
          description: 'y',
          charityId: VALID_UUID_2,
          charityName: 'C',
          priceTwd: 100,
        }),
      ).not.toThrow()
    })
  })

  describe('ListPage', () => {
    it('空 items + nextCursor:null 通過', () => {
      expect(() => ListPage.parse({ items: [], nextCursor: null })).not.toThrow()
    })

    it('nextCursor 為 string 通過', () => {
      expect(() =>
        ListPage.parse({ items: [], nextCursor: 'next-page-token' }),
      ).not.toThrow()
    })
  })

  describe('BackendListResponse', () => {
    it('Charity 完整 pageInfo + items 通過（spec 016 v0.13 — null logoUrl, inflated categories）', () => {
      const parsed = BackendListResponse.parse({
        items: [
          {
            id: VALID_UUID,
            name: 'x',
            description: 'y',
            logoUrl: null,
            categories: [
              { id: 'cat-1', key: 'child_care', displayName: '兒少照護' },
            ],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        pageInfo: { nextCursor: null, hasMore: false },
      })
      expect(parsed.items).toHaveLength(1)
    })

    it('Item 完整 shape 通過(charityId + priceTwd + inflated categories)', () => {
      const parsed = BackendListResponse.parse({
        items: [
          {
            id: VALID_UUID,
            charityId: VALID_UUID_2,
            charityName: '紅絲帶基金會',
            name: '寵物魚油',
            description: '愛購一份善意',
            logoUrl: 'https://cdn.example.com/x.png',
            coverImageUrl: null,
            priceTwd: 920,
            categories: [
              { id: 'cat-1', key: 'animal_protection', displayName: '動物保護' },
            ],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        pageInfo: { nextCursor: 'next', hasMore: true },
      })
      expect(parsed.items).toHaveLength(1)
    })
  })

  describe('ResourceListItem（共用最小 shape）', () => {
    it('logoUrl optional', () => {
      expect(() =>
        ResourceListItem.parse({ id: VALID_UUID, name: 'x', description: 'y' }),
      ).not.toThrow()
    })
  })
})
