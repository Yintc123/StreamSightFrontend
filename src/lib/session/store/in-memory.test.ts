import { runSessionStoreContract } from '../../../../tests/contracts/session-store.contract'
import { InMemorySessionStore } from './in-memory'

runSessionStoreContract('in-memory', () => new InMemorySessionStore())
