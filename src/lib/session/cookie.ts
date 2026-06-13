import 'server-only'
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { sessionOptions } from './config'
import { SESSION_ID_BYTES } from '@/lib/api/constants'

const CookiePayload = z.object({ sessionId: z.string().min(40).max(50) })
type CookiePayload = z.infer<typeof CookiePayload>

async function getCookieSession() {
  // iron-session reads the cookie store returned by next/headers cookies().
  // Zod is applied after unseal to defend against schema drift across secret
  // rotations (old secret may decrypt an older payload shape).
  return getIronSession<CookiePayload>(await cookies(), sessionOptions)
}

export async function readSessionId(): Promise<string | null> {
  const s = await getCookieSession()
  const parsed = CookiePayload.safeParse({ sessionId: s.sessionId })
  return parsed.success ? parsed.data.sessionId : null
}

export async function writeSessionId(sessionId: string): Promise<void> {
  const s = await getCookieSession()
  s.sessionId = sessionId
  await s.save()
}

export async function clearSessionCookie(): Promise<void> {
  const s = await getCookieSession()
  s.destroy()
}

export function newSessionId(): string {
  return randomBytes(SESSION_ID_BYTES).toString('base64url')
}
