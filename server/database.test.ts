// Runs only against an explicitly supplied disposable CI PostgreSQL service.
import assert from 'node:assert/strict'
import { afterAll, beforeAll, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { stallHealthQueries } from '../deploy/postgres-proxy'

if (!process.env.TEST_DATABASE_URL)
  throw new Error('TEST_DATABASE_URL must point to disposable PostgreSQL')
const admin = postgres(process.env.TEST_DATABASE_URL, {
  max: 1,
  onnotice: () => {}
})
const name = 'suggestions_ci_' + randomUUID().replaceAll('-', '').slice(0, 10)
const ownerName = name + '_owner'
const runtimeName = name + '_runtime'
const otherName = name + '_other'
const clients: ReturnType<typeof postgres>[] = []
const created: string[] = []
let proxy: Awaited<ReturnType<typeof stallHealthQueries>> | undefined

function client(user: string, database = name) {
  const url = new URL(process.env.TEST_DATABASE_URL!)
  url.username = user
  url.password = ''
  url.pathname = '/' + database
  const sql = postgres(url.toString(), { max: 1, onnotice: () => {} })
  clients.push(sql)
  return sql
}

async function denied(operation: PromiseLike<unknown>) {
  await assert.rejects(Promise.resolve(operation), (error: unknown) => {
    return (error as { code?: string }).code === '42501'
  })
}

async function within<T>(operation: PromiseLike<T>, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 1500)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

let owner: ReturnType<typeof postgres>
let runtime: ReturnType<typeof postgres>
let ownerUrl: URL
let applicationSql: ReturnType<typeof postgres>
let health: () => Promise<Response>
const originalEnv = Object.fromEntries(
  [
    'DATABASE_URL',
    'SUGGESTIONS_REVISION',
    'CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY'
  ].map((key) => [key, process.env[key]])
)

beforeAll(async () => {
  for (const role of [ownerName, runtimeName]) {
    await admin.unsafe(
      `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`
    )
    created.push(role)
  }
  for (const database of [name, otherName]) {
    await admin.unsafe(`CREATE DATABASE "${database}" OWNER "${ownerName}"`)
    created.push(database)
    await admin.unsafe(`REVOKE ALL ON DATABASE "${database}" FROM PUBLIC`)
  }
  await admin.unsafe(`GRANT CONNECT ON DATABASE "${name}" TO "${runtimeName}"`)
  owner = client(ownerName)
  await owner.unsafe(`
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO "${runtimeName}";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${runtimeName}";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${runtimeName}";
  `)
  ownerUrl = new URL(process.env.TEST_DATABASE_URL!)
  ownerUrl.username = ownerName
  ownerUrl.password = ''
  ownerUrl.pathname = '/' + name
  // Create the fixture through the real migration entrypoint. The test reruns it.
  const migration = Bun.spawn(
    ['bun', new URL('../server/migrate.ts', import.meta.url).pathname],
    {
      env: { ...process.env, DATABASE_URL: ownerUrl.toString() },
      stdout: 'ignore',
      stderr: 'inherit'
    }
  )
  assert.equal(await migration.exited, 0, 'Migration failed')
  runtime = client(runtimeName)
  const applicationUrl = new URL(process.env.TEST_DATABASE_URL!)
  applicationUrl.username = runtimeName
  applicationUrl.password = ''
  applicationUrl.pathname = '/' + name
  proxy = await stallHealthQueries(
    applicationUrl.toString(),
    /^SELECT id FROM suggestions LIMIT 0$/i
  )
  proxy.allowNewConnections()
  process.env.DATABASE_URL = proxy.url
  process.env.SUGGESTIONS_REVISION = 'health-probe-test'
  process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_ZXhhbXBsZS5jb20k'
  process.env.CLERK_SECRET_KEY = 'sk_test_fixture'
  const { sql } = await import('../src/server/db')
  applicationSql = sql
  clients.push(applicationSql)
  const { default: application } = await import('./index')
  health = () => application.fetch(new Request('http://localhost/healthz'))
})

afterAll(async () => {
  await proxy?.close()
  await Promise.all(clients.map((sql) => sql.end({ timeout: 1 })))
  for (const database of [otherName, name]) {
    if (created.includes(database))
      await admin.unsafe(`DROP DATABASE "${database}" WITH (FORCE)`)
  }
  for (const role of [runtimeName, ownerName]) {
    if (created.includes(role)) await admin.unsafe(`DROP ROLE "${role}"`)
  }
  await admin.end({ timeout: 1 })
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('owner migrations are repeatable and preserve their journal', async () => {
  const migration = Bun.spawn(
    ['bun', new URL('./migrate.ts', import.meta.url).pathname],
    {
      env: { ...process.env, DATABASE_URL: ownerUrl.toString() },
      stdout: 'ignore',
      stderr: 'inherit'
    }
  )
  assert.equal(await migration.exited, 0, 'Migration failed')
  const [journal] =
    await owner`SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`
  assert.equal(journal.applied, 1)
})

test('restricted runtime supports CRUD while DDL, journals and other databases are denied', async () => {
  const [row] = await runtime`
    INSERT INTO suggestions(title, description) VALUES ('CI check', 'Disposable test')
    RETURNING id, status
  `
  assert.equal(row.status, 'pending')
  await runtime`UPDATE suggestions SET status = 'reviewed' WHERE id = ${row.id}`
  const [updated] =
    await runtime`SELECT status FROM suggestions WHERE id = ${row.id}`
  assert.equal(updated.status, 'reviewed')
  await runtime`DELETE FROM suggestions WHERE id = ${row.id}`
  assert.equal((await runtime`SELECT id FROM suggestions`).length, 0)
  await denied(runtime.unsafe('CREATE TABLE public.forbidden(id int)'))
  await denied(runtime.unsafe('CREATE SCHEMA forbidden'))
  await denied(runtime.unsafe('CREATE ROLE forbidden'))
  await denied(runtime`SELECT hash FROM drizzle.__drizzle_migrations`)
  const foreign = client(runtimeName, otherName)
  await denied(foreign`SELECT 1`)
})

test('API inputs, public submissions and admin permissions are enforced', async () => {
  // API procedures run on the application pool as the restricted runtime role.
  const { appRouter } = await import('../src/server/trpc')
  const caller = (userId: string | null) =>
    appRouter.createCaller({
      userId,
      isAdmin: async (id) => id === 'admin'
    })
  async function rejectsWith(operation: Promise<unknown>, code: string) {
    await assert.rejects(operation, (error: unknown) => {
      return (error as { code?: string }).code === code
    })
  }
  assert.deepEqual(await caller(null).me(), { isAdmin: false })
  assert.deepEqual(await caller('someone').me(), { isAdmin: false })
  assert.deepEqual(await caller('admin').me(), { isAdmin: true })
  for (const userId of [null, 'someone']) {
    const code = userId ? 'FORBIDDEN' : 'UNAUTHORIZED'
    await rejectsWith(caller(userId).suggestions.list({}), code)
    await rejectsWith(caller(userId).suggestions.stats(), code)
  }
  const visitor = caller(null).suggestions
  const { id: first } = await visitor.create({
    title: '  Trimmed  ',
    description: ' Body ',
    authorName: ' ',
    authorEmail: ''
  })
  const { id: second } = await visitor.create({
    title: 'Signed',
    description: 'With author',
    authorName: 'Cy',
    authorEmail: 'cy@example.com'
  })
  await rejectsWith(
    visitor.create({ title: ' ', description: 'x' }),
    'BAD_REQUEST'
  )
  await rejectsWith(
    caller(null).suggestions.updateStatus({ id: first, status: 'reviewed' }),
    'UNAUTHORIZED'
  )
  const adminApi = caller('admin').suggestions
  await rejectsWith(
    // @ts-expect-error: statuses outside the enum are rejected at runtime too.
    adminApi.updateStatus({ id: first, status: 'bogus' }),
    'BAD_REQUEST'
  )
  await adminApi.updateStatus({ id: first, status: 'reviewed' })
  const listed = await adminApi.list({})
  assert.deepEqual(
    listed.map(
      ({ id, title, description, status, authorName, authorEmail }) => ({
        id,
        title,
        description,
        status,
        authorName,
        authorEmail
      })
    ),
    [
      {
        id: second,
        title: 'Signed',
        description: 'With author',
        status: 'pending',
        authorName: 'Cy',
        authorEmail: 'cy@example.com'
      },
      {
        id: first,
        title: 'Trimmed',
        description: 'Body',
        status: 'reviewed',
        authorName: null,
        authorEmail: null
      }
    ]
  )
  assert.deepEqual(
    (await adminApi.list({ status: 'reviewed' })).map(({ id }) => id),
    [first]
  )
  assert.deepEqual(await adminApi.stats(), {
    all: 2,
    pending: 1,
    reviewed: 1,
    implemented: 0,
    rejected: 0
  })
  await runtime`DELETE FROM suggestions`
})

test('health deadlines cancel SQL, preserve the application pool and recover from stalled sockets', async () => {
  const healthProxy = proxy
  assert.ok(healthProxy)
  const healthy = await health()
  assert.equal(healthy.status, 200)
  assert.deepEqual(await healthy.json(), {
    ok: true,
    revision: 'health-probe-test'
  })

  await owner`BEGIN`
  try {
    await owner`LOCK TABLE suggestions IN ACCESS EXCLUSIVE MODE`
    // Repeated bursts exceed the pool size and must not leave work behind.
    for (let wave = 0; wave < 2; wave++) {
      const responses = await Promise.all(Array.from({ length: 8 }, health))
      for (const response of responses) {
        assert.equal(response.status, 503)
        assert.equal(response.headers.get('Cache-Control'), 'no-store')
        assert.equal(
          response.headers.get('X-Suggestions-Revision'),
          'health-probe-test'
        )
        assert.deepEqual(await response.json(), { ok: false })
      }
      // The table stays locked: unrelated application work must still get a slot.
      const [available] = await within(
        applicationSql`SELECT 1 AS available`,
        'Timed-out health probes exhausted the application database pool'
      )
      assert.equal(available.available, 1)
      await within(
        (async () => {
          for (;;) {
            const [activity] = await admin`
              SELECT count(*)::int AS active FROM pg_stat_activity
              WHERE datname = ${name} AND usename = ${runtimeName} AND state = 'active'
            `
            if (activity.active === 0) return
            await Bun.sleep(25)
          }
        })(),
        'The health SQL kept running after its deadline'
      )
    }
  } finally {
    await owner`ROLLBACK`
  }
  assert.equal((await health()).status, 200)
  try {
    healthProxy.stall()
    const responses = await Promise.all(Array.from({ length: 8 }, health))
    for (const response of responses) {
      assert.equal(response.status, 503)
      assert.deepEqual(await response.json(), { ok: false })
    }
    healthProxy.allowNewConnections()
    assert.equal((await health()).status, 200)
    await within(
      (async () => {
        while (healthProxy.stalledConnections) await Bun.sleep(10)
      })(),
      'The timed-out health connection was not retired'
    )
  } finally {
    healthProxy.allowNewConnections()
  }
}, 20000)
