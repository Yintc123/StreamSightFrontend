import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdminTable } from './AdminTable'

type Row = { id: string; name: string; n: number }

const COLUMNS = [
  { header: '名稱', cell: (r: Row) => r.name },
  { header: '數量', cell: (r: Row) => r.n, align: 'right' as const },
]

describe('AdminTable', () => {
  it('1: rows 有 → 渲染 table + thead + 每 row', () => {
    const rows: Row[] = [
      { id: '1', name: 'A', n: 10 },
      { id: '2', name: 'B', n: 20 },
    ]
    render(
      <AdminTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        caption="清單"
      />,
    )
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2 rows
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('2: rows 空 → 渲染預設 empty state', () => {
    render(
      <AdminTable
        columns={COLUMNS}
        rows={[]}
        rowKey={(r: Row) => r.id}
        caption="清單"
      />,
    )
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(/沒有資料/)).toBeInTheDocument()
  })

  it('3: caller emptyState 覆寫', () => {
    render(
      <AdminTable
        columns={COLUMNS}
        rows={[]}
        rowKey={(r: Row) => r.id}
        emptyState={<p>自訂空狀態</p>}
        caption="清單"
      />,
    )
    expect(screen.getByText('自訂空狀態')).toBeInTheDocument()
  })

  it('4: column.cell 回 ReactNode（含 ReactElement）正確渲染', () => {
    const cols = [
      {
        header: '操作',
        cell: (r: Row) => <a href={`/x/${r.id}`}>edit</a>,
      },
    ]
    render(
      <AdminTable
        columns={cols}
        rows={[{ id: '1', name: 'A', n: 0 }]}
        rowKey={(r) => r.id}
        caption="x"
      />,
    )
    expect(screen.getByRole('link', { name: 'edit' })).toHaveAttribute(
      'href',
      '/x/1',
    )
  })

  it('5: caption sr-only', () => {
    render(
      <AdminTable
        columns={COLUMNS}
        rows={[{ id: '1', name: 'A', n: 0 }]}
        rowKey={(r) => r.id}
        caption="清單"
      />,
    )
    expect(screen.getByText('清單')).toHaveClass('sr-only')
  })
})
