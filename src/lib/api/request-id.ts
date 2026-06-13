import 'server-only'
import { randomBytes } from 'node:crypto'

export function newRequestId(): string {
  const date = new Date().toISOString().slice(0, 10)
  // base64url for ~6 bits/char; spec 001f §3.3.
  const suffix = randomBytes(6).toString('base64url').slice(0, 8)
  return `req_${date}_${suffix}`
}
