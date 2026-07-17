import { randomBytes } from 'node:crypto'
import { runSessionStoreContract } from '../../../../tests/contracts/session-store.contract'
import { RedisSessionStore } from './redis'

const host = process.env.REDIS_HOST ?? 'localhost'
const port = Number(process.env.REDIS_PORT ?? 6379)
const password = process.env.REDIS_PASSWORD ?? ''
const prefix = `streamsight-test-${randomBytes(4).toString('hex')}`

runSessionStoreContract(
  'redis',
  () => new RedisSessionStore({ host, port, password, keyPrefix: prefix }),
)
