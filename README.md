# Suggestions

A React + Vite frontend with a small [Hono](https://hono.dev) API server running on [Bun](https://bun.sh), backed by Postgres, with auth by [Clerk](https://clerk.com).

## Setup

1. Copy `.env.example` to `.env` and fill it in (Bun and Vite both load `.env`):
   - `DATABASE_URL` for your Postgres database
   - Clerk publishable/secret keys from the Clerk dashboard
   - `ADMIN_EMAILS`: verified email addresses allowed into the admin dashboard
2. `bun install`

The schema is defined with [Drizzle](https://orm.drizzle.team) in `server/schema.ts`.
Apply migrations from `drizzle/` with `bun run db:migrate`, and run
`bun run db:generate` to create a migration after changing the schema. Run
migrations with a schema owner credential; the production server can use a
restricted data-only role.

## Development

`bun run dev` applies the schema and starts Vite and the API server (port 3001).
Vite proxies `/api` to the server.

## Production

`bun run db:migrate && bun run build && bun run start` — the API server also serves
the built frontend from `dist/`. Supply the owner credential only to the migration
command when using separate database roles.

For the host's container deployment, database provisioning and rollback, see
[deploy/README.md](deploy/README.md).
