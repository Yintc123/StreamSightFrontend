// Spec 008 §4 — CtaIsland: glue between detail-page CTA and the sheets.
//
// Integration test: drives the real DonationSettingsSheet / PurchaseQtySheet
// underneath so a breaking change in either bubbles up here. Sheets are
// already deeply unit-tested in their own files; this file just pins the
// island contract:
//   - button text from `label`
//   - click → sheet opens (dialog appears in document.body via portal)
//   - kind discriminates which sheet renders
//   - sticky=true wraps the button in the bottom chrome wrapper
//   - sheet close returns focus to the trigger button

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Item } from '@/lib/schemas/list'

const routerPushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

import { CtaIsland } from './CtaIsland'

const CHARITY_ID = '00000000-0000-4000-8000-000000000001'
const ITEM: Item = {
  id: '00000000-0000-4000-8000-000000000099',
  name: '陸仕私廚 藤椒牛肉麵',
  description: '760g 袋（冷凍）',
  priceTwd: 449,
}

beforeEach(() => {
  routerPushMock.mockReset()
})

describe('CtaIsland', () => {
  it('1: 初始 → 渲染 button (label) + 不渲染任何 dialog', () => {
    render(
      <CtaIsland
        kind="donation"
        target={{ type: 'CHARITY', id: CHARITY_ID }}
        label="直接捐款給團體"
      />,
    )
    expect(
      screen.getByRole('button', { name: '直接捐款給團體' }),
    ).toBeInTheDocument()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('2: 點 button → donation kind 開出 DonationSettingsSheet（title「捐款設定」）', async () => {
    render(
      <CtaIsland
        kind="donation"
        target={{ type: 'CHARITY', id: CHARITY_ID }}
        label="直接捐款給團體"
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: '直接捐款給團體' }),
    )
    expect(
      screen.getByRole('heading', { name: '捐款設定' }),
    ).toBeInTheDocument()
  })

  it('3: kind=purchase → 開出 PurchaseQtySheet（title「購買數量」）', async () => {
    render(<CtaIsland kind="purchase" item={ITEM} label="立即捐款" />)
    await userEvent.click(screen.getByRole('button', { name: '立即捐款' }))
    expect(
      screen.getByRole('heading', { name: '購買數量' }),
    ).toBeInTheDocument()
  })

  it('4: sticky=false（預設） → button 直接在 caller 樹中，無 sticky wrapper', () => {
    const { container } = render(
      <CtaIsland
        kind="donation"
        target={{ type: 'CHARITY', id: CHARITY_ID }}
        label="直接捐款給團體"
      />,
    )
    // wrapper 應該不存在
    expect(container.querySelector('.sticky')).toBeNull()
  })

  it('5: sticky=true → button 外包 sticky bottom-0 z-30 wrapper（對齊 TopNav）', () => {
    const { container } = render(
      <CtaIsland
        kind="donation"
        target={{ type: 'DONATION_PROJECT', id: CHARITY_ID }}
        label="立即捐款"
        sticky
      />,
    )
    const wrapper = container.querySelector('.sticky') as HTMLElement
    expect(wrapper).not.toBeNull()
    expect(wrapper.className).toMatch(/bottom-0/)
    expect(wrapper.className).toMatch(/z-30/)
    expect(wrapper.className).toMatch(/safe-area-inset-bottom/)
    // button 仍在 wrapper 內
    expect(wrapper.querySelector('button')).not.toBeNull()
  })

  it('6: 開 sheet 後按 esc 關閉 → focus 回到 trigger button（spec 008a §6.3 focus return）', async () => {
    render(
      <CtaIsland
        kind="donation"
        target={{ type: 'CHARITY', id: CHARITY_ID }}
        label="直接捐款給團體"
      />,
    )
    const trigger = screen.getByRole('button', { name: '直接捐款給團體' })
    await userEvent.click(trigger)
    // sheet 內初始焦點時序屬 BottomSheet 範圍，不在此處斷言；只驗 close → focus
    // 回 trigger 這條 island 自己的契約。

    await userEvent.keyboard('{Escape}')
    expect(document.activeElement).toBe(trigger)
  })

  it('7: sheet 內按下「下一步」（valid form）→ router.push 被叫 + sheet 關閉 + focus 回 trigger', async () => {
    render(
      <CtaIsland
        kind="purchase"
        item={ITEM}
        label="立即捐款"
        sticky
      />,
    )
    const trigger = screen.getByRole('button', { name: '立即捐款' })
    await userEvent.click(trigger)
    // PurchaseQty「下一步」永遠 enabled（quantity 預設 1）
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(routerPushMock).toHaveBeenCalledTimes(1)
    const url = routerPushMock.mock.calls[0][0] as string
    expect(url).toContain(`saleItemId=${ITEM.id}`)
    expect(document.activeElement).toBe(trigger) // focus return
  })
})
