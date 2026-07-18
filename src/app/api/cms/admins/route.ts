// Spec 013a §3.2 — GET list + POST create (SUPER_ADMIN only).
import { adminListRoute, adminCreateRoute } from '@/lib/api/admin-routes'

export const GET = adminListRoute
export const POST = adminCreateRoute
