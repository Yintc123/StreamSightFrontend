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

test('切 tab → URL ?tab=item；直接訪問該 URL 也顯示同 tab', async ({ page }) => {
  await page.goto('/donation')
  await page.getByRole('tab', { name: '義賣商品' }).click()
  await expect(page).toHaveURL(/[?&]tab=item/)

  await page.goto('/donation?tab=donation')
  await expect(page.getByRole('tab', { name: '捐款專案' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('進 item 詳情後返回 → 仍在義賣商品 tab', async ({ page }) => {
  await page.goto('/donation')
  await page.getByRole('tab', { name: '義賣商品' }).click()
  await expect(page).toHaveURL(/[?&]tab=item/)

  // 點任一義賣商品卡
  await page
    .getByRole('heading', { level: 2, name: '北歐天然｜貝比D - 液體維生素D3食品' })
    .click()
  await expect(page).toHaveURL(/\/sale-items\//)

  // 返回 → URL 回到帶 ?tab=item 的 /donation
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page).toHaveURL(/\/donation\?[^#]*tab=item/)
  // 義賣商品 tab 仍 active
  await expect(page.getByRole('tab', { name: '義賣商品' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})
