-- =============================================================================
-- Shopverse · Migration 020 · Analytics and GST reports
--
--  * sales_report: totals, a day-by-day series, top products, payment methods,
--    states and shops for a date range (India time), with the previous period
--    of the same length for comparison. SECURITY INVOKER: row-level security
--    applies, so staff limited to some shops see only those shops.
--  * A sale is an order that wasn't cancelled and isn't waiting for an online
--    payment. Revenue is what customers pay (grand total, GST included).
--  * gst_invoices: every invoice issued in a month, for the GST summaries
--    (B2C by state and rate, HSN), computed in the app with the same code as
--    the invoices themselves.
-- =============================================================================

create index if not exists orders_org_placed_idx on public.orders (organization_id, placed_at);
create index if not exists orders_org_invoiced_idx on public.orders (organization_id, invoiced_at) where invoice_number is not null;

-- An order counts as a sale.
create or replace function private.is_sale(p_order public.orders)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_order.status <> 'cancelled'
    and not (p_order.status = 'pending' and p_order.payment_due_at is not null and p_order.payment_status <> 'paid');
$$;
grant execute on function private.is_sale(public.orders) to authenticated;

create or replace function public.sales_report(
  p_organization_id uuid,
  p_from            date,
  p_to              date,
  p_shop_id         uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_days      integer := (p_to - p_from) + 1;
  v_prev_from date := p_from - ((p_to - p_from) + 1);
  v_prev_to   date := p_from - 1;
begin
  if p_to < p_from then
    raise exception 'The end date is before the start date' using errcode = 'check_violation';
  end if;
  if v_days > 366 then
    raise exception 'Choose a range of a year or less' using errcode = 'check_violation';
  end if;

  return (
    with orders_in as (
      select o.*
      from public.orders o
      where o.organization_id = p_organization_id
        and (p_shop_id is null or o.shop_id = p_shop_id)
        and o.placed_at >= (v_prev_from::timestamp at time zone 'Asia/Kolkata')
        and o.placed_at < ((p_to + 1)::timestamp at time zone 'Asia/Kolkata')
    ),
    cur as (select * from orders_in where (placed_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    prev as (select * from orders_in where (placed_at at time zone 'Asia/Kolkata')::date between v_prev_from and v_prev_to),
    sales as (select * from cur where private.is_sale(cur)),
    prev_sales as (select * from prev where private.is_sale(prev)),
    lines as (
      select oi.*, s.shipping_address ->> 'state' as state
      from public.order_items oi join sales s on s.id = oi.order_id
    ),
    -- First order ever per customer, to tell new from returning.
    firsts as (
      select o.customer_id, min(o.placed_at) as first_at
      from public.orders o
      where o.organization_id = p_organization_id and o.customer_id is not null and private.is_sale(o)
      group by o.customer_id
    )
    select jsonb_build_object(
      'from', p_from, 'to', p_to, 'previous_from', v_prev_from, 'previous_to', v_prev_to,
      'totals', (
        select jsonb_build_object(
          'orders', count(*),
          'revenue', coalesce(sum(grand_total), 0),
          'gross', coalesce(sum(subtotal), 0),
          'discounts', coalesce(sum(discount_total), 0),
          'shipping', coalesce(sum(shipping_total), 0),
          'tax', coalesce(sum(tax_total), 0),
          'items', (select coalesce(sum(quantity), 0) from lines),
          'customers', count(distinct customer_id),
          'new_customers', (select count(*) from firsts f
                            where f.customer_id in (select customer_id from sales)
                              and (f.first_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
          'online_orders', count(*) filter (where payment_method not in ('cod')),
          'cod_orders', count(*) filter (where payment_method = 'cod'),
          'cancelled', (select count(*) from cur where status = 'cancelled'),
          'returned', count(*) filter (where fulfillment_status = 'returned'),
          'delivered', count(*) filter (where status = 'completed'))
        from sales),
      'previous', (
        select jsonb_build_object('orders', count(*), 'revenue', coalesce(sum(grand_total), 0),
                                  'items', (select coalesce(sum(oi.quantity), 0) from public.order_items oi
                                            join prev_sales ps on ps.id = oi.order_id),
                                  'customers', count(distinct customer_id))
        from prev_sales),
      'by_day', (
        select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'revenue', coalesce(x.revenue, 0),
                                                     'orders', coalesce(x.orders, 0)) order by d.day), '[]'::jsonb)
        from generate_series(p_from, p_to, interval '1 day') as d(day)
        left join (select (placed_at at time zone 'Asia/Kolkata')::date as day, sum(grand_total) as revenue, count(*) as orders
                   from sales group by 1) x
          on x.day = d.day::date),
      'top_products', (
        select coalesce(jsonb_agg(t order by t.revenue desc), '[]'::jsonb)
        from (
          select coalesce(v.product_id::text, l.title) as key, max(p.title) as title,
                 sum(l.quantity) as quantity, sum(l.total - l.discount_amount) as revenue
          from lines l
          left join public.product_variants v on v.id = l.variant_id
          left join public.products p on p.id = v.product_id
          group by coalesce(v.product_id::text, l.title)
          order by sum(l.total - l.discount_amount) desc
          limit 8
        ) t),
      'by_payment', (
        select coalesce(jsonb_agg(t order by t.revenue desc), '[]'::jsonb)
        from (select coalesce(payment_method::text, 'unknown') as method, count(*) as orders,
                     sum(grand_total) as revenue
              from sales group by payment_method) t),
      'by_state', (
        select coalesce(jsonb_agg(t order by t.revenue desc), '[]'::jsonb)
        from (select coalesce(nullif(shipping_address ->> 'state', ''), 'Unknown') as state, count(*) as orders,
                     sum(grand_total) as revenue
              from sales group by 1 order by sum(grand_total) desc limit 8) t),
      'by_shop', (
        select coalesce(jsonb_agg(t order by t.revenue desc), '[]'::jsonb)
        from (select s.name as shop, count(*) as orders, sum(x.grand_total) as revenue
              from sales x join public.shops s on s.id = x.shop_id
              group by s.name) t)
    )
  );
end;
$$;

revoke all on function public.sales_report(uuid, date, date, uuid) from public, anon;
grant execute on function public.sales_report(uuid, date, date, uuid) to authenticated;

-- Invoices issued in a month (India time), for GST returns. Owners, admins and
-- managers; restricted managers see only their shops' invoices.
create or replace function public.gst_invoices(p_organization_id uuid, p_month date, p_shop_id uuid default null)
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
    select coalesce(jsonb_agg(private.invoice_json(o, true) order by o.invoiced_at), '[]'::jsonb)
    from (
      select * from public.orders o
      where o.organization_id = p_organization_id
        and o.invoice_number is not null
        and o.invoiced_at >= v_from and o.invoiced_at < v_to
        and (p_shop_id is null or o.shop_id = p_shop_id)
        and private.can_access_shop(o.organization_id, o.shop_id)
      order by o.invoiced_at
      limit 10000
    ) o
  );
end;
$$;

revoke all on function public.gst_invoices(uuid, date, uuid) from public, anon;
grant execute on function public.gst_invoices(uuid, date, uuid) to authenticated;
