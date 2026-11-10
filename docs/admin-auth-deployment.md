# AVELORA administrator accounts — deployment checklist

This change replaces the shared `x-admin-key` panel login with individual administrator accounts and database-backed sessions.

## Important: deployment order

Do not deploy the new server code before applying the database migration. The new login routes require the three tables created by `database/migrations/008_admin_auth.sql`.

1. Take a fresh database backup.
2. Open the hosting database manager (for example, phpMyAdmin), select the AVELORA production database, and run the complete SQL in `database/migrations/008_admin_auth.sql` once.
3. Confirm that `admin_users`, `admin_sessions`, and `admin_audit_logs` exist.
4. Confirm that the server environment still has a private `ADMIN_API_KEY` of at least 32 bytes. This key is used only once to bootstrap the first owner account; do not put it in website files or share it in chat.
5. Confirm the admin site is served over HTTPS before deploying. Production session cookies are marked `Secure`.
6. Deploy the branch only after the migration and HTTPS checks are complete.
7. Visit `/admin/`. On the first visit, create the owner account using the server bootstrap key and a unique password of at least 12 characters. The bootstrap route permits only the first owner.
8. Sign out and sign in again with the owner username and password. Confirm that an unauthenticated browser cannot access admin APIs.

## Security behavior

- Admin passwords are stored as scrypt hashes with per-account random salts.
- Session tokens are random, stored as SHA-256 hashes in the database, and expire after one day.
- The session cookie is HttpOnly, SameSite=Strict, and Secure in production.
- Owner-only endpoints manage manager accounts and active sessions; manager permissions are checked by the API.
- Admin mutations require the explicit same-origin request header in addition to a valid session.
- The old shared-key header is no longer accepted by protected admin routes after this change is deployed.

## Rollback

If deployment must be rolled back, restore the previous application version. Do not drop the new tables; they are additive and contain the new account/session/audit records. Keep the database backup until the new login has been verified.

## Verification status

The migration and application changes are committed on the feature branch. Production migration, deployment, and live login verification must be performed separately; none is performed by this document.
