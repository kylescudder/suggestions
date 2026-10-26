import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

export const sql = postgres(process.env.DATABASE_URL, {
  max: 4,
  onnotice: () => {}
})

export const db = drizzle(sql, { schema })
