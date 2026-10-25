import postgres from 'postgres'

export function createHealthCheck(databaseUrl: string) {
  let probe: Promise<void> | undefined
  return () => {
    probe ??= check().finally(() => {
      probe = undefined
    })
    return probe
  }

  async function check() {
    // Own this connection so a deadline can retire it without touching app SQL.
    const sql = postgres(databaseUrl, {
      max: 1,
      connect_timeout: 3,
      connection: { statement_timeout: 3000 },
      onnotice: () => {}
    })
    const query = sql`SELECT id FROM suggestions LIMIT 0`
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        query,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), 3000)
        })
      ])
    } catch (error) {
      // Closing the socket doesn't stop a backend waiting on a lock, so cancel it.
      // The cancel request uses its own connection, so bound it too.
      await Promise.race([query.cancel(), Bun.sleep(500)]).catch(() => {})
      throw error
    } finally {
      clearTimeout(timer)
      // A SQL statement timeout cannot stop a socket that never reaches Postgres.
      await sql.end({ timeout: 0 })
    }
  }
}
