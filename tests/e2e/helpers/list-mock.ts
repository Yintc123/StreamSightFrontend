// Per-test BFF response mock for list endpoints.
//
// Why page.route() over relying on the server-side mock dispatcher:
//   - Each test controls its own data set (search, empty, pagination).
//   - Tests stay hermetic across parallel workers.
//   - Reduced coupling — when the dispatcher / fixture file changes,
//     these tests don't need updating.

import type { Page, Route } from '@playwright/test'

type ResourcePath = '/api/charities' | '/api/donations' | '/api/items'

export interface MockListItem {
  id: string
  name: string
  description: string
  logoUrl?: string
  coverImageUrl?: string
  charityId?: string
  charityName?: string
  priceTwd?: number
  categories: string[]
}

export interface MockPage {
  items: MockListItem[]
  nextCursor: string | null
}

export interface ResourceMock {
  resource: ResourcePath
  /**
   * Either a single page (no pagination) or a paginated function that
   * receives the inbound URLSearchParams (`q`, `category`, `cursor`,
   * `limit`) and returns the page to serve.
   */
  pages: MockPage | ((params: URLSearchParams) => MockPage)
}

export async function mockListEndpoints(
  page: Page,
  mocks: ResourceMock[],
): Promise<void> {
  for (const m of mocks) {
    await page.route(`**${m.resource}*`, async (route: Route) => {
      const url = new URL(route.request().url())
      const body =
        typeof m.pages === 'function' ? m.pages(url.searchParams) : m.pages
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: body }),
      })
    })
  }
}

export function makeCharity(
  id: string,
  name: string,
  description = 'desc',
  categories: string[] = [],
): MockListItem {
  return { id, name, description, categories }
}

export function makeDonation(
  id: string,
  name: string,
  charityId: string,
  charityName: string,
  description = 'desc',
  categories: string[] = [],
): MockListItem {
  return { id, name, description, charityId, charityName, categories }
}

export function makeItem(
  id: string,
  name: string,
  priceTwd: number,
  charityId: string,
  charityName: string,
  description = 'desc',
  categories: string[] = [],
): MockListItem {
  return {
    id,
    name,
    description,
    priceTwd,
    charityId,
    charityName,
    categories,
  }
}
