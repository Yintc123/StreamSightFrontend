import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeyValueList, KeyValueRow } from './KeyValueList'

describe('KeyValueList', () => {
  it('多 row → dl 內含對等 dt/dd', () => {
    const { container } = render(
      <KeyValueList>
        <KeyValueRow label="捐款專案">直接捐款給團體</KeyValueRow>
        <KeyValueRow label="捐款對象">ACC</KeyValueRow>
      </KeyValueList>,
    )
    const dl = container.querySelector('dl')
    expect(dl).not.toBeNull()
    expect(dl?.querySelectorAll('dt')).toHaveLength(2)
    expect(dl?.querySelectorAll('dd')).toHaveLength(2)
    expect(screen.getByText('捐款專案').tagName).toBe('DT')
    expect(screen.getByText('直接捐款給團體').tagName).toBe('DD')
  })

  it('預設 grid-template-columns 為 "6em 1fr"', () => {
    const { container } = render(
      <KeyValueList>
        <KeyValueRow label="x">y</KeyValueRow>
      </KeyValueList>,
    )
    const dl = container.querySelector('dl') as HTMLElement
    expect(dl.style.gridTemplateColumns).toBe('6em 1fr')
  })

  it('labelWidth prop → grid-template-columns inline style 對應', () => {
    const { container } = render(
      <KeyValueList labelWidth="8em">
        <KeyValueRow label="x">y</KeyValueRow>
      </KeyValueList>,
    )
    const dl = container.querySelector('dl') as HTMLElement
    expect(dl.style.gridTemplateColumns).toBe('8em 1fr')
  })
})

describe('KeyValueRow', () => {
  it('variant 預設 normal → dd 不含 text-brand 或 font-bold', () => {
    render(
      <KeyValueList>
        <KeyValueRow label="x">value</KeyValueRow>
      </KeyValueList>,
    )
    const dd = screen.getByText('value')
    expect(dd.className).not.toMatch(/text-brand/)
    expect(dd.className).not.toMatch(/font-bold/)
  })

  it('variant emphasized → dd 含 text-brand + font-bold', () => {
    render(
      <KeyValueList>
        <KeyValueRow label="金額" variant="emphasized">TWD 100</KeyValueRow>
      </KeyValueList>,
    )
    const dd = screen.getByText('TWD 100')
    expect(dd.className).toMatch(/text-brand/)
    expect(dd.className).toMatch(/font-bold/)
  })
})
