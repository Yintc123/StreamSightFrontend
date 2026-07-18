// Eager mock-handler registration.
//
// Imported by `src/instrumentation.ts` on the Node runtime when
// `process.env.USE_MOCK === '1'`. Side-effect: the admin auth bridge paths
// the BFF hits (`/admin/auth/login`, `/admin/me`) become resolvable through
// `resolveMock` — so the dev server and e2e suite can authenticate
// without a live backend.
//
// Domain endpoints (charities / donations / items / …) were removed with
// the feature layer; re-register their handlers here when a new feature
// vertical lands.

import 'server-only'

import { loginHandler, meHandler } from './auth-mock'
import {
  adminCollectionHandler,
  adminItemHandler,
  adminRoleHandler,
  adminArchiveHandler,
  adminUnarchiveHandler,
  adminRestoreHandler,
  mePasswordHandler,
} from './admin-mock'
import { registerMock } from './dispatch'

// —— Admin auth bridge (USE_MOCK=1 login path) ——
// /api/auth/login posts /admin/auth/login then GETs /admin/me (spec 012a
// §4.1), so both must resolve to keep the auth smoke green.
registerMock('/admin/auth/login', loginHandler)
registerMock('/admin/me', meHandler)

// —— Admin management (spec 013a §3.3; happy path only) ——
// Handlers branch on opts.method so one path covers all verbs.
registerMock('/admin/admins', adminCollectionHandler) // GET list / POST create
registerMock('/admin/admins/:id', adminItemHandler) // GET detail / PATCH rename / DELETE
registerMock('/admin/me/password', mePasswordHandler)
registerMock('/admin/admins/:id/role', adminRoleHandler)
registerMock('/admin/admins/:id/archive', adminArchiveHandler)
registerMock('/admin/admins/:id/unarchive', adminUnarchiveHandler)
registerMock('/admin/admins/:id/restore', adminRestoreHandler)
