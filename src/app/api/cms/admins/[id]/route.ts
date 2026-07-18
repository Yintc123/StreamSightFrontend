// Spec 013a §3.2 — detail (GET) / rename (PATCH) / soft-delete (DELETE).
import {
  adminDetailRoute,
  adminRenameRoute,
  adminDeleteRoute,
} from '@/lib/api/admin-routes'

export const GET = adminDetailRoute
export const PATCH = adminRenameRoute
export const DELETE = adminDeleteRoute
