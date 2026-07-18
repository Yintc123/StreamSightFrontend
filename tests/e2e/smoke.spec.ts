import { test, expect } from '@playwright/test'

test('/ 顯示 StreamSight header + 登入卡片（無公開註冊入口）', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'StreamSight' })).toBeVisible()
  await expect(page.getByLabel('帳號')).toBeVisible()
  await expect(page.getByLabel('密碼')).toBeVisible()
  await expect(page.getByRole('button', { name: '登入後台' })).toBeVisible()
  // Spec 012b §1/§4 — public self-registration entry removed.
  await expect(page.getByRole('button', { name: '建立帳號' })).toHaveCount(0)
})

test('/register redirects to the login homepage (spec 012b §1.2)', async ({ page }) => {
  await page.goto('/register')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: '登入後台' })).toBeVisible()
})
