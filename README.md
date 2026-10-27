# Shopverse

Multi-shop commerce SaaS for businesses that sell **anything**: clothing, electronics, kitchenware, groceries, beauty, books and more. It runs many storefronts with shared inventory across warehouses, delivery tracking and email-OTP security.

**Stack:** Next.js 16 (App Router, Cache Components, Server Actions) · React 19 · TypeScript (strict) · Supabase (Postgres, Auth, RLS, Storage) · shadcn/ui + Tailwind CSS 4 · Zod 4 · React Hook Form · Vitest

## Status: Phase 5.5 (shopper accounts & storefront essentials)

| Area       | What's in place                                                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth       | Email OTP sign-up and sign-in (6-digit code, 10-minute expiry, resend cooldown), no passwords, no account enumeration, open-redirect protection                                                           |
| Tenancy    | Organisations → shops and warehouses, roles (owner, admin, manager, staff, support), per-shop access for restricted staff                                                                                 |
| Onboarding | One transaction creates the organisation, owner membership, first shop, first warehouse and the audit entries                                                                                             |
| App shell  | Collapsible sidebar, workspace switcher, user menu, shop switcher (`?shop=` in the URL), dark mode                                                                                                        |
| Dashboard  | Live stats from a single RLS-aware RPC, shops table, setup checklist                                                                                                                                      |
| Shops      | List and create, with field-level conflict errors                                                                                                                                                         |
| Categories | Multi-industry category tree; add, edit and delete categories and their fields (typed, with options, units, required, "creates variants")                                                                 |
| Products   | Searchable, filterable list; a form generated from the category's fields; variant matrix (e.g. Storage × Colour) with SKUs and prices; publish to shops                                                   |
| Inventory  | Receive, remove and transfer stock by quantity, serial/IMEI (scan to pick) or batch with expiry (FEFO); reorder points and low-stock alerts; movement history                                             |
| Warehouses | Create and edit, per-warehouse stock summary, which shops each one fulfils; inactive warehouses take in no new stock                                                                                      |
| Orders     | Enter phone, WhatsApp and counter orders; live GST-inclusive totals; customers matched by email or phone; confirm (reserve stock), mark paid, cancel                                                      |
| Routing    | Stock is reserved in one warehouse that can ship the whole order, or split across the shop's warehouses by priority                                                                                       |
| Shipments  | Pack per warehouse (scan IMEIs; batches picked first-expiry-first-out); picked up → in transit → out for delivery → delivered; failed attempts, returns                                                   |
| Delivery   | 6-digit delivery OTP, shown once to staff and shareable on WhatsApp; stored only as a bcrypt hash; 24-hour expiry; locked after 5 wrong tries; COD auto-paid                                              |
| Tracking   | Deliveries board by stage; a public tracking page per parcel (`/track/<token>`) with no personal details                                                                                                  |
| Storefront | Each shop at `/s/<shop-handle>`: search, categories, sorting, product pages with variant pickers and live stock, cart; drafts are staff-only previews                                                     |
| Checkout   | Cash on delivery confirmed by a 6-digit email code (hashed, 10-minute expiry, 5 tries, resend limits, per-email rate limit); shipping fee, free-shipping threshold and COD limit per shop                 |
| Customers  | Customer list with orders and spend; customer page with order history; verified-email badge; customer order page by private link                                                                          |
| Team       | Invite by email (single-use link, 7-day expiry, token stored hashed), resend and revoke; change roles and shop access; remove members or leave; admins can't touch owners and nobody edits their own role |
| Audit log  | Every change recorded by the database; filter by type, person and date; shows what changed in plain language                                                                                              |
| Billing    | Plans with usage meters (shops, seats incl. pending invites, products, warehouses), limits enforced in the database, trial countdown banner; upgrades by request                                          |
| Shoppers   | Shopper accounts separate from staff: email-code sign-in, orders with a progress tracker, wishlist, saved addresses, profile; one-click signed-in checkout; cancel before packing; buy again              |
| Photos     | Up to 12 photos per product, resized to WebP (1600/480px) with metadata stripped; cover, reorder, alt text; gallery on product pages                                                                      |
| Invoices   | GST tax invoices issued at dispatch, numbered per shop per financial year; CGST/SGST or IGST by place of supply; print or save as PDF                                                                     |
| Emails     | Order confirmed, shipped, out for delivery (with the delivery code), missed delivery, delivered, cancelled; shops can turn them off                                                                       |
| Shop pages | Shipping/returns/privacy/terms pages, contact page, footer; price and in-stock filters; Open Graph, product JSON-LD, sitemap and robots.txt                                                               |
| Quality    | Strict TypeScript, ESLint and Prettier, 160 unit tests, eight SQL test suites (RLS, stock, order flow, storefront and checkout, team and billing, shopper accounts, photos, invoices), CI, commit hooks   |

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

Open **Team & security → Invite**. With SMTP set up (above) the invitation is emailed; either way you get a link to copy and send yourself. The person opens it, signs up or signs in with the invited email, and joins with the role and shops you chose. **Billing** shows your plan and usage. Plan prices live in `src/config/plans.ts`; card payments aren't connected yet, so **Choose plan** emails a request to your support address.

### Storefront essentials (Phase 5.5)

After `git pull`, run `npx supabase db push` (migrations 014–017). It also creates the public `product-images` Storage bucket. Then, in **Shops → settings** (gear icon):

- **Business details**: registered name, GSTIN and address. These are printed on invoices; leave GSTIN blank if you aren't registered. Invoices are issued when a parcel is picked up.
- **Policy pages**: write your shipping, returns, privacy and terms text; each appears in the footer once filled in.
- **Email customers about their orders** is on by default and uses the SMTP settings above. Without SMTP, development prints emails in the terminal.

Add photos from a product's **Photos** tab. Set `NEXT_PUBLIC_APP_URL` to your real public URL so links in emails, share previews and sitemaps point to it.

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
- **Phase 5 (done):** team invitations and roles UI, audit log viewer, billing (plans and limits; online payments next)
- **Phase 5.5 (done):** shopper accounts, wishlist and address book, self-service cancel and reorder, product photos, GST invoices, order emails, policy pages, filters, SEO
- **Phase 6:** marketing (banners, discounts, loyalty), analytics, channel sync, super-admin
