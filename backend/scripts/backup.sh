#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
UPLOADS_DIR="${UPLOADS_DIR:-$REPO_ROOT/backend/uploads}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
: "${DATABASE_URL:?DATABASE_URL must point to the AVELORA database}"

for command in pg_dump tar sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 1; }
done

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$(mktemp -d "$BACKUP_DIR/.avelora-backup.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

pg_dump --format=custom --no-owner --no-acl --file="$WORK_DIR/database.dump" "$DATABASE_URL"
if [[ -d "$UPLOADS_DIR" ]]; then
  tar -czf "$WORK_DIR/uploads.tar.gz" -C "$UPLOADS_DIR" .
else
  echo "Uploads directory does not exist: $UPLOADS_DIR" >&2
  exit 1
fi

cat > "$WORK_DIR/manifest.txt" <<EOF
backup_format=avelora-v1
created_utc=$STAMP
database_dump=database.dump
uploads_archive=uploads.tar.gz
EOF

(
  cd "$WORK_DIR"
  sha256sum database.dump uploads.tar.gz manifest.txt > SHA256SUMS
)
ARCHIVE_TMP="$BACKUP_DIR/.avelora-$STAMP.tar.gz.tmp"
ARCHIVE="$BACKUP_DIR/avelora-$STAMP.tar.gz"
tar -czf "$ARCHIVE_TMP" -C "$WORK_DIR" .
mv "$ARCHIVE_TMP" "$ARCHIVE"
sha256sum "$ARCHIVE" > "$ARCHIVE.sha256"
chmod 600 "$ARCHIVE" "$ARCHIVE.sha256"
echo "Backup created: $ARCHIVE"
echo "SHA256 file: $ARCHIVE.sha256"
echo "IMPORTANT: copy both files to encrypted off-site storage; do not commit them to Git."
