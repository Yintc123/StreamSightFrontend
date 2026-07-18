import { redirect } from 'next/navigation'

/**
 * Spec 013b §3 — the spec 011 `/cms/users` static UI was migrated to
 * `/cms/admins` (admin-management model). This route now permanently
 * redirects there so old links / bookmarks keep working.
 */
export default function CmsUsersPage(): never {
  redirect('/cms/admins')
}
