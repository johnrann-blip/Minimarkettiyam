#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ARCHIVE="${1:?Usage: bash backend/scripts/verify-backup.sh /path/to/avelora-backup.tar.gz}"
: "${RESTORE_TEST_DATABASE_URL:?RESTORE_TEST_DATABASE_URL must point to a separate EMPTY restore-test database}"

for command in tar sha256sum pg_restore psql grep; do
  command -v "$command" >/dev/null 2>&1 || { echo "Missing required command: $command" >&2; exit 1; }
done
[[ -f "$ARCHIVE" && -f "$ARCHIVE.sha256" ]] || { echo "Backup archive or checksum file is missing." >&2; exit 1; }
(cd "$(dirname "$ARCHIVE")" && sha256sum -c "$(basename "$ARCHIVE").sha256")

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
tar -xzf "$ARCHIVE" -C "$WORK_DIR"
(cd "$WORK_DIR" && sha256sum -c SHA256SUMS)
tar -tzf "$WORK_DIR/uploads.tar.gz" >/dev/null
pg_restore --list "$WORK_DIR/database.dump" >/dev/null

TABLE_COUNT="$(psql "$RESTORE_TEST_DATABASE_URL" -XAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")"
[[ "$TABLE_COUNT" == "0" ]] || { echo "Refusing restore: target database is not empty ($TABLE_COUNT user tables)." >&2; exit 1; }

pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_TEST_DATABASE_URL" "$WORK_DIR/database.dump"
psql "$RESTORE_TEST_DATABASE_URL" -XAt -v ON_ERROR_STOP=1 -c "SELECT to_regclass('public.products') IS NOT NULL AND to_regclass('public.orders') IS NOT NULL" | grep -qx t
PRODUCT_COUNT="$(psql "$RESTORE_TEST_DATABASE_URL" -XAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM products")"
echo "Restore test passed. Restored product rows: $PRODUCT_COUNT"
echo "Uploads archive integrity passed. Extract uploads separately and verify image URLs before any production cutover."
