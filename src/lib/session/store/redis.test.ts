import { randomBytes } from 'node:crypto'
import { runSessionStoreContract } from '../../../../tests/contracts/session-store.contract'
import { RedisSessionStore } from './redis'

const url = process.env.REDIS_URL ?? 'redis://localhost:6380/0'
const prefix = `jko-test-${randomBytes(4).toString('hex')}`

runSessionStoreContract(
  'redis',
  () => new RedisSessionStore({ url, keyPrefix: prefix }),
)
