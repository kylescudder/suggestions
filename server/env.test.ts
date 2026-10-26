import { expect, test } from 'bun:test'
import { readDatabaseEnv, readEnv } from '../src/server/env'

const valid = {
  DATABASE_URL: 'postgres://fixture:password@localhost:5432/app',
  CLERK_PUBLISHABLE_KEY: 'public-fixture',
  CLERK_SECRET_KEY: 'secret-fixture'
}

test('valid runtime settings are typed and use the app defaults', () => {
  const env = readEnv(valid)
  expect(env.PORT).toBe(3001)
  expect(env.NODE_ENV).toBe('development')
  expect(readEnv({ ...valid, PORT: '4312' }).PORT).toBe(4312)
})

test('migrations need only a valid PostgreSQL URL', () => {
  expect(
    readDatabaseEnv({ DATABASE_URL: valid.DATABASE_URL }).DATABASE_URL
  ).toBe(valid.DATABASE_URL)
  for (const DATABASE_URL of [
    undefined,
    '',
    'not-a-url',
    'https://example.com/app',
    'postgres://localhost'
  ]) {
    expect(() => readDatabaseEnv({ DATABASE_URL })).toThrow('DATABASE_URL')
  }
})

test('bad listener settings are rejected before accepting requests', () => {
  for (const PORT of ['0', '-1', '65536', '3000.5', 'invalid']) {
    expect(() => readEnv({ ...valid, PORT })).toThrow('PORT')
  }
  expect(() => readEnv({ ...valid, NODE_ENV: 'staging' })).toThrow('NODE_ENV')
})

test('configuration errors identify fields without printing secret values', () => {
  const secret = 'do-not-print-this-password'
  try {
    readEnv({
      ...valid,
      DATABASE_URL: 'https://user:' + secret + '@example.com/app'
    })
    throw new Error('invalid configuration was accepted')
  } catch (error) {
    expect((error as Error).message).toContain('DATABASE_URL')
    expect((error as Error).message).not.toContain(secret)
  }
})

test('missing Clerk credentials fail runtime validation', () => {
  expect(() => readEnv({ ...valid, CLERK_SECRET_KEY: '' })).toThrow(
    'CLERK_SECRET_KEY'
  )
  expect(() => readEnv({ ...valid, CLERK_PUBLISHABLE_KEY: undefined })).toThrow(
    'CLERK_PUBLISHABLE_KEY'
  )
})

test('admin emails and allowed origins are validated and normalized', () => {
  const env = readEnv({
    ...valid,
    ADMIN_EMAILS: ' Admin@example.com, second@example.com ',
    CLERK_AUTHORIZED_PARTIES:
      ' https://ideas.example.com/, http://localhost:3001 '
  })
  expect(env.ADMIN_EMAILS).toEqual(['admin@example.com', 'second@example.com'])
  expect(env.CLERK_AUTHORIZED_PARTIES).toEqual([
    'https://ideas.example.com',
    'http://localhost:3001'
  ])
  expect(
    readEnv({ ...valid, ADMIN_EMAILS: '', CLERK_AUTHORIZED_PARTIES: '' })
      .ADMIN_EMAILS
  ).toEqual([])
  expect(() => readEnv({ ...valid, ADMIN_EMAILS: 'invalid' })).toThrow(
    'ADMIN_EMAILS'
  )
  expect(() =>
    readEnv({ ...valid, CLERK_AUTHORIZED_PARTIES: 'https://example.com/path' })
  ).toThrow('CLERK_AUTHORIZED_PARTIES')
})
