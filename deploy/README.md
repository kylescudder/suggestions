# Suggestions on Herman

The app is React/Vite with a Hono API on Bun. One ARM64 container serves both
the API and the frontend on `suggestions:3001`, joining `platform-web` and the
private `platform-db` network. It publishes no host ports. Memory is limited to
256 MiB, with a non-root user, read-only root filesystem and bounded logs.

## Current deployment

Since 17 October 2026, `https://suggestions.kylescudder.co.uk` serves Herman.
`deployment.json` records the running image and application revision; the first
release is based on `bb9edac`. The one legacy suggestion was imported and verified.
Kyle requested removal of Netlify on 17 October 2026. The former project
`amazing-seahorse-f7629b` (site ID `be720617-5e17-4067-b701-cd0b6e0e23b5`)
was deleted; its Netlify hostname and preview return 404. The Convex source is
retained, but Netlify is no longer a rollback target. Evidence is
`/Users/kyle/platform/verification/suggestions-netlify-removal.json`.

Clerk's `Suggestions` production instance uses
`clerk.suggestions.kylescudder.co.uk` and
`accounts.suggestions.kylescudder.co.uk`. Its five CNAME records are DNS-only,
with dedicated email/DKIM records under `suggestions.kylescudder.co.uk`.
Production keys are in the protected `.env` and encrypted NAS backup. The
Herman 1Password service account can read the Clerk dashboard login but cannot
create vault items, so no separate API-key item was saved there.

The initial admin is `kyle@kylescudder.co.uk`, using Clerk email-code sign-in.
The app also checks the verified email against `ADMIN_EMAILS` on the server.
Public browser submission, asset delivery, signed-out/invalid-token rejection
and the runtime Clerk admin lookup passed. Kyle completed email-code sign-in
in the collaborative browser on 17 October 2026. The authenticated dashboard,
admin identity check, suggestion list and statistics all passed, showing the
one imported rejected suggestion. Evidence is recorded in
`/Users/kyle/platform/verification/suggestions-admin-acceptance.json`.

## First deployment

Use `/Users/kyle/platform/apps/suggestions` on `herman.local`.
Provision the isolated database with:

```sh
python3 /Users/kyle/platform/scripts/provision-project.py suggestions
```

Create `.env` with mode 0600, using unquoted, single-line values:

```dotenv
DATABASE_URL=postgres://suggestions_runtime:<runtime-password>@postgres:5432/suggestions
PORT=3001
VITE_CLERK_PUBLISHABLE_KEY=<Clerk publishable key>
CLERK_PUBLISHABLE_KEY=<same Clerk publishable key>
CLERK_SECRET_KEY=<matching Clerk secret key>
CLERK_AUTHORIZED_PARTIES=https://suggestions.kylescudder.co.uk
ADMIN_EMAILS=kyle@kylescudder.co.uk
```

Read the runtime password directly from
`/Users/kyle/platform/projects/suggestions/runtime-password`; URL-encode it
when constructing `DATABASE_URL`. Keep credentials out of logs and commits.
Configure Clerk for the public origin, with the intended sign-in methods and
verified admin email. Use production Clerk keys for production.

Commit application and deployment changes, then run:

```sh
python3 deploy/release.py
```

This builds a versioned image with the pinned Bun base and frozen lockfile,
runs the project's typechecks/build, applies the schema using the separate
owner password in a temporary protected file, then starts the app using only
the runtime credential. The pool is capped at four connections. The private
container healthcheck checks frontend delivery and database table access.
The release also checks built assets, signed-out admin rejection and a temporary
public submission, which it deletes after checking storage. Failed checks restore
the previous image.
Schema changes must remain compatible with the previous release for image
rollback to be safe.

The previous public hostname pointed to `snazzy-suggestion-box.netlify.app`.
Its retained Convex deployment is `https://third-stork-431.convex.cloud`; one
rejected suggestion was copied and verified during the initial deployment. On
a fresh restore or before repeating that cutover, preserve the source using
the image's `deploy/import-convex.ts` command with that URL as its argument
and the runtime `.env`, on both `platform-web` and `platform-db` (for example,
`docker compose run --rm --no-deps suggestions bun deploy/import-convex.ts https://third-stork-431.convex.cloud`).
It only reads Convex and preserves
all suggestion fields, creation times and source IDs. Repeating it is safe;
it refuses to overwrite differing data. Re-run before switching traffic and
reconcile any differences first.

After the container is healthy, register the hostname from the platform root:

```sh
python3 scripts/hostname.py add suggestions suggestions.kylescudder.co.uk --upstream suggestions:3001 --dry-run
python3 scripts/hostname.py add suggestions suggestions.kylescudder.co.uk --upstream suggestions:3001
```

The original Netlify DNS record is retained privately at
`/Users/kyle/platform/verification/suggestions-netlify-dns-before.json`.
The initial cutover removed that exact conflicting record only after private
health and Clerk TLS checks passed, then registered the route using the
hostname tool. The public release and Spooktober were checked afterwards.
Evidence is `verification/suggestions-cutover.json` in the platform root.
Future registrations use the managed record normally. The old DNS record is
historical only: Netlify has been deleted. Never restore that CNAME, force the
tool past a new conflict or edit its registry. The Convex source remains retained.

Verify public HTTPS, assets, suggestion submission and signed-out rejection
of listing/statistics/status updates. Verify an actual Clerk admin sign-in
before declaring that flow accepted. Check an existing Herman site as well.

## Updates and rollback

Check out a reviewed commit, then run `python3 deploy/release.py` again.
Failed container health checks restore the previous image automatically.
If a public acceptance check fails after a healthy rollout, restore it with:

```sh
python3 deploy/release.py --rollback
```

The command keeps the previous image reference in protected `deployment.json`.
Rollback restores the image only; it never erases submissions or reverses SQL.
Netlify is no longer available for traffic rollback; do not restore its saved
CNAME. Recover the application on Herman using a retained image or rebuild the
recorded repository revision, and use the encrypted database backup when a data
restore is needed. Preserve current submissions and reconcile any writes before
restoring older data. Keep Clerk's dedicated DNS records intact.
The public Clerk key is baked into the frontend, so a key change needs a rebuild;
rolling back across Clerk-instance changes needs matching configuration too.
There is no automatic GitHub deployment configured.

Routine commands are `docker compose ps`, `docker compose config --quiet` and
`docker compose logs --tail 50`. Never print resolved Compose output, `.env` or
full container inspections. The platform's encrypted NAS job includes the
database, its credentials, this deployment tooling, `.env`, Compose and release
references. Images and application source are recovered from the repository
and rebuilt. The database is registered for the Sunday 03:00 backup.
