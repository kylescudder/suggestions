# Suggestions on the host

## Shared deployment service

This app is registered as `suggestions` in the central deployment registry
`/Users/kyle/platform/deploy-core/apps.json`. LaunchAgent
`com.kylescudder.deploy-core` runs the single installed engine. Application hooks
are `deploy/hooks.py`; the receiver, credentials, queues,
state and database contracts below remain app-specific. Manual deployment uses
`./deploy/host-deploy.sh sha256:<digest>`.

Engine updates, application registration, failure inspection and service rollback
are documented in [deploy-core](https://github.com/kylescudder/deploy-core).
There are no vendored engine files, lock files or sync PRs. Do not install an
app-specific LaunchAgent. Apply future engine changes once through the central service.


The app is React/Vite with a Hono API on Bun. One ARM64 container serves both
the API and the frontend on `suggestions:3001`, joining `platform-web` and the
private `platform-db` network. It publishes no host ports. Memory is limited to
256 MiB, with a non-root user, read-only root filesystem and bounded logs.

## Deployer

`application hooks` holds this app's settings and hooks; the

## Current deployment

Since 17 October 2026, `https://suggestions.kylescudder.co.uk` is served from the host.
`deployment.json` records the running image and application revision; the first
release is based on `bb9edac`. The one legacy suggestion was imported and verified.
Kyle requested removal of Netlify on 17 October 2026. The former project
`amazing-seahorse-f7629b` (site ID `be720617-5e17-4067-b701-cd0b6e0e23b5`)
was deleted; its Netlify hostname and preview return 404. The retired Convex
`suggestions` project was also deleted on 17 October, including development
`third-stork-431` and the empty, never-deployed production `clever-ant-210`.
The imported suggestion was verified in Postgres, and a full Convex export was
downloaded and verified in encrypted NAS backup before deletion. Neither old
service is a rollback target. Evidence is in the platform's
`verification/suggestions-netlify-removal.json` and
`verification/suggestions-convex-removal.json`.

Clerk's `Suggestions` production instance uses
`clerk.suggestions.kylescudder.co.uk` and
`accounts.suggestions.kylescudder.co.uk`. Its five CNAME records are DNS-only,
with dedicated email/DKIM records under `suggestions.kylescudder.co.uk`.
Production keys are in the protected `.env` and encrypted NAS backup. The
The host 1Password service account can read the Clerk dashboard login but cannot
create vault items, so no separate API-key item was saved there.

The initial admin is `kyle@kylescudder.co.uk`, using Clerk email-code sign-in.
The app also checks the verified email against `ADMIN_EMAILS` on the server.
Public browser submission, asset delivery, signed-out/invalid-token rejection
and the runtime Clerk admin lookup passed. Kyle completed email-code sign-in
in the collaborative browser on 17 October 2026. The authenticated dashboard,
admin identity check, suggestion list and statistics all passed, showing the
one imported rejected suggestion. Evidence is recorded in
`/Users/kyle/platform/verification/suggestions-admin-acceptance.json`.

## Automatic releases

Every push to `main` runs `.github/workflows/release.yml`. CI checks all
TypeScript and the frontend build, owner migrations and restricted runtime
database access in disposable PostgreSQL, deployment rollback/provenance gates,
and receiver signature/path/queue behavior. Native AMD64 and ARM64 builders
publish `ghcr.io/kylescudder/suggestions` with GitHub provenance. GitHub holds
only deployment credentials and the public Clerk publishable-key variable;
Clerk secrets and production database credentials remain on the host.
The release job includes a read-only, job-lifetime registry token in its signed
request so the host can verify and pull private GHCR images. The host removes its
temporary registry configuration after the pull and omits this token from state
and logs. No persistent GitHub registry password is installed on the host.

The main-only `production` environment sends a signed request through Cloudflare
Access to `https://deploy-suggestions.kylescudder.co.uk/hooks/suggestions`.
Caddy exposes only that exact path to `suggestions-deploy-hook:9000`. The
receiver has no Docker socket, database network or host port: it writes a queue
consumed by `com.kylescudder.deploy-core` on the host. The host independently
verifies repository, workflow and main-branch image provenance, saves a database
dump, runs owner migrations, then starts the immutable image. Failed application
checks restore the previous image. Runtime credentials remain restricted.

The workflow waits for the host's completed acceptance record over an
Access-protected GET to the same webhook path, matching both commit and image
digest, and for `/api/me` to report that commit in `X-Suggestions-Revision`.
The receiver sees only a read-only `state/public/` mount containing acceptance
metadata. The host publishes that record after database/API checks finish;
a responding candidate alone cannot make CI report success.
`DEPLOY_ENABLED=true` and
`SUGGESTIONS_BASE_URL=https://suggestions.kylescudder.co.uk` control deployment.
`VITE_CLERK_PUBLISHABLE_KEY` is a repository variable baked into the frontend.

Private receiver settings are `.env.deploy-hook` and `secrets/`. Release
history, queued delivery and failure records are under `state/`; the latest
release is also recorded in `deployment.json`. Protected local pre-deploy dumps
are under `backups/`, retaining the latest 14 independently of weekly NAS policy.
The encrypted NAS archive includes private config, state, deploy tooling and the
project database. End-to-end evidence and screenshots are in
`/Users/kyle/platform/verification/suggestions-cicd.json`.

Changes to host deploy tooling or Compose need an explicit checkout update on
The host; routine image releases do not run `git pull` or change the host tools.

## First deployment or manual local build

Use `/Users/kyle/platform/apps/suggestions` on the host.
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
DEPLOY_HOSTNAME=<host name> python3 deploy/release.py
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
Its old backend was the development deployment `third-stork-431`; its single
rejected suggestion was copied with all source fields and timestamps preserved.
Both that deployment and the unused production deployment `clever-ant-210` were
removed with the Convex project on 17 October 2026. The historical
`deploy/import-convex.ts` utility cannot read the deleted source.

Use the current Postgres dump for recovery. Protected historical snapshots are
`secrets/convex-pre-herman.json`, `secrets/convex-before-removal.json` and the full
database/file-storage export `secrets/convex-retirement/third-stork-431-full.zip`.
The export includes the retired authentication tables; treat it as secret data.
These snapshots are included in encrypted NAS backup. Do not overwrite current
Postgres writes with the historical export.

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
tool past a new conflict or edit its registry. Convex is also deleted; recovery
uses the retained the host image or encrypted Postgres backup.

Verify public HTTPS, assets, suggestion submission and signed-out rejection
of listing/statistics/status updates. Verify an actual Clerk admin sign-in
before declaring that flow accepted. Check an existing the host site as well.

## Updates and rollback

Normally, merge a reviewed change to `main` and let the release workflow deploy
it. To redeploy or roll back to a previously attested main image on the host:

```sh
./deploy/host-deploy.sh sha256:<verified-manifest-digest>
```

Manual private-registry digest deployment requires package-read access. The
cached previous image can instead be restored with `python3 deploy/release.py --rollback`.
The manual local-build fallback is `python3 deploy/release.py`. Both release
paths share `state/deploy.lock`. Failed checks restore the previous image.
For the local release record's previous image, use:

```sh
DEPLOY_HOSTNAME=<host name> python3 deploy/release.py --rollback
```

The command keeps the previous image reference in protected `deployment.json`.
Rollback restores the image only; it never erases submissions or reverses SQL.
Netlify is no longer available for traffic rollback; do not restore its saved
CNAME. Recover the application on the host using a retained image or rebuild the
recorded repository revision, and use the encrypted database backup when a data
restore is needed. Preserve current submissions and reconcile any writes before
restoring older data. Keep Clerk's dedicated DNS records intact.
The public Clerk key is baked into the frontend, so a key change needs a rebuild;
rolling back across Clerk-instance changes needs matching configuration too.

Routine commands are `docker compose ps`, `docker compose config --quiet` and
`docker compose logs --tail 50`. Never print resolved Compose output, `.env` or
full container inspections. The platform's encrypted NAS job includes the
database, its credentials, this deployment tooling, `.env`, Compose and release
references. Images and application source are recovered from the repository
and rebuilt. The database is registered for the Sunday 03:00 backup.
