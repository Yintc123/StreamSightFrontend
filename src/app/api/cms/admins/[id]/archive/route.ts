// Spec 013a §3.2 — archive (POST, SUPER_ADMIN only).
import { makeLifecyclePost } from '@/lib/api/admin-routes'

export const POST = makeLifecyclePost('archive')
