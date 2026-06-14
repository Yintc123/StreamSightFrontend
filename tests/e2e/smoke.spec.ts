import { test, expect } from '@playwright/test'

test('/ redirects to /donation and renders 所有捐款項目 TopNav', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/donation/)
  await expect(page.getByRole('heading', { level: 1, name: '所有捐款項目' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '公益團體' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '捐款專案' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '義賣商品' })).toBeVisible()
})

test('charity tab shows at least one fixture card', async ({ page }) => {
  await page.goto('/donation')
  await expect(
    page.getByRole('heading', { level: 2, name: 'ACC 中華耆幼關懷協會' }),
  ).toBeVisible()
})

test('switching to 義賣商品 tab shows TWD price', async ({ page }) => {
  await page.goto('/donation')
  await page.getByRole('tab', { name: '義賣商品' }).click()
  await expect(page.getByText(/TWD\s+\d/).first()).toBeVisible()
})
