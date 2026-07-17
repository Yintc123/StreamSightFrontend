import { test, expect } from '@playwright/test'

test('/ 顯示 StreamSight header + 登入卡片', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'StreamSight' })).toBeVisible()
  await expect(page.getByLabel('帳號')).toBeVisible()
  await expect(page.getByLabel('密碼')).toBeVisible()
  await expect(page.getByRole('button', { name: '登入後台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '建立帳號' })).toBeVisible()
})
