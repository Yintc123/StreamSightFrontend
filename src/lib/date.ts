// Spec 013b §0.3 — shared date formatting extracted from the CMS tables.
// Formatting is a UI concern; the backend/BFF keep timestamps as ISO strings
// (spec 013a §3.2). `null` timestamps (archivedAt/deletedAt) render as a dash.

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}
