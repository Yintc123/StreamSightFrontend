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

test('從 item tab 切回 charity（default）→ URL drop ?tab=', async ({ page }) => {
  // 防呆 useUrlSync 在 default tab 時清不掉 querystring 的 regression
  await page.goto('/donation?tab=item')
  await page.getByRole('tab', { name: '公益團體' }).click()
  await expect(page).not.toHaveURL(/[?&]tab=/)
  await page.waitForTimeout(500)
  await expect(page).not.toHaveURL(/[?&]tab=/)
})

test('browse 模式：TabsRow 在 FilterButton + 搜尋 icon 之上（Figma 對齊）', async ({
  page,
}) => {
  await page.goto('/donation')
  const tab = page.getByRole('tab', { name: '公益團體' })
  const filterBtn = page.getByRole('button', { name: '篩選：全部' })
  await expect(tab).toBeVisible()
  await expect(filterBtn).toBeVisible()
  const tabBox = await tab.boundingBox()
  const filterBox = await filterBtn.boundingBox()
  expect(tabBox).toBeTruthy()
  expect(filterBox).toBeTruthy()
  // tab 的 y 應該比 filter 的 y 小（在上面）
  expect(tabBox!.y).toBeLessThan(filterBox!.y)
})

test('點搜尋 icon → 進 search 模式：FilterButton 消失、SearchBar 出現、TabsRow 跑到下方', async ({
  page,
}) => {
  await page.goto('/donation')
  await page.getByRole('button', { name: '開啟搜尋' }).click()

  // FilterButton 應消失
  await expect(page.getByRole('button', { name: '篩選：全部' })).toHaveCount(0)
  // SearchBar input 出現且 focus
  const input = page.getByRole('searchbox')
  await expect(input).toBeVisible()
  await expect(input).toBeFocused()

  // TabsRow 仍存在，但 y 應該大於 SearchBar（在搜尋列下方）
  const tab = page.getByRole('tab', { name: '公益團體' })
  const tabBox = await tab.boundingBox()
  const inputBox = await input.boundingBox()
  expect(tabBox!.y).toBeGreaterThan(inputBox!.y)
})

test('進 search 模式：「取消」按鈕立即出現（即使還沒打字）', async ({
  page,
}) => {
  await page.goto('/donation')
  await page.getByRole('button', { name: '開啟搜尋' }).click()
  await expect(page.getByRole('button', { name: '取消' })).toBeVisible()
})

test('search 模式 + 還沒打字 → Spinner + 不渲染 items + TabsRow 仍在', async ({
  page,
}) => {
  await page.goto('/donation')
  await page.getByRole('button', { name: '開啟搜尋' }).click()
  // Spinner 出現
  await expect(
    page.getByRole('status', { name: '搜尋中…' }),
  ).toBeVisible()
  // items 隱藏
  await expect(
    page.getByRole('heading', { level: 2, name: 'ACC 中華耆幼關懷協會' }),
  ).toHaveCount(0)
  // TabsRow 仍在（!isPending 時 Figma 1:2213 樣式）
  await expect(page.getByRole('tab', { name: '公益團體' })).toBeVisible()
})

test('search 模式 isPending → Figma 1:2247：藏 TabsRow + 顯示 Spinner', async ({
  page,
}) => {
  await page.goto('/donation')
  await page.getByRole('button', { name: '開啟搜尋' }).click()
  // 一打字、debounce 還沒到 → spinner 出現、TabsRow 消失
  await page.getByRole('searchbox').fill('魚油')
  await expect(
    page.getByRole('status', { name: '搜尋中…' }),
  ).toBeVisible({ timeout: 200 })
  await expect(page.getByRole('tab', { name: '公益團體' })).toHaveCount(0)
})

test('search 模式打字後 → empty 提示消失，卡片或查無結果出現', async ({
  page,
}) => {
  await page.goto('/donation')
  await page.getByRole('button', { name: '開啟搜尋' }).click()
  await page.getByRole('searchbox').fill('ACC')
  await page.waitForTimeout(400) // debounce
  await expect(
    page.getByRole('heading', { level: 2, name: '請輸入關鍵字搜尋' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', { level: 2, name: 'ACC 中華耆幼關懷協會' }),
  ).toBeVisible()
})

test('search 模式按取消 → 回 browse 模式、清空 q、URL drop ?q=', async ({ page }) => {
  await page.goto('/donation')
  await page.getByRole('button', { name: '開啟搜尋' }).click()
  await page.getByRole('searchbox').fill('魚油')
  await expect(page).toHaveURL(/[?&]q=/)

  await page.getByRole('button', { name: '取消' }).click()
  // 回 browse 模式 → FilterButton 又出現
  await expect(page.getByRole('button', { name: '篩選：全部' })).toBeVisible()
  // q 從 URL drop
  await expect(page).not.toHaveURL(/[?&]q=/)
})

test('URL ?q=xxx 進入頁面 → 直接是 search 模式', async ({ page }) => {
  await page.goto('/donation?q=動物')
  // FilterButton 不在
  await expect(page.getByRole('button', { name: /篩選/ })).toHaveCount(0)
  // SearchBar input 有值
  await expect(page.getByRole('searchbox')).toHaveValue('動物')
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
