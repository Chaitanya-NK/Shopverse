# Shopverse runbook

What to do when something breaks, and how to make sure you can recover. Keep a
copy of this somewhere you can read when the app is down.

## 1. What has to be backed up

| What                                                      | Where                                     | How it's protected                                                                      |
| --------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Database (businesses, orders, stock, customers, designs…) | Supabase Postgres                         | Supabase backups + the nightly **Backup** workflow (`scripts/backup/backup-db.sh`)      |
| Uploaded images (product photos, logos, design images)    | Supabase Storage, `product-images` bucket | Nightly workflow when `BACKUP_SUPABASE_*` are set (`scripts/backup/backup-storage.mjs`) |
| Database structure                                        | `supabase/migrations` in git              | Git. Backups hold data only; structure is rebuilt from the migrations                   |
| Secrets                                                   | Hosting environment variables             | **You.** Keep a copy in a password manager (see below)                                  |

**Secrets you can't get back:** `PAYMENTS_ENCRYPTION_KEY` encrypts every
business's Stripe and Twilio keys. A restore without the same key works, but
every business has to re-enter its keys. `BACKUP_PASSPHRASE` is the only way to
open an encrypted backup. Store both in a password manager, not only in the
hosting dashboard or GitHub.

Everything else (`SUPABASE_SECRET_KEY`, `CRON_SECRET`, SMTP, Stripe webhook
secrets) can be regenerated from the provider's dashboard.

### Targets

- **Recovery point (how much data you could lose):** up to 24 hours with
  nightly backups; minutes with Supabase point-in-time recovery (paid add-on).
- **Recovery time:** about an hour to restore into a new project (section 4).

## 2. Setting up backups

1. **Supabase.** Paid plans keep daily backups (Database → Backups). On the
   free plan there are none, so the workflow below is your only backup. For
   real shops, turn on point-in-time recovery.
2. **Nightly workflow** (`.github/workflows/backup.yml`). Add repository secrets:
   - `BACKUP_DATABASE_URL`: Supabase → Connect → _Session pooler_ string, with the password.
   - `BACKUP_PASSPHRASE`: `openssl rand -base64 32`, also saved in your password manager.
   - Optional, to copy images too: `BACKUP_SUPABASE_URL` and `BACKUP_SUPABASE_SECRET_KEY`.

   Each night it uploads an encrypted backup as a workflow artifact, kept 30
   days. Run it once by hand (Actions → Backup → Run workflow) and check it
   produced `shopverse-<time>.tar.enc`.

3. **Off-site copy.** Artifacts live in GitHub. Once a month, download one
   and keep it somewhere else (an external drive, another cloud).

Manual backup from your machine (needs `pg_dump` 17 or newer to match Supabase):

```bash
DATABASE_URL='postgresql://…' BACKUP_PASSPHRASE='…' scripts/backup/backup-db.sh backups
NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/backup/backup-storage.mjs backups/storage
```

## 3. Practise a restore (every 3 months)

A backup you haven't restored is a hope, not a backup.

1. Create a new, empty Supabase project ("shopverse-drill").
2. `npx supabase link --project-ref <drill ref>` then `npx supabase db push`.
3. Download last night's artifact, then run
   `DATABASE_URL='<drill session pooler>' BACKUP_PASSPHRASE='…' scripts/backup/restore-db.sh shopverse-<time>.tar.enc`.
   It ends with "Every table has the same number of rows as when it was backed up."
4. Point a local copy of the app at the drill project (`.env.local`), sign in
   with a real account (the sign-in code is emailed as usual) and open a few
   orders, products and a storefront.
5. Delete the drill project. Note the date and how long it took.

## 4. Disaster: the database is lost or badly damaged

1. **Stop writes.** Pause the shops (or the whole deployment) so nothing is
   written to a database you're about to replace.
2. **Pick the restore point.**
   - Supabase PITR or daily backup available → restore it in the Supabase
     dashboard (Database → Backups). That restores files too; skip to step 5.
   - Otherwise use the newest artifact from the Backup workflow.
3. **New project:** create it, `npx supabase db push` (all migrations), then
   `scripts/backup/restore-db.sh` as in section 3. The script refuses a
   database that already has businesses (use `FORCE=1` only if you know why).
4. **Images:** `node scripts/backup/restore-storage.mjs <unpacked storage folder>`
   (decrypt with `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in storage-….tar.enc -pass env:BACKUP_PASSPHRASE | tar -x`).
   In Storage, create the `product-images` bucket as public if `db push` didn't.
5. **Reconnect the app:** update `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`, set the
   auth URLs and email templates as in the README, keep the **same**
   `PAYMENTS_ENCRYPTION_KEY`, and redeploy.
6. **Check:** `/admin` overview numbers look right, a test shop loads, a test
   order can be placed, `/admin/jobs` is empty or draining.
7. **Tell businesses** what happened and the time window that was lost.
   Orders paid online in that window are still in Stripe: compare Stripe's
   payments with the restored orders.

## 5. Other incidents

**Someone deleted or changed data by mistake (one business).** Don't restore
the whole database over newer data. Restore a backup into a scratch project
(section 3), then copy just the rows you need across with SQL. The audit log
(`/app/<business>/team` → Audit log) shows who changed what and when.

**A bad deployment.** Roll back in your host (Vercel: Deployments → the
previous one → Promote). If the deployment ran a migration that damaged data,
treat it as section 4 or the case above; migrations are not undone by a code
rollback.

**Emails, WhatsApp messages or payments not going out.** Open `/admin/jobs`.

- Many _waiting_ jobs and nothing running: the worker isn't being called. Check
  that the **Job worker** workflow runs (or call `POST /api/cron/jobs` with the
  `CRON_SECRET`).
- Jobs _retrying_ or _failed_: the last error says why (SMTP login, Twilio
  credentials, Stripe key). Fix the setting, then press **Retry**.

**Errors.** `/admin/errors` lists them grouped by cause, with the request id
(also in the response's `x-request-id` header and the server logs). Mark a group
resolved once fixed; it reopens if it happens again. With `SENTRY_DSN` set they
also go to Sentry.

**Someone hammering the site.** The proxy limits each address (sign-in and
checkout 20 a minute, token pages 30, actions 120, pages 600). Offenders get
`429`. With several servers, set `UPSTASH_REDIS_REST_URL`/`TOKEN` so limits are
shared. For a real attack, turn on your host's firewall or DDoS protection.

**A secret leaked.**

- `SUPABASE_SECRET_KEY`: Supabase → API keys → create a new secret key, deploy
  it, delete the old one.
- Stripe/Twilio keys of a business: they roll them at the provider and enter
  the new ones in Payments / WhatsApp & SMS.
- `PAYMENTS_ENCRYPTION_KEY`: set a new one and ask every business to re-enter
  their Stripe and Twilio keys (the old ciphertexts can't be read any more).
- `CRON_SECRET`: change it in the app and in the GitHub secrets.

## 6. Routine checks

- **Weekly:** `/admin/errors` (anything new?), `/admin/jobs` (nothing failed?),
  last night's Backup run is green.
- **Monthly:** keep one backup off GitHub; check Supabase usage limits.
- **Quarterly:** restore drill (section 3); `npm run audit:a11y` against production.
