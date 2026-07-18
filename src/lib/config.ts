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
    SESSION_COOKIE_NAME: z.string().default('streamsight_session'),
    SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),
    ALLOWED_ORIGINS: z.string().optional(),
    SESSION_COOKIE_DOMAIN: z.string().optional(),

    // Discrete connection parts — symmetric with backend's spec 001 §3.3
    // pattern. ioredis accepts { host, port, password } directly so no URL
    // string composition is needed; passwords with URL-unsafe characters
    // (@ / : / ? / # etc.) don't need percent-encoding.
    REDIS_HOST: z.string().min(1).optional(),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    REDIS_PASSWORD: z.string().default(''),
    REDIS_KEY_PREFIX: z.string().default('streamsight-bff'),
    REDIS_TLS_ENABLED: z.enum(['0', '1']).default('0'),
    REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
    REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(1000),

    APP_VERSION: z.string().default('0.0.0'),
    APP_COMMIT: z.string().optional(),
    NEXT_PUBLIC_APP_NAME: z.string().default('StreamSight'),

    // Base URL of the Streamlit app (dashboard / data / monitor / analytics /
    // admin). The CMS sidebar links out to it; both apps share the same ALB.
    // Optional — when unset the sidebar falls back to root-relative paths.
    STREAMLIT_BASE_URL: z.string().url().optional(),
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
      if (!env.REDIS_HOST) {
        ctx.addIssue({
          code: 'custom',
          path: ['REDIS_HOST'],
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

  })

// Treat empty strings as missing. dotenv files routinely emit `KEY=` to mean
// "not configured"; Zod's `.optional()` only handles undefined, not '', so an
// empty SESSION_SECRET would otherwise fail `min(32)` instead of being skipped.
const cleanedEnv = Object.fromEntries(
  Object.entries(process.env).map(([k, v]) => [k, v === '' ? undefined : v]),
)

export const env = RawEnv.parse(cleanedEnv)
export type Env = typeof env
