// Spec 002 §13 — list page e2e.
//
// Each test sets up its own BFF response via `page.route()` so the data
// set is explicit at the assertion site. Server-side mock dispatchers
// (src/lib/mock/register.ts) are the fallback for routes we don't
// override here — letting these tests focus on UI behaviour rather than
// fixture choice.

import { test, expect } from '@playwright/test'

import {
  makeCharity,
  makeDonation,
  makeItem,
  mockListEndpoints,
} from './helpers/list-mock'

const CHARITY_A = '11111111-1111-4111-8111-aaaaaaaaaaa1'
const CHARITY_B = '11111111-1111-4111-8111-aaaaaaaaaaa2'
const DONATION_A = '22222222-2222-4222-8222-aaaaaaaaaaa1'
const ITEM_A = '33333333-3333-4333-8333-aaaaaaaaaaa1'

test.describe('Charity tab', () => {
  test('initial render: shows seeded charity cards from the BFF response', async ({
    page,
  }) => {
    await mockListEndpoints(page, [
      {
        resource: '/api/charities',
        pages: {
          items: [
            makeCharity(CHARITY_A, '流浪動物之家'),
            makeCharity(CHARITY_B, '兒少關懷協會'),
          ],
          nextCursor: null,
        },
      },
    ])
    await page.goto('/donation')
    await expect(page.getByRole('heading', { level: 2, name: '流浪動物之家' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: '兒少關懷協會' })).toBeVisible()
  })

  test('empty result renders the no-data illustration (spec 003g)', async ({
    page,
  }) => {
    await mockListEndpoints(page, [
      {
        resource: '/api/charities',
        pages: { items: [], nextCursor: null },
      },
    ])
    await page.goto('/donation')
    // Default-tab empty title from CharityListShell.DEFAULT_EMPTY_TITLE
    await expect(page.getByText('目前沒有公益團體')).toBeVisible()
  })
})

test.describe('Search', () => {
  test('typing debounces, forwards q to the BFF, and renders the new result', async ({
    page,
  }) => {
    let lastQ: string | null = null
    await page.route('**/api/charities*', async (route) => {
      const url = new URL(route.request().url())
      lastQ = url.searchParams.get('q')
      const items = lastQ === '流浪'
        ? [makeCharity(CHARITY_A, '流浪動物之家')]
        : [
            makeCharity(CHARITY_A, '流浪動物之家'),
            makeCharity(CHARITY_B, '兒少關懷協會'),
          ]
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { items, nextCursor: null } }),
      })
    })

    await page.goto('/donation')
    await expect(page.getByRole('heading', { level: 2, name: '兒少關懷協會' })).toBeVisible()

    await page.getByRole('button', { name: '開啟搜尋' }).click()
    await page.getByRole('searchbox').fill('流浪')

    // After debounce (300ms) + query roundtrip the unrelated card should
    // be gone. `toHaveCount(0)` auto-waits up to the test timeout, so we
    // don't need an explicit waitForTimeout.
    await expect(
      page.getByRole('heading', { level: 2, name: '兒少關懷協會' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('heading', { level: 2, name: '流浪動物之家' }),
    ).toBeVisible()
    expect(lastQ).toBe('流浪')
  })

  test('search with no match shows the empty state with adjust-keyword hint', async ({
    page,
  }) => {
    await page.route('**/api/charities*', async (route) => {
      const url = new URL(route.request().url())
      const items = url.searchParams.get('q')
        ? []
        : [makeCharity(CHARITY_A, '流浪動物之家')]
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { items, nextCursor: null } }),
      })
    })

    await page.goto('/donation')
    await page.getByRole('button', { name: '開啟搜尋' }).click()
    await page.getByRole('searchbox').fill('zzz-無命中')
    await expect(page.getByText('查無相關資料')).toBeVisible()
    await expect(page.getByText('請調整關鍵字再重新搜尋')).toBeVisible()
  })

  test('cancel search returns to browse mode + restores full list', async ({
    page,
  }) => {
    await mockListEndpoints(page, [
      {
        resource: '/api/charities',
        pages: (params) => ({
          items: params.get('q')
            ? []
            : [makeCharity(CHARITY_A, '流浪動物之家')],
          nextCursor: null,
        }),
      },
    ])

    await page.goto('/donation')
    await page.getByRole('button', { name: '開啟搜尋' }).click()
    await page.getByRole('searchbox').fill('zzz')
    await expect(page.getByText('查無相關資料')).toBeVisible()

    await page.getByRole('button', { name: '取消' }).click()
    await expect(
      page.getByRole('heading', { level: 2, name: '流浪動物之家' }),
    ).toBeVisible()
    await expect(page.getByRole('searchbox')).toHaveCount(0)
  })
})

test.describe('Tab switching', () => {
  test('switches tab → fires the matching BFF endpoint and renders different cards', async ({
    page,
  }) => {
    await mockListEndpoints(page, [
      {
        resource: '/api/charities',
        pages: {
          items: [makeCharity(CHARITY_A, '公益團體 X')],
          nextCursor: null,
        },
      },
      {
        resource: '/api/donations',
        pages: {
          items: [
            makeDonation(DONATION_A, '專案 Y', CHARITY_A, '主辦團體 X'),
          ],
          nextCursor: null,
        },
      },
      {
        resource: '/api/items',
        pages: {
          items: [
            makeItem(ITEM_A, '義賣品 Z', 1234, CHARITY_A, '主辦團體 X'),
          ],
          nextCursor: null,
        },
      },
    ])

    await page.goto('/donation')
    await expect(page.getByRole('heading', { level: 2, name: '公益團體 X' })).toBeVisible()

    await page.getByRole('tab', { name: '捐款專案' }).click()
    await expect(page.getByRole('heading', { level: 2, name: '專案 Y' })).toBeVisible()
    await expect(page).toHaveURL(/[?&]tab=donation/)

    await page.getByRole('tab', { name: '義賣商品' }).click()
    await expect(page.getByText(/TWD\s+1,234/)).toBeVisible()
    await expect(page).toHaveURL(/[?&]tab=item/)
  })

  test('direct visit ?tab=item highlights item tab + fires /api/items', async ({
    page,
  }) => {
    let itemsHit = 0
    await page.route('**/api/items*', async (route) => {
      itemsHit++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [makeItem(ITEM_A, 'TWD-only', 500, CHARITY_A, 'X')],
            nextCursor: null,
          },
        }),
      })
    })

    await page.goto('/donation?tab=item')
    await expect(page.getByRole('tab', { name: '義賣商品' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByText(/TWD\s+500/)).toBeVisible()
    expect(itemsHit).toBeGreaterThanOrEqual(1)
  })
})

test.describe('Category filter (URL sync)', () => {
  test('forwards category to BFF query + persists in URL', async ({ page }) => {
    let lastCategory: string | null = null
    await page.route('**/api/charities*', async (route) => {
      const url = new URL(route.request().url())
      lastCategory = url.searchParams.get('category')
      const items = lastCategory === 'animal_protection'
        ? [makeCharity(CHARITY_A, '流浪動物 only', 'd', ['animal_protection'])]
        : [
            makeCharity(CHARITY_A, '流浪動物 only', 'd', ['animal_protection']),
            makeCharity(CHARITY_B, '其它團體', 'd', ['child_care']),
          ]
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { items, nextCursor: null } }),
      })
    })

    await page.goto('/donation')
    // Open the FilterButton, pick a category from CategoryMenu.
    // Buttons inside the menu use role="radio" (spec 003m §3).
    await page.getByRole('button', { name: '篩選：全部' }).click()
    await page.getByRole('radio', { name: '動物保護' }).click()

    await expect(
      page.getByRole('heading', { level: 2, name: '其它團體' }),
    ).toHaveCount(0)
    await expect(page).toHaveURL(/[?&]category=animal_protection/)
    expect(lastCategory).toBe('animal_protection')
  })
})

test.describe('Infinite scroll', () => {
  test('scroll near bottom → fetchNextPage → appends second page', async ({
    page,
    isMobile,
  }) => {
    // 30 cards per page so the page1 list overflows the viewport — the
    // scroll-percent sentinel auto-fires when content ≤ viewport (spec
    // 002 §7.3 "初始檢查"), so a short page1 would defeat the assertion
    // "page2 not visible before scroll".
    const page1Items = Array.from({ length: 30 }, (_, i) =>
      makeCharity(
        `11111111-1111-4111-8111-${(i + 1).toString().padStart(12, '0')}`,
        `Page1-Charity-${(i + 1).toString().padStart(2, '0')}`,
      ),
    )
    const page2Items = Array.from({ length: 5 }, (_, i) =>
      makeCharity(
        `22222222-2222-4222-8222-${(i + 1).toString().padStart(12, '0')}`,
        `Page2-Charity-${(i + 1).toString().padStart(2, '0')}`,
      ),
    )

    await page.route('**/api/charities*', async (route) => {
      const url = new URL(route.request().url())
      const cursor = url.searchParams.get('cursor')
      const body = cursor
        ? { items: page2Items, nextCursor: null }
        : { items: page1Items, nextCursor: 'p2' }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: body }),
      })
    })

    await page.goto('/donation')
    await expect(
      page.getByRole('heading', { level: 2, name: 'Page1-Charity-01', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'Page2-Charity-01', exact: true }),
    ).toHaveCount(0)

    // Trigger the scroll-percent sentinel (≤10% from bottom).
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    )

    await expect(
      page.getByRole('heading', { level: 2, name: 'Page2-Charity-01', exact: true }),
    ).toBeVisible({ timeout: isMobile ? 8_000 : 4_000 })
    await expect(
      page.getByRole('heading', { level: 2, name: 'Page1-Charity-01', exact: true }),
    ).toBeVisible()
  })
})

test.describe('URL sync (q + tab + category in one go)', () => {
  test('direct deep-link restores all three', async ({ page }) => {
    let qParam: string | null = null
    let categoryParam: string | null = null
    await page.route('**/api/items*', async (route) => {
      const url = new URL(route.request().url())
      qParam = url.searchParams.get('q')
      categoryParam = url.searchParams.get('category')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [
              makeItem(ITEM_A, '魚油 2oz', 920, CHARITY_A, '紅絲帶', '商品', [
                'animal_protection',
              ]),
            ],
            nextCursor: null,
          },
        }),
      })
    })

    await page.goto('/donation?tab=item&q=魚油&category=animal_protection')

    await expect(page.getByRole('tab', { name: '義賣商品' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByText(/TWD\s+920/)).toBeVisible()
    await expect(page.getByRole('searchbox')).toHaveValue('魚油')
    expect(qParam).toBe('魚油')
    expect(categoryParam).toBe('animal_protection')
  })
})
