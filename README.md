# Shopverse

Multi-shop commerce SaaS for businesses that sell **anything**: clothing, electronics, kitchenware, groceries, beauty, books and more. It runs many storefronts with shared inventory across warehouses, delivery tracking and email-OTP security.

**Stack:** Next.js 16 (App Router, Cache Components, Server Actions) · React 19 · TypeScript (strict) · Supabase (Postgres, Auth, RLS) · shadcn/ui + Tailwind CSS 4 · Zod 4 · React Hook Form · Vitest

## Status: Phase 1 (foundation)

| Area       | What's in place                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth       | Email OTP sign-up and sign-in (6-digit code, 10-minute expiry, resend cooldown), no passwords, no account enumeration, open-redirect protection |
| Tenancy    | Organisations → shops and warehouses, roles (owner, admin, manager, staff, support), per-shop access for restricted staff                       |
| Onboarding | One transaction creates the organisation, owner membership, first shop, first warehouse and the audit entries                                   |
| App shell  | Collapsible sidebar, workspace switcher, user menu, shop switcher (`?shop=` in the URL), dark mode                                              |
| Dashboard  | Live stats from a single RLS-aware RPC, shops table, setup checklist                                                                            |
| Shops      | List and create, with field-level conflict errors                                                                                               |
| Database   | Full schema for catalogue, inventory ledger, orders and shipments, ready for later phases                                                       |
| Quality    | Strict TypeScript, ESLint and Prettier, 60+ unit tests, a SQL test suite for RLS and invariants, CI, commit hooks                               |

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

- **Phase 2:** products and variants (forms generated from category attributes), category editor, inventory with serial/IMEI and batch/expiry tracking, transfers, reorder alerts, warehouses
- **Phase 3:** orders, fulfilment routing, shipments and tracking, delivery OTP
- **Phase 4:** storefront and checkout (COD OTP), customers
- **Phase 5:** team invitations and roles UI, audit log viewer, billing
- **Phase 6:** marketing (banners, discounts, loyalty), analytics, channel sync, super-admin
