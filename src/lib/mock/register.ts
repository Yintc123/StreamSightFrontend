// Eager mock-handler registration.
//
// Imported by `src/instrumentation.ts` on the Node runtime when
// `process.env.USE_MOCK === '1'`. Side-effect: the auth bridge paths the
// BFF hits (`/auth/login`, `/auth/me`) become resolvable through
// `resolveMock` — so the dev server and e2e suite can authenticate
// without a live backend.
//
// Domain endpoints (charities / donations / items / …) were removed with
// the feature layer; re-register their handlers here when a new feature
// vertical lands.

import 'server-only'

import { loginHandler, meHandler } from './auth-mock'
import { registerMock } from './dispatch'

// —— Auth bridge (USE_MOCK=1 login / register paths) ——
// /api/auth/login posts /auth/login then GETs /auth/me, so both must
// resolve to keep the auth smoke green.
registerMock('/auth/login', loginHandler)
registerMock('/auth/me', meHandler)
