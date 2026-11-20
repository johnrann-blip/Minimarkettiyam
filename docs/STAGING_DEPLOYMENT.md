# AVELORA staging deployment checklist (cPanel)

This guide is for a **separate test installation**. Never point staging at the production PostgreSQL database, production upload directory, or production payment credentials.

## 1. Isolate the environment

- Create a dedicated subdomain, for example `test.avelorashop.ir`.
- Create a new PostgreSQL database and database user only for staging.
- Use a separate cPanel Node.js application/root directory, for example `~/avelora-staging/backend`.
- Use a separate persistent uploads directory, for example `~/avelora-staging/backend/uploads`.
- Keep production app, database, uploads, environment variables, and restart marker unchanged.

## 2. Deploy the candidate branch

Deploy only the reviewed GitHub branch `feature/avelora-gemini-admin-integration` to the staging app. Install dependencies from `backend/package-lock.json` with `npm ci`. Do not merge to `main` or deploy to the production app as part of this test.

## 3. Configure staging environment

Create `backend/.env` on the staging host only. Never commit it or paste secrets into GitHub.

Required values:
- `DATABASE_URL`: staging-only PostgreSQL URL.
- `ADMIN_API_KEY`: a newly generated random secret of at least 32 bytes, unique to staging.
- `PORT`: the port assigned by cPanel.
- `UPLOAD_STORAGE=local` only if this staging app has a persistent writable disk.
- `PUBLIC_BASE_URL=https://test.avelorashop.ir` after HTTPS is active.
- `ZARINPAL_ENABLED=false`.
- Do not configure live ZarinPal or BitPay credentials. Keep payment-provider integration disabled during the UI and workflow test.

If the host requires `NODE_ENV=production`, keep the database, secrets, uploads, app root and domain isolated as above. Never weaken production validation to make staging boot.

## 4. Initialize and protect test data

The application runs additive schema migrations during startup. Confirm `DATABASE_URL` points to the staging database before the first start. Start with an empty staging database; do not copy customer names, phone numbers, addresses, password hashes, sessions, payment authorities, or production orders.

Create a separate staging owner account through the documented bootstrap flow. Use fictitious test products, test customers, and test orders only.

## 5. Smoke tests

- `GET /api/health` returns HTTP 200 and `status: ok`.
- Storefront and `/admin/` load over HTTPS.
- Owner login, logout, session expiry and manager permission restrictions behave correctly.
- Product create/edit/archive/restore/delete, gallery reorder/remove/upload and per-color stock work.
- Orders can be created with test data; no real gateway redirect or charge is possible.
- Appearance draft/save/publish, all six presets, section visibility and mobile/desktop layout are checked.
- Advertising request, approval, campaign publishing and click tracking work with test data.
- Feedback moderation and audit log work.
- Verify no staging route, asset, cookie, upload or API request points to the production app.

## 6. Evidence and rollback

Record test date, browser/device, tested account role, action, expected result and actual result. On failure, stop testing and preserve logs. Roll back by stopping only the staging Node app; do not change production files, database, or restart marker.

## 7. Before public launch

The repository README currently notes that customer phone ownership verification by SMS and password recovery are not implemented. Resolve and test those flows before accepting unrestricted public customer accounts. Also verify privacy, return/shipping policies, backup restoration, and the actual payment provider's sandbox process before enabling real payments.
