import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReminderNote, REMINDER_DONOR_NAME } from './ReminderNote'

describe('ReminderNote', () => {
  it('渲染 children 在 <p> semantic 內', () => {
    render(<ReminderNote>提醒一句</ReminderNote>)
    const p = screen.getByText(/提醒一句/)
    expect(p.closest('p')).not.toBeNull()
  })

  it('預設帶「小提醒：」前綴', () => {
    render(<ReminderNote>body</ReminderNote>)
    expect(screen.getByText(/小提醒：/)).toBeInTheDocument()
  })

  it('icon 標 aria-hidden（裝飾性）', () => {
    const { container } = render(<ReminderNote>x</ReminderNote>)
    const icon = container.querySelector('[aria-hidden="true"]')
    expect(icon).not.toBeNull()
  })

  it('className prop 合併到 <p>', () => {
    render(<ReminderNote className="mt-4">x</ReminderNote>)
    const p = screen.getByText(/小提醒：/).closest('p')!
    expect(p.className).toMatch(/mt-4/)
  })

  it('REMINDER_DONOR_NAME 為非空字串', () => {
    expect(typeof REMINDER_DONOR_NAME).toBe('string')
    expect(REMINDER_DONOR_NAME.length).toBeGreaterThan(0)
  })
})
