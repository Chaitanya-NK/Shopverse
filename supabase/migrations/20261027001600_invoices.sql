-- =============================================================================
-- Shopverse · Migration 016 · GST invoices and customer-facing order stage
--
--  * Order lines keep the product's HSN code as it was when ordered.
--  * An invoice is issued once, when the first parcel of an order ships (the
--    GST "time of supply" for goods), or when an order is completed without
--    one. Numbers run per shop per financial year: <PREFIX><YY><YY>-<00001>,
--    at most 16 characters as GST requires.
--  * The seller's details (legal name, GSTIN, address from shop settings) and
--    the buyer's are snapshotted on the order, so later edits never change an
--    issued invoice.
--  * order_invoice (staff) and storefront_invoice (server, for shoppers)
--    return the invoice; the app splits tax into CGST/SGST or IGST.
-- =============================================================================

alter table public.order_items add column hsn_code text;

update public.order_items oi
set hsn_code = p.hsn_code
from public.product_variants v
join public.products p on p.id = v.product_id
where v.id = oi.variant_id and oi.hsn_code is null;

create or replace function private.order_item_hsn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.hsn_code is null and new.variant_id is not null then
    select p.hsn_code into new.hsn_code
    from public.product_variants v join public.products p on p.id = v.product_id
    where v.id = new.variant_id;
  end if;
  return new;
end;
$$;

create trigger order_items_hsn
  before insert on public.order_items
  for each row execute function private.order_item_hsn();

alter table public.orders
  add column invoice_number  text,
  add column invoiced_at     timestamptz,
  add column invoice_details jsonb,
  add constraint orders_invoice_number_key unique (organization_id, invoice_number);

-- Indian financial year of a moment, e.g. 2026-10-27 -> '2627'.
create or replace function private.financial_year(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select lpad(((y - case when m < 4 then 1 else 0 end) % 100)::text, 2, '0')
      || lpad(((y - case when m < 4 then 1 else 0 end + 1) % 100)::text, 2, '0')
  from (select extract(year from p_at at time zone 'Asia/Kolkata')::int as y,
               extract(month from p_at at time zone 'Asia/Kolkata')::int as m) d;
$$;

-- Issue the invoice for an order if it doesn't have one. Idempotent.
create or replace function private.issue_invoice(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_shop  public.shops;
  v_fy    text;
  v_seq   bigint;
  v_addr  jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.invoice_number is not null or v_order.status = 'cancelled' then
    return;
  end if;
  select * into v_shop from public.shops where id = v_order.shop_id;

  v_fy := private.financial_year(now());
  v_seq := private.next_counter(v_order.organization_id, 'invoice:' || v_shop.id || ':' || v_fy);
  v_addr := coalesce(v_shop.settings -> 'business_address', '{}'::jsonb);

  update public.orders
  set invoice_number = v_shop.order_prefix || v_fy || '-' || lpad(v_seq::text, 5, '0'),
      invoiced_at = now(),
      invoice_details = jsonb_build_object(
        'seller', jsonb_build_object(
          'shop_name', v_shop.name,
          'legal_name', coalesce(nullif(v_shop.settings ->> 'legal_name', ''), v_shop.name),
          'gstin', nullif(v_shop.settings ->> 'gstin', ''),
          'line1', v_addr ->> 'line1',
          'city', v_addr ->> 'city',
          'state', v_addr ->> 'state',
          'postal_code', v_addr ->> 'postal_code',
          'email', v_shop.settings ->> 'support_email',
          'phone', v_shop.settings ->> 'support_phone'),
        'buyer', jsonb_build_object(
          'name', v_order.shipping_address ->> 'name',
          'phone', v_order.shipping_address ->> 'phone',
          'line1', v_order.shipping_address ->> 'line1',
          'line2', v_order.shipping_address ->> 'line2',
          'city', v_order.shipping_address ->> 'city',
          'state', v_order.shipping_address ->> 'state',
          'postal_code', v_order.shipping_address ->> 'postal_code'))
  where id = p_order_id;

  perform private.add_order_event(v_order.organization_id, p_order_id, 'invoice.issued',
    'Invoice ' || v_shop.order_prefix || v_fy || '-' || lpad(v_seq::text, 5, '0') || ' issued');
end;
$$;

create or replace function private.invoice_on_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('picked_up', 'in_transit', 'out_for_delivery', 'delivered')
     and old.status is distinct from new.status then
    perform private.issue_invoice(new.order_id);
  end if;
  return new;
end;
$$;

create trigger shipments_issue_invoice
  after update of status on public.shipments
  for each row execute function private.invoice_on_dispatch();

create or replace function private.invoice_on_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    perform private.issue_invoice(new.id);
  end if;
  return new;
end;
$$;

create trigger orders_issue_invoice
  after update of status on public.orders
  for each row execute function private.invoice_on_completion();

-- Correction to migration 014: fulfillment_status = 'fulfilled' means every
-- item has shipped, not that it arrived. Delivered is a completed order.
create or replace function private.order_stage(p_order public.orders)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_order.status = 'cancelled' then 'cancelled'
    when p_order.fulfillment_status = 'returned' then 'returned'
    when p_order.status = 'completed' then 'delivered'
    when exists (select 1 from public.shipments where order_id = p_order.id and status = 'out_for_delivery') then 'out_for_delivery'
    when exists (select 1 from public.shipments where order_id = p_order.id
                 and status in ('picked_up', 'in_transit', 'failed_attempt', 'delivered')) then 'shipped'
    when exists (select 1 from public.shipments where order_id = p_order.id and status = 'packed') then 'packed'
    when p_order.status = 'confirmed' then 'confirmed'
    else 'placed'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Reading an invoice
-- -----------------------------------------------------------------------------
create or replace function private.invoice_json(p_order public.orders, p_full_buyer boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_order.invoice_number is null then null else jsonb_build_object(
    'number', p_order.invoice_number,
    'issued_at', p_order.invoiced_at,
    'order_number', p_order.number,
    'placed_at', p_order.placed_at,
    'payment_method', p_order.payment_method,
    'payment_status', p_order.payment_status,
    'currency', p_order.currency,
    'seller', p_order.invoice_details -> 'seller',
    'buyer', case when p_full_buyer then p_order.invoice_details -> 'buyer'
                  else (p_order.invoice_details -> 'buyer') - 'phone' - 'line1' - 'line2' end,
    'subtotal', p_order.subtotal,
    'discount_total', p_order.discount_total,
    'shipping_total', p_order.shipping_total,
    'grand_total', p_order.grand_total,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
               'title', oi.title, 'sku', oi.sku, 'hsn_code', oi.hsn_code, 'quantity', oi.quantity,
               'unit_price', oi.unit_price, 'total', oi.total, 'gst_rate', oi.gst_rate, 'tax_amount', oi.tax_amount)
             order by oi.created_at)
             from public.order_items oi where oi.order_id = p_order.id), '[]'::jsonb)
  ) end;
$$;

create or replace function public.order_invoice(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  v_order := private.authorize_order(p_order_id, array['owner', 'admin', 'manager', 'staff', 'support']::public.org_role[]);
  return private.invoice_json(v_order, true);
end;
$$;

-- For the customer's own invoice page. The server decides whether to include
-- the street address and phone (only for the signed-in owner of the order).
create or replace function public.storefront_invoice(p_token text, p_full_buyer boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.invoice_json(o, p_full_buyer)
  from public.orders o
  where p_token ~ '^[0-9a-f]{32}$' and o.public_token = p_token;
$$;

-- The customer's order page gains the stage and whether an invoice exists.
create or replace function public.storefront_order(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'number', o.number,
    'placed_at', o.placed_at,
    'status', o.status,
    'stage', private.order_stage(o),
    'invoice_number', o.invoice_number,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'fulfillment_status', o.fulfillment_status,
    'currency', o.currency,
    'subtotal', o.subtotal,
    'discount_total', o.discount_total,
    'shipping_total', o.shipping_total,
    'tax_total', o.tax_total,
    'grand_total', o.grand_total,
    'ship_to', jsonb_build_object('name', o.shipping_address ->> 'name', 'city', o.shipping_address ->> 'city',
                                  'state', o.shipping_address ->> 'state', 'postal_code', o.shipping_address ->> 'postal_code'),
    'shop', jsonb_build_object('name', s.name, 'slug', s.slug, 'support_email', s.settings ->> 'support_email',
                               'support_phone', s.settings ->> 'support_phone'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('title', oi.title, 'quantity', oi.quantity,
                                                           'unit_price', oi.unit_price, 'total', oi.total,
                                                           'image', private.product_cover(v.product_id))
                                        order by oi.created_at)
                       from public.order_items oi
                       left join public.product_variants v on v.id = oi.variant_id
                       where oi.order_id = o.id), '[]'::jsonb),
    'shipments', coalesce((select jsonb_agg(jsonb_build_object('number', sh.number, 'status', sh.status,
                                                               'tracking_token', sh.tracking_token) order by sh.created_at)
                           from public.shipments sh where sh.order_id = o.id and sh.status <> 'cancelled'), '[]'::jsonb)
  )
  from public.orders o join public.shops s on s.id = o.shop_id
  where p_token ~ '^[0-9a-f]{32}$' and o.public_token = p_token;
$$;

revoke all on function private.order_item_hsn() from public;
revoke all on function private.financial_year(timestamptz) from public;
revoke all on function private.issue_invoice(uuid) from public;
revoke all on function private.invoice_on_dispatch() from public;
revoke all on function private.invoice_on_completion() from public;
revoke all on function private.invoice_json(public.orders, boolean) from public;

revoke all on function public.order_invoice(uuid) from public, anon;
grant execute on function public.order_invoice(uuid) to authenticated;
revoke all on function public.storefront_invoice(text, boolean) from public, anon, authenticated;
grant execute on function public.storefront_invoice(text, boolean) to service_role;
