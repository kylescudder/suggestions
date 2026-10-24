import { sql } from '../server/db'

try {
  const response = await fetch('http://127.0.0.1:3001/', {
    signal: AbortSignal.timeout(3000)
  })
  if (!response.ok) throw new Error('Frontend is unavailable')
  await sql`SELECT id FROM suggestions LIMIT 0`
} finally {
  await sql.end({ timeout: 1 })
}
