import 'server-only'
import { z } from 'zod'

const RawEnv = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    BACKEND_API_URL: z.string().url().optional(),
    USE_MOCK: z.enum(['0', '1']).default('0'),
    // iron-session signs every cookie, so SESSION_SECRET is required even in
    // mock mode where backend / Redis are optional. Spec 001a §3.1 gated it on
    // USE_MOCK=0 but in practice the cookie path runs for every request.
    SESSION_SECRET: z.string().min(32),
    SESSION_SECRET_PREVIOUS: z.string().min(32).optional(),
    SESSION_COOKIE_NAME: z.string().default('jko_session'),
    SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
    ALLOWED_ORIGINS: z.string().optional(),

    REDIS_URL: z.string().url().optional(),
    REDIS_KEY_PREFIX: z.string().default('jko-bff'),
    REDIS_TLS_ENABLED: z.enum(['0', '1']).default('0'),
    REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
    REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(1000),

    APP_VERSION: z.string().default('0.0.0'),
    APP_COMMIT: z.string().optional(),
    ENABLE_DEV_LOGIN: z.enum(['0', '1']).default('0'),
    NEXT_PUBLIC_APP_NAME: z.string().default('JKODonation'),
  })
  .superRefine((env, ctx) => {
    if (env.USE_MOCK === '0') {
      if (!env.BACKEND_API_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['BACKEND_API_URL'],
          message: 'required when USE_MOCK=0',
        })
      }
      // SESSION_SECRET is required unconditionally (schema-level) — see comment above.
      if (!env.REDIS_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['REDIS_URL'],
          message: 'required when USE_MOCK=0',
        })
      }
    }

    if (env.NODE_ENV === 'production') {
      const list = (env.ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (list.length === 0 || list.every((o) => o.startsWith('http://localhost'))) {
        ctx.addIssue({
          code: 'custom',
          path: ['ALLOWED_ORIGINS'],
          message: 'production requires non-localhost origins',
        })
      }
    }

    if (env.NODE_ENV === 'production' && env.ENABLE_DEV_LOGIN === '1') {
      ctx.addIssue({
        code: 'custom',
        path: ['ENABLE_DEV_LOGIN'],
        message: 'must not be enabled in production',
      })
    }
  })

// Treat empty strings as missing. dotenv files routinely emit `KEY=` to mean
// "not configured"; Zod's `.optional()` only handles undefined, not '', so an
// empty SESSION_SECRET would otherwise fail `min(32)` instead of being skipped.
const cleanedEnv = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v]),
)

export const env = RawEnv.parse(cleanedEnv)
export type Env = typeof env
