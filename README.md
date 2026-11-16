# Suggestions

A [TanStack Start](https://tanstack.com/start) app with a [tRPC](https://trpc.io) API, served by [Bun](https://bun.sh), backed by Postgres via [Drizzle](https://orm.drizzle.team), with auth by [Better Auth](https://better-auth.com).

## Setup

1. Copy `.env.example` to `.env` and fill it in:
   - `DATABASE_URL` for your Postgres database
   - `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (at least 32 characters), and the
     `BREVO_API_KEY` and `AUTH_EMAIL_FROM` used to send sign-in emails
   - `ADMIN_EMAILS`: verified email addresses allowed into the admin dashboard
2. `bun install`

The schema is defined with [Drizzle](https://orm.drizzle.team) in `src/server/schema.ts`.
Apply migrations from `drizzle/` with `bun run db:migrate`, and run
`bun run db:generate` to create a migration after changing the schema. Run
migrations with a schema owner credential; the production server can use a
restricted data-only role.

## Development

`bun run dev` applies migrations and starts the Vite dev server on port 3001.

## Production

`bun run db:migrate && bun run build && bun run start` — the Bun server in
`server/index.ts` serves `/healthz`, the built assets and the Start app. Supply the owner credential only to the migration
command when using separate database roles.

For the host's container deployment, database provisioning and rollback, see
[deploy/README.md](deploy/README.md).

## Runtime configuration

Server settings are validated with `@t3-oss/env-core` and Zod when they are read.
Production builds need no runtime credentials. Invalid settings report their names
without logging secret values; see `.env.example` for the deployment settings.
Migration commands validate database settings independently of auth configuration.

Every database client sets `connect_timeout: 2`. postgres.js v4 retries a
connection refused for too many connections (`53300`) until that timeout, so a
full connection limit fails a request in about 3 seconds. See
[Database connection budget](deploy/README.md#database-connection-budget).

## Database tests

`TEST_DATABASE_URL=postgres://... bun run test` runs the env checks and six named
Bun integration tests against an explicitly supplied disposable PostgreSQL service:
repeatable migrations, restricted-role permissions, API validation/auth, and
health-probe cancellation/recovery, application connection reuse, idle retirement
and reconnection, plus fast `53300` rejection when a role's connection limit is full. Fixtures are created and removed by test hooks,
and modified runtime environment values are restored after the suite.
The deployment receiver continues to run through its separate Node test command.

`bun run test` runs the server/database suite and then the client DOM suite in
separate Bun processes. This keeps browser globals and cached auth-client modules
isolated from server rendering. Only the server suite needs `TEST_DATABASE_URL`;
point it at a disposable PostgreSQL service, never at an application database.

## Self-contained browser tests

Run `bun install --frozen-lockfile`, install Chromium with
`bunx --no-install playwright install chromium`, then run `bun run test:e2e`.
Homebrew PostgreSQL tools (`brew install postgresql@18`) must be on PATH.
The harness creates a temporary local cluster, migrates it, seeds a verified
throwaway account with a random password, builds the app, and signs in through
the real password form. It stops and removes the cluster on completion.
No production accounts or stored credentials are needed.

Tests live permanently in `e2e/`. Reports are ignored artifacts.
`E2E_SKIP_BUILD=1` reuses a current build. `E2E_DATABASE_URL` may name a
disposable local database with the prefix in `e2e/run.ts`; migrations and
fixtures modify that database, so never point it at valuable data.
Passkeys, real email delivery and production are not exercised.
