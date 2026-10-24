import { sql } from '../server/db'

type LegacySuggestion = {
  _id: string
  _creationTime: number
  title: string
  description: string
  status: string
  authorName?: string
  authorEmail?: string
}

const source = new URL(process.argv[2] ?? '')
if (
  source.protocol !== 'https:' ||
  !source.hostname.endsWith('.convex.cloud')
) {
  throw new Error(
    "Supply the existing application's HTTPS Convex deployment URL"
  )
}

try {
  const response = await fetch(new URL('/api/query', source), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: 'suggestions:list',
      args: {},
      format: 'json'
    }),
    signal: AbortSignal.timeout(15000)
  })
  const result = (await response.json()) as {
    status?: string
    value?: unknown
  }
  if (
    !response.ok ||
    result.status !== 'success' ||
    !Array.isArray(result.value)
  ) {
    throw new Error('Could not read the legacy suggestions query')
  }
  const rows: LegacySuggestion[] = result.value
  for (const row of rows) {
    if (
      typeof row._id !== 'string' ||
      !Number.isFinite(row._creationTime) ||
      typeof row.title !== 'string' ||
      typeof row.description !== 'string' ||
      !['pending', 'reviewed', 'implemented', 'rejected'].includes(
        row.status
      ) ||
      (row.authorName !== undefined && typeof row.authorName !== 'string') ||
      (row.authorEmail !== undefined && typeof row.authorEmail !== 'string')
    ) {
      throw new Error('Legacy suggestion has unexpected fields; import stopped')
    }
  }
  let inserted = 0
  await sql.begin(async (transaction) => {
    for (const row of rows) {
      const added = await transaction`
        INSERT INTO suggestions (title, description, status, author_name, author_email, created_at,
          legacy_convex_id, legacy_convex_created_at)
        VALUES (${row.title}, ${row.description}, ${row.status}, ${row.authorName ?? null},
          ${row.authorEmail ?? null}, to_timestamp(${row._creationTime}::double precision / 1000),
          ${row._id}, ${row._creationTime})
        ON CONFLICT (legacy_convex_id) DO NOTHING RETURNING id
      `
      inserted += added.length
      const [saved] = await transaction`
        SELECT title, description, status, author_name, author_email, created_at, legacy_convex_created_at
        FROM suggestions WHERE legacy_convex_id = ${row._id}
      `
      if (
        saved.title !== row.title ||
        saved.description !== row.description ||
        saved.status !== row.status ||
        saved.author_name !== (row.authorName ?? null) ||
        saved.author_email !== (row.authorEmail ?? null) ||
        saved.legacy_convex_created_at !== row._creationTime ||
        Math.abs(new Date(saved.created_at).getTime() - row._creationTime) > 1
      ) {
        throw new Error(
          'Existing imported data differs from Convex; transaction rolled back'
        )
      }
    }
  })
  console.log(
    `Verified ${rows.length} legacy suggestions; inserted ${inserted}. Source was unchanged.`
  )
} finally {
  await sql.end({ timeout: 1 })
}
