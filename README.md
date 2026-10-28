# Shopverse

Multi-shop commerce SaaS for businesses that sell **anything**: clothing, electronics, kitchenware, groceries, beauty, books and more. It runs many storefronts with shared inventory across warehouses, delivery tracking and email-OTP security.

**Stack:** Next.js 16 (App Router, Cache Components, Server Actions) · React 19 · TypeScript (strict) · Supabase (Postgres, Auth, RLS, Storage) · shadcn/ui + Tailwind CSS 4 · Zod 4 · React Hook Form · Vitest

## Status: Phase 11 (catalogue power tools)

| Area         | What's in place                                                                                                                                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth         | Email OTP sign-up and sign-in (6-digit code, 10-minute expiry, resend cooldown), no passwords, no account enumeration, open-redirect protection                                                                                                                                                                                               |
| Tenancy      | Organisations → shops and warehouses, roles (owner, admin, manager, staff, support), per-shop access for restricted staff                                                                                                                                                                                                                     |
| Onboarding   | One transaction creates the organisation, owner membership, first shop, first warehouse and the audit entries                                                                                                                                                                                                                                 |
| App shell    | Collapsible sidebar, workspace switcher, user menu, shop switcher (`?shop=` in the URL), dark mode                                                                                                                                                                                                                                            |
| Dashboard    | Live stats from a single RLS-aware RPC, shops table, setup checklist                                                                                                                                                                                                                                                                          |
| Shops        | List and create, with field-level conflict errors                                                                                                                                                                                                                                                                                             |
| Categories   | Multi-industry category tree; add, edit and delete categories and their fields (typed, with options, units, required, "creates variants")                                                                                                                                                                                                     |
| Products     | Searchable, filterable list; a form generated from the category's fields; variant matrix (e.g. Storage × Colour) with SKUs and prices; publish to shops                                                                                                                                                                                       |
| Inventory    | Receive, remove and transfer stock by quantity, serial/IMEI (scan to pick) or batch with expiry (FEFO); reorder points and low-stock alerts; movement history                                                                                                                                                                                 |
| Warehouses   | Create and edit, per-warehouse stock summary, which shops each one fulfils; inactive warehouses take in no new stock                                                                                                                                                                                                                          |
| Orders       | Enter phone, WhatsApp and counter orders; live GST-inclusive totals; customers matched by email or phone; confirm (reserve stock), mark paid, cancel                                                                                                                                                                                          |
| Routing      | Stock is reserved in one warehouse that can ship the whole order, or split across the shop's warehouses by priority                                                                                                                                                                                                                           |
| Shipments    | Pack per warehouse (scan IMEIs; batches picked first-expiry-first-out); picked up → in transit → out for delivery → delivered; failed attempts, returns                                                                                                                                                                                       |
| Delivery     | 6-digit delivery OTP, shown once to staff and shareable on WhatsApp; stored only as a bcrypt hash; 24-hour expiry; locked after 5 wrong tries; COD auto-paid                                                                                                                                                                                  |
| Tracking     | Deliveries board by stage; a public tracking page per parcel (`/track/<token>`) with no personal details                                                                                                                                                                                                                                      |
| Storefront   | Each shop at `/s/<shop-handle>`: search, categories, sorting, product pages with variant pickers and live stock, cart; drafts are staff-only previews                                                                                                                                                                                         |
| Checkout     | Cash on delivery confirmed by a 6-digit email code (hashed, 10-minute expiry, 5 tries, resend limits, per-email rate limit); shipping fee, free-shipping threshold and COD limit per shop                                                                                                                                                     |
| Customers    | Customer list with orders and spend; customer page with order history; verified-email badge; customer order page by private link                                                                                                                                                                                                              |
| Team         | Invite by email (single-use link, 7-day expiry, token stored hashed), resend and revoke; change roles and shop access; remove members or leave; admins can't touch owners and nobody edits their own role                                                                                                                                     |
| Audit log    | Every change recorded by the database; filter by type, person and date; shows what changed in plain language                                                                                                                                                                                                                                  |
| Billing      | Plans billed monthly or yearly (two months free) through Shopverse's Razorpay account: checkout, upgrades at once, downgrades at renewal (only when usage fits), cancel at period end, failed payments with a 7-day grace, a GST tax invoice for every charge; limits enforced in the database                                                |
| Admin        | Shopverse's own console at `/admin`: revenue and plan mix, every business with search and filters, usage, subscriptions and invoices, extend trials and set plans by hand (audited)                                                                                                                                                           |
| Shoppers     | Shopper accounts separate from staff: email-code sign-in, orders with a progress tracker, wishlist, saved addresses, profile; one-click signed-in checkout; cancel before packing; buy again                                                                                                                                                  |
| Photos       | Up to 12 photos per product, resized to WebP (1600/480px) with metadata stripped; cover, reorder, alt text; gallery on product pages                                                                                                                                                                                                          |
| Invoices     | GST tax invoices issued at dispatch, numbered per shop per financial year; CGST/SGST or IGST by place of supply; print or save as PDF                                                                                                                                                                                                         |
| Emails       | Order confirmed, shipped, out for delivery (with the delivery code), missed delivery, delivered, cancelled; shops can turn them off                                                                                                                                                                                                           |
| Shop pages   | Shipping/returns/privacy/terms pages, contact page, footer; price and in-stock filters; Open Graph, product JSON-LD, sitemap and robots.txt                                                                                                                                                                                                   |
| Payments     | Each business connects its own Razorpay account (keys encrypted); UPI, cards, net banking at checkout; stock held 30 min; webhook; automatic refunds on cancel                                                                                                                                                                                |
| Discounts    | Codes and automatic offers (percent with cap, amount, free delivery), minimum order, dates, overall and per-customer limits, first order only, per shop; GST on the discounted price; announcement bar                                                                                                                                        |
| Analytics    | Sales, orders, average order and customers against the previous period; sales by day (chart or table); top products, payment methods, states and shops; India time; owners, admins and managers                                                                                                                                               |
| GST          | Monthly B2C summary by place of supply and rate, HSN summary, invoice register, built from the issued invoices; CSV exports of orders, customers and stock (safe against spreadsheet formulas)                                                                                                                                                |
| Returns      | Shoppers ask to return or exchange delivered items within the shop's window (categories can be non-returnable); approve or decline, pickup, receive back into stock (serials and batches too), refunds to the original payment or recorded UPI/bank/cash refunds, replacement orders for exchanges; undelivered parcels handled automatically |
| Credit notes | Numbered GST credit notes against the invoice for every return, printable by staff and shoppers, netted off the monthly GST report                                                                                                                                                                                                            |
| Catalogue    | CSV import (preview first; new products and updates matched by handle and SKU, blank cells keep values) and export; photos per variant; collections with their own pages and homepage rows; typo-tolerant search and SKU lookup                                                                                                               |
| Reviews      | Star ratings and reviews from customers who received the product (verified-buyer badge), ratings on product cards and in search results, public replies and hiding by staff; related products                                                                                                                                                 |
| Quality      | Strict TypeScript, ESLint and Prettier, 222 unit tests, fourteen SQL test suites (RLS, stock, order flow, storefront and checkout, team and billing, shopper accounts, photos, invoices, payments, discounts, analytics, returns, platform billing, catalogue tools), CI, commit hooks                                                        |

## Quick start in GitHub Codespaces

1. Push this folder to a GitHub repository (your personal account is fine).
2. **Code → Codespaces → Create codespace** (choose the 4-core machine). Dependencies install automatically.
3. Pick a database. Option A is the easiest:

### Option A: hosted Supabase (recommended)

1. Create a free project at [supabase.com](https://supabase.com).
2. In a terminal in the codespace:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push            # applies supabase/migrations
   ```
3. **Set up email sending (custom SMTP).** Supabase's built-in sender only emails your own team members, allows about 2 emails per hour, and won't let you edit templates. Brevo's free plan (300 emails/day, no domain needed) works well:
   1. Sign up at [brevo.com](https://www.brevo.com). Under **Senders, Domains & Dedicated IPs → Senders**, add and verify the address emails should come from (your Gmail works for testing).
   2. Under **SMTP & API → SMTP**, generate an **SMTP key** (not an API key) and note the _Login_ shown there.
   3. In Supabase, go to **Authentication → Emails → SMTP Settings** and turn on **Enable custom SMTP**:

      | Field        | Value                             |
      | ------------ | --------------------------------- |
      | Sender email | the address you verified in Brevo |
      | Sender name  | `Shopverse`                       |
      | Host         | `smtp-relay.brevo.com`            |
      | Port         | `587`                             |
      | Username     | the SMTP _Login_ from Brevo       |
      | Password     | the SMTP key                      |

   4. **Authentication → Rate Limits:** raise _emails per hour_ if you need more than the default 30.
4. **Email templates** (editable once SMTP is on). Under **Authentication → Emails → Templates**, open **Magic Link** and **Confirm signup**. Set the subject to _Your Shopverse sign-in code_, and replace the body with the contents of `supabase/templates/otp.html`. The email then shows the 6-digit code **and** a one-click sign-in button.
5. **Authentication → Providers → Email:** set _Email OTP Length_ to 6 and _Email OTP Expiration_ to 600 seconds.
6. **Authentication → URL Configuration:** set _Site URL_ to your app URL (`https://<codespace>-3000.app.github.dev`), and add `https://*.app.github.dev/**` and `http://localhost:3000/**` to _Redirect URLs_.
7. Copy **Project URL** and **Publishable key** (Project Settings → API Keys) into `.env.local`, and set `NEXT_PUBLIC_APP_URL` to the same URL as the Site URL.

> **Before SMTP is set up**, sign-in still works for your own (team-member) email. The default email contains a link instead of a code; clicking it signs you in via `/auth/confirm`. Open it in the same browser you requested it from.

### Option B: local Supabase in Docker

```bash
npm run db:start      # starts Postgres, Auth, Studio and Mailpit; applies migrations
```

Copy the printed _API URL_ and _Publishable key_ into `.env.local`. OTP emails appear in Mailpit on port 54324 (open it from the Ports tab).

### Run the app

```bash
npm run dev
```

Open port 3000 from the **Ports** tab, then create an account, read the code from your inbox (or Mailpit) and finish onboarding.

### Open your storefront (Phase 4)

1. **Server secret key.** Checkout runs with Supabase's secret key on the server (it handles one-time codes). In Supabase, open **Project Settings → API Keys → Secret keys**, create one, and add it to `.env.local` as `SUPABASE_SECRET_KEY`. Never prefix it with `NEXT_PUBLIC_`.
2. **Email for shoppers.** Add the same Brevo SMTP details you gave Supabase:

   ```bash
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_USER=<Brevo SMTP login>
   SMTP_PASSWORD=<Brevo SMTP key>
   MAIL_FROM="Your Shop <the-address-you-verified@example.com>"
   ```

   In development, if these are missing, the checkout code is written to the terminal running `npm run dev` instead.

3. **Go live.** In **Shops**, open a shop's settings (gear icon), set **Storefront** to **Live**, and fill in the delivery fee, free-delivery threshold, COD limit and support contacts. Publish products to the shop from each product's **Sell in** box. The storefront is at `/s/<shop-handle>` (the open-in-new-tab icon in Shops).

### Invite your team (Phase 5)

Open **Team & security → Invite**. With SMTP set up (above) the invitation is emailed; either way you get a link to copy and send yourself. The person opens it, signs up or signs in with the invited email, and joins with the role and shops you chose. **Billing** shows your plan and usage. Plan prices live in `src/config/plans.ts`; Shopverse's own plan billing isn't automated yet, so **Choose plan** emails a request to your support address.

### Storefront essentials (Phase 5.5)

After `git pull`, run `npx supabase db push` (migrations 014–017). It also creates the public `product-images` Storage bucket. Then, in **Shops → settings** (gear icon):

- **Business details**: registered name, GSTIN and address. These are printed on invoices; leave GSTIN blank if you aren't registered. Invoices are issued when a parcel is picked up.
- **Policy pages**: write your shipping, returns, privacy and terms text; each appears in the footer once filled in.
- **Email customers about their orders** is on by default and uses the SMTP settings above. Without SMTP, development prints emails in the terminal.

Add photos from a product's **Photos** tab. Set `NEXT_PUBLIC_APP_URL` to your real public URL so links in emails, share previews and sitemaps point to it.

### Take online payments (Phase 6)

1. **Server key.** Add `PAYMENTS_ENCRYPTION_KEY` to `.env.local` (`openssl rand -base64 32`). Each business's Razorpay secrets are encrypted with it before they're stored, so keep it secret and don't change it later.
2. **Migrations.** Run `npx supabase db push` (migrations 018 and 018b).
3. **Connect Razorpay.** In **Payments**, paste your Razorpay **test** key id and secret (Razorpay Dashboard → Account & Settings → API Keys). They're checked with Razorpay before they're saved.
4. **Webhook.** In Razorpay → Webhooks, add the URL shown on the Payments page with the events `payment.captured`, `payment.failed` and `order.paid`, and paste the same secret into Payments. Razorpay needs a public HTTPS URL, so set `NEXT_PUBLIC_APP_URL` to your Codespace or deployed URL. Without the webhook, payments still work while the shopper stays on the page.
5. **Shops.** Each shop's settings has **Ways to pay** (online, cash on delivery).

Online orders hold stock for 30 minutes. Unpaid ones are cancelled the next time someone tries to pay, or every 5 minutes if `pg_cron` is enabled (Supabase → Database → Extensions) before you push. Cancelling a paid order refunds it automatically. Switch to live keys when you're ready.

### Discounts (Phase 7)

Run `npx supabase db push` (migration 019). In **Discounts**, create codes (e.g. `WELCOME10`) or automatic offers. Shoppers enter codes in the cart or at checkout; one discount applies per order (a valid code, otherwise the best automatic offer). Limits are checked again when the order is placed. The **announcement bar** is in each shop's settings.

### Analytics and GST reports (Phase 8)

Run `npx supabase db push` (migration 020) and `npm install` (adds `recharts` for the charts). **Analytics** shows sales for a period with the change against the period before; **GST reports** summarises the invoices issued in a month for GSTR-1 (B2C by state and rate, HSN). Both download as CSV. Add HSN codes to products and a GSTIN to each shop so the reports are complete; the page lists what's missing.

### Returns and credit notes (Phase 9)

Run `npx supabase db push` (migration 021). Each shop's settings now has **Returns** (a window of 3–30 days after delivery, or no online returns, and whether to offer exchanges); mark categories such as food as not returnable in **Categories**. Shoppers ask from their order page once signed in; you work through requests in **Returns** (review, collect, settle). Receiving a return restocks it and issues a GST credit note. Orders paid online are refunded to the original payment (managers and above); for cash on delivery, pay the customer's UPI id and record the transaction id. A parcel returned to origin after its invoice was issued gets a credit note automatically, and a refund if it was prepaid.

### Shopverse billing and the admin console (Phase 10)

Run `npx supabase db push` (migration 022). Plans are billed through **Shopverse's own** Razorpay account (separate from the accounts businesses connect for their shops):

1. In Razorpay, turn on Subscriptions and create API keys. Set `PLATFORM_RAZORPAY_KEY_ID` and `PLATFORM_RAZORPAY_KEY_SECRET`. Razorpay plans are created automatically the first time each plan is chosen.
2. Add a webhook to `<your app>/api/webhooks/razorpay/platform` with the `subscription.*` events and set the same secret as `PLATFORM_RAZORPAY_WEBHOOK_SECRET`.
3. Set Shopverse's invoice details: `PLATFORM_LEGAL_NAME`, `PLATFORM_GSTIN` and address. With a GSTIN, 18% GST is added to plan prices and every charge gets a tax invoice (CGST + SGST or IGST by the business's state).

Without the keys, Billing shows plans and asks owners to email a request, as before. To open the admin console at `/admin`, make yourself a platform admin in the Supabase SQL editor:

```sql
insert into private.platform_admins (user_id)
select id from auth.users where email = 'you@example.com';
```

This migration also closes a gap where owners and admins could change their organisation's plan through the API: only the name can be edited directly now.

### Catalogue power tools (Phase 11)

Run `npx supabase db push` (migration 023, which turns on the `pg_trgm` extension for typo-tolerant search). Then:

- **Products → CSV** exports every product, or opens **Import products**. The file has one row per variant; rows sharing a `handle` are one product. Existing handles are updated (blank cells keep their values, variants are matched by SKU, new SKUs are added), new handles are created. Variant options go in `option:<field>` columns and product details in `attribute:<field>` columns; separate several values with `|`. You see every problem before anything is saved. Stock is still received in **Inventory**.
- **Collections** groups products by hand, in your order, with a page at `/s/<shop>/c/<collection>`. Turn on "Show on the homepage" to add a row to the shop's front page.
- On a product's photos, **Shows option** links a photo to a variant, so choosing that option shows its photos first.
- Shoppers who received a product can rate and review it from the product page. **Reviews** lets owners, admins, managers and support staff reply in public or hide a review.

## Scripts

| Command                                     | Purpose                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `npm run dev` / `dev:pretty`                | Dev server (`dev:pretty` formats the JSON logs)                  |
| `npm run check`                             | Typecheck, lint, format check and unit tests: run before pushing |
| `npm run build`                             | Production build                                                 |
| `npm test` / `test:watch`                   | Unit tests (Vitest)                                              |
| `npm run db:start` / `db:stop` / `db:reset` | Local Supabase stack                                             |
| `npm run db:test`                           | SQL tests for RLS, tenancy and stock invariants (local stack)    |
| `npm run db:types`                          | Regenerate `src/types/database.types.ts` from the local DB       |
| `npm run db:migration <name>`               | Create a new migration file                                      |

## Project layout

```
src/
  app/                      Routes only: thin pages that compose features
    (auth)/                 sign-in, sign-up, verify
    onboarding/
    app/[orgSlug]/          Signed-in workspace (layout = sidebar shell)
  features/<feature>/       Vertical slices
    schemas.ts              Zod schemas: shared by forms and server actions
    actions.ts              "use server" mutations (via createAction)
    queries.ts              server-only reads (Data Access Layer)
    components/             Feature UI
    internal/               Private helpers (lint-enforced)
  components/ui/            shadcn/ui primitives
  components/app-shell/     Sidebar, switchers, user menu
  components/shared/        Cross-feature UI (page header, logo, …)
  lib/                      Framework glue: supabase clients, auth session,
                            action pipeline, errors, logger, utils
  config/                   Routes, navigation, site constants
  types/database.types.ts   Generated from the database schema
supabase/
  migrations/               Ordered, forward-only SQL migrations
  tests/                    SQL behaviour tests (RLS, invariants)
  templates/                Auth email templates (OTP)
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the design decisions and conventions.

## Roadmap

- **Phase 2 (done):** products and variants, category editor, inventory with serial/IMEI and batch/expiry tracking, transfers, reorder alerts, warehouses
- **Phase 3 (done):** orders, fulfilment routing, shipments and tracking, delivery OTP
- **Phase 4 (done):** storefront and checkout (COD OTP), customers
- **Phase 5 (done):** team invitations and roles UI, audit log viewer, billing (plans and limits)
- **Phase 5.5 (done):** shopper accounts, wishlist and address book, self-service cancel and reorder, product photos, GST invoices, order emails, policy pages, filters, SEO
- **Phase 6 (done):** online payments with each business's own Razorpay account, webhooks, automatic refunds
- **Phase 7 (done) — Discounts & promotions:** coupon codes (percentage or flat, minimum order, cap, validity, usage limits overall and per customer, first order only, per shop), automatic offers, discounts applied server-side and spread across lines so GST invoices stay correct, an announcement bar and homepage banners
- **Phase 8 (done) — Analytics & reports:** sales dashboard (sales, orders, average order, customers vs the previous period, by day, top products, payment methods, states, shops, delivered/returned/cancelled), GST reports (B2C by state and rate, HSN summary, invoice register), CSV exports of orders, invoices, stock and customers
- **Phase 9 (done) — Returns & credit notes:** return and exchange requests within a window set by the shop, approval, reverse pickup, restocking on receipt, refunds (online to the original payment, COD by UPI), numbered GST credit notes, credit notes netted in the GST report
- **Phase 10 (done) — Shopverse billing & platform admin:** plan subscriptions through Razorpay Subscriptions (monthly or yearly), upgrades and downgrades, GST invoices to businesses, failed-payment grace period, a platform admin console (businesses, usage, plans)
- **Phase 11 (done) — Catalogue power tools:** CSV bulk import and export, photos per variant, collections, verified-buyer reviews and ratings, related products, typo-tolerant search
- **Phase 12 — Operations:** suppliers and purchase orders, low-stock email alerts and a daily digest, courier integration (rates, AWB, labels, tracking updates), packing slips and shipping labels, barcode labels
- **Phase 13 — Brand & reach:** per-shop logo, colours and banners, custom domains, WhatsApp and SMS order updates, abandoned-cart reminders, installable app (PWA)
- **Phase 14 — Hardening:** background job queue for emails and webhooks, edge rate limiting, error tracking and tracing, backup and recovery runbook, accessibility audit, Hindi interface
