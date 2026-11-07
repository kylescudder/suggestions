// Runs only against an explicitly supplied disposable CI PostgreSQL service.
import assert from 'node:assert/strict'
import { afterAll, beforeAll, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import sharp from 'sharp'
import { stallHealthQueries } from '../deploy/postgres-proxy'
import { virtualAuthenticator } from './webauthn-fixture'

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
let application: { fetch(request: Request): Promise<Response> }
let preservedAnonymousSuggestion: { before: unknown; after: unknown }
const authOrigin = 'https://suggestions.auth.test'
const originalEnv = Object.fromEntries(
  [
    'DATABASE_URL',
    'SUGGESTIONS_REVISION',
    'CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
    'AUTH_PROVIDER',
    'BETTER_AUTH_URL',
    'BETTER_AUTH_SECRET',
    'BREVO_API_KEY',
    'AUTH_EMAIL_FROM',
    'ADMIN_EMAILS'
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
  // Simulate the existing production schema and anonymous data before adding
  // auth tables. The baseline explicitly supports this adoption path.
  await owner.unsafe(
    await Bun.file(
      new URL('../drizzle/0000_baseline.sql', import.meta.url)
    ).text()
  )
  const [anonymous] = await owner`
    INSERT INTO suggestions(title, description, status, legacy_convex_id, legacy_convex_created_at)
    VALUES ('Existing anonymous idea', 'Keep this content and identity unchanged', 'reviewed', 'pre-auth-fixture', 1740000000123.456)
    RETURNING id
  `
  const [beforeAuth] =
    await owner`SELECT row_to_json(s) AS snapshot FROM suggestions s WHERE id = ${anonymous.id}`
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
  const [afterAuth] =
    await owner`SELECT row_to_json(s) AS snapshot FROM suggestions s WHERE id = ${anonymous.id}`
  preservedAnonymousSuggestion = {
    before: beforeAuth.snapshot,
    after: afterAuth.snapshot
  }
  await owner`DELETE FROM suggestions WHERE id = ${anonymous.id}`
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
  process.env.AUTH_PROVIDER = 'better-auth'
  process.env.BETTER_AUTH_URL = authOrigin
  process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID()
  process.env.BREVO_API_KEY = 'fixture-never-used-to-send'
  process.env.AUTH_EMAIL_FROM = 'suggestions@example.com'
  process.env.ADMIN_EMAILS = 'admin@example.com,second@example.com'
  const { sql } = await import('../src/server/db')
  applicationSql = sql
  clients.push(applicationSql)
  application = (await import('./index')).default
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
  assert.equal(journal.applied, 3)
})

test('adding authentication preserves existing anonymous suggestions and legacy fields', () => {
  assert.deepEqual(
    preservedAnonymousSuggestion.after,
    preservedAnonymousSuggestion.before
  )
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

test('application pool reuses connections, retires idle backends and reconnects', async () => {
  const [first] = await applicationSql`SELECT pg_backend_pid() AS pid`
  const [reused] = await applicationSql`SELECT pg_backend_pid() AS pid`
  assert.equal(reused.pid, first.pid)

  // Observe PostgreSQL without issuing app queries that reset its idle timer.
  const deadline = Date.now() + 25000
  let connected = true
  while (connected && Date.now() < deadline) {
    const [activity] = await admin`
      SELECT count(*)::int AS connections FROM pg_stat_activity
      WHERE datname = ${name} AND usename = ${runtimeName} AND pid = ${first.pid}
    `
    connected = activity.connections > 0
    if (connected) await Bun.sleep(250)
  }
  assert.equal(connected, false, 'Idle application connection was not retired')

  const [reconnected] = await applicationSql`SELECT pg_backend_pid() AS pid`
  assert.notEqual(reconnected.pid, first.pid)
}, 30000)

let fixtureNumber = 0
async function authFixture(dailyEmailLimit = 40, failMail = false) {
  await owner`DELETE FROM auth_user`
  await owner`DELETE FROM auth_verification`
  await owner`DELETE FROM auth_rate_limit`
  await owner`DELETE FROM auth_email_limit`
  const { db } = await import('../src/server/db')
  const { createSuggestionsAuth } = await import('../src/server/auth-factory')
  const sent = new Map<string, string>()
  const links: { email: string; kind: string; url: string }[] = []
  const settings = {
    baseURL: authOrigin,
    secret: process.env.BETTER_AUTH_SECRET!,
    adminEmails: ['admin@example.com', 'second@example.com'],
    dailyEmailLimit
  }
  const auth = createSuggestionsAuth(
    db,
    settings,
    async (email, otp) => {
      if (failMail) throw new Error('Simulated mail outage')
      sent.set(email, otp)
    },
    async (email, kind, url) => {
      if (failMail) throw new Error('Simulated mail outage')
      links.push({ email, kind, url })
    }
  )
  const ip = `203.0.113.${++fixtureNumber}`
  function request(
    path: string,
    body?: unknown,
    cookie = '',
    extra: Record<string, string> = {}
  ) {
    return auth.handler(
      new Request(authOrigin + '/api/auth' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Origin: authOrigin,
          'Content-Type': 'application/json',
          'CF-Connecting-IP': ip,
          Cookie: cookie,
          ...extra
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    )
  }
  return { auth, request, sent, links, settings, db }
}

function mergeCookies(response: Response, prior = '') {
  const values = new Map(
    prior
      .split('; ')
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        return [part.slice(0, index), part.slice(index + 1)]
      })
  )
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(';')[0]
    const index = pair.indexOf('=')
    values.set(pair.slice(0, index), pair.slice(index + 1))
  }
  return [...values].map(([key, value]) => key + '=' + value).join('; ')
}

async function signInFixture(
  fixture: Awaited<ReturnType<typeof authFixture>>,
  email = 'admin@example.com'
) {
  const sent = await fixture.request('/email-otp/send-verification-otp', {
    email,
    type: 'sign-in'
  })
  assert.equal(sent.status, 200, await sent.clone().text())
  const response = await fixture.request('/sign-in/email-otp', {
    email,
    otp: fixture.sent.get(email)
  })
  assert.equal(response.status, 200, await response.clone().text())
  return {
    response,
    cookie: mergeCookies(response),
    user: (await response.clone().json()).user as {
      id: string
      email: string
      emailVerified: boolean
    }
  }
}

test('email-code sign-in is allowlisted, hashed, single-use, and authorizes the real admin API', async () => {
  const fixture = await authFixture()
  const outsider = await fixture.request('/email-otp/send-verification-otp', {
    email: 'outsider@example.com',
    type: 'sign-in'
  })
  assert.equal(outsider.status, 200)
  assert.deepEqual(await outsider.json(), { success: true })
  assert.equal(fixture.sent.size, 0)
  assert.equal((await owner`SELECT id FROM auth_verification`).length, 0)
  const sent = await fixture.request('/email-otp/send-verification-otp', {
    email: 'ADMIN@example.com',
    type: 'sign-in'
  })
  assert.equal(sent.status, 200)
  const otp = fixture.sent.get('admin@example.com')!
  assert.match(otp, /^\d{6}$/)
  const [stored] = await owner`SELECT value FROM auth_verification`
  assert.match(stored.value, /^[a-f0-9]{64}:0$/)
  assert.notEqual(stored.value.split(':')[0], otp, 'Raw OTP was persisted')
  const wrong = otp === '000000' ? '111111' : '000000'
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'admin@example.com',
        otp: wrong
      })
    ).status,
    400
  )
  const signedIn = await fixture.request('/sign-in/email-otp', {
    email: 'admin@example.com',
    otp
  })
  assert.equal(signedIn.status, 200, await signedIn.clone().text())
  assert.equal((await signedIn.clone().json()).user.emailVerified, true)
  const cookies = signedIn.headers.getSetCookie().join(';')
  assert.match(cookies, /HttpOnly/i)
  assert.match(cookies, /Secure/i)
  assert.match(cookies, /SameSite=Lax/i)
  assert.ok(
    !/Domain=/i.test(cookies),
    'Session cookie escaped the app hostname'
  )
  const cookie = mergeCookies(signedIn)
  const me = await application.fetch(
    new Request(authOrigin + '/api/trpc/me', { headers: { Cookie: cookie } })
  )
  assert.equal(me.status, 200)
  assert.equal((await me.json()).result.data.isAdmin, true)
  const [idea] =
    await owner`INSERT INTO suggestions(title, description) VALUES ('Admin mutation', 'Disposable') RETURNING id`
  const update = (origin: string) =>
    application.fetch(
      new Request(authOrigin + '/api/trpc/suggestions.updateStatus', {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Origin: origin,
          'Sec-Fetch-Site': 'same-site',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: idea.id, status: 'reviewed' })
      })
    )
  assert.equal((await update('https://sibling.auth.test')).status, 403)
  assert.equal((await update(authOrigin)).status, 200)
  const [updated] =
    await owner`SELECT status FROM suggestions WHERE id = ${idea.id}`
  assert.equal(updated.status, 'reviewed')
  await owner`DELETE FROM suggestions WHERE id = ${idea.id}`
  assert.equal(
    (
      await application.fetch(
        new Request(authOrigin + '/api/trpc/suggestions.list?input=%7B%7D', {
          headers: { Cookie: cookie }
        })
      )
    ).status,
    200
  )
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'admin@example.com',
        otp
      })
    ).status,
    400
  )
  assert.equal((await fixture.request('/sign-out', {}, cookie)).status, 200)
  assert.equal(
    await (await fixture.request('/get-session', undefined, cookie)).json(),
    null
  )
})

test('native profile updates persist for the verified owner without changing identity or permissions', async () => {
  const fixture = await authFixture()
  const { cookie, user } = await signInFixture(fixture)
  const other = await signInFixture(fixture, 'second@example.com')
  const { createProfileHandler } = await import('../src/server/profile-handler')
  const handler = createProfileHandler(fixture.db, {
    origin: authOrigin,
    adminEmails: fixture.settings.adminEmails,
    getSession: (headers) => fixture.auth.api.getSession({ headers })
  })
  const read = (session = cookie) =>
    handler(
      new Request(authOrigin + '/api/profile', { headers: { Cookie: session } })
    )
  const update = (
    body: unknown,
    extra: Record<string, string> = {},
    session = cookie
  ) => fixture.request('/update-user', body, session, extra)
  assert.equal((await update({ name: 'New' }, {}, '')).status, 401)
  const details = {
    name: '  Display Name  ',
    givenName: 'Given',
    familyName: 'Family'
  }
  assert.equal(
    (await update(details, { Origin: 'https://sibling.auth.test' })).status,
    403
  )
  assert.equal((await update(details, { Origin: '' })).status, 403)
  for (const field of [
    { email: 'attacker@example.com' },
    { emailVerified: true },
    { userId: other.user.id },
    { role: 'admin' },
    { image: 'https://example.com/track' }
  ])
    assert.equal((await update({ ...details, ...field })).status, 400)
  assert.equal((await update({ ...details, name: '' })).status, 400)
  assert.equal(
    (await update({ ...details, name: 'x'.repeat(121) })).status,
    400
  )
  assert.equal((await update(details)).status, 200)
  const saved = await read()
  assert.equal(saved.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await saved.json(), {
    name: 'Display Name',
    givenName: 'Given',
    familyName: 'Family',
    email: user.email,
    emailVerified: true,
    image: null
  })
  const [stored] =
    await owner`SELECT name,email,email_verified,given_name,family_name FROM auth_user WHERE id=${user.id}`
  assert.equal(stored.name, 'Display Name')
  assert.equal(stored.email, user.email)
  assert.equal(stored.email_verified, true)
  const different = await (await read(other.cookie)).json()
  assert.equal(different.email, other.user.email)
  assert.equal(different.givenName, '')
  assert.equal((await update({ givenName: null })).status, 200)
  assert.equal((await (await read()).json()).givenName, '')
  assert.equal((await (await read()).json()).familyName, 'Family')
  const routed = await application.fetch(
    new Request(authOrigin + '/api/auth/update-user', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        Origin: authOrigin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Routed Name' })
    })
  )
  assert.equal(routed.status, 200, await routed.clone().text())
  const session = await fixture.auth.api.getSession({
    headers: new Headers({ Cookie: cookie })
  })
  assert.equal(
    (session!.user as typeof user & { name: string }).name,
    'Routed Name'
  )
  const profileSessionUser = session!.user as typeof user & {
    givenName: string
    familyName: string
  }
  assert.equal(profileSessionUser.givenName, '')
  assert.equal(profileSessionUser.familyName, 'Family')
  await owner`UPDATE auth_user SET email_verified=false WHERE id=${user.id}`
  assert.equal((await read()).status, 403)
  assert.equal((await update({ name: 'No' })).status, 401)
  await owner`UPDATE auth_user SET email_verified=true,email='removed@example.com' WHERE id=${user.id}`
  assert.equal((await read()).status, 403)
  assert.equal((await update({ name: 'No' })).status, 401)
})

test('profile photos are bounded, re-encoded, private to their owner and removable', async () => {
  const fixture = await authFixture()
  const { cookie, user } = await signInFixture(fixture)
  const other = await signInFixture(fixture, 'second@example.com')
  const { createProfileHandler } = await import('../src/server/profile-handler')
  const handler = createProfileHandler(fixture.db, {
    origin: authOrigin,
    adminEmails: fixture.settings.adminEmails,
    getSession: (headers) => fixture.auth.api.getSession({ headers })
  })
  const image = await sharp({
    create: { width: 64, height: 32, channels: 3, background: '#8844ff' }
  })
    .png()
    .withMetadata({ exif: { IFD0: { Artist: 'Test metadata to strip' } } })
    .toBuffer()
  const request = (
    method = 'GET',
    body?: BodyInit,
    type = 'image/png',
    session = cookie,
    extra: Record<string, string> = {}
  ) =>
    handler(
      new Request(authOrigin + '/api/profile/avatar', {
        method,
        body,
        headers: {
          Origin: authOrigin,
          Cookie: session,
          'Content-Type': type,
          ...extra
        }
      })
    )
  assert.equal(
    (await request('PUT', new Uint8Array(image), 'image/png', '')).status,
    401
  )
  assert.equal(
    (
      await request('PUT', new Uint8Array(image), 'image/png', cookie, {
        Origin: 'https://sibling.auth.test'
      })
    ).status,
    403
  )
  assert.equal(
    (await request('PUT', '<svg onload="alert(1)"/>', 'image/svg+xml')).status,
    415
  )
  assert.equal(
    (await request('PUT', '<svg onload="alert(1)"/>', 'image/png')).status,
    400
  )
  assert.equal(
    (await request('PUT', new Uint8Array(2 * 1024 * 1024 + 1))).status,
    413
  )
  const first = await request('PUT', new Uint8Array(image))
  assert.equal(first.status, 200, await first.clone().text())
  const initial = await first.json()
  assert.match(initial.image, /^\/api\/profile\/avatar\?v=/)
  assert.equal(
    (await fixture.request('/update-user', { image: initial.image }, cookie))
      .status,
    200
  )
  assert.equal(
    (
      await fixture.request(
        '/update-user',
        { image: initial.image },
        other.cookie
      )
    ).status,
    400
  )
  assert.equal(
    (await fixture.request('/update-user', { image: null }, cookie)).status,
    400
  )
  const picture = await request()
  assert.equal(picture.status, 200)
  assert.equal(picture.headers.get('Content-Type'), 'image/jpeg')
  assert.equal(picture.headers.get('Cache-Control'), 'no-store')
  assert.equal(
    picture.headers.get('Cross-Origin-Resource-Policy'),
    'same-origin'
  )
  const metadata = await sharp(
    Buffer.from(await picture.arrayBuffer())
  ).metadata()
  assert.equal(metadata.format, 'jpeg')
  assert.equal(metadata.width, 256)
  assert.equal(metadata.height, 256)
  assert.equal(metadata.exif, undefined)
  assert.equal(
    (await request('GET', undefined, 'image/png', other.cookie)).status,
    404
  )
  const next = await (await request('PUT', new Uint8Array(image))).json()
  assert.notEqual(next.image, initial.image)
  const [stored] = await owner`SELECT image FROM auth_user WHERE id=${user.id}`
  assert.equal(stored.image, next.image)
  const routed = await application.fetch(
    new Request(authOrigin + '/api/profile/avatar', {
      method: 'PUT',
      headers: {
        Origin: authOrigin,
        Cookie: cookie,
        'Content-Type': 'image/png'
      },
      body: new Uint8Array(image)
    })
  )
  assert.equal(routed.status, 200, await routed.clone().text())
  assert.equal((await request('DELETE')).status, 200)
  assert.equal(
    (await fixture.request('/update-user', { image: null }, cookie)).status,
    200
  )
  assert.equal((await request()).status, 404)
  const [removed] = await owner`SELECT image FROM auth_user WHERE id=${user.id}`
  assert.equal(removed.image, null)
  // The real application routes use the same protected handler.
  assert.equal(
    (await application.fetch(new Request(authOrigin + '/api/profile'))).status,
    401
  )
  assert.equal(
    (await application.fetch(new Request(authOrigin + '/api/profile/avatar')))
      .status,
    401
  )
  assert.equal(
    (await application.fetch(new Request(authOrigin + '/profile'))).status,
    200
  )
})

test('OTP expiry, attempt limits and cross-site protections reject invalid access', async () => {
  const fixture = await authFixture()
  const crossSite = await fixture.request(
    '/email-otp/send-verification-otp',
    { email: 'admin@example.com', type: 'sign-in' },
    '',
    { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }
  )
  assert.equal(crossSite.status, 403)
  assert.equal(fixture.sent.size, 0)
  assert.equal((await owner`SELECT key FROM auth_email_limit`).length, 0)
  await fixture.request('/email-otp/send-verification-otp', {
    email: 'admin@example.com',
    type: 'sign-in'
  })
  const otp = fixture.sent.get('admin@example.com')!
  const wrong = otp === '000000' ? '111111' : '000000'
  for (let attempt = 0; attempt < 5; attempt++)
    assert.equal(
      (
        await fixture.request('/sign-in/email-otp', {
          email: 'admin@example.com',
          otp: wrong
        })
      ).status,
      400
    )
  const exhausted = await fixture.request('/sign-in/email-otp', {
    email: 'admin@example.com',
    otp
  })
  assert.equal(exhausted.status, 403)
  assert.equal((await exhausted.json()).code, 'TOO_MANY_ATTEMPTS')
  assert.equal(
    (
      await fixture.request('/email-otp/send-verification-otp', {
        email: 'second@example.com',
        type: 'sign-in'
      })
    ).status,
    200
  )
  await owner`UPDATE auth_verification SET expires_at = now() - interval '1 second'`
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'second@example.com',
        otp: fixture.sent.get('second@example.com')
      })
    ).status,
    400
  )
  assert.equal((await owner`SELECT id FROM auth_user`).length, 0)
})

test('concurrent resends preserve the usable code and cannot exceed the app email budget', async () => {
  const fixture = await authFixture(1)
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      fixture.request('/email-otp/send-verification-otp', {
        email: 'admin@example.com',
        type: 'sign-in'
      })
    )
  )
  assert.equal(
    responses.filter((response) => response.status === 200).length,
    1
  )
  assert.equal(
    responses.filter((response) => response.status === 429).length,
    3
  )
  assert.equal(fixture.sent.size, 1)
  const [global] =
    await owner`SELECT count FROM auth_email_limit WHERE key = 'global:day'`
  assert.equal(global.count, 1)
  // A different recipient still shares the same app-wide budget.
  assert.equal(
    (
      await fixture.request('/email-otp/send-verification-otp', {
        email: 'second@example.com',
        type: 'sign-in'
      })
    ).status,
    429
  )
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'admin@example.com',
        otp: fixture.sent.get('admin@example.com')
      })
    ).status,
    200
  )
})

test('rate limits persist across independent auth instances', async () => {
  const fixture = await authFixture()
  const extra = { 'CF-Connecting-IP': '203.0.113.200' }
  for (let index = 0; index < 3; index++)
    assert.equal(
      (
        await fixture.request(
          '/email-otp/send-verification-otp',
          { email: 'outsider@example.com', type: 'sign-in' },
          '',
          extra
        )
      ).status,
      200
    )
  const { createSuggestionsAuth } = await import('../src/server/auth-factory')
  const restarted = createSuggestionsAuth(
    fixture.db,
    fixture.settings,
    async () => {
      throw new Error('Must not send')
    }
  )
  const response = await restarted.handler(
    new Request(authOrigin + '/api/auth/email-otp/send-verification-otp', {
      method: 'POST',
      headers: {
        Origin: authOrigin,
        'Content-Type': 'application/json',
        ...extra
      },
      body: JSON.stringify({ email: 'outsider@example.com', type: 'sign-in' })
    })
  )
  assert.equal(response.status, 429)
  assert.ok((await owner`SELECT id FROM auth_rate_limit`).length > 0)
})

test('a permitted resend rotates the code and cannot revive older verification records', async () => {
  const fixture = await authFixture()
  const send = () =>
    fixture.request('/email-otp/send-verification-otp', {
      email: 'admin@example.com',
      type: 'sign-in'
    })
  assert.equal((await send()).status, 200)
  const old = fixture.sent.get('admin@example.com')!
  await owner`UPDATE auth_email_limit SET window_started_at = now() - interval '61 seconds' WHERE key LIKE '%:minute'`
  assert.equal((await send()).status, 200)
  const fresh = fixture.sent.get('admin@example.com')!
  if (old !== fresh)
    assert.equal(
      (
        await fixture.request('/sign-in/email-otp', {
          email: 'admin@example.com',
          otp: old
        })
      ).status,
      400
    )
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'admin@example.com',
        otp: fresh
      })
    ).status,
    200
  )
  assert.equal(
    (
      await fixture.request('/sign-in/email-otp', {
        email: 'admin@example.com',
        otp: old
      })
    ).status,
    400
  )
  assert.equal((await owner`SELECT id FROM auth_verification`).length, 0)
})

test('unverified or removed admin emails cannot access data or enroll passkeys', async () => {
  const fixture = await authFixture()
  const { cookie, user } = await signInFixture(fixture)
  await owner`UPDATE auth_user SET email_verified = false WHERE id = ${user.id}`
  const me = await application.fetch(
    new Request(authOrigin + '/api/trpc/me', { headers: { Cookie: cookie } })
  )
  assert.equal((await me.json()).result.data.isAdmin, false)
  assert.equal(
    (
      await application.fetch(
        new Request(authOrigin + '/api/trpc/suggestions.stats', {
          headers: { Cookie: cookie }
        })
      )
    ).status,
    403
  )
  assert.equal(
    (
      await fixture.request(
        '/passkey/generate-register-options',
        undefined,
        cookie
      )
    ).status,
    401
  )
  await owner`UPDATE auth_user SET email_verified = true, email = 'outsider@example.com' WHERE id = ${user.id}`
  assert.equal(
    (
      await fixture.request(
        '/passkey/generate-register-options',
        undefined,
        cookie
      )
    ).status,
    401
  )
  assert.equal(
    (await fixture.request('/passkey/generate-register-options')).status,
    401
  )
})

test('passkeys enroll after verified sign-in and enforce RP, origin, verification and challenge replay', async () => {
  const fixture = await authFixture()
  const { cookie, user } = await signInFixture(fixture)
  const authenticator = virtualAuthenticator(authOrigin)
  const registration = await fixture.request(
    '/passkey/generate-register-options',
    undefined,
    cookie
  )
  assert.equal(registration.status, 200, await registration.clone().text())
  const options = await registration.json()
  assert.equal(options.rp.id, new URL(authOrigin).hostname)
  assert.equal(options.authenticatorSelection.userVerification, 'required')
  const registered = await fixture.request(
    '/passkey/verify-registration',
    {
      response: authenticator.registration(options.challenge),
      name: 'Disposable authenticator'
    },
    mergeCookies(registration, cookie)
  )
  assert.equal(registered.status, 200, await registered.clone().text())
  const [passkey] =
    await owner`SELECT id, user_id FROM auth_passkey WHERE credential_id = ${authenticator.id}`
  assert.equal(passkey.user_id, user.id)
  await fixture.request('/sign-out', {}, cookie)
  const challenge = await fixture.request(
    '/passkey/generate-authenticate-options'
  )
  const challengeData = await challenge.json()
  const assertion = authenticator.assertion(challengeData.challenge, user.id)
  const signedIn = await fixture.request(
    '/passkey/verify-authentication',
    { response: assertion },
    mergeCookies(challenge)
  )
  assert.equal(signedIn.status, 200, await signedIn.clone().text())
  assert.equal((await signedIn.clone().json()).user.id, user.id)
  assert.ok(mergeCookies(signedIn).includes('session_token='))
  assert.equal(
    (
      await fixture.request(
        '/passkey/verify-authentication',
        { response: assertion },
        mergeCookies(challenge)
      )
    ).status,
    400
  )
  for (const invalid of [
    { origin: 'https://evil.example' },
    { hostname: 'evil.example' },
    { verified: false }
  ]) {
    const next = await fixture.request('/passkey/generate-authenticate-options')
    const data = await next.json()
    const rejected = await fixture.request(
      '/passkey/verify-authentication',
      {
        response: authenticator.assertion(data.challenge, user.id, {
          ...invalid,
          counter: 2
        })
      },
      mergeCookies(next)
    )
    assert.ok(rejected.status >= 400, 'Invalid WebAuthn assertion was accepted')
  }
  const signedCookie = mergeCookies(signedIn)
  assert.equal(
    (
      await fixture.request(
        '/passkey/delete-passkey',
        { id: passkey.id },
        signedCookie
      )
    ).status,
    200
  )
  assert.equal((await owner`SELECT id FROM auth_passkey`).length, 0)
})

test('mail failure does not block anonymous submissions; unused auth surfaces stay disabled', async () => {
  const fixture = await authFixture(40, true)
  // Better Auth deliberately keeps the send response generic even if the
  // delivery callback fails. This must not affect public submissions.
  assert.equal(
    (
      await fixture.request('/email-otp/send-verification-otp', {
        email: 'admin@example.com',
        type: 'sign-in'
      })
    ).status,
    200
  )
  const page = await application.fetch(new Request(authOrigin + '/'))
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Magical Ideas/)
  const response = await application.fetch(
    new Request(authOrigin + '/api/trpc/suggestions.create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'suggestions-auth.session_token=invalid'
      },
      body: JSON.stringify({
        title: 'Mail outage',
        description: 'Public submissions remain available'
      })
    })
  )
  assert.equal(response.status, 200, await response.clone().text())
  const id = (await response.json()).result.data.id
  const [stored] = await owner`SELECT title FROM suggestions WHERE id = ${id}`
  assert.equal(stored.title, 'Mail outage')
  await owner`DELETE FROM suggestions WHERE id = ${id}`
  for (const path of ['/email-otp/get-verification-otp', '/sign-up/email'])
    assert.equal(
      (
        await application.fetch(
          new Request(authOrigin + '/api/auth' + path, {
            method: 'POST',
            headers: { Origin: authOrigin, 'Content-Type': 'application/json' },
            body: '{}'
          })
        )
      ).status,
      404
    )
  // The new sign-in methods are reachable through the app's auth route.
  for (const path of [
    '/sign-in/email',
    '/sign-in/magic-link',
    '/request-password-reset',
    '/reset-password',
    '/list-accounts'
  ])
    assert.notEqual(
      (
        await application.fetch(
          new Request(authOrigin + '/api/auth' + path, {
            method: path === '/list-accounts' ? 'GET' : 'POST',
            headers: { Origin: authOrigin, 'Content-Type': 'application/json' },
            body: path === '/list-accounts' ? undefined : '{}'
          })
        )
      ).status,
      404,
      path
    )
  assert.equal((await health()).status, 200)
})

test('password, reset links and magic links are allowlisted and sign-up stays closed', async () => {
  const fixture = await authFixture()
  const password = 'correct horse battery staple'
  // No public sign-up, even for an allowlisted address.
  const signUp = await fixture.request('/sign-up/email', {
    email: 'admin@example.com',
    password,
    name: 'Admin'
  })
  assert.equal(signUp.status, 400, await signUp.clone().text())
  const { user } = await signInFixture(fixture)
  // An account created by email code has no password until a reset link sets one.
  const noPassword = await fixture.request('/sign-in/email', {
    email: 'admin@example.com',
    password
  })
  assert.equal(noPassword.status, 401)
  // The sign-in code used this address's one-email-a-minute allowance.
  const tooSoon = await fixture.request('/request-password-reset', {
    email: 'admin@example.com',
    redirectTo: '/auth/reset-password'
  })
  assert.equal(tooSoon.status, 429)
  assert.equal(fixture.links.length, 0)
  await owner`DELETE FROM auth_email_limit`

  // Reset: generic answer for everyone, mail only for allowlisted admins.
  for (const email of ['stranger@example.com', 'ADMIN@example.com '])
    assert.equal(
      (
        await fixture.request('/request-password-reset', {
          email,
          redirectTo: '/auth/reset-password'
        })
      ).status,
      200
    )
  assert.deepEqual(
    fixture.links.map(({ email, kind }) => [email, kind]),
    [['admin@example.com', 'reset-password']]
  )
  const resetUrl = new URL(fixture.links[0].url)
  assert.equal(resetUrl.origin, authOrigin)
  const token = resetUrl.pathname.split('/').at(-1)!
  const tooShort = await fixture.request('/reset-password', {
    newPassword: 'short',
    token
  })
  assert.equal(tooShort.status, 400)
  const reset = await fixture.request('/reset-password', {
    newPassword: password,
    token
  })
  assert.equal(reset.status, 200, await reset.clone().text())
  assert.equal(
    (
      await fixture.request('/reset-password', {
        newPassword: password + '!',
        token
      })
    ).status,
    400,
    'Reset tokens are single-use'
  )
  const [credential] = await owner`
    SELECT password FROM auth_account
    WHERE user_id = ${user.id} AND provider_id = 'credential'`
  assert.ok(credential.password && !credential.password.includes(password))

  assert.equal(
    (
      await fixture.request('/sign-in/email', {
        email: 'admin@example.com',
        password: 'wrong password entirely'
      })
    ).status,
    401
  )
  const signedIn = await fixture.request('/sign-in/email', {
    email: 'admin@example.com',
    password
  })
  assert.equal(signedIn.status, 200, await signedIn.clone().text())
  const session = await fixture.request(
    '/get-session',
    undefined,
    mergeCookies(signedIn)
  )
  assert.equal((await session.json()).user.id, user.id)

  // Magic link: allowlisted only, same-origin callback, single use.
  fixture.links.length = 0
  assert.equal(
    (
      await fixture.request('/sign-in/magic-link', {
        email: 'stranger@example.com',
        callbackURL: '/?view=admin'
      })
    ).status,
    200
  )
  assert.equal(fixture.links.length, 0)
  for (const callbackURL of [
    'https://attacker.example/',
    '//attacker.example/',
    '/\t/attacker.example/',
    '/\\attacker.example/'
  ]) {
    // Stay under the per-IP magic-link limit; this checks the redirect guard.
    await owner`DELETE FROM auth_rate_limit`
    assert.equal(
      (
        await fixture.request('/sign-in/magic-link', {
          email: 'second@example.com',
          callbackURL
        })
      ).status,
      403,
      JSON.stringify(callbackURL)
    )
  }
  await owner`DELETE FROM auth_rate_limit`
  // Three reset requests above used this IP's per-minute allowance.
  await owner`DELETE FROM auth_rate_limit`
  assert.equal(
    (
      await fixture.request('/request-password-reset', {
        email: 'admin@example.com',
        redirectTo: 'https://attacker.example/reset'
      })
    ).status,
    403
  )
  assert.equal(fixture.links.length, 0)
  const requested = await fixture.request('/sign-in/magic-link', {
    email: 'second@example.com',
    callbackURL: authOrigin + '/?view=admin'
  })
  assert.equal(requested.status, 200, await requested.clone().text())
  assert.deepEqual(
    fixture.links.map(({ email, kind }) => [email, kind]),
    [['second@example.com', 'magic-link']]
  )
  const magic = new URL(fixture.links[0].url)
  assert.equal(magic.origin, authOrigin)
  const verify = () =>
    fixture.auth.handler(
      new Request(magic, {
        headers: { 'CF-Connecting-IP': '203.0.113.250' },
        redirect: 'manual'
      })
    )
  const verified = await verify()
  assert.equal(verified.status, 302)
  assert.equal(verified.headers.get('location'), authOrigin + '/?view=admin')
  const magicSession = await fixture.request(
    '/get-session',
    undefined,
    mergeCookies(verified)
  )
  const magicUser = (await magicSession.json()).user
  assert.equal(magicUser.email, 'second@example.com')
  assert.equal(magicUser.emailVerified, true)
  const replay = await verify()
  assert.equal(mergeCookies(replay).includes('session_token'), false)
  const [stored] = await owner`
    SELECT count(*)::int AS users FROM auth_user
    WHERE email = 'stranger@example.com'`
  assert.equal(stored.users, 0)
})
