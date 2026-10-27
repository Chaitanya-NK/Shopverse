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

## Multi-industry catalogue

Shopverse isn't tied to one kind of product. The catalogue is data-driven:

- **Industries** (`organizations.industries`): what a business sells. The list lives in `features/organizations/industries.ts` and the matching CHECK constraint. Each industry has a template in `private.industry_templates()`.
- **Categories** (`categories`): a tree per organisation (Industry › Category › optional sub-categories), seeded from the templates at onboarding or via `add_industries()`. Seeding is idempotent.
- **Attribute definitions** (`attribute_definitions`): the fields a category needs, typed (`text`, `number`, `boolean`, `select`, `multiselect`, `date`) with units, options and a required flag. `is_variant_option` marks the fields that generate SKUs: Size × Colour for clothing, Storage × Colour for phones, Capacity for cookware, Net weight for groceries.
- **Tracking mode** (`inventory_tracking`): `quantity` (count units), `serial` (each unit has a serial/IMEI, for phones, appliances and jewellery) or `batch` (lots with expiry, picked FEFO, for food and cosmetics). Products inherit it, plus HSN/GST defaults, from their category by trigger.
- Products store their detail values in `products.attributes` (jsonb object), and variant values in `product_variants.options`. Both are validated against the category's definitions twice: in TypeScript (`features/products/attribute-values.ts` builds a Zod schema from the definitions, shared by the form and the server action) and in Postgres (`private.validate_attribute_values()` triggers).
- A field's key, type and variant role are fixed once it exists; option values still used by products can't be removed; a category holding products can't be deleted (migration 008 guards).
- Products are created and edited through `create_product()` / `update_product()` so the product, its variants and its shop listings change atomically. Removed variants are deactivated, not deleted, so their stock history survives.

## Inventory

- Every stock change goes through a database function that locks the level row and writes the ledger: `receive_stock()`, `remove_stock()`, `transfer_stock()` (both legs share a transfer id). `adjust_stock()` remains for quantity-tracked items.
- **Serial** products: each unit is a row in `inventory_serials` (unique per organisation). Receiving takes the list of serials; removing or transferring takes the exact serials, which must be in stock at the source.
- **Batch** products: `inventory_batches` holds per-lot quantity and expiry. The UI offers batches in FEFO order (first expiry first out).
- Inactive warehouses take in no new stock (a trigger on `stock_movements`), but customer returns are still accepted.
- Low stock = `available <= reorder_point` per variant and warehouse; managers edit reorder points inline.

## Orders, shipments and delivery

- Order tables are **read-only to clients**. Every change goes through a function (migration 010) so totals, reservations and stock can't drift: `create_order`, `confirm_order`, `cancel_order`, `mark_order_paid`, `create_shipment`, `update_shipment_status`, `confirm_delivery`. Only `orders.notes` is directly editable.
- Prices are GST-inclusive. `create_order` stores each line's GST rate (product, else category) and the tax contained in the line; `features/orders/totals.ts` mirrors the arithmetic for the live preview, and a unit test pins both to the same numbers.
- **Routing** (`private.route_order`): reserve everything in the first warehouse (by the shop's priority) that has every line in stock; otherwise split each line across warehouses in priority order. Reservations live in `order_allocations` and `inventory_levels.reserved`.
- **Shipping** consumes a reservation: release it, then take stock out as a `sale` movement. Serial items must name exact in-stock units; batch items are picked FEFO, skipping expired batches, and the shipment records which batches left.
- **Status rules** are enforced in the database (`packed → picked_up → in_transit → out_for_delivery → delivered`, plus `failed_attempt`, `returned_to_origin`, `cancelled`). A parcel cancelled before pickup goes back on the shelf and is re-reserved for the order; a returned parcel comes back as a `return`.
- **Delivery OTP:** going out for delivery creates a 6-digit code from `gen_random_bytes`, stores only its bcrypt hash (unreadable to clients via column grants) and returns the code once. `confirm_delivery` counts wrong attempts without raising (so the count persists) and locks after five. When the last live parcel is delivered the order completes, and COD orders are marked paid.
- **Public tracking:** each shipment has a 128-bit random `tracking_token`. `get_tracking(token)` (granted to `anon`) returns the journey, items and destination city only.

Adding a new industry means one entry in `INDUSTRIES`, the CHECK constraint, `industry_templates()` and `industry_label()`, all in a new migration.

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
- Every email carries both the code and a one-click link. `/auth/confirm` accepts our template's `token_hash` link (works in any browser) and the default template's PKCE `code` link (same browser only). Invalid or expired links go back to sign-in with a clear message.
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
