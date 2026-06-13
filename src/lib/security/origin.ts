import 'server-only'
import { env } from '@/lib/config'

export const allowedOrigins: ReadonlySet<string> = new Set(
  (env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

export function extractOriginFromReferer(req: Request): string | null {
  const ref = req.headers.get('referer')
  if (!ref) return null
  try {
    return new URL(ref).origin
  } catch {
    return null
  }
}
