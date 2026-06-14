import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchBar } from './SearchBar'

describe('SearchBar', () => {
  it('受控渲染：value="foo" 顯示在 input', () => {
    render(<SearchBar value="foo" onChange={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveValue('foo')
  })

  it('輸入文字觸發 onChange', async () => {
    const onChange = vi.fn()
    render(<SearchBar value="" onChange={onChange} />)
    await userEvent.type(screen.getByRole('searchbox'), 'a')
    expect(onChange).toHaveBeenLastCalledWith('a')
  })

  it('沒傳 onCancel → 取消按鈕不渲染（不管 value）', () => {
    const { rerender } = render(<SearchBar value="" onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull()
    rerender(<SearchBar value="x" onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull()
  })

  it('傳了 onCancel → 取消按鈕始終渲染（含 value=""）', () => {
    const { rerender } = render(
      <SearchBar value="" onChange={() => {}} onCancel={() => {}} />,
    )
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
    rerender(<SearchBar value="foo" onChange={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
  })

  it('按取消：清空 value、呼叫 onCancel、blur input', async () => {
    const onChange = vi.fn()
    const onCancel = vi.fn()
    render(<SearchBar value="foo" onChange={onChange} onCancel={onCancel} />)
    const input = screen.getByRole('searchbox')
    input.focus()
    expect(input).toHaveFocus()

    await userEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onChange).toHaveBeenCalledWith('')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(input).not.toHaveFocus()
  })

  it('放大鏡 icon 渲染（alt 空字串）', () => {
    const { container } = render(<SearchBar value="" onChange={() => {}} />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('/figma/icon-magnifier.svg')
    expect(img?.getAttribute('alt')).toBe('')
  })

  it('預設 placeholder 為「搜尋公益團體」', () => {
    render(<SearchBar value="" onChange={() => {}} />)
    expect(screen.getByPlaceholderText('搜尋公益團體')).toBeInTheDocument()
  })

  it('自訂 placeholder', () => {
    render(<SearchBar value="" onChange={() => {}} placeholder="搜尋商品" />)
    expect(screen.getByPlaceholderText('搜尋商品')).toBeInTheDocument()
  })

  it('input type 為 search', () => {
    render(<SearchBar value="" onChange={() => {}} />)
    expect(screen.getByRole('searchbox')).toHaveAttribute('type', 'search')
  })

  it('autoFocus=true → mount 時 input 取得 focus', () => {
    render(<SearchBar value="" onChange={() => {}} autoFocus />)
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('autoFocus=false (default) → mount 時 input 不 focus', () => {
    render(<SearchBar value="" onChange={() => {}} />)
    expect(screen.getByRole('searchbox')).not.toHaveFocus()
  })
})
