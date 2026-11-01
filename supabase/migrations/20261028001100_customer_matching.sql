-- Orders with an email belong to the customer with that email.
--
-- create_order_core matched customers on "email or phone", preferring the
-- email. A new email with a phone number already on another customer's record
-- attached the order to that other customer, so the confirmation, the delivery
-- code and the order itself went to the other person's email, although the
-- shopper had just verified their own address at checkout.

CREATE OR REPLACE FUNCTION private.create_order_core(p_shop_id uuid, p_customer jsonb, p_address jsonb, p_items jsonb, p_payment_method payment_method, p_payment_status payment_status, p_shipping_total numeric, p_discount_total numeric, p_notes text, p_source text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_shop        public.shops;
  v_order_id    uuid;
  v_customer_id uuid;
  v_email       text := nullif(lower(btrim(p_customer ->> 'email')), '');
  v_phone       text := nullif(regexp_replace(coalesce(p_customer ->> 'phone', ''), '[\s()-]', '', 'g'), '');
  v_name        text := nullif(btrim(p_customer ->> 'full_name'), '');
  v_line        jsonb;
  v_variant     record;
  v_qty         integer;
  v_price       numeric;
  v_tax_line    numeric;
  v_subtotal    numeric := 0;
  v_tax         numeric := 0;
begin
  select * into v_shop from public.shops where id = p_shop_id;
  if v_shop.id is null then
    raise exception 'Shop not found' using errcode = 'no_data_found';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'An order can have at most 100 lines' using errcode = 'check_violation';
  end if;
  if (select count(distinct x ->> 'variant_id') from jsonb_array_elements(p_items) x) <> jsonb_array_length(p_items) then
    raise exception 'Each product variant can appear only once' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_address ->> 'name'), '') = '' or coalesce(btrim(p_address ->> 'line1'), '') = ''
     or coalesce(btrim(p_address ->> 'city'), '') = '' or coalesce(btrim(p_address ->> 'postal_code'), '') = ''
     or coalesce(btrim(p_address ->> 'phone'), '') = '' then
    raise exception 'The shipping address needs a name, phone, street, city and PIN code' using errcode = 'check_violation';
  end if;
  if p_shipping_total < 0 or p_discount_total < 0 then
    raise exception 'Shipping and discount cannot be negative' using errcode = 'check_violation';
  end if;

  -- Customer. An email (verified at checkout) is who the order belongs to, so
  -- it never lands on another customer's record just because the phone
  -- matches: emails, codes and the shopper account all follow the email.
  -- A phone-only record (an earlier phone order) is adopted by the email;
  -- orders with no email match on phone.
  if v_email is not null then
    select id into v_customer_id from public.customers
    where organization_id = v_shop.organization_id and email = v_email::extensions.citext;
    if v_customer_id is null and v_phone is not null then
      select id into v_customer_id from public.customers
      where organization_id = v_shop.organization_id and phone = v_phone and email is null;
    end if;
  elsif v_phone is not null then
    select id into v_customer_id from public.customers
    where organization_id = v_shop.organization_id and phone = v_phone;
  end if;

  -- A phone already on someone else's record stays theirs (phones are unique).
  if v_phone is not null and exists (
    select 1 from public.customers
    where organization_id = v_shop.organization_id and phone = v_phone
      and id is distinct from v_customer_id
  ) then
    v_phone := null;
  end if;

  if v_customer_id is null and (v_email is not null or v_phone is not null) then
    insert into public.customers (organization_id, email, phone, full_name)
    values (v_shop.organization_id, v_email, v_phone, v_name)
    returning id into v_customer_id;
  elsif v_customer_id is not null then
    update public.customers
    set full_name = coalesce(full_name, v_name),
        email = coalesce(email, v_email::extensions.citext),
        phone = coalesce(phone, v_phone)
    where id = v_customer_id;
  end if;

  insert into public.orders (
    organization_id, shop_id, customer_id, payment_method, payment_status, currency,
    shipping_total, discount_total, shipping_address, notes, paid_at, source
  ) values (
    v_shop.organization_id, v_shop.id, v_customer_id, p_payment_method, p_payment_status, v_shop.currency,
    round(p_shipping_total, 2), round(p_discount_total, 2), p_address, nullif(btrim(p_notes), ''),
    case when p_payment_status = 'paid' then now() end, p_source
  )
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 10000 then
      raise exception 'Quantities must be between 1 and 10,000' using errcode = 'check_violation';
    end if;

    select v.id, v.sku, v.price, v.title as variant_title, p.title as product_title, p.tracking, p.status,
           coalesce(p.gst_rate, c.gst_rate, 0) as gst_rate
    into v_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.categories c on c.id = p.category_id
    where v.id = (v_line ->> 'variant_id')::uuid
      and v.organization_id = v_shop.organization_id
      and v.is_active;

    if v_variant.id is null then
      raise exception 'A product in this order is no longer available' using errcode = 'check_violation';
    end if;
    if v_variant.status = 'archived' then
      raise exception '% is no longer sold', v_variant.product_title using errcode = 'check_violation';
    end if;

    v_price := round(coalesce((v_line ->> 'unit_price')::numeric, v_variant.price), 2);
    if v_price < 0 then
      raise exception 'Prices cannot be negative' using errcode = 'check_violation';
    end if;
    v_tax_line := round(v_qty * v_price * v_variant.gst_rate / (100 + v_variant.gst_rate), 2);

    insert into public.order_items (
      organization_id, order_id, variant_id, title, sku, quantity, unit_price, tracking, gst_rate, tax_amount
    ) values (
      v_shop.organization_id, v_order_id, v_variant.id,
      v_variant.product_title || case when v_variant.variant_title <> 'Default' then ' · ' || v_variant.variant_title else '' end,
      v_variant.sku, v_qty, v_price, v_variant.tracking, v_variant.gst_rate, v_tax_line
    );

    v_subtotal := v_subtotal + v_qty * v_price;
    v_tax := v_tax + v_tax_line;
  end loop;

  if p_discount_total > v_subtotal then
    raise exception 'The discount is larger than the order subtotal' using errcode = 'check_violation';
  end if;

  update public.orders
  set subtotal = v_subtotal,
      tax_total = v_tax,
      grand_total = v_subtotal - round(p_discount_total, 2) + round(p_shipping_total, 2)
  where id = v_order_id;

  perform private.add_order_event(v_shop.organization_id, v_order_id, 'order.created',
    case when p_source = 'storefront' then 'Placed online by the customer' else 'Order created' end,
    jsonb_build_object('lines', jsonb_array_length(p_items), 'source', p_source));

  return v_order_id;
end;
$function$;
