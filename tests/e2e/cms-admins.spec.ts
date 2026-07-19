import { test, expect, type Page } from '@playwright/test'

/**
 * Spec 013b §4 — admin-management happy path under USE_MOCK=1.
 *
 * The mock login (spec 012a §6.6) always issues a super_admin session, so the
 * SUPER_ADMIN gate + nav entry are exercised. The runtime mock is stateless
 * and has no error codes (spec 013a §3.3), so this covers the happy path only;
 * guard / error paths live in the MSW integration tests.
 */

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('帳號').fill('admin')
  await page.getByLabel('密碼').fill('admin-dev-password-change-me')
  await page.getByRole('button', { name: '登入後台' }).click()
  await expect(page).toHaveURL(/\/cms$/)
}

test('super_admin: login → 管理員管理 → 列表 + 新增流程', async ({ page }) => {
  await login(page)

  // Nav entry exists for super_admin (may be inside a collapsed sidebar on
  // mobile — use href selector to assert presence without requiring it to be
  // interactive when collapsed).
  await expect(page.locator('a[href="/cms/admins"]')).toBeAttached()

  // Navigate to the admins page (works on both mobile and desktop regardless
  // of sidebar collapsed state).
  await page.goto('/cms/admins')
  await expect(page).toHaveURL(/\/cms\/admins$/)
  await expect(page.getByRole('heading', { name: '管理員管理' })).toBeVisible()

  // Seed rows from admin-mock.
  await expect(page.getByText('@root')).toBeVisible()
  await expect(page.getByText('@editor1')).toBeVisible()

  // Protected root cannot be archived/deleted.
  const rootRow = page.getByTestId('admin-row-1')
  await expect(rootRow.getByText(/root · 不可移除/)).toBeVisible()
  await expect(rootRow.getByRole('button', { name: '刪除' })).toHaveCount(0)

  // Create flow — sheet opens, submits, closes without an error.
  await page.getByRole('button', { name: '新增管理員' }).click()
  await page.getByLabel('帳號').fill('newviewer')
  await page.getByLabel('顯示名稱').fill('New Viewer')
  await page.getByLabel('密碼').fill('secret123')
  await page.getByRole('button', { name: '建立' }).click()
  await expect(page.getByRole('button', { name: '建立' })).toHaveCount(0)
})

test('status tabs switch the list query', async ({ page }) => {
  await login(page)
  await page.goto('/cms/admins')
  await page.getByRole('tab', { name: '已封存' }).click()
  await expect(page.getByRole('tab', { name: '已封存' })).toHaveAttribute('aria-selected', 'true')
})

test('/cms/users redirects to /cms/admins (spec 013b §3)', async ({ page }) => {
  await login(page)
  await page.goto('/cms/users')
  await expect(page).toHaveURL(/\/cms\/admins$/)
})
