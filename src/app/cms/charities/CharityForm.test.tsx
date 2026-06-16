import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/cms/charities/x/edit',
}))

import { CharityForm } from './CharityForm'
import { DEFAULT_FORM, type FormState } from './useCharityForm'
import { isoToLocalInput } from '@/components/cms/DateTimeInput'

const CATEGORIES = [
  { id: 'cat-1', key: 'child_care' as const, displayName: '兒少照護', displayOrder: 0 },
]

describe('CharityForm edit pre-fill', () => {
  it('publishStartAt + publishEndAt initial values render in inputs', () => {
    const initial: FormState = {
      ...DEFAULT_FORM,
      name: '示範團體',
      description: 'desc',
      publishStartAt: '2026-07-01T00:00:00.000Z',
      publishEndAt: '2026-12-31T00:00:00.000Z',
    }

    render(
      <CharityForm
        mode="edit"
        id="x"
        initial={initial}
        categories={CATEGORIES}
      />,
    )

    const start = document.getElementById('publishStartAt') as HTMLInputElement
    const end = document.getElementById('publishEndAt') as HTMLInputElement
    expect(start).toBeInTheDocument()
    expect(end).toBeInTheDocument()
    // Values should be the local-format string isoToLocalInput would produce
    expect(start.value).toBe(isoToLocalInput('2026-07-01T00:00:00.000Z'))
    expect(end.value).toBe(isoToLocalInput('2026-12-31T00:00:00.000Z'))
    // The non-empty inputs are the smoking gun the test cares about
    expect(start.value).not.toBe('')
    expect(end.value).not.toBe('')
  })

  it('publishStartAt/End empty initial → empty inputs', () => {
    render(
      <CharityForm
        mode="edit"
        id="x"
        initial={{ ...DEFAULT_FORM, name: 'x', description: 'd' }}
        categories={CATEGORIES}
      />,
    )
    expect((document.getElementById('publishStartAt') as HTMLInputElement).value).toBe('')
    expect((document.getElementById('publishEndAt') as HTMLInputElement).value).toBe('')
  })
})
