import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

import { readDatabaseEnv } from './env'

const env = readDatabaseEnv()

// postgres.js v4 retries a connection refused for too many connections (53300)
// until connect_timeout passes, so keep it short: a full role limit fails a
// request in about 3 s instead of leaving it waiting.
export const sql = postgres(env.DATABASE_URL, {
  max: 4,
  idle_timeout: 20,
  connect_timeout: 2,
  onnotice: () => {}
})

export const db = drizzle(sql, { schema })
