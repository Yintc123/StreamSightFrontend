// Spec 013a §3.2 — restore soft-deleted (POST, SUPER_ADMIN only).
import { makeLifecyclePost } from '@/lib/api/admin-routes'

export const POST = makeLifecyclePost('restore')
