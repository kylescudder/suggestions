#!/usr/bin/env python3
"""Build and release Suggestions on Herman, or restore its previous image."""
import argparse
import datetime
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
from urllib.parse import quote, urlparse

APP = Path(__file__).resolve().parents[1]
PLATFORM = APP.parents[1]
CONFIG = APP / ".env"
STATE = APP / "deployment.json"


def run(*args, env=None, capture=False):
    return subprocess.run(
        args, cwd=APP, env=env, check=True, text=True,
        stdout=subprocess.PIPE if capture else None,
    ).stdout


def atomic_write(path, content):
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as f:
        temporary = Path(f.name)
        try:
            os.chmod(temporary, 0o600)
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rollback", action="store_true")
    args = parser.parse_args()
    if socket.gethostname().split(".")[0] != "herman" or PLATFORM != Path("/Users/kyle/platform"):
        raise SystemExit("This release command must run in Herman's platform checkout")
    if not CONFIG.is_file() or CONFIG.stat().st_mode & 0o077:
        raise SystemExit("Create .env with mode 0600; see deploy/README.md")
    original = CONFIG.read_text()
    config = {}
    for line in original.splitlines():
        if line.strip() and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            config[key.strip()] = value.strip()
    previous = json.loads(STATE.read_text()) if STATE.exists() else {}
    revision = run("git", "rev-parse", "HEAD", capture=True).strip()
    if args.rollback:
        image = previous.get("previous_image")
        if not image:
            raise SystemExit("There is no previous release to restore")
        run("docker", "image", "inspect", image, capture=True)
    else:
        if run("git", "status", "--porcelain", capture=True).strip():
            raise SystemExit("Commit the application and deployment changes before releasing")
        required = ("DATABASE_URL", "CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY",
                    "VITE_CLERK_PUBLISHABLE_KEY", "ADMIN_EMAILS", "CLERK_AUTHORIZED_PARTIES")
        missing = [key for key in required if not config.get(key) or "..." in config[key]]
        if missing:
            raise SystemExit("Configure these .env fields first: " + ", ".join(missing))
        if config["VITE_CLERK_PUBLISHABLE_KEY"] != config["CLERK_PUBLISHABLE_KEY"]:
            raise SystemExit("Frontend and backend Clerk publishable keys must match")
        database = urlparse(config["DATABASE_URL"])
        if (database.hostname, database.username, database.path) != (
            "postgres", "proj_suggestions_runtime", "/proj_suggestions"
        ):
            raise SystemExit("DATABASE_URL must use Suggestions' restricted Herman runtime role")
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
        image = f"suggestions:{revision[:12]}-{stamp}"
        run("docker", "build", "--build-arg", "SUGGESTIONS_REVISION=" + revision,
            "--build-arg", "VITE_CLERK_PUBLISHABLE_KEY=" + config["VITE_CLERK_PUBLISHABLE_KEY"],
            "-t", image, ".")
        owner = (PLATFORM / "projects/suggestions/owner-password").read_text().strip()
        with tempfile.TemporaryDirectory(prefix="suggestions-migration-") as directory:
            migration = Path(directory) / "migration.env"
            atomic_write(migration, "DATABASE_URL=postgres://proj_suggestions_owner:" +
                         quote(owner, safe="") + "@postgres:5432/proj_suggestions\n")
            run("docker", "run", "--rm", "--network", "platform-db", "--env-file",
                str(migration), image, "bun", "server/migrate.ts")

    environment = dict(os.environ, SUGGESTIONS_IMAGE=image)
    run("docker", "compose", "config", "--quiet", env=environment)
    try:
        run("docker", "compose", "up", "-d", "--wait", "--wait-timeout", "90", env=environment)
        run("docker", "compose", "exec", "-T", "suggestions", "bun", "deploy/verify.ts", env=environment)
    except subprocess.CalledProcessError:
        if previous.get("image"):
            print("Health checks failed; restoring the previous image", flush=True)
            run("docker", "compose", "up", "-d", "--wait", "--wait-timeout", "90",
                env=dict(os.environ, SUGGESTIONS_IMAGE=previous["image"]))
        else:
            run("docker", "compose", "stop", env=environment)
        raise
    lines = [line for line in original.splitlines() if not line.startswith("SUGGESTIONS_IMAGE=")]
    atomic_write(CONFIG, "\n".join(lines) + "\nSUGGESTIONS_IMAGE=" + image + "\n")
    state = {
        "image": image,
        "previous_image": previous.get("image"),
        "revision": previous.get("previous_revision") if args.rollback else revision,
        "previous_revision": previous.get("revision"),
        "hostname": "suggestions.kylescudder.co.uk",
        "released_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    atomic_write(STATE, json.dumps(state, indent=2) + "\n")
    print("Healthy release: " + image)


if __name__ == "__main__":
    main()
