# AVELORA administrator accounts — deployment checklist

## Important: preserve the existing store

This application uses PostgreSQL. For an existing store, keep the current database and its records. Do not drop/recreate the database, delete tables, or import `database/schema.sql` again.

Before deployment, take a database backup and preserve `backend/uploads/` (product images). Deploying application files must not replace the database or erase uploads.

## Deployment order

1. Back up the existing PostgreSQL database and `backend/uploads/`.
2. Confirm the hosting provider's correct PostgreSQL connection method (host/socket, port, SSL requirements) and verify that the configured `DATABASE_URL` can connect using the application account. Do not guess a host or change database authentication files on shared hosting.
3. Keep a private `ADMIN_API_KEY` in the Node.js application's environment. It must contain at least 32 bytes and must never be committed to Git, placed in public files, or sent in chat.
4. Confirm the site is served over HTTPS. Production admin session cookies use the `Secure` attribute.
5. Deploy the application code and restart the Node.js application.
6. On startup, the server runs the versioned, additive migrations from `database/migrations/` and records completed migrations in `app_schema_migrations`. It also creates missing admin/session/audit tables if needed. Do not run these migrations manually through phpMyAdmin; phpMyAdmin is for MySQL, while this project uses PostgreSQL.
7. Confirm `/api/health` responds with `{"status":"ok"}`.
8. Open `/admin/`. If no owner exists, the one-time owner setup form appears. Enter the server-side `ADMIN_API_KEY`, choose your own username, display name, and a unique password of at least 12 characters.
9. After setup, sign out and sign in using the owner credentials. The bootstrap route must reject further owner creation once an owner exists.
10. Confirm unauthenticated requests cannot access protected admin APIs.

If the application returns 503 during startup, inspect the Node.js application error log first. A PostgreSQL authentication/connection failure prevents startup migrations and health checks; do not reset the database to address it.

## Security behavior

- Admin passwords are stored as scrypt hashes with per-account random salts.
- Session tokens are random, stored as SHA-256 hashes in PostgreSQL, and expire after one day.
- The session cookie is HttpOnly, SameSite=Strict, and Secure in production.
- The first owner can be created only while no owner account exists and only with the server-side bootstrap key.
- Manager permissions are checked by the API; owner-only settings remain restricted.
- Admin mutations require the same-origin request header as well as a valid session.
- The old shared-key header is not accepted as a substitute for an authenticated admin session.

## Rollback

If deployment must be rolled back, restore the previous application code and restart the Node.js application. Do not drop the new tables or reset the database. Keep the database and uploads backups until the site, admin login, product images, and existing orders have all been verified.

## Verification status

The repository's automated tests cover the application and isolated PostgreSQL integration database. They do not verify the hosting provider's PostgreSQL network/authentication configuration or perform a production deployment. Live health, login, and data-preservation checks must be performed on the hosting account after deployment.
