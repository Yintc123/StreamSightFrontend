// Spec 013a §3.2 — unarchive (POST, SUPER_ADMIN only).
import { makeLifecyclePost } from '@/lib/api/admin-routes'

export const POST = makeLifecyclePost('unarchive')
