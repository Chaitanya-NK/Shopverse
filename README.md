# Tradeloom

Multi-shop commerce SaaS: many storefronts, shared inventory across warehouses, delivery tracking, and email-OTP security, for brands that run more than one shop.

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
3. In the Supabase dashboard:
   - **Authentication → Email Templates → Magic Link**: replace the body with the contents of `supabase/templates/otp.html` (it renders `{{ .Token }}`, the 6-digit code). Do the same for **Confirm signup**.
   - **Authentication → Providers → Email**: set _Email OTP Length_ to 6 and _Email OTP Expiration_ to 600 seconds.
   - **Authentication → URL Configuration**: set _Site URL_ to your codespace URL (`https://<codespace>-3000.app.github.dev`).
4. Copy **Project URL** and **Publishable key** (Project Settings → API Keys) into `.env.local`.

> The built-in Supabase email sender only allows a few emails per hour. For real use, add your own SMTP provider under Authentication → SMTP Settings.

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

- **Phase 2:** products and variants, inventory (stock ledger UI, transfers, reorder alerts), warehouses
- **Phase 3:** orders, fulfilment routing, shipments and tracking, delivery OTP
- **Phase 4:** storefront and checkout (COD OTP), customers
- **Phase 5:** team invitations and roles UI, audit log viewer, billing
- **Phase 6:** marketing (banners, discounts, loyalty), analytics, channel sync, super-admin
