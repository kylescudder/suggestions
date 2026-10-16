# Suggestions

A React + Vite frontend with a small [Hono](https://hono.dev) API server running on [Bun](https://bun.sh), backed by Postgres, with auth by [Clerk](https://clerk.com).

## Setup

1. Copy `.env.example` to `.env` and fill it in (Bun and Vite both load `.env`):
   - `DATABASE_URL` for your Postgres database
   - Clerk publishable/secret keys from the Clerk dashboard
   - `ADMIN_EMAILS`: verified email addresses allowed into the admin dashboard
2. `bun install`

The schema in `server/schema.sql` is applied automatically when the server starts.

## Development

`bun run dev` starts Vite and the API server (port 3001). Vite proxies `/api` to the server.

## Production

`bun run build && bun run start` — the API server also serves the built frontend from `dist/`.
