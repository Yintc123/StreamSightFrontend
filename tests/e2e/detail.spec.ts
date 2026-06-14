import { test, expect } from '@playwright/test'

const CHARITY_ID = '11111111-1111-4111-8111-000000000001'
const DONATION_ID = '22222222-2222-4222-8222-000000000001'
const ITEM_ID = '33333333-3333-4333-8333-000000000001'

test('點公益團體卡 → 進入詳情頁顯示 公益團體介紹 TopNav + 直接捐款給團體 CTA', async ({
  page,
}) => {
  await page.goto('/donation')
  await page.getByRole('heading', { level: 2, name: 'ACC 中華耆幼關懷協會' }).click()
  await expect(page).toHaveURL(new RegExp(`/charities/${CHARITY_ID}`))
  await expect(
    page.getByRole('heading', { level: 1, name: 'ACC 中華耆幼關懷協會' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '直接捐款給團體' })).toBeVisible()
})

test('直接訪問 charity detail URL 顯示完整內容', async ({ page }) => {
  await page.goto(`/charities/${CHARITY_ID}`)
  // TopNav title
  await expect(
    page.getByRole('heading', { level: 1, name: 'ACC 中華耆幼關懷協會' }),
  ).toBeVisible()
  // 基本資料 section
  await expect(page.getByRole('heading', { level: 2, name: '基本資料' })).toBeVisible()
})

test('直接訪問 donation project detail URL', async ({ page }) => {
  await page.goto(`/donation-projects/${DONATION_ID}`)
  // TopNav h1 是「捐款專案介紹」、content h1 是專案標題；用 .last() 取 content
  await expect(page.getByRole('heading', { level: 1 }).last()).toContainText('安居')
  await expect(page.getByRole('button', { name: '立即捐款' })).toBeVisible()
})

test('直接訪問 sale item detail URL 顯示 TWD 價格 + 公益義賣 ribbon', async ({
  page,
}) => {
  await page.goto(`/sale-items/${ITEM_ID}`)
  await expect(page.getByText('TWD 1,000')).toBeVisible()
  await expect(page.getByText('公益義賣')).toBeVisible()
  await expect(page.getByRole('button', { name: '立即捐款' })).toBeVisible()
})

test('detail page 未知 id → Next not-found', async ({ page }) => {
  const res = await page.goto(
    '/charities/00000000-0000-0000-0000-000000000000',
  )
  // Next 16 notFound() 預設回傳 404 status
  expect(res?.status()).toBe(404)
})
