// Spec 013b §0.3 / §2.1 — admin lifecycle status badge (active / archived /
// deleted), driven by a prop. Colours use semantic tokens only.

type AdminStatus = 'active' | 'archived' | 'deleted'

const STYLES: Record<AdminStatus, { dot: string; text: string; label: string }> = {
  active: { dot: 'bg-ok', text: 'text-ok', label: '啟用' },
  archived: { dot: 'bg-warn', text: 'text-warn', label: '已封存' },
  deleted: { dot: 'bg-danger', text: 'text-danger', label: '已刪除' },
}

export function StatusBadge({ status }: { status: AdminStatus }) {
  const s = STYLES[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${s.text}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}
