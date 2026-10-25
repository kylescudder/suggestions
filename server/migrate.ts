import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

// Runs with the owner role only; the app runtime role cannot create tables.
// The journal lives in its own schema, where the runtime role has no access.
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
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
