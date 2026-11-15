# AVELORA backup and restore

## What the backup contains
- A PostgreSQL custom-format dump of the configured AVELORA database.
- A compressed copy of `backend/uploads`.
- SHA-256 checksums for the archive and its contents.

The default backup directory is `$HOME/avelora-backups`, outside the Git checkout. Files are created with restrictive permissions. Backups must never be committed to Git.

## Create a backup

Set `DATABASE_URL` to the production database connection string in the server environment, then run:

```bash
bash backend/scripts/backup.sh
```

Keep the connection string out of shell history and logs. Copy both the generated `.tar.gz` and its `.sha256` file to encrypted off-site storage. A backup stored only on the same hosting account is not disaster recovery.

## Verify and restore-test

Create a separate, empty PostgreSQL database first. Never use the live production database as the restore-test target. Set `RESTORE_TEST_DATABASE_URL` to that isolated database and run:

```bash
bash backend/scripts/verify-backup.sh "$HOME/avelora-backups/avelora-YYYYMMDDTHHMMSSZ.tar.gz"
```

The script verifies checksums and archive readability, refuses a non-empty target database, and restores the database dump into the isolated target. It does not overwrite production data.

## Before launch
- Configure a scheduled backup using the hosting provider's cron facility.
- Retain multiple dated backups and copy them off-site, encrypted.
- Perform a restore test after schema changes and periodically thereafter.
- Test recovery of uploaded images as well as database rows.
- Confirm the hosting account has the PostgreSQL client utilities required by the scripts.

These scripts have not been executed against the production hosting account. A successful GitHub commit is not proof that backups are scheduled or restorable in production.
