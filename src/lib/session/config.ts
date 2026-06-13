import 'server-only'
import type { SessionOptions } from 'iron-session'
import { env } from '@/lib/config'

const password = env.SESSION_SECRET_PREVIOUS
  ? { 2: env.SESSION_SECRET!, 1: env.SESSION_SECRET_PREVIOUS }
  : env.SESSION_SECRET!

export const sessionOptions: SessionOptions = {
  password,
  cookieName: env.SESSION_COOKIE_NAME,
  cookieOptions: {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: env.SESSION_TTL_SECONDS,
    path: '/',
  },
  ttl: env.SESSION_TTL_SECONDS,
}
