-- =============================================================================
-- Shopverse · Migration 021 · Returns, exchanges and GST credit notes
--
--  * Shoppers ask to return delivered items within the shop's window (7 days
--    unless the shop sets another; 0 turns returns off). Categories can be
--    marked non-returnable. Staff can also start a return for any order.
--  * requested → approved (or rejected) → picked up → received → completed.
--    Shoppers can withdraw a request until it's picked up.
--  * On receipt, items go back into the warehouse they shipped from (serials
--    and batches included) unless staff mark them damaged, and a numbered GST
--    credit note is issued against the invoice.
--  * Refunds: online payments are refunded through the payment provider by the
--    app (planned and recorded here, reconciled by return id); cash on delivery
--    is refunded by UPI or another way and recorded by a manager.
--  * Exchanges: a replacement order for another variant of the same product,
--    at the price originally paid, settled against the credit note.
--  * A parcel returned to origin after its invoice was issued gets the same
--    treatment automatically: a credit note, and a refund if it was prepaid.
-- =============================================================================

create type public.return_status as enum (
  'requested', 'approved', 'picked_up', 'received', 'completed', 'rejected', 'cancelled'
);

alter table public.categories add column returnable boolean not null default true;

alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders add constraint orders_source_check check (source in ('admin', 'storefront', 'exchange'));

create table public.returns (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  shop_id             uuid not null,
  order_id            uuid not null,
  number              text not null,
  source              text not null default 'customer' check (source in ('customer', 'staff', 'rto')),
  status              public.return_status not null default 'requested',
  resolution          text not null check (resolution in ('refund', 'exchange')),
  reason              text not null check (reason in ('damaged', 'wrong_item', 'size_fit', 'not_as_described',
                                                      'changed_mind', 'undelivered', 'other')),
  note                text check (char_length(note) <= 1000),
  -- Where a cash-on-delivery refund goes (shopper's UPI id).
  refund_upi          text check (refund_upi is null or refund_upi ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z]{2,64}$'),
  staff_note          text check (char_length(staff_note) <= 500),
  -- Value credited back (items after discount, plus delivery when it's refunded). Set on receipt.
  credit_total        numeric(12, 2) not null default 0 check (credit_total >= 0),
  shipping_credit     numeric(12, 2) not null default 0 check (shipping_credit >= 0),
  -- Money to give back, and what has gone back so far.
  refund_amount       numeric(12, 2) not null default 0 check (refund_amount >= 0),
  refunded_amount     numeric(12, 2) not null default 0 check (refunded_amount >= 0),
  refund_status       text check (refund_status in ('due', 'processing', 'refunded', 'failed', 'not_needed')),
  refund_method       text check (refund_method in ('original', 'upi', 'bank', 'cash')),
  refund_reference    text check (char_length(refund_reference) <= 120),
  refund_error        text check (char_length(refund_error) <= 500),
  refund_started_at   timestamptz,
  credit_note_number  text,
  credit_note_at      timestamptz,
  credit_note_details jsonb,
  exchange_order_id   uuid,
  approved_at         timestamptz,
  picked_up_at        timestamptz,
  received_at         timestamptz,
  completed_at        timestamptz,
  rejected_at         timestamptz,
  cancelled_at        timestamptz,
  created_by          uuid references auth.users (id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, order_id) references public.orders (organization_id, id) on delete cascade,
  foreign key (organization_id, shop_id) references public.shops (organization_id, id) on delete cascade,
  foreign key (organization_id, exchange_order_id) references public.orders (organization_id, id) on delete set null (exchange_order_id)
);

create index returns_org_status_idx on public.returns (organization_id, status, created_at desc);
create index returns_order_idx on public.returns (order_id);
create index returns_credit_note_idx on public.returns (organization_id, credit_note_at) where credit_note_number is not null;

create table public.return_items (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  return_id           uuid not null,
  order_item_id       uuid not null,
  quantity            integer not null check (quantity between 1 and 10000),
  exchange_variant_id uuid,
  -- Decided on receipt: back into stock, or kept aside as damaged.
  restock             boolean,
  serial_numbers      text[] not null default '{}',
  -- This return's share of the order line, frozen on receipt.
  total               numeric(12, 2),
  discount_amount     numeric(12, 2),
  tax_amount          numeric(12, 2),
  unique (return_id, order_item_id),
  foreign key (organization_id, return_id) references public.returns (organization_id, id) on delete cascade,
  foreign key (organization_id, order_item_id) references public.order_items (organization_id, id) on delete cascade,
  foreign key (organization_id, exchange_variant_id) references public.product_variants (organization_id, id) on delete set null (exchange_variant_id)
);

create index return_items_order_item_idx on public.return_items (order_item_id);

-- Refunds paid through the payment provider for a return (one row per provider refund).
create table public.return_refunds (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null,
  return_id          uuid not null,
  payment_id         uuid not null references public.payments (id) on delete cascade,
  provider_refund_id text not null unique,
  amount             numeric(12, 2) not null check (amount > 0),
  created_at         timestamptz not null default now(),
  foreign key (organization_id, return_id) references public.returns (organization_id, id) on delete cascade
);

create trigger returns_set_updated_at
  before update on public.returns
  for each row execute function private.set_updated_at();
create trigger returns_audit
  after insert or update or delete on public.returns
  for each row execute function private.audit_row_change('return');

alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.return_refunds enable row level security;

create policy "returns: read with shop access" on public.returns
  for select to authenticated using (private.can_access_shop(organization_id, shop_id));
create policy "return items: read with shop access" on public.return_items
  for select to authenticated using (exists (
    select 1 from public.returns r where r.id = return_id and private.can_access_shop(r.organization_id, r.shop_id)));
create policy "return refunds: read with shop access" on public.return_refunds
  for select to authenticated using (exists (
    select 1 from public.returns r where r.id = return_id and private.can_access_shop(r.organization_id, r.shop_id)));

-- Every change goes through the functions below.
revoke insert, update, delete on public.returns, public.return_items, public.return_refunds from authenticated, anon;
grant select on public.returns, public.return_items, public.return_refunds to authenticated;

-- -----------------------------------------------------------------------------
-- What can still be returned
-- -----------------------------------------------------------------------------

-- Return window in days for a shop (0 = returns off).
create or replace function private.return_window_days(p_shop public.shops)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_shop.settings -> 'return_window_days') = 'number'
      then greatest(least((p_shop.settings ->> 'return_window_days')::numeric::integer, 90), 0)
    else 7
  end;
$$;

-- Quantity of an order line already in a return that is still going ahead.
create or replace function private.returned_quantity(p_order_item_id uuid, p_exclude_return uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(ri.quantity), 0)::integer
  from public.return_items ri
  join public.returns r on r.id = ri.return_id
  where ri.order_item_id = p_order_item_id
    and r.status not in ('rejected', 'cancelled')
    and (p_exclude_return is null or r.id <> p_exclude_return);
$$;

/*
 * Per order line: what was delivered, what can still be returned and until
 * when, or why not; plus the variants it can be exchanged for.
 */
create or replace function private.return_options(p_order public.orders)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with shop as (select * from public.shops where id = p_order.shop_id),
  lines as (
    select oi.*, v.product_id,
           coalesce(c.returnable, true) as category_returnable,
           (select coalesce(sum(si.quantity), 0) from public.shipment_items si
              join public.shipments sh on sh.id = si.shipment_id
              where si.order_item_id = oi.id and sh.status = 'delivered')::integer as delivered,
           (select max(sh.delivered_at) from public.shipment_items si
              join public.shipments sh on sh.id = si.shipment_id
              where si.order_item_id = oi.id and sh.status = 'delivered') as delivered_at,
           private.returned_quantity(oi.id) as in_returns
    from public.order_items oi
    left join public.product_variants v on v.id = oi.variant_id
    left join public.products p on p.id = v.product_id
    left join public.categories c on c.id = p.category_id
    where oi.order_id = p_order.id
  )
  select jsonb_build_object(
    'window_days', private.return_window_days(s),
    'allow_exchanges', coalesce((s.settings ->> 'allow_exchanges')::boolean, true),
    'needs_upi', not exists (select 1 from public.payments pm where pm.order_id = p_order.id
                             and pm.status in ('captured', 'partially_refunded')),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_item_id', l.id,
        'title', l.title,
        'sku', l.sku,
        'quantity', l.quantity,
        'unit_price', l.unit_price,
        'unit_paid', round((l.total - l.discount_amount) / l.quantity, 2),
        'image', private.product_cover(l.product_id),
        'delivered', l.delivered,
        'returnable', greatest(l.delivered - l.in_returns, 0),
        'window_ends_at', case when l.delivered_at is not null
                               then l.delivered_at + make_interval(days => private.return_window_days(s)) end,
        'blocked', case
          when p_order.status = 'cancelled' then 'cancelled'
          when l.delivered = 0 then 'not_delivered'
          when l.delivered - l.in_returns <= 0 then 'already_returned'
          when not l.category_returnable then 'not_returnable'
          when private.return_window_days(s) = 0 then 'returns_off'
          when l.delivered_at + make_interval(days => private.return_window_days(s)) < now() then 'window_closed'
          end,
        'exchange_for', case when l.product_id is null then '[]'::jsonb else coalesce((
          select jsonb_agg(jsonb_build_object('variant_id', v2.id, 'title', v2.title,
                                              'available', private.shop_available(p_order.shop_id, v2.id))
                           order by v2.created_at, v2.title)
          from public.product_variants v2
          where v2.product_id = l.product_id and v2.is_active and v2.id is distinct from l.variant_id
            and private.shop_available(p_order.shop_id, v2.id) > 0), '[]'::jsonb) end)
        order by l.created_at)
      from lines l), '[]'::jsonb))
  from shop s;
$$;

create or replace function private.order_returnable(p_order public.orders)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from jsonb_array_elements(private.return_options(p_order) -> 'items') i
                 where i ->> 'blocked' is null);
$$;

-- -----------------------------------------------------------------------------
-- Creating a return
-- -----------------------------------------------------------------------------
create or replace function private.create_return_core(
  p_order      public.orders,
  p_items      jsonb,
  p_reason     text,
  p_note       text,
  p_resolution text,
  p_refund_upi text,
  p_source     text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_options  jsonb := private.return_options(p_order);
  v_line     jsonb;
  v_opt      jsonb;
  v_qty      integer;
  v_variant  uuid;
  v_id       uuid;
  v_number   text;
  v_staff    boolean := p_source = 'staff';
  v_upi      text := nullif(btrim(p_refund_upi), '');
begin
  if p_order.status = 'cancelled' then
    raise exception 'This order was cancelled' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one item to return' using errcode = 'check_violation';
  end if;
  if (select count(distinct x ->> 'order_item_id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Each item can appear only once' using errcode = 'check_violation';
  end if;
  if p_resolution not in ('refund', 'exchange') then
    raise exception 'Choose a refund or an exchange' using errcode = 'check_violation';
  end if;
  if p_resolution = 'exchange' and not (v_options ->> 'allow_exchanges')::boolean then
    raise exception 'This shop doesn''t offer exchanges' using errcode = 'check_violation';
  end if;
  if p_reason is null or p_reason not in ('damaged', 'wrong_item', 'size_fit', 'not_as_described', 'changed_mind', 'other') then
    raise exception 'Choose a reason' using errcode = 'check_violation';
  end if;
  if p_reason = 'other' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Tell the shop what went wrong' using errcode = 'check_violation';
  end if;
  if v_upi is not null and v_upi !~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z]{2,64}$' then
    raise exception 'Enter a UPI id like name@bank' using errcode = 'check_violation';
  end if;
  if not v_staff and p_resolution = 'refund' and (v_options ->> 'needs_upi')::boolean and v_upi is null then
    raise exception 'Enter the UPI id to refund to' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.returns where order_id = p_order.id) >= 20 then
    raise exception 'This order has too many returns' using errcode = 'check_violation';
  end if;

  v_number := 'RET-' || lpad(private.next_counter(p_order.organization_id, 'return')::text, 6, '0');
  insert into public.returns (organization_id, shop_id, order_id, number, source, status, resolution, reason,
                              note, refund_upi, approved_at)
  values (p_order.organization_id, p_order.shop_id, p_order.id, v_number, p_source,
          case when v_staff then 'approved' else 'requested' end::public.return_status,
          p_resolution, p_reason, nullif(left(btrim(p_note), 1000), ''), v_upi,
          case when v_staff then now() end)
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_items) loop
    select o into v_opt from jsonb_array_elements(v_options -> 'items') o
    where o ->> 'order_item_id' = v_line ->> 'order_item_id';
    if v_opt is null then
      raise exception 'An item isn''t part of this order' using errcode = 'check_violation';
    end if;
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > (v_opt ->> 'returnable')::integer then
      raise exception 'You can return up to % of %', (v_opt ->> 'returnable')::integer, v_opt ->> 'title'
        using errcode = 'check_violation';
    end if;
    -- Staff can accept returns outside the rules (e.g. at the counter); shoppers can't.
    if not v_staff and v_opt ->> 'blocked' is not null then
      raise exception '% can''t be returned: %', v_opt ->> 'title', case v_opt ->> 'blocked'
        when 'not_returnable' then 'this kind of item isn''t returnable'
        when 'window_closed' then 'the return window has closed'
        when 'returns_off' then 'this shop doesn''t accept returns'
        else 'it hasn''t been delivered' end
        using errcode = 'check_violation';
    end if;

    v_variant := null;
    if p_resolution = 'exchange' then
      v_variant := nullif(v_line ->> 'exchange_variant_id', '')::uuid;
      if v_variant is null or not exists (
        select 1 from jsonb_array_elements(v_opt -> 'exchange_for') e where (e ->> 'variant_id')::uuid = v_variant
      ) then
        raise exception 'Choose an option in stock to exchange % for', v_opt ->> 'title' using errcode = 'check_violation';
      end if;
    end if;

    insert into public.return_items (organization_id, return_id, order_item_id, quantity, exchange_variant_id)
    values (p_order.organization_id, v_id, (v_line ->> 'order_item_id')::uuid, v_qty, v_variant);
  end loop;

  perform private.add_order_event(p_order.organization_id, p_order.id, 'return.requested',
    case when v_staff then 'Return ' || v_number || ' started by staff'
         else 'Customer asked to return items (' || v_number || ')' end,
    jsonb_build_object('return_id', v_id));
  return v_id;
end;
$$;

-- Staff: start a return (approved straight away; window and category rules don't apply).
create or replace function public.create_return(
  p_order_id   uuid,
  p_items      jsonb,
  p_reason     text,
  p_note       text default null,
  p_resolution text default 'refund',
  p_refund_upi text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  v_order := private.authorize_order(p_order_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);
  perform 1 from public.orders where id = p_order_id for update;
  return private.create_return_core(v_order, p_items, p_reason, p_note, p_resolution, p_refund_upi, 'staff');
end;
$$;

create or replace function public.order_return_options(p_order_id uuid)
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
  return private.return_options(v_order);
end;
$$;

-- Shoppers (server only, with the shopper's session token).
create or replace function public.shopper_return_options(p_shop_id uuid, p_token text, p_order_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
  v_order    public.orders;
begin
  select * into v_order from public.orders
  where public_token = p_order_token and shop_id = p_shop_id and customer_id = v_customer.id;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  return private.return_options(v_order) || jsonb_build_object('order_number', v_order.number,
    'payment_method', v_order.payment_method);
end;
$$;

create or replace function public.shopper_request_return(
  p_shop_id     uuid,
  p_token       text,
  p_order_token text,
  p_items       jsonb,
  p_reason      text,
  p_note        text,
  p_resolution  text,
  p_refund_upi  text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
  v_order    public.orders;
  v_id       uuid;
begin
  select * into v_order from public.orders
  where public_token = p_order_token and shop_id = p_shop_id and customer_id = v_customer.id
  for update;
  if v_order.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  v_id := private.create_return_core(v_order, p_items, p_reason, p_note, p_resolution, p_refund_upi, 'customer');
  return (select jsonb_build_object('id', r.id, 'number', r.number) from public.returns r where r.id = v_id);
end;
$$;

create or replace function public.shopper_cancel_return(p_shop_id uuid, p_token text, p_return_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer public.customers := private.require_shopper(p_shop_id, p_token);
  v_return   public.returns;
begin
  select r.* into v_return from public.returns r join public.orders o on o.id = r.order_id
  where r.id = p_return_id and r.shop_id = p_shop_id and o.customer_id = v_customer.id
  for update of r;
  if v_return.id is null then
    raise exception 'Return not found' using errcode = 'P0002';
  end if;
  if v_return.status not in ('requested', 'approved') then
    raise exception 'This return can no longer be withdrawn' using errcode = 'check_violation';
  end if;
  update public.returns set status = 'cancelled', cancelled_at = now() where id = v_return.id;
  perform private.add_order_event(v_return.organization_id, v_return.order_id, 'return.cancelled',
    'Customer withdrew return ' || v_return.number, jsonb_build_object('return_id', v_return.id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Staff workflow
-- -----------------------------------------------------------------------------
create or replace function private.authorize_return(p_return_id uuid, p_roles public.org_role[])
returns public.returns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return public.returns;
begin
  select * into v_return from public.returns where id = p_return_id for update;
  if v_return.id is null or not private.can_access_shop(v_return.organization_id, v_return.shop_id) then
    raise exception 'Return not found' using errcode = 'no_data_found';
  end if;
  if not private.has_org_role(v_return.organization_id, p_roles) then
    raise exception 'Not allowed to manage this return' using errcode = '42501';
  end if;
  return v_return;
end;
$$;

create or replace function public.review_return(p_return_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return public.returns := private.authorize_return(p_return_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);
  v_note   text := nullif(left(btrim(p_note), 500), '');
begin
  if v_return.status <> 'requested' then
    raise exception 'This return has already been reviewed' using errcode = 'check_violation';
  end if;
  if not p_approve and v_note is null then
    raise exception 'Tell the customer why' using errcode = 'check_violation';
  end if;
  update public.returns
  set status = case when p_approve then 'approved' else 'rejected' end::public.return_status,
      approved_at = case when p_approve then now() end,
      rejected_at = case when p_approve then null else now() end,
      staff_note = v_note
  where id = p_return_id;
  perform private.add_order_event(v_return.organization_id, v_return.order_id,
    case when p_approve then 'return.approved' else 'return.rejected' end,
    'Return ' || v_return.number || case when p_approve then ' approved' else ' declined: ' || v_note end,
    jsonb_build_object('return_id', v_return.id));
end;
$$;

create or replace function public.mark_return_picked_up(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return public.returns := private.authorize_return(p_return_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);
begin
  if v_return.status <> 'approved' then
    raise exception 'Only an approved return can be picked up' using errcode = 'check_violation';
  end if;
  update public.returns set status = 'picked_up', picked_up_at = now() where id = p_return_id;
  perform private.add_order_event(v_return.organization_id, v_return.order_id, 'return.picked_up',
    'Return ' || v_return.number || ' picked up from the customer', jsonb_build_object('return_id', v_return.id));
end;
$$;

-- Freeze each line's share of the order line (the last units take the remainder,
-- so several partial returns never add up to more than was charged).
create or replace function private.price_return_items(p_return public.returns)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ri   public.return_items;
  v_oi   public.order_items;
  v_prev record;
begin
  for v_ri in select * from public.return_items where return_id = p_return.id loop
    select * into v_oi from public.order_items where id = v_ri.order_item_id;
    select coalesce(sum(ri.quantity), 0) as qty, coalesce(sum(ri.total), 0) as total,
           coalesce(sum(ri.discount_amount), 0) as discount, coalesce(sum(ri.tax_amount), 0) as tax
    into v_prev
    from public.return_items ri join public.returns r on r.id = ri.return_id
    where ri.order_item_id = v_oi.id and r.id <> p_return.id and ri.total is not null
      and r.status in ('received', 'completed');
    if v_prev.qty + v_ri.quantity >= v_oi.quantity then
      update public.return_items
      set total = v_oi.total - v_prev.total,
          discount_amount = v_oi.discount_amount - v_prev.discount,
          tax_amount = v_oi.tax_amount - v_prev.tax
      where id = v_ri.id;
    else
      update public.return_items
      set total = round(v_oi.total * v_ri.quantity / v_oi.quantity, 2),
          discount_amount = round(v_oi.discount_amount * v_ri.quantity / v_oi.quantity, 2),
          tax_amount = round(v_oi.tax_amount * v_ri.quantity / v_oi.quantity, 2)
      where id = v_ri.id;
    end if;
  end loop;
end;
$$;

create or replace function private.issue_credit_note(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return public.returns;
  v_order  public.orders;
  v_shop   public.shops;
  v_fy     text;
  v_seq    bigint;
  v_number text;
begin
  select * into v_return from public.returns where id = p_return_id for update;
  select * into v_order from public.orders where id = v_return.order_id;
  if v_return.credit_note_number is not null or v_order.invoice_number is null or v_return.credit_total <= 0 then
    return;
  end if;
  select * into v_shop from public.shops where id = v_order.shop_id;
  v_fy := private.financial_year(now());
  -- One series per GST registration (or per shop without one), separate from invoices.
  v_seq := private.next_counter(v_order.organization_id,
    'credit_note:' || coalesce(v_order.invoice_details -> 'seller' ->> 'gstin', v_shop.id::text) || ':' || v_fy);
  v_number := 'CN' || v_fy || '-' || lpad(v_seq::text, 5, '0');
  update public.returns
  set credit_note_number = v_number,
      credit_note_at = now(),
      credit_note_details = v_order.invoice_details || jsonb_build_object(
        'invoice_number', v_order.invoice_number, 'invoiced_at', v_order.invoiced_at)
  where id = p_return_id;
  perform private.add_order_event(v_order.organization_id, v_order.id, 'credit_note.issued',
    'Credit note ' || v_number || ' issued against invoice ' || v_order.invoice_number,
    jsonb_build_object('return_id', p_return_id));
end;
$$;

/*
 * Goods are back: value the return, decide delivery credit, issue the credit
 * note, and work out the money to give back. Stock is handled by the caller.
 */
create or replace function private.settle_received_return(p_return_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return    public.returns;
  v_order     public.orders;
  v_items     numeric;
  v_all_back  boolean;
  v_shipping  numeric := 0;
  v_credit    numeric;
  v_paid      numeric;
  v_refunded  numeric;
  v_refund    numeric := 0;
begin
  select * into v_return from public.returns where id = p_return_id for update;
  select * into v_order from public.orders where id = v_return.order_id for update;
  perform private.price_return_items(v_return);

  select coalesce(sum(total - discount_amount), 0) into v_items from public.return_items where return_id = p_return_id;

  -- Is everything on the order now back with the shop (this return included)?
  select bool_and(oi.quantity <= coalesce((
           select sum(ri.quantity) from public.return_items ri join public.returns r on r.id = ri.return_id
           where ri.order_item_id = oi.id and (r.id = p_return_id or r.status in ('received', 'completed'))), 0))
  into v_all_back
  from public.order_items oi where oi.order_id = v_order.id;

  -- Delivery is credited when nothing was delivered after all, or the shop got it wrong.
  if v_all_back and (v_return.source = 'rto' or v_return.reason in ('damaged', 'wrong_item', 'not_as_described'))
     and not exists (select 1 from public.returns r where r.order_id = v_order.id and r.id <> p_return_id
                     and r.shipping_credit > 0) then
    v_shipping := v_order.shipping_total;
  end if;
  v_credit := round(v_items + v_shipping, 2);

  if v_return.resolution = 'refund' then
    -- Money the customer actually paid and hasn't had back yet.
    select coalesce(sum(amount - refunded_amount), 0) into v_paid
    from public.payments where order_id = v_order.id and status in ('captured', 'partially_refunded');
    if v_paid = 0 and v_order.payment_status in ('paid', 'partially_refunded') then
      select coalesce(sum(refunded_amount), 0) into v_refunded
      from public.returns where order_id = v_order.id and id <> p_return_id;
      v_paid := greatest(v_order.grand_total - v_refunded, 0);
    end if;
    v_refund := least(v_credit, v_paid);
  end if;

  update public.returns
  set status = case when v_return.resolution = 'refund' and v_refund = 0 then 'completed' else 'received' end::public.return_status,
      received_at = now(),
      completed_at = case when v_return.resolution = 'refund' and v_refund = 0 then now() end,
      shipping_credit = v_shipping,
      credit_total = v_credit,
      refund_amount = v_refund,
      refund_status = case when v_return.resolution = 'exchange' then null
                           when v_refund = 0 then 'not_needed' else 'due' end
  where id = p_return_id;

  perform private.issue_credit_note(p_return_id);

  if v_all_back then
    update public.orders set fulfillment_status = 'returned' where id = v_order.id;
  end if;
end;
$$;

/*
 * Receive the parcel: p_items = [{ return_item_id, restock, serial_numbers? }].
 * Restocked items go back into the warehouse they were shipped from.
 */
create or replace function public.receive_return(p_return_id uuid, p_items jsonb default '[]'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return  public.returns := private.authorize_return(p_return_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);
  v_ri      public.return_items;
  v_oi      public.order_items;
  v_choice  jsonb;
  v_restock boolean;
  v_serials text[];
  v_shipped text[];
  v_wh      uuid;
  v_left    integer;
  v_b       record;
  v_take    integer;
  v_note    text;
begin
  if v_return.status not in ('approved', 'picked_up') then
    raise exception 'Only an approved return can be received' using errcode = 'check_violation';
  end if;
  v_note := 'Return ' || v_return.number;

  for v_ri in select * from public.return_items where return_id = p_return_id loop
    select * into v_oi from public.order_items where id = v_ri.order_item_id;
    select x into v_choice from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
    where x ->> 'return_item_id' = v_ri.id::text;
    v_restock := coalesce((v_choice ->> 'restock')::boolean, true);
    v_serials := coalesce(array(select jsonb_array_elements_text(v_choice -> 'serial_numbers')), '{}');

    -- The warehouse it shipped from (latest delivered shipment).
    select sh.warehouse_id into v_wh
    from public.shipment_items si join public.shipments sh on sh.id = si.shipment_id
    where si.order_item_id = v_oi.id and sh.status = 'delivered'
    order by sh.delivered_at desc nulls last limit 1;

    if v_oi.tracking = 'serial' then
      select coalesce(array_agg(distinct s), '{}') into v_shipped
      from public.shipment_items si join public.shipments sh on sh.id = si.shipment_id,
           unnest(si.serial_numbers) s
      where si.order_item_id = v_oi.id and sh.status = 'delivered';
      if cardinality(v_serials) <> v_ri.quantity or not (v_serials <@ v_shipped) then
        raise exception 'Choose the % serial number(s) returned for %', v_ri.quantity, v_oi.title
          using errcode = 'check_violation';
      end if;
      if exists (select 1 from public.inventory_serials where organization_id = v_return.organization_id
                 and serial_number = any (v_serials) and status <> 'sold') then
        raise exception 'A serial number for % is already back in stock', v_oi.title using errcode = 'check_violation';
      end if;
    end if;

    if v_restock and v_oi.variant_id is not null and v_wh is not null then
      if v_oi.tracking = 'serial' then
        update public.inventory_serials set status = 'in_stock', warehouse_id = v_wh
        where organization_id = v_return.organization_id and serial_number = any (v_serials);
        perform private.apply_stock_delta(v_return.organization_id, v_oi.variant_id, v_wh, v_ri.quantity,
          'return', v_note, 'return', v_return.id, v_serials, null);
      elsif v_oi.tracking = 'batch' then
        -- Back into the batches it came from, newest expiry first.
        v_left := v_ri.quantity;
        for v_b in
          select (b ->> 'batch_id')::uuid as batch_id, sum((b ->> 'quantity')::integer) as qty, max(ib.expiry_date) as expiry_date
          from public.shipment_items si join public.shipments sh on sh.id = si.shipment_id,
               jsonb_array_elements(si.batches) b
          left join public.inventory_batches ib on ib.id = (b ->> 'batch_id')::uuid
          where si.order_item_id = v_oi.id and sh.status = 'delivered'
          group by 1 order by max(ib.expiry_date) desc nulls last
        loop
          exit when v_left <= 0;
          v_take := least(v_left, v_b.qty);
          update public.inventory_batches set on_hand = on_hand + v_take where id = v_b.batch_id;
          perform private.apply_stock_delta(v_return.organization_id, v_oi.variant_id, v_wh, v_take,
            'return', v_note, 'return', v_return.id, null, v_b.batch_id);
          v_left := v_left - v_take;
        end loop;
      else
        perform private.apply_stock_delta(v_return.organization_id, v_oi.variant_id, v_wh, v_ri.quantity,
          'return', v_note, 'return', v_return.id, null, null);
      end if;
    elsif v_oi.tracking = 'serial' then
      update public.inventory_serials set status = 'damaged'
      where organization_id = v_return.organization_id and serial_number = any (v_serials);
    end if;

    update public.return_items
    set restock = v_restock and v_oi.variant_id is not null and v_wh is not null, serial_numbers = v_serials
    where id = v_ri.id;
  end loop;

  perform private.settle_received_return(p_return_id);
  perform private.add_order_event(v_return.organization_id, v_return.order_id, 'return.received',
    'Return ' || v_return.number || ' received', jsonb_build_object('return_id', v_return.id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Refunds
-- -----------------------------------------------------------------------------

/*
 * Start refunding a received return through the payment provider. Returns the
 * plan (which payments, how much) and marks the refund as in progress, so a
 * second click can't start another. A refund stuck "processing" for 10 minutes
 * (the app stopped half way) can be started again; the app reconciles with the
 * provider by return id before paying anything twice.
 */
create or replace function public.start_return_refund(p_return_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return public.returns := private.authorize_return(p_return_id, array['owner', 'admin', 'manager']::public.org_role[]);
  v_left   numeric;
  v_plan   jsonb := '[]'::jsonb;
  v_p      record;
  v_take   numeric;
begin
  if v_return.refund_status is null or v_return.refund_status in ('refunded', 'not_needed')
     or (v_return.refund_status = 'processing' and v_return.refund_started_at > now() - interval '10 minutes') then
    raise exception 'There is no refund to start for this return' using errcode = 'check_violation';
  end if;
  v_left := v_return.refund_amount - v_return.refunded_amount;
  for v_p in
    select p.* from public.payments p
    where p.order_id = v_return.order_id and p.status in ('captured', 'partially_refunded')
      and p.amount > p.refunded_amount and p.provider_payment_id is not null
    order by p.captured_at
  loop
    exit when v_left <= 0;
    v_take := least(v_left, v_p.amount - v_p.refunded_amount);
    v_plan := v_plan || jsonb_build_object('payment_id', v_p.id, 'provider_payment_id', v_p.provider_payment_id,
      'amount', v_take, 'already', coalesce((select sum(amount) from public.return_refunds
                                             where return_id = p_return_id and payment_id = v_p.id), 0));
    v_left := v_left - v_take;
  end loop;
  if jsonb_array_length(v_plan) = 0 then
    raise exception 'This order wasn''t paid online. Record how you refunded the customer instead.'
      using errcode = 'check_violation';
  end if;
  update public.returns
  set refund_status = 'processing', refund_started_at = now(), refund_error = null, refund_method = 'original'
  where id = p_return_id;
  return jsonb_build_object('organization_id', v_return.organization_id, 'order_id', v_return.order_id,
                            'return_id', v_return.id, 'number', v_return.number, 'payments', v_plan);
end;
$$;

-- Server: one provider refund done. Idempotent on the provider refund id.
create or replace function public.record_return_refund(p_return_id uuid, p_payment_id uuid, p_refund_id text, p_amount numeric)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_return public.returns;
  v_total  numeric;
begin
  select * into v_return from public.returns where id = p_return_id for update;
  if v_return.id is null then
    raise exception 'Return not found' using errcode = 'P0002';
  end if;
  insert into public.return_refunds (organization_id, return_id, payment_id, provider_refund_id, amount)
  values (v_return.organization_id, p_return_id, p_payment_id, p_refund_id, round(p_amount, 2))
  on conflict (provider_refund_id) do nothing;
  if not found then
    return;
  end if;
  perform public.record_refund(p_payment_id, p_refund_id, p_amount);

  select coalesce(sum(amount), 0) into v_total from public.return_refunds where return_id = p_return_id;
  update public.returns
  set refunded_amount = least(v_total, refund_amount),
      refund_status = case when v_total >= refund_amount then 'refunded' else refund_status end,
      status = case when v_total >= refund_amount then 'completed' else status end,
      completed_at = case when v_total >= refund_amount then now() else completed_at end
  where id = p_return_id;
end;
$$;

create or replace function public.fail_return_refund(p_return_id uuid, p_error text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.returns set refund_status = 'failed', refund_error = left(p_error, 500)
  where id = p_return_id and refund_status = 'processing';
$$;

-- The order's payment status after money went back outside the provider.
create or replace function private.sync_manual_refund_status(p_order_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.orders o
  set payment_status = case when r.refunded >= o.grand_total then 'refunded'::public.payment_status
                            else 'partially_refunded'::public.payment_status end
  from (select coalesce(sum(refunded_amount), 0) as refunded from public.returns where order_id = p_order_id) r
  where o.id = p_order_id and r.refunded > 0 and o.payment_status in ('paid', 'partially_refunded')
    and not exists (select 1 from public.payments p where p.order_id = o.id and p.status in ('captured', 'partially_refunded', 'refunded'));
$$;

-- Managers: record a refund made outside the provider (UPI, bank transfer, cash).
create or replace function public.record_manual_refund(p_return_id uuid, p_method text, p_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return public.returns := private.authorize_return(p_return_id, array['owner', 'admin', 'manager']::public.org_role[]);
  v_ref    text := nullif(left(btrim(p_reference), 120), '');
begin
  if v_return.refund_status not in ('due', 'failed') then
    raise exception 'There is no refund to record for this return' using errcode = 'check_violation';
  end if;
  if p_method not in ('upi', 'bank', 'cash') then
    raise exception 'Choose how you refunded' using errcode = 'check_violation';
  end if;
  if p_method <> 'cash' and v_ref is null then
    raise exception 'Enter the transaction reference' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.payments where order_id = v_return.order_id
             and status in ('captured', 'partially_refunded') and amount > refunded_amount) then
    raise exception 'This order was paid online. Refund it to the original payment instead.' using errcode = 'check_violation';
  end if;
  update public.returns
  set refund_status = 'refunded', refunded_amount = refund_amount, refund_method = p_method,
      refund_reference = v_ref, refund_error = null, status = 'completed', completed_at = now()
  where id = p_return_id;
  perform private.sync_manual_refund_status(v_return.order_id);
  perform private.add_order_event(v_return.organization_id, v_return.order_id, 'return.refunded',
    'Refunded ' || v_return.refund_amount || ' by ' || upper(p_method) || coalesce(' (' || v_ref || ')', '')
      || ' for return ' || v_return.number,
    jsonb_build_object('return_id', v_return.id));
end;
$$;

-- -----------------------------------------------------------------------------
-- Exchanges
-- -----------------------------------------------------------------------------
create or replace function public.create_exchange_order(p_return_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_return   public.returns := private.authorize_return(p_return_id, array['owner', 'admin', 'manager', 'staff']::public.org_role[]);
  v_order    public.orders;
  v_customer public.customers;
  v_items    jsonb;
  v_discount numeric;
  v_new      uuid;
begin
  if v_return.resolution <> 'exchange' or v_return.status <> 'received' or v_return.exchange_order_id is not null then
    raise exception 'A replacement can be sent once an exchange is received' using errcode = 'check_violation';
  end if;
  select * into v_order from public.orders where id = v_return.order_id;
  select * into v_customer from public.customers where id = v_order.customer_id;

  select jsonb_agg(jsonb_build_object('variant_id', ri.exchange_variant_id, 'quantity', ri.quantity,
                                      'unit_price', oi.unit_price)),
         coalesce(sum(ri.discount_amount), 0)
  into v_items, v_discount
  from public.return_items ri join public.order_items oi on oi.id = ri.order_item_id
  where ri.return_id = p_return_id and ri.exchange_variant_id is not null;
  if v_items is null then
    raise exception 'The options to exchange for are no longer available' using errcode = 'check_violation';
  end if;

  -- Same price as paid, settled by the credit note: nothing more to pay.
  v_new := private.create_order_core(v_order.shop_id,
    jsonb_build_object('email', v_customer.email, 'phone', v_customer.phone, 'full_name', v_customer.full_name),
    v_order.shipping_address, v_items, 'store_credit', 'paid', 0, v_discount,
    'Replacement for return ' || v_return.number || ' on order ' || v_order.number, 'exchange');
  perform private.confirm_order_core(v_new);

  update public.returns set exchange_order_id = v_new, status = 'completed', completed_at = now() where id = p_return_id;
  perform private.add_order_event(v_return.organization_id, v_return.order_id, 'return.exchanged',
    'Replacement order ' || (select number from public.orders where id = v_new) || ' created for return ' || v_return.number,
    jsonb_build_object('return_id', v_return.id, 'order_id', v_new));
  return v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Parcels returned to origin after invoicing
-- -----------------------------------------------------------------------------
create or replace function private.return_on_rto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order  public.orders;
  v_id     uuid;
  v_number text;
begin
  select * into v_order from public.orders where id = new.order_id;
  if v_order.invoice_number is null then
    return new;
  end if;
  v_number := 'RET-' || lpad(private.next_counter(new.organization_id, 'return')::text, 6, '0');
  insert into public.returns (organization_id, shop_id, order_id, number, source, status, resolution, reason,
                              note, approved_at, picked_up_at)
  values (new.organization_id, v_order.shop_id, v_order.id, v_number, 'rto', 'picked_up', 'refund', 'undelivered',
          'Shipment ' || new.number || ' returned to origin', now(), now())
  returning id into v_id;
  -- Stock already went back with the shipment.
  insert into public.return_items (organization_id, return_id, order_item_id, quantity, restock, serial_numbers)
  select new.organization_id, v_id, si.order_item_id, si.quantity, true, si.serial_numbers
  from public.shipment_items si where si.shipment_id = new.id;
  perform private.settle_received_return(v_id);
  perform private.add_order_event(new.organization_id, v_order.id, 'return.received',
    'Shipment ' || new.number || ' came back undelivered (' || v_number || ')', jsonb_build_object('return_id', v_id));
  return new;
end;
$$;

create trigger shipments_return_on_rto
  after update of status on public.shipments
  for each row when (new.status = 'returned_to_origin' and old.status is distinct from 'returned_to_origin')
  execute function private.return_on_rto();

-- -----------------------------------------------------------------------------
-- Credit notes (same shape as invoices, so the same code prints and totals them)
-- -----------------------------------------------------------------------------
create or replace function private.credit_note_json(p_return public.returns, p_full_buyer boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_return.credit_note_number is null then null else jsonb_build_object(
    'kind', 'credit_note',
    'number', p_return.credit_note_number,
    'issued_at', p_return.credit_note_at,
    'order_number', o.number,
    'placed_at', o.placed_at,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'currency', o.currency,
    'seller', p_return.credit_note_details -> 'seller',
    'buyer', case when p_full_buyer then p_return.credit_note_details -> 'buyer'
                  else (p_return.credit_note_details -> 'buyer') - 'phone' - 'line1' - 'line2' end,
    'against', jsonb_build_object('number', p_return.credit_note_details ->> 'invoice_number',
                                  'issued_at', p_return.credit_note_details ->> 'invoiced_at'),
    'return_number', p_return.number,
    'reason', p_return.reason,
    'subtotal', (select coalesce(sum(total), 0) from public.return_items where return_id = p_return.id),
    'discount_total', (select coalesce(sum(discount_amount), 0) from public.return_items where return_id = p_return.id),
    'discount_code', null,
    'shipping_total', p_return.shipping_credit,
    -- Delivery is credited at the rate it was invoiced at (the order's highest item rate).
    'shipping_rate', (select coalesce(max(gst_rate), 0) from public.order_items where order_id = p_return.order_id),
    'grand_total', p_return.credit_total,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
               'title', oi.title, 'sku', oi.sku, 'hsn_code', oi.hsn_code, 'quantity', ri.quantity,
               'unit_price', oi.unit_price, 'total', ri.total, 'discount_amount', ri.discount_amount,
               'gst_rate', oi.gst_rate, 'tax_amount', ri.tax_amount) order by oi.created_at)
             from public.return_items ri join public.order_items oi on oi.id = ri.order_item_id
             where ri.return_id = p_return.id), '[]'::jsonb)
  ) end
  from public.orders o where o.id = p_return.order_id;
$$;

create or replace function public.return_credit_note(p_return_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_return public.returns;
begin
  select * into v_return from public.returns where id = p_return_id;
  if v_return.id is null or not private.can_access_shop(v_return.organization_id, v_return.shop_id) then
    raise exception 'Return not found' using errcode = 'no_data_found';
  end if;
  return private.credit_note_json(v_return, true);
end;
$$;

create or replace function public.storefront_credit_note(p_order_token text, p_return_id uuid, p_full_buyer boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.credit_note_json(r, p_full_buyer)
  from public.returns r join public.orders o on o.id = r.order_id
  where p_order_token ~ '^[0-9a-f]{32}$' and o.public_token = p_order_token and r.id = p_return_id;
$$;

create or replace function public.gst_credit_notes(p_organization_id uuid, p_month date, p_shop_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := (date_trunc('month', p_month)::date::timestamp at time zone 'Asia/Kolkata');
  v_to   timestamptz := ((date_trunc('month', p_month) + interval '1 month')::date::timestamp at time zone 'Asia/Kolkata');
begin
  if not private.has_org_role(p_organization_id, array['owner', 'admin', 'manager']::public.org_role[]) then
    raise exception 'Only owners, admins and managers can see tax reports' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(private.credit_note_json(r, true) order by r.credit_note_at), '[]'::jsonb)
    from (
      select * from public.returns r
      where r.organization_id = p_organization_id
        and r.credit_note_number is not null
        and r.credit_note_at >= v_from and r.credit_note_at < v_to
        and (p_shop_id is null or r.shop_id = p_shop_id)
        and private.can_access_shop(r.organization_id, r.shop_id)
      order by r.credit_note_at
      limit 10000
    ) r
  );
end;
$$;

-- Returns in a date range, for the sales page (row-level security applies).
create or replace function public.returns_report(p_organization_id uuid, p_from date, p_to date, p_shop_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'requested', count(*) filter (where (created_at at time zone 'Asia/Kolkata')::date between p_from and p_to
                                   and source <> 'rto'),
    'received', count(*) filter (where received_at is not null
                                  and (received_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'undelivered', count(*) filter (where source = 'rto'
                                     and (received_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'credited', coalesce(sum(credit_total) filter (where received_at is not null
                                  and (received_at at time zone 'Asia/Kolkata')::date between p_from and p_to), 0),
    'refunded', coalesce(sum(refunded_amount) filter (where completed_at is not null
                                  and (completed_at at time zone 'Asia/Kolkata')::date between p_from and p_to), 0),
    'open', count(*) filter (where status in ('requested', 'approved', 'picked_up', 'received')))
  from public.returns
  where organization_id = p_organization_id and (p_shop_id is null or shop_id = p_shop_id);
$$;

-- -----------------------------------------------------------------------------
-- Lists and the shopper's order page
-- -----------------------------------------------------------------------------
create or replace view public.return_overview
with (security_invoker = true) as
select r.id, r.organization_id, r.shop_id, s.name as shop_name, r.number, r.order_id, o.number as order_number,
       coalesce(c.full_name, o.shipping_address ->> 'name') as customer_name, c.email as customer_email,
       r.source, r.status, r.resolution, r.reason, r.credit_total, r.refund_amount, r.refunded_amount,
       r.refund_status, r.credit_note_number, r.exchange_order_id, r.created_at, r.updated_at,
       (select coalesce(sum(quantity), 0) from public.return_items ri where ri.return_id = r.id)::integer as item_count,
       (select string_agg(oi.title, ', ' order by oi.created_at) from public.return_items ri
          join public.order_items oi on oi.id = ri.order_item_id where ri.return_id = r.id) as item_titles,
       o.currency
from public.returns r
join public.orders o on o.id = r.order_id
join public.shops s on s.id = r.shop_id
left join public.customers c on c.id = o.customer_id;

grant select on public.return_overview to authenticated;

create or replace function private.order_returns_json(p_order public.orders)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'number', r.number, 'status', r.status, 'source', r.source, 'resolution', r.resolution,
    'reason', r.reason, 'staff_note', r.staff_note, 'created_at', r.created_at,
    'credit_total', r.credit_total, 'refund_amount', r.refund_amount, 'refunded_amount', r.refunded_amount,
    'refund_status', r.refund_status, 'refund_method', r.refund_method,
    'credit_note_number', r.credit_note_number,
    'exchange_order_token', (select x.public_token from public.orders x where x.id = r.exchange_order_id),
    'items', (select jsonb_agg(jsonb_build_object('title', oi.title, 'quantity', ri.quantity,
                                                  'exchange_for', v.title) order by oi.created_at)
              from public.return_items ri join public.order_items oi on oi.id = ri.order_item_id
              left join public.product_variants v on v.id = ri.exchange_variant_id
              where ri.return_id = r.id)) order by r.created_at), '[]'::jsonb)
  from public.returns r where r.order_id = p_order.id;
$$;

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
    'payment_due_at', case when o.status = 'pending' and o.payment_status <> 'paid' then o.payment_due_at end,
    'fulfillment_status', o.fulfillment_status,
    'currency', o.currency,
    'subtotal', o.subtotal,
    'discount_total', o.discount_total,
    'discount_code', o.discount_code,
    'discount_title', (select d.title from public.discounts d where d.id = o.discount_id),
    'shipping_total', o.shipping_total,
    'tax_total', o.tax_total,
    'grand_total', o.grand_total,
    'source', o.source,
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
                           from public.shipments sh where sh.order_id = o.id and sh.status <> 'cancelled'), '[]'::jsonb),
    'returns', private.order_returns_json(o)
  )
  from public.orders o join public.shops s on s.id = o.shop_id
  where p_token ~ '^[0-9a-f]{32}$' and o.public_token = p_token;
$$;

create or replace function public.shopper_order_access(p_shop_id uuid, p_token text, p_order_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('can_cancel', private.order_cancellable(o),
    'can_return', private.order_returnable(o),
    'lines', coalesce((select jsonb_agg(jsonb_build_object('variant_id', oi.variant_id, 'quantity', oi.quantity)
                                        order by oi.created_at)
                       from public.order_items oi where oi.order_id = o.id and oi.variant_id is not null), '[]'::jsonb))
  from public.orders o
  where o.public_token = p_order_token
    and o.shop_id = p_shop_id
    and o.customer_id = (private.shopper_customer(p_shop_id, p_token)).id;
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function private.return_window_days(public.shops) from public;
revoke all on function private.returned_quantity(uuid, uuid) from public;
revoke all on function private.return_options(public.orders) from public;
revoke all on function private.order_returnable(public.orders) from public;
revoke all on function private.create_return_core(public.orders, jsonb, text, text, text, text, text) from public;
revoke all on function private.authorize_return(uuid, public.org_role[]) from public;
revoke all on function private.price_return_items(public.returns) from public;
revoke all on function private.issue_credit_note(uuid) from public;
revoke all on function private.settle_received_return(uuid) from public;
revoke all on function private.sync_manual_refund_status(uuid) from public;
revoke all on function private.return_on_rto() from public;
revoke all on function private.credit_note_json(public.returns, boolean) from public;
revoke all on function private.order_returns_json(public.orders) from public;

revoke all on function public.create_return(uuid, jsonb, text, text, text, text) from public, anon;
grant execute on function public.create_return(uuid, jsonb, text, text, text, text) to authenticated;
revoke all on function public.order_return_options(uuid) from public, anon;
grant execute on function public.order_return_options(uuid) to authenticated;
revoke all on function public.review_return(uuid, boolean, text) from public, anon;
grant execute on function public.review_return(uuid, boolean, text) to authenticated;
revoke all on function public.mark_return_picked_up(uuid) from public, anon;
grant execute on function public.mark_return_picked_up(uuid) to authenticated;
revoke all on function public.receive_return(uuid, jsonb) from public, anon;
grant execute on function public.receive_return(uuid, jsonb) to authenticated;
revoke all on function public.start_return_refund(uuid) from public, anon;
grant execute on function public.start_return_refund(uuid) to authenticated;
revoke all on function public.record_manual_refund(uuid, text, text) from public, anon;
grant execute on function public.record_manual_refund(uuid, text, text) to authenticated;
revoke all on function public.create_exchange_order(uuid) from public, anon;
grant execute on function public.create_exchange_order(uuid) to authenticated;
revoke all on function public.return_credit_note(uuid) from public, anon;
grant execute on function public.return_credit_note(uuid) to authenticated;
revoke all on function public.gst_credit_notes(uuid, date, uuid) from public, anon;
grant execute on function public.gst_credit_notes(uuid, date, uuid) to authenticated;
revoke all on function public.returns_report(uuid, date, date, uuid) from public, anon;
grant execute on function public.returns_report(uuid, date, date, uuid) to authenticated;

-- Server only (service role).
revoke all on function public.record_return_refund(uuid, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.record_return_refund(uuid, uuid, text, numeric) to service_role;
revoke all on function public.fail_return_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_return_refund(uuid, text) to service_role;
revoke all on function public.shopper_return_options(uuid, text, text) from public, anon, authenticated;
grant execute on function public.shopper_return_options(uuid, text, text) to service_role;
revoke all on function public.shopper_request_return(uuid, text, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.shopper_request_return(uuid, text, text, jsonb, text, text, text, text) to service_role;
revoke all on function public.shopper_cancel_return(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.shopper_cancel_return(uuid, text, uuid) to service_role;
revoke all on function public.storefront_credit_note(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.storefront_credit_note(text, uuid, boolean) to service_role;
