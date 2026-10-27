# Architecture & conventions

## Principles

1. **The database is the security boundary.** Every tenant-owned table has `organization_id` and Row Level Security. UI checks (`can()`) only decide what to show. Server code uses the signed-in user's Supabase client, so a bug in app code cannot read another tenant's data.
2. **Validate at every boundary.** Zod schemas in `features/*/schemas.ts` validate forms on the client and are re-run on the server in every action. RPC responses are parsed too.
3. **Vertical slices.** Each feature owns its schemas, actions, queries and components. Features import each other only through public modules; `internal/` is private (enforced by ESLint).
4. **Thin routes.** Files in `src/app` compose features and handle streaming; they hold no business logic.
5. **One way to do each thing.** One action pipeline, one error model, one URL map, one logger.

## Request flow

```
Browser ─▶ proxy.ts ──────────────▶ Server Component / Server Action
           refresh session cookie     │
           optimistic redirects       ├─ lib/auth/session.ts  getSessionUser() (verified JWT, per-request cache)
                                      ├─ features/*/queries.ts (server-only, RLS-bound client)
                                      └─ features/*/actions.ts via createAction()
                                              validate (Zod) → authenticate → handler → ActionResult
                                                                                     │
                                                         Postgres: RLS policies + SECURITY DEFINER RPCs
```

- `proxy.ts` (Next 16's name for middleware) only refreshes the session and redirects optimistically. It is never the authorisation layer.
- `getSessionUser()` uses `supabase.auth.getClaims()`, which verifies the JWT signature. `getSession()` is never trusted on the server.

## Server actions

All mutations use `createAction({ name, schema, handler })` from `lib/actions/create-action.ts`:

- Input is parsed with the Zod schema, and failures become field errors.
- Authentication is required unless `requireAuth: false` is set.
- The handler gets `{ supabase, user }`.
- Thrown `AppError`s become `{ ok: false, error: { code, message, fieldErrors } }`. Unknown errors are logged and returned as a generic message, so internals never leak.
- `redirect()` and `notFound()` pass through (`unstable_rethrow`).

On the client, `applyActionError(form, error)` maps field errors onto inputs and anything else into a form-level alert plus a toast.

## Rendering (Cache Components)

`cacheComponents` and `partialPrefetching` are enabled. Rules followed throughout:

- Anything that reads cookies, `params` or `searchParams` sits inside `<Suspense>` with a skeleton fallback, so each route ships an instant static shell (◐ in the build output).
- `lib/supabase/server.ts` calls `connection()` before creating the client. Supabase data is per-request, and the SDK reads the clock, which isn't allowed during prerendering.
- After a mutation, actions call `refresh()` (or `redirect()`).

## Database

| Migration                | Contents                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `…100_foundation`        | profiles, organizations, members, invitations, shops, warehouses, shop↔warehouse routing, audit log, RLS helpers, `create_organization()` |
| `…200_catalog_inventory` | products, variants, shop publishing, inventory levels, append-only stock ledger, `adjust_stock()`                                         |
| `…300_orders_fulfilment` | customers, orders (gap-free numbers per org), items, shipments, tracking events                                                           |
| `…400_dashboard_stats`   | `get_overview_stats()` (SECURITY INVOKER, so RLS applies)                                                                                 |

Key invariants, all covered by `supabase/tests/rls_and_invariants.test.sql`:

- Tenants are fully isolated. Cross-tenant reads return nothing, and cross-tenant writes and RPCs are rejected.
- Composite foreign keys `(organization_id, id)` make it impossible to link rows across tenants.
- Stock changes only through `adjust_stock()`. It locks the row, refuses to go below the reserved quantity and writes a ledger entry with the running balance. Clients may only edit `reorder_point` (column-level grant).
- The delivery OTP is stored only as a hash, and its column is not selectable by clients.
- An organisation always keeps at least one owner. Staff can't change roles, and only owners can grant ownership.
- Shop, warehouse and membership changes are audited by trigger, including which columns changed.
- RLS helper functions live in the unexposed `private` schema.

### Gotcha: `INSERT … RETURNING` and RLS

PostgREST's `.insert().select()` checks the new row against the table's **SELECT** policy. A STABLE function that looks the row up by id can't see a row still being inserted. Pass the row's own columns into the policy function instead, as `can_access_shop(organization_id, id)` does. There's a regression test for this.

### Making schema changes

```bash
npm run db:migration add_purchase_orders   # new file in supabase/migrations
# write SQL with RLS enabled and policies for every new table
npm run db:reset && npm run db:test        # apply and run the SQL tests
npm run db:types                           # regenerate TypeScript types
```

Migrations are forward-only. Never edit one that has been applied in a shared environment.

## Auth (email OTP)

- `requestSignInCode` uses `shouldCreateUser: false` and behaves the same whether or not the account exists (no enumeration). `requestSignUpCode` creates the account with the user's name in its metadata.
- The address being verified is kept in a short-lived httpOnly cookie, not in the URL, and the verify screen shows only a masked version.
- Codes are 6 digits, expire after 10 minutes and have a 30-second resend cooldown. Supabase also rate-limits sends and verification attempts, and 429s are shown as friendly messages.
- `?next=` return paths go through `safeReturnTo()` to block open redirects (unit tested).

## UI

- shadcn/ui ("new-york", Tailwind v4, Radix) everywhere. Add components with `npx shadcn@latest add <name>`.
- Forms: React Hook Form + `zodResolver` + shadcn `Field` components (`Controller` pattern).
- Theme tokens are in `src/app/globals.css`, with a deep-teal primary, ink sidebar, and `success` and `warning` tokens. Dark mode uses `next-themes`.
- Local changes to vendored primitives: `use-mobile` uses `useSyncExternalStore`, and `SidebarMenuSkeleton` widths are deterministic (pure render).

## Testing

| Layer                                 | Tool                 | Location               |
| ------------------------------------- | -------------------- | ---------------------- |
| Pure logic, schemas, security helpers | Vitest               | `src/**/*.test.ts`     |
| Database: RLS, invariants, RPCs       | SQL assertions       | `supabase/tests/*.sql` |
| End-to-end                            | Playwright (Phase 2) | `e2e/`                 |

## Observability

`lib/logger.ts` (pino) writes structured JSON with automatic redaction of email, token, phone and password fields. Server actions log rejections at `info` and unexpected failures at `error` with the action name.
