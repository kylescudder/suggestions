import { migrate, sql } from './db'

try {
  await migrate()
  console.log('Suggestions schema is ready')
} finally {
  await sql.end()
}
