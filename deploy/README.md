# Suggestions on Herman

The app is React/Vite with a Hono API on Bun. One ARM64 container serves both
the API and the frontend on `suggestions:3001`, joining `platform-web` and the
private `platform-db` network. It publishes no host ports. Memory is limited to
256 MiB, with a non-root user, read-only root filesystem and bounded logs.

## First deployment

Use `/Users/kyle/platform/apps/suggestions` on `herman.local`.
Provision the isolated database with:

```sh
python3 /Users/kyle/platform/scripts/provision-project.py suggestions
```

Create `.env` with mode 0600, using unquoted, single-line values:

```dotenv
DATABASE_URL=postgres://proj_suggestions_runtime:<runtime-password>@postgres:5432/proj_suggestions
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

The existing public hostname points to `snazzy-suggestion-box.netlify.app`.
Its Convex deployment is `https://third-stork-431.convex.cloud`; one rejected
suggestion was present on 16 October 2026. Preserve it before cutover using
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

The existing Netlify DNS record is a conflict, so these commands deliberately
stop until that record is migrated. Save its exact record privately, replace
it only as part of the verified cutover, and restore it if onboarding fails.
Keep the Netlify site and Convex database for rollback. Never force the
hostname tool past a conflict or edit its managed registry manually.

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
The public Clerk key is baked into the frontend, so a key change needs a rebuild;
rolling back across Clerk-instance changes needs matching configuration too.
There is no automatic GitHub deployment configured.

Routine commands are `docker compose ps`, `docker compose config --quiet` and
`docker compose logs --tail 50`. Never print resolved Compose output, `.env` or
full container inspections. The platform's encrypted NAS job includes the
database, its credentials, this deployment tooling, `.env`, Compose and release
references. Images and application source are recovered from the repository
and rebuilt. The database is registered for the Sunday 03:00 backup.
