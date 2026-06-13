import 'server-only'
import type { SessionStore } from './types'
import { RedisSessionStore } from './redis'

let instance: SessionStore | undefined

export function getSessionStore(): SessionStore {
  if (!instance) instance = new RedisSessionStore()
  return instance
}

export type { SessionStore } from './types'
