import { test, expect, type Page } from '@playwright/test'

/**
 * Spec 018 §6 — 閒置 15 分鐘自動登出(USE_MOCK=1）。
 *
 * 用 Playwright 的 clock API 快轉時間:fastForward 只推進計時器 / Date,
 * 不會派發滑鼠或鍵盤事件,正好等同「使用者完全沒動」的閒置狀態。
 *
 * 先以真實時鐘登入(登入流程本身有計時器,不宜在暫停的假時鐘下跑),
 * 再 install() 假時鐘並重新載入 /cms,讓 useIdleLogout 的 setTimeout
 * 在假時鐘下重新掛載,fastForward 才控得動它。
 */

const IDLE_MS = 15 * 60 * 1000

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('帳號').fill('admin')
  await page.getByLabel('密碼').fill('admin-dev-password-change-me')
  await page.getByRole('button', { name: '登入後台' }).click()
  await expect(page).toHaveURL(/\/cms$/)
}

test('閒置 15 分鐘無操作 → 自動登出並導回首頁 + 提示', async ({ page }) => {
  await login(page)

  await page.clock.install()
  await page.goto('/cms') // 在假時鐘下重新掛載閒置偵測
  await expect(page).toHaveURL(/\/cms$/)

  // 不做任何滑鼠 / 鍵盤活動,快轉超過 15 分鐘。
  await page.clock.fastForward(IDLE_MS + 2000)

  // 已離開 CMS、落在首頁,登入卡片重新出現(代表已登出)。
  await expect(page).not.toHaveURL(/\/cms/)
  await expect(page.getByRole('button', { name: '登入後台' })).toBeVisible()

  // AuthRedirectToast 接住 ?reason=idle-logout 並顯示提示。
  await expect(page.getByText('閒置過久,已自動登出')).toBeVisible()
})

test('閒置期間有活動 → 重置計時,不登出', async ({ page }) => {
  await login(page)

  await page.clock.install()
  await page.goto('/cms')
  await expect(page).toHaveURL(/\/cms$/)

  // 距逾時前 1 分鐘做一次滑鼠移動,重置計時。
  await page.clock.fastForward(IDLE_MS - 60_000)
  await page.mouse.move(20, 20)

  // 再快轉將近一輪逾時,但因剛才有活動,累計未達 15 分鐘連續閒置。
  await page.clock.fastForward(IDLE_MS - 60_000)

  await expect(page).toHaveURL(/\/cms$/)
})
