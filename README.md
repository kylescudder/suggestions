# Suggestions

A [TanStack Start](https://tanstack.com/start) app with a [tRPC](https://trpc.io) API, served by [Bun](https://bun.sh), backed by Postgres via [Drizzle](https://orm.drizzle.team), with auth by [Clerk](https://clerk.com).

## Setup

1. Copy `.env.example` to `.env` and fill it in:
   - `DATABASE_URL` for your Postgres database
   - Clerk publishable/secret keys from the Clerk dashboard
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
