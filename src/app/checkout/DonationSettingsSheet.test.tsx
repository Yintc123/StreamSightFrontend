// Spec 008b v0.5 §7.3 — component visual / integration tests.
// Logic is fully covered by useDonationSettingsForm.test.ts; this file just
// pins the visual integration (sections render, selected styling flips,
// submit button disabled-gate, form-semantic Enter triggers submit).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const routerPushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}))

import { DonationSettingsSheet } from './DonationSettingsSheet'
import type { DonationTarget } from './useDonationSettingsForm'

const TARGET: DonationTarget = {
  type: 'CHARITY',
  id: '00000000-0000-4000-8000-000000000001',
}

beforeEach(() => {
  routerPushMock.mockReset()
})

describe('DonationSettingsSheet', () => {
  it('1: 渲染 sheet header「捐款設定」+ 三個 section + submit button', () => {
    render(
      <DonationSettingsSheet open onClose={vi.fn()} target={TARGET} />,
    )
    expect(
      screen.getByRole('heading', { name: '捐款設定' }),
    ).toBeInTheDocument()
    expect(screen.getByText('捐款類型')).toBeInTheDocument()
    expect(screen.getByText('扣款日期')).toBeInTheDocument()
    expect(screen.getByText('扣款金額')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一步' })).toBeInTheDocument()
  })

  it('2: RECURRING（預設）→ 扣款日期 section 渲染；ONE_TIME → 隱藏', async () => {
    render(
      <DonationSettingsSheet open onClose={vi.fn()} target={TARGET} />,
    )
    expect(screen.getByText('扣款日期')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: '單次捐款' }))
    expect(screen.queryByText('扣款日期')).toBeNull()
  })

  it('3: 點 preset TWD 100 → 該 pill 為 selected 樣式（border-2 border-ink-AAA）', async () => {
    render(
      <DonationSettingsSheet open onClose={vi.fn()} target={TARGET} />,
    )
    const preset100 = screen.getByRole('radio', { name: 'TWD 100' })
    expect(preset100.className).not.toMatch(/border-2/)
    await userEvent.click(preset100)
    expect(preset100.className).toMatch(/border-2/)
    expect(preset100.className).toMatch(/border-ink-AAA/)
  })

  it('3b (v0.6): 點 preset → 「請輸入金額」input 自動帶入該金額字串', async () => {
    render(
      <DonationSettingsSheet open onClose={vi.fn()} target={TARGET} />,
    )
    const input = screen.getByLabelText('自訂金額') as HTMLInputElement
    expect(input.value).toBe('')
    await userEvent.click(screen.getByRole('radio', { name: 'TWD 500' }))
    expect(input.value).toBe('500')
    await userEvent.click(screen.getByRole('radio', { name: 'TWD 1,000' }))
    expect(input.value).toBe('1000')
  })

  it('4: TWD input value 等於 form.amountInputRaw（受控；ghost-reset regression guard）', async () => {
    render(
      <DonationSettingsSheet open onClose={vi.fn()} target={TARGET} />,
    )
    const input = screen.getByLabelText('自訂金額') as HTMLInputElement
    await userEvent.type(input, '00')
    // "00" parses to 0 → amount=null，但 raw 保留顯示
    expect(input.value).toBe('00')
  })

  it('5: submit button isValid=false 時 disabled；填齊 → enabled', async () => {
    render(
      <DonationSettingsSheet open onClose={vi.fn()} target={TARGET} />,
    )
    const submit = screen.getByRole('button', { name: '下一步' })
    expect(submit).toBeDisabled()

    await userEvent.click(screen.getByRole('radio', { name: 'TWD 100' }))
    expect(submit).toBeDisabled() // 還缺 billingDay

    await userEvent.click(screen.getByRole('radio', { name: '每月 16 日' }))
    expect(submit).toBeEnabled()
  })

  it('5b (v0.6): 自訂金額 < MIN_PRESET_AMOUNT (100) → 紅字提示「本專案最低捐款金額為 100」+ submit disabled', async () => {
    render(
      <DonationSettingsSheet open onClose={vi.fn()} target={TARGET} />,
    )
    const input = screen.getByLabelText('自訂金額') as HTMLInputElement
    await userEvent.type(input, '50')

    const hint = screen.getByText('本專案最低捐款金額為 100')
    expect(hint).toBeInTheDocument()
    expect(hint.className).toMatch(/text-brand/)
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled()
  })

  it('5c (v0.6): 自訂金額 = 100 → 不顯示紅字提示', async () => {
    render(
      <DonationSettingsSheet open onClose={vi.fn()} target={TARGET} />,
    )
    const input = screen.getByLabelText('自訂金額') as HTMLInputElement
    await userEvent.type(input, '100')
    expect(screen.queryByText('本專案最低捐款金額為 100')).toBeNull()
  })

  it('5d (v0.6): 空 input → 不顯示提示（提示只在「真的低於 min」時出現）', () => {
    render(
      <DonationSettingsSheet open onClose={vi.fn()} target={TARGET} />,
    )
    expect(screen.queryByText('本專案最低捐款金額為 100')).toBeNull()
  })

  it('6: 在 input 按 Enter → submit handler 觸發（form semantic）', async () => {
    render(
      <DonationSettingsSheet open onClose={vi.fn()} target={TARGET} />,
    )
    // 先把 form 填到 valid
    await userEvent.click(screen.getByRole('radio', { name: 'TWD 500' }))
    await userEvent.click(screen.getByRole('radio', { name: '每月 6 日' }))

    const input = screen.getByLabelText('自訂金額') as HTMLInputElement
    input.focus()
    await userEvent.keyboard('{Enter}')

    expect(routerPushMock).toHaveBeenCalledTimes(1)
    const url = routerPushMock.mock.calls[0][0] as string
    expect(url).toContain('billingDay=DAY_6')
    expect(url).toContain('amountTwd=500')
  })
})
