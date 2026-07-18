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
import { registerMock } from './dispatch'

// —— Admin auth bridge (USE_MOCK=1 login path) ——
// /api/auth/login posts /admin/auth/login then GETs /admin/me (spec 012a
// §4.1), so both must resolve to keep the auth smoke green.
registerMock('/admin/auth/login', loginHandler)
registerMock('/admin/me', meHandler)
