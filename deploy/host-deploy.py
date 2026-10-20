#!/usr/bin/env python3
"""Suggestions settings and hooks for the shared host deployer (deploy_core.py)."""
from pathlib import Path
import tempfile
from urllib.parse import quote

import deploy_core as core

NAME = 'suggestions'


def accept(image):
    core.compose('exec', '-T', 'suggestions', 'bun', 'deploy/verify.ts', image=image)


def migrate(candidate):
    password = core.protected_file(core.APP.parents[1] / f'projects/{NAME}/owner-password', 'Migration credential')
    with tempfile.TemporaryDirectory(prefix=f'{NAME}-migration-') as folder:
        config = Path(folder) / 'migration.env'
        config.write_text(f'DATABASE_URL=postgres://{NAME}_owner:' +
                          quote(password.read_text().strip(), safe='') + f'@postgres:5432/{NAME}\n')
        config.chmod(0o600)
        core.run(['docker', 'run', '--rm', '--read-only', '--cap-drop', 'ALL', '--security-opt',
                  'no-new-privileges:true', '--network', 'platform-db', '--memory', '128m', '--cpus', '0.5',
                  '--env-file', str(config), candidate, 'bun', 'server/migrate.ts'])


def prepare(candidate, current):
    core.backup_database(NAME)
    migrate(candidate)
    core.log('owner migrations applied; runtime remains restricted')


def after_success(record):
    # Public release record read by the app's own status checks.
    core.save_json(core.APP / 'deployment.json', {'released_at':record['deployed_at'], 'image':record['image'],
                   'revision':record['revision'], 'previous_image':record['previous_image'],
                   'previous_revision':record['previous_revision'], 'hostname':'suggestions.kylescudder.co.uk'})


APP = core.App(
    name='suggestions', title='Suggestions',
    image='ghcr.io/kylescudder/suggestions', repo='kylescudder/suggestions',
    image_var='SUGGESTIONS_IMAGE', service='suggestions', app_dir=Path(__file__).resolve().parents[1],
    accept=accept,
    prepare=prepare,
    after_success=after_success,
    public_status=True,
    backups=True)

if __name__ == '__main__':
    core.cli(APP, __file__)
