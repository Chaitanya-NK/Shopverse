# Shopverse

Multi-shop commerce SaaS for businesses that sell **anything**: clothing, electronics, kitchenware, groceries, beauty, books and more. It runs many storefronts with shared inventory across warehouses, delivery tracking and email-OTP security.

**Stack:** Next.js 16 (App Router, Cache Components, Server Actions) · React 19 · TypeScript (strict) · Supabase (Postgres, Auth, RLS, Storage) · shadcn/ui + Tailwind CSS 4 · Zod 4 · React Hook Form · Vitest

## Status: Phase 14 (hardening)

| Area            | What's in place                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth            | Email OTP sign-up and sign-in (6-digit code, 10-minute expiry, resend cooldown), no passwords, no account enumeration, open-redirect protection                                                                                                                                                                                                                                                                                                                                                                        |
| Tenancy         | Organisations → shops and warehouses, roles (owner, admin, manager, staff, support), per-shop access for restricted staff                                                                                                                                                                                                                                                                                                                                                                                              |
| Onboarding      | One transaction creates the organisation, owner membership, first shop, first warehouse and the audit entries                                                                                                                                                                                                                                                                                                                                                                                                          |
| App shell       | Collapsible sidebar, workspace switcher, user menu, shop switcher (`?shop=` in the URL), dark mode                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Dashboard       | Live stats from a single RLS-aware RPC, shops table, setup checklist                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Shops           | List and create, with field-level conflict errors                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Categories      | Multi-industry category tree; add, edit and delete categories and their fields (typed, with options, units, required, "creates variants")                                                                                                                                                                                                                                                                                                                                                                              |
| Products        | Searchable, filterable list; a form generated from the category's fields; variant matrix (e.g. Storage × Colour) with SKUs and prices; publish to shops                                                                                                                                                                                                                                                                                                                                                                |
| Inventory       | Receive, remove and transfer stock by quantity, serial/IMEI (scan to pick) or batch with expiry (FEFO); reorder points and low-stock alerts; movement history                                                                                                                                                                                                                                                                                                                                                          |
| Warehouses      | Create and edit, per-warehouse stock summary, which shops each one fulfils; inactive warehouses take in no new stock                                                                                                                                                                                                                                                                                                                                                                                                   |
| Orders          | Enter phone, WhatsApp and counter orders; live GST-inclusive totals; customers matched by email or phone; confirm (reserve stock), mark paid, cancel                                                                                                                                                                                                                                                                                                                                                                   |
| Routing         | Stock is reserved in one warehouse that can ship the whole order, or split across the shop's warehouses by priority                                                                                                                                                                                                                                                                                                                                                                                                    |
| Shipments       | Pack per warehouse (scan IMEIs; batches picked first-expiry-first-out); picked up → in transit → out for delivery → delivered; failed attempts, returns                                                                                                                                                                                                                                                                                                                                                                |
| Delivery        | 6-digit delivery OTP, shown once to staff and shareable on WhatsApp; stored only as a bcrypt hash; 24-hour expiry; locked after 5 wrong tries; COD auto-paid                                                                                                                                                                                                                                                                                                                                                           |
| Tracking        | Deliveries board by stage; a public tracking page per parcel (`/track/<token>`) with no personal details                                                                                                                                                                                                                                                                                                                                                                                                               |
| Storefront      | Each shop at `/s/<shop-handle>`: search, categories, sorting, product pages with variant pickers and live stock, cart; drafts are staff-only previews                                                                                                                                                                                                                                                                                                                                                                  |
| Checkout        | Cash on delivery confirmed by a 6-digit email code (hashed, 10-minute expiry, 5 tries, resend limits, per-email rate limit); shipping fee, free-shipping threshold and COD limit per shop                                                                                                                                                                                                                                                                                                                              |
| Customers       | Customer list with orders and spend; customer page with order history; verified-email badge; customer order page by private link                                                                                                                                                                                                                                                                                                                                                                                       |
| Team            | Invite by email (single-use link, 7-day expiry, token stored hashed), resend and revoke; change roles and shop access; remove members or leave; admins can't touch owners and nobody edits their own role                                                                                                                                                                                                                                                                                                              |
| Audit log       | Every change recorded by the database; filter by type, person and date; shows what changed in plain language                                                                                                                                                                                                                                                                                                                                                                                                           |
| Billing         | Plans billed monthly or yearly (two months free) through Shopverse's Stripe account (Stripe Billing): checkout, upgrades at once, downgrades at renewal (only when usage fits), cancel at period end, failed payments with a 7-day grace, a GST tax invoice for every charge; limits enforced in the database                                                                                                                                                                                                          |
| Admin           | Shopverse's own console at `/admin`: revenue and plan mix, every business with search and filters, usage, subscriptions and invoices, extend trials and set plans by hand (audited)                                                                                                                                                                                                                                                                                                                                    |
| Shoppers        | Shopper accounts separate from staff: email-code sign-in, orders with a progress tracker, wishlist, saved addresses, profile; one-click signed-in checkout; cancel before packing; buy again                                                                                                                                                                                                                                                                                                                           |
| Photos          | Up to 12 photos per product, resized to WebP (1600/480px) with metadata stripped; cover, reorder, alt text; gallery on product pages                                                                                                                                                                                                                                                                                                                                                                                   |
| Invoices        | GST tax invoices issued at dispatch, numbered per shop per financial year; CGST/SGST or IGST by place of supply; print or save as PDF                                                                                                                                                                                                                                                                                                                                                                                  |
| Emails          | Order confirmed, shipped, out for delivery (with the delivery code), missed delivery, delivered, cancelled; shops can turn them off                                                                                                                                                                                                                                                                                                                                                                                    |
| Shop pages      | Shipping/returns/privacy/terms pages, contact page, footer; price and in-stock filters; Open Graph, product JSON-LD, sitemap and robots.txt                                                                                                                                                                                                                                                                                                                                                                            |
| Payments        | Each business connects its own Stripe account (keys encrypted); Stripe Checkout for cards and more; stock held 30 min; webhook; automatic refunds on cancel                                                                                                                                                                                                                                                                                                                                                            |
| Discounts       | Codes and automatic offers (percent with cap, amount, free delivery), minimum order, dates, overall and per-customer limits, first order only, per shop; GST on the discounted price; announcement bar                                                                                                                                                                                                                                                                                                                 |
| Analytics       | Sales, orders, average order and customers against the previous period; sales by day (chart or table); top products, payment methods, states and shops; India time; owners, admins and managers                                                                                                                                                                                                                                                                                                                        |
| GST             | Monthly B2C summary by place of supply and rate, HSN summary, invoice register, built from the issued invoices; CSV exports of orders, customers and stock (safe against spreadsheet formulas)                                                                                                                                                                                                                                                                                                                         |
| Returns         | Shoppers ask to return or exchange delivered items within the shop's window (categories can be non-returnable); approve or decline, pickup, receive back into stock (serials and batches too), refunds to the original payment or recorded UPI/bank/cash refunds, replacement orders for exchanges; undelivered parcels handled automatically                                                                                                                                                                          |
| Credit notes    | Numbered GST credit notes against the invoice for every return, printable by staff and shoppers, netted off the monthly GST report                                                                                                                                                                                                                                                                                                                                                                                     |
| Catalogue       | CSV import (preview first; new products and updates matched by handle and SKU, blank cells keep values) and export; photos per variant; collections with their own pages and homepage rows; typo-tolerant search and SKU lookup                                                                                                                                                                                                                                                                                        |
| Reviews         | Star ratings and reviews from customers who received the product (verified-buyer badge), ratings on product cards and in search results, public replies and hiding by staff; related products                                                                                                                                                                                                                                                                                                                          |
| Purchasing      | Suppliers, purchase orders (draft, place and email to the supplier, print), receiving in parts straight into stock with serials or batches, latest cost recorded, reorder suggestions from low stock                                                                                                                                                                                                                                                                                                                   |
| Alerts          | Low-stock emails as soon as an item reaches its reorder point, and a daily digest (yesterday's sales, orders to pack, returns, low stock, deliveries due) at the hour you choose                                                                                                                                                                                                                                                                                                                                       |
| Shipping        | Courier booking from the order (rates by PIN-code zone and weight, AWB, cash to collect), tracking scans move the parcel and complete delivery; 4×6 shipping labels and packing slips; a built-in test courier                                                                                                                                                                                                                                                                                                         |
| Labels          | Barcode labels on A4 sheets or a label roll (EAN-13 or Code 128), from any products or straight from a received purchase order                                                                                                                                                                                                                                                                                                                                                                                         |
| Brand           | Per-shop colour (contrast-checked, text flips between white and black), logo used in the header, tab and app icon, up to 5 homepage banners with headline and link                                                                                                                                                                                                                                                                                                                                                     |
| Domains         | Shops on their own domain (e.g. shop.example.in), verified by a DNS TXT record; links, sitemap and cookies follow the domain; staff pages never served there                                                                                                                                                                                                                                                                                                                                                           |
| Messaging       | WhatsApp or SMS order updates through each business's Twilio account (keys encrypted), only for shoppers who opt in at checkout; test message and a log                                                                                                                                                                                                                                                                                                                                                                |
| Cart reminders  | One email to shoppers who leave without ordering (1–24 h later, optional discount code), a link back to their cart, one-click opt-out, recovered sales on **Marketing**                                                                                                                                                                                                                                                                                                                                                |
| Installable     | Each shop is an installable app (manifest, icons from the logo, service worker with an offline page); the staff app installs too                                                                                                                                                                                                                                                                                                                                                                                       |
| Design          | Each shop lays out its own storefront in a full-screen editor with a live preview: 23 section types (slideshow, hero, product lists, collections, category tiles, image with text, video, gallery, FAQ, reviews, promises, countdown, newsletter, our story, stores, social grid…) on every page layout (home, all products, collection, product, cart) and on its own pages; header and footer layouts and menus; fonts, corners, cards, grid and width; four starting layouts; drafts with undo, preview and publish |
| Background jobs | Emails, WhatsApp/SMS messages, stock alerts and Stripe webhooks run from a job queue in the database: retries with back-off, duplicates collapsed, failures visible and retryable in `/admin/jobs`; webhooks answer Stripe at once                                                                                                                                                                                                                                                                                     |
| Reliability     | Rate limits per address in the proxy (sign-in and checkout, private links, actions, pages; shared through Upstash Redis when configured), errors grouped and stored in `/admin/errors` with request ids, optional Sentry and OpenTelemetry tracing, nightly encrypted backups with a tested restore and a [runbook](docs/RUNBOOK.md)                                                                                                                                                                                   |
| Languages       | Storefront in English or Hindi (हिन्दी): pages, cart, checkout, account, order emails and WhatsApp messages; each shop picks its default and shoppers can switch; staff pages stay in English                                                                                                                                                                                                                                                                                                                          |
| Accessibility   | axe-core audit (WCAG 2.2 AA) of every main storefront, shopper-account, staff and admin page in light and dark mode, plus keyboard checks, run in CI; skip link, labelled controls                                                                                                                                                                                                                                                                                                                                     |
| Quality         | Strict TypeScript, ESLint and Prettier, 296 unit tests, 14 end-to-end tests (Playwright), nineteen SQL test suites (RLS, stock, order flow, storefront and checkout, team and billing, shopper accounts, photos, invoices, payments, discounts, analytics, returns, platform billing, catalogue tools, operations, brand and reach, storefront design, hardening, customer matching), CI, commit hooks                                                                                                                 |

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

Payments run on **Stripe** in test mode: sign up at [stripe.com](https://stripe.com) (any country) and you get test keys straight away, with no documents or business verification. No real money moves; pay with Stripe's test card `4242 4242 4242 4242`, any future expiry date and any CVC.

1. **Server key.** Add `PAYMENTS_ENCRYPTION_KEY` to `.env.local` (`openssl rand -base64 32`). Each business's Stripe keys are encrypted with it before they're stored, so keep it secret and don't change it later.
2. **Migrations.** Run `npx supabase db push`.
3. **Connect Stripe.** In **Payments**, paste your Stripe **test secret key** (`sk_test_…`, from Stripe → Developers → API keys). It's checked with Stripe before it's saved.
4. **Shops.** Each shop's settings has **Ways to pay** (online, cash on delivery).
5. **Webhook (optional for testing).** Shoppers go to Stripe's payment page and come back to their order, which is confirmed from Stripe's own record of the payment, so testing works without a webhook. The webhook also confirms payments when a shopper closes the tab. Stripe needs to reach your app: in a Codespace, use the [Stripe CLI](https://docs.stripe.com/stripe-cli) (`stripe listen --forward-to localhost:3000/api/webhooks/stripe/<organization id>`, using the URL shown on the Payments page) and paste the `whsec_…` it prints. When deployed, add an endpoint for that URL in Stripe → Developers → Webhooks with the events listed on the Payments page.

`NEXT_PUBLIC_APP_URL` must be the address you open the app at (your Codespace URL, for example), because Stripe sends shoppers back there. Online orders hold stock for 30 minutes. Unpaid ones are cancelled the next time someone tries to pay, or every 5 minutes if `pg_cron` is enabled (Supabase → Database → Extensions) before you push. Cancelling a paid order refunds it automatically.

### Discounts (Phase 7)

Run `npx supabase db push` (migration 019). In **Discounts**, create codes (e.g. `WELCOME10`) or automatic offers. Shoppers enter codes in the cart or at checkout; one discount applies per order (a valid code, otherwise the best automatic offer). Limits are checked again when the order is placed. The **announcement bar** is in each shop's settings.

### Analytics and GST reports (Phase 8)

Run `npx supabase db push` (migration 020) and `npm install` (adds `recharts` for the charts). **Analytics** shows sales for a period with the change against the period before; **GST reports** summarises the invoices issued in a month for GSTR-1 (B2C by state and rate, HSN). Both download as CSV. Add HSN codes to products and a GSTIN to each shop so the reports are complete; the page lists what's missing.

### Returns and credit notes (Phase 9)

Run `npx supabase db push` (migration 021). Each shop's settings now has **Returns** (a window of 3–30 days after delivery, or no online returns, and whether to offer exchanges); mark categories such as food as not returnable in **Categories**. Shoppers ask from their order page once signed in; you work through requests in **Returns** (review, collect, settle). Receiving a return restocks it and issues a GST credit note. Orders paid online are refunded to the original payment (managers and above); for cash on delivery, pay the customer's UPI id and record the transaction id. A parcel returned to origin after its invoice was issued gets a credit note automatically, and a refund if it was prepaid.

### Shopverse billing and the admin console (Phase 10)

Run `npx supabase db push`. Plans are billed through **Shopverse's own** Stripe account with Stripe Billing (it can be the same test account you use for a shop):

1. Set `PLATFORM_STRIPE_SECRET_KEY` (`sk_test_…`). Stripe prices are created automatically the first time each plan is chosen.
2. For renewals, failed payments and cancellations to show up, add a webhook to `<your app>/api/webhooks/stripe/platform` with the events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` and `invoice.payment_failed`, and set its signing secret as `PLATFORM_STRIPE_WEBHOOK_SECRET` (or `stripe listen --forward-to localhost:3000/api/webhooks/stripe/platform`). The first checkout works without it.
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

### Operations (Phase 12)

Run `npx supabase db push` (migration 025). Then:

- **Purchasing** holds suppliers and purchase orders. Draft one (or start from the low-stock suggestions), place it (optionally emailing the supplier), and **Receive delivery** as goods arrive: quantities go straight into the warehouse's stock, with IMEIs or a batch code where the product needs them. **Barcode labels** on a received order prints labels for exactly what came in.
- **Alerts & shipping** (under Organisation) turns on low-stock emails and the daily digest, picks who gets them, and switches on a courier. Set reorder points per item in **Inventory**.
- **Scheduler.** Low-stock emails also go out right after stock changes. For the daily digest (and as a safety net), set `CRON_SECRET` and call `POST /api/cron/operations` with `Authorization: Bearer <CRON_SECRET>` every 15 minutes. `.github/workflows/operations-cron.yml` does this once you add the `APP_URL` and `CRON_SECRET` repository secrets.
- **Courier.** The built-in **Shopverse Test Courier** behaves like an Indian courier aggregator (PIN-code zones, weight slabs, COD fee, AWB numbers) but nothing is picked up: choose it, give each warehouse a PIN code and state, then **Book courier** on a packed parcel and press **Next scan** to move it to delivered. Real couriers (Shiprocket, Delhivery and so on) need their own accounts and plug into `src/lib/couriers`.
- Every parcel has a **Packing slip** and a 4 × 6 inch **Shipping label** to print.

### Brand & reach (Phase 13)

Run `npx supabase db push` (migration 026). Then:

- **Shops → a shop → Brand** sets the colour, logo and homepage banners. The preview shows the contrast; buttons stay readable whichever colour you pick.
- **Shops → a shop → Domain** connects your own domain. Add the TXT record it shows at `_shopverse.<your-domain>`, point the domain (CNAME or A record) at wherever Shopverse is hosted and add it to that host (on Vercel: Project → Domains), then press **Verify**. The shop must be live. Locally, add `127.0.0.1 shop.test` to `/etc/hosts`, set `DEV_EXTRA_HOSTS=shop.test,shop.test:3000`, and mark the domain verified with `select mark_shop_domain_verified('<shop id>', 'shop.test');` in the SQL editor (DNS can't be checked for a made-up domain).
- **WhatsApp & SMS** (under Organisation) takes a Twilio Account SID, auth token and sender. For free testing use the Twilio WhatsApp sandbox (`whatsapp:+14155238886`, and join it from your phone first). Shoppers tick "Send me order updates on WhatsApp" at checkout. `TWILIO_API_URL` is only for pointing at a fake Twilio in tests.
- **Marketing** turns on cart reminders per shop. Reminders go out from the same scheduler as Phase 12 (`POST /api/cron/operations`), so set that up first.
- **Install the app:** in production, the shop's footer offers "Install app" (Chrome, Edge, Android); on iPhone use Share → Add to Home Screen. The service worker only runs in production builds (`npm run build && npm start`).

### Storefront design (Phase 13.5)

Run `npm install` (new fonts) and `npx supabase db push` (migration 027). Then open **Shops → a shop → Design**:

- **Sections** lists what's on the page you picked at the top (Home, All products & search, Collection pages, Product pages, Cart, or one of your own pages). Add sections, drag them into order, hide them, or click one (in the list or in the preview) to edit it. Each page layout keeps its own content (the product details, the cart…): it can be moved, not removed.
- **Header** sets the header layout, search, menu links and the footer (about text, menu, social links).
- **Style** picks fonts, corners, product cards, photo shape, products per row and page width, and has four starting layouts (Classic, Bold, Minimal, Catalogue). Colour and logo stay on the **Brand** tab.
- **Pages** makes your own pages (About us, Size guide…) at `/s/<shop>/pages/<address>`.
- Every change is saved as a draft that only your team sees (the preview, or "Preview in a new tab"). **Publish** shows it to shoppers; **Discard** goes back to what's live. Undo/redo: the arrows or Ctrl/⌘+Z.
- Shops you don't design keep the classic layout, including the banners from Phase 13 (which now live in a Slideshow section). Newsletter sign-ups appear under **Marketing**, with a CSV download.
- Checkout and account pages keep the standard layout (they still use your fonts, colours, header and footer), so paying and signing in always look the way shoppers expect.

### Hardening (Phase 14)

Run `npm install` (new packages) and `npx supabase db push` (migration 028). Then:

- **Job worker.** Emails, messages and webhooks now go through a queue. They are sent right after each request, and anything that failed is retried by `POST /api/cron/jobs` (same `CRON_SECRET` as operations). `.github/workflows/jobs-cron.yml` calls it every 5 minutes: add `APP_URL` and `CRON_SECRET` as repository secrets if you haven't already. `/admin/jobs` shows the queue.
- **Errors.** Server and browser errors appear in `/admin/errors`. Optional: `SENTRY_DSN` to send them to Sentry as well, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (and `OTEL_EXPORTER_OTLP_HEADERS`) for traces, `APP_RELEASE` to tag them with a version.
- **Rate limits** work out of the box on one server. With several servers (or serverless), set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (free Upstash database) so they're shared.
- **Backups.** Follow [docs/RUNBOOK.md](docs/RUNBOOK.md): add the backup secrets for `.github/workflows/backup.yml`, then practise a restore once.
- **Hindi.** **Shops → a shop → Settings → Storefront language** sets the default; shoppers switch in the footer. Text you write yourself (product names, sections) is shown as you wrote it.
- **Accessibility.** `npm run audit:a11y` runs the accessibility tests on their own; they're part of the end-to-end suite ([e2e/README.md](e2e/README.md)), which runs in CI.

## Scripts

| Command                                     | Purpose                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `npm run dev` / `dev:pretty`                | Dev server (`dev:pretty` formats the JSON logs)                    |
| `npm run check`                             | Typecheck, lint, format check and unit tests: run before pushing   |
| `npm run build`                             | Production build                                                   |
| `npm test` / `test:watch`                   | Unit tests (Vitest)                                                |
| `npm run db:start` / `db:stop` / `db:reset` | Local Supabase stack                                               |
| `npm run db:test`                           | SQL tests for RLS, tenancy and stock invariants (local stack)      |
| `npm run db:types`                          | Regenerate `src/types/database.types.ts` from the local DB         |
| `npm run db:migration <name>`               | Create a new migration file                                        |
| `npm run test:e2e`                          | End-to-end tests (Playwright, local Supabase): see `e2e/README.md` |
| `npm run audit:a11y`                        | Just the accessibility tests (axe, WCAG 2.2 AA, keyboard)          |
| `npm run backup:db`                         | Dump the database to an (optionally encrypted) archive             |

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
- **Phase 6 (done):** online payments with each business's own payment account, webhooks, automatic refunds (moved from Razorpay to Stripe after Phase 11)
- **Phase 7 (done) — Discounts & promotions:** coupon codes (percentage or flat, minimum order, cap, validity, usage limits overall and per customer, first order only, per shop), automatic offers, discounts applied server-side and spread across lines so GST invoices stay correct, an announcement bar and homepage banners
- **Phase 8 (done) — Analytics & reports:** sales dashboard (sales, orders, average order, customers vs the previous period, by day, top products, payment methods, states, shops, delivered/returned/cancelled), GST reports (B2C by state and rate, HSN summary, invoice register), CSV exports of orders, invoices, stock and customers
- **Phase 9 (done) — Returns & credit notes:** return and exchange requests within a window set by the shop, approval, reverse pickup, restocking on receipt, refunds (online to the original payment, COD by UPI), numbered GST credit notes, credit notes netted in the GST report
- **Phase 10 (done) — Shopverse billing & platform admin:** plan subscriptions (monthly or yearly, now on Stripe Billing), upgrades and downgrades, GST invoices to businesses, failed-payment grace period, a platform admin console (businesses, usage, plans)
- **Phase 11 (done) — Catalogue power tools:** CSV bulk import and export, photos per variant, collections, verified-buyer reviews and ratings, related products, typo-tolerant search
- **Stripe (done):** shop payments, refunds and Shopverse plans moved from Razorpay to Stripe (test mode needs no documents)
- **Phase 12 (done) — Operations:** suppliers and purchase orders, low-stock email alerts and a daily digest, courier integration (rates, AWB, labels, tracking updates, with a built-in test courier), packing slips and shipping labels, barcode labels
- **Phase 13 (done) — Brand & reach:** per-shop logo, colours and banners, custom domains, WhatsApp and SMS order updates, abandoned-cart reminders, installable app (PWA)
- **Phase 13.5 (done) — Storefront design:** section-based layouts for every storefront page, header and footer, fonts and style, starting layouts, custom pages, live preview with drafts and publishing, newsletter sign-ups
- **Phase 14 (done) — Hardening:** background job queue for emails and webhooks, edge rate limiting, error tracking and tracing, backup and recovery runbook, accessibility audit, Hindi interface
