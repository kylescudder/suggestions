import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

import { readDatabaseEnv } from './env'

const env = readDatabaseEnv()

export const sql = postgres(env.DATABASE_URL, {
  max: 4,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}
})

export const db = drizzle(sql, { schema })
