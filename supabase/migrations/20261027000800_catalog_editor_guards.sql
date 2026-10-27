-- =============================================================================
-- Shopverse · Migration 008 · Guards for editing categories and fields
--  * a field's key, type, scope and variant role are fixed once created
--    (delete and re-add instead); its options can't drop values in use
--  * a category (or any sub-category) that holds products can't be deleted
-- =============================================================================

create or replace function private.guard_attribute_definition_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed text[];
begin
  if new.key is distinct from old.key
     or new.type is distinct from old.type
     or new.category_id is distinct from old.category_id
     or new.is_variant_option is distinct from old.is_variant_option then
    raise exception 'A field''s key, type and variant setting cannot change. Remove it and add a new one.'
      using errcode = 'check_violation';
  end if;

  v_removed := array(select unnest(old.options) except select unnest(new.options));
  if cardinality(v_removed) = 0 then
    return new;
  end if;

  if old.is_variant_option then
    if exists (
      select 1 from public.product_variants v
      join public.products p on p.id = v.product_id
      where p.organization_id = old.organization_id
        and (old.category_id is null or p.category_id = old.category_id)
        and v.is_active
        and (v.options ->> old.key) = any (v_removed)
    ) then
      raise exception 'Some variants of "%" still use a removed option', old.label
        using errcode = 'check_violation';
    end if;
  elsif exists (
    select 1 from public.products p
    where p.organization_id = old.organization_id
      and (old.category_id is null or p.category_id = old.category_id)
      and (
        (old.type = 'select' and (p.attributes ->> old.key) = any (v_removed))
        or (old.type = 'multiselect' and (p.attributes -> old.key) ?| v_removed)
      )
  ) then
    raise exception 'Some products still use a removed option of "%"', old.label
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger attribute_definitions_guard_update
  before update on public.attribute_definitions
  for each row execute function private.guard_attribute_definition_update();

create or replace function private.guard_category_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.organizations where id = old.organization_id) then
    return old; -- organization is being deleted
  end if;

  if exists (
    with recursive subtree as (
      select old.id as id
      union all
      select c.id from public.categories c join subtree s on c.parent_id = s.id
    )
    select 1 from public.products p where p.category_id in (select id from subtree)
  ) then
    raise exception 'Move or delete the products in "%" before deleting it', old.name
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger categories_guard_delete
  before delete on public.categories
  for each row execute function private.guard_category_delete();
