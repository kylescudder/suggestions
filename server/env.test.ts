import { expect, test } from 'bun:test'
import { readDatabaseEnv, readEnv } from '../src/server/env'

const valid = {
  DATABASE_URL: 'postgres://fixture:password@localhost:5432/app',
  BETTER_AUTH_URL: 'https://suggestions.example.com',
  BETTER_AUTH_SECRET:
    'fixture-secret-that-is-longer-than-thirty-two-characters',
  BREVO_API_KEY: 'fixture-api-key',
  AUTH_EMAIL_FROM: 'suggestions@example.com'
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

test('Better Auth settings are required', () => {
  expect(readEnv(valid).AUTH_EMAIL_DAILY_LIMIT).toBe(40)
  for (const key of [
    'BETTER_AUTH_URL',
    'BETTER_AUTH_SECRET',
    'BREVO_API_KEY',
    'AUTH_EMAIL_FROM'
  ]) {
    expect(() => readEnv({ ...valid, [key]: '' })).toThrow(key)
    expect(() => readEnv({ ...valid, [key]: undefined })).toThrow(key)
  }
  expect(() => readEnv({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow(
    'BETTER_AUTH_SECRET'
  )
  expect(() =>
    readEnv({
      ...valid,
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'http://suggestions.example.com'
    })
  ).toThrow('BETTER_AUTH_URL')
  expect(() => readEnv({ ...valid, AUTH_EMAIL_DAILY_LIMIT: '301' })).toThrow(
    'AUTH_EMAIL_DAILY_LIMIT'
  )
})

test('retired provider settings left in the host .env are ignored', () => {
  const env = readEnv({
    ...valid,
    AUTH_PROVIDER: 'retired-provider',
    RETIRED_PROVIDER_SECRET_KEY: 'leftover'
  })
  expect(env.BETTER_AUTH_URL).toBe(valid.BETTER_AUTH_URL)
  expect('AUTH_PROVIDER' in env).toBe(false)
})

test('admin emails are validated and normalized', () => {
  const env = readEnv({
    ...valid,
    ADMIN_EMAILS: ' Admin@example.com, second@example.com '
  })
  expect(env.ADMIN_EMAILS).toEqual(['admin@example.com', 'second@example.com'])
  expect(readEnv({ ...valid, ADMIN_EMAILS: '' }).ADMIN_EMAILS).toEqual([])
  expect(() => readEnv({ ...valid, ADMIN_EMAILS: 'invalid' })).toThrow(
    'ADMIN_EMAILS'
  )
})
