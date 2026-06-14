import { test, expect, type Page } from '@playwright/test'

type Tier = 'mobile' | 'tablet' | 'desktop'

const VIEWPORTS: Record<Tier, { width: number; height: number }> = {
  mobile: { width: 390, height: 844 }, // iPhone 14 Pro
  tablet: { width: 820, height: 1180 }, // iPad
  desktop: { width: 1440, height: 900 },
}

async function getGridCols(page: Page, selector: string): Promise<number> {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return 0
    const cs = window.getComputedStyle(el)
    return cs.gridTemplateColumns.split(' ').length
  }, selector)
}

for (const tier of ['mobile', 'tablet', 'desktop'] as const) {
  test.describe(`RWD - ${tier} ${VIEWPORTS[tier].width}px`, () => {
    test.use({ viewport: VIEWPORTS[tier] })

    test(`公益團體 (charity) 欄數 - ${tier}`, async ({ page }) => {
      await page.goto('/donation')
      // Wait for the first card to render before measuring grid — otherwise
      // the spinner div (no grid) is what the selector hits.
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
      const cols = await getGridCols(page, 'main > div > div:not([hidden])')
      const expected = { mobile: 1, tablet: 2, desktop: 3 }[tier]
      expect(cols).toBe(expected)
    })

    test(`義賣商品 (item) 欄數 - ${tier}`, async ({ page }) => {
      await page.goto('/donation?tab=item')
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
      const cols = await getGridCols(page, 'main > div > div:not([hidden])')
      const expected = { mobile: 2, tablet: 3, desktop: 4 }[tier]
      expect(cols).toBe(expected)
    })
  })
}

test('desktop CategoryMenu sheet 限寬 + 置中（不橫跨 1440）', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.goto('/donation')
  await page.getByRole('button', { name: '篩選：全部' }).click()
  const sheet = page.getByRole('dialog').locator('section')
  await expect(sheet).toBeVisible()
  const box = await sheet.boundingBox()
  expect(box).toBeTruthy()
  // 寬度應 ≤ 480；x 應 > 0（不貼左邊）
  expect(box!.width).toBeLessThanOrEqual(480)
  expect(box!.x).toBeGreaterThan(0)
  // 置中：x + width/2 ≈ 1440/2 = 720（±20px 容忍度）
  const center = box!.x + box!.width / 2
  expect(Math.abs(center - 720)).toBeLessThan(20)
})
