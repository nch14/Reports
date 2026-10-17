#!/bin/sh
# Daily backup, run from the repository directory on the server, e.g. via cron:
#   15 3 * * * cd /opt/reports && ./deploy/backup.sh >> backup.log 2>&1
# Keeps 14 days of snapshots in ./backups. Copy that folder off the server too.
set -eu
mkdir -p backups
name="reports-$(date +%Y-%m-%d).db"
docker compose -f compose.prod.yml exec -T reports node --disable-warning=ExperimentalWarning dist/cli.js backup "/data/backups/$name"
docker compose -f compose.prod.yml cp "reports:/data/backups/$name" "backups/$name"
docker compose -f compose.prod.yml exec -T reports rm "/data/backups/$name"
find backups -name 'reports-*.db' -mtime +14 -delete
echo "$(date -Iseconds) backed up $name"
