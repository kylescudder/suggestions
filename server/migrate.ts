import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { readDatabaseEnv } from '../src/server/env'

const env = readDatabaseEnv()

// Runs with the owner role only; the app runtime role cannot create tables.
// The journal lives in its own schema, where the runtime role has no access.
const sql = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} })
try {
  await migrate(drizzle(sql), {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
    migrationsSchema: 'drizzle',
    migrationsTable: '__drizzle_migrations'
  })
  console.log('Suggestions schema is ready')
} finally {
  await sql.end()
}
