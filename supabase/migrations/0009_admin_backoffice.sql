-- bluePi Slot — 0009 admin back office
-- Everything an admin needs to turn game_ready:false into a playable slot:
-- a storage bucket for symbol images, and atomic save/archive operations.

-- ---------------------------------------------------------------- symbol images
-- Public-read bucket: symbol art is not secret and the board loads it on every spin,
-- so serving it from the CDN beats signing a URL per tile. Writes stay admin-only.
do $$
begin
  if to_regnamespace('storage') is null then
    raise notice 'no storage schema — skipping bucket setup (local Postgres)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('symbols', 'symbols', true, 307200,
          array['image/png','image/webp','image/svg+xml'])
  on conflict (id) do update
    set public = true,
        file_size_limit = 307200,
        allowed_mime_types = array['image/png','image/webp','image/svg+xml'];

  execute $p$drop policy if exists symbols_public_read on storage.objects$p$;
  execute $p$create policy symbols_public_read on storage.objects for select
             using (bucket_id = 'symbols')$p$;

  execute $p$drop policy if exists symbols_admin_write on storage.objects$p$;
  execute $p$create policy symbols_admin_write on storage.objects for all
             using (bucket_id = 'symbols' and slot.is_admin())
             with check (bucket_id = 'symbols' and slot.is_admin())$p$;

  raise notice 'storage bucket "symbols" ready (public read, 300 KB limit)';
end $$;

-- ---------------------------------------------------------------- symbols
-- One call covers create and edit. Returns the symbol id either way.
create or replace function slot.save_symbol(
  p_id         uuid,
  p_name       text,
  p_image_path text,
  p_weight     integer default 100,
  p_is_wild    boolean default false,
  p_is_scatter boolean default false,
  p_scatter_free_spins integer default 0
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not slot.is_admin() then
    raise exception 'admins only' using errcode = 'insufficient_privilege';
  end if;
  if p_is_wild and p_is_scatter then
    raise exception 'a symbol cannot be both wild and scatter'
      using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into slot.symbol (name, image_path, weight, is_wild, is_scatter, scatter_free_spins)
    values (p_name, p_image_path, p_weight, p_is_wild, p_is_scatter,
            case when p_is_scatter then p_scatter_free_spins else 0 end::smallint)
    returning id into v_id;
  else
    update slot.symbol
       set name = p_name, image_path = p_image_path, weight = p_weight,
           is_wild = p_is_wild, is_scatter = p_is_scatter,
           scatter_free_spins = (case when p_is_scatter then p_scatter_free_spins else 0 end)::smallint
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'no such symbol' using errcode = 'no_data_found';
    end if;
  end if;
  return v_id;
end $$;

-- Symbols are archived, never deleted: past spins in the ledger refer to them, and
-- a hard delete would leave the Play Dashboard describing symbols that no longer exist.
create or replace function slot.archive_symbol(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not slot.is_admin() then
    raise exception 'admins only' using errcode = 'insufficient_privilege';
  end if;
  update slot.symbol set is_active = false where id = p_id;
  -- Drop it from every group too, so no combination silently becomes unwinnable.
  delete from slot.combination_symbol where symbol_id = p_id;
end $$;

-- ---------------------------------------------------------------- combinations
-- Name, bonus and membership are saved together: a group is meaningless without its
-- symbols, so a half-applied edit must not be possible.
create or replace function slot.save_combination(
  p_id         uuid,
  p_name       text,
  p_bonus      numeric,
  p_symbol_ids uuid[]
) returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; n int;
begin
  if not slot.is_admin() then
    raise exception 'admins only' using errcode = 'insufficient_privilege';
  end if;

  n := coalesce(array_length(p_symbol_ids, 1), 0);
  if n = 0 then
    raise exception 'a winning combination needs at least one symbol'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(p_symbol_ids) s
              where not exists (select 1 from slot.symbol y where y.id = s and y.is_active)) then
    raise exception 'one of those symbols does not exist or is archived'
      using errcode = 'foreign_key_violation';
  end if;

  if p_id is null then
    insert into slot.combination (name, bonus) values (p_name, p_bonus) returning id into v_id;
  else
    update slot.combination set name = p_name, bonus = p_bonus
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'no such combination' using errcode = 'no_data_found';
    end if;
    delete from slot.combination_symbol where combination_id = v_id;
  end if;

  insert into slot.combination_symbol (combination_id, symbol_id)
  select v_id, s from unnest(p_symbol_ids) s
  on conflict do nothing;

  return v_id;
end $$;

create or replace function slot.archive_combination(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not slot.is_admin() then
    raise exception 'admins only' using errcode = 'insufficient_privilege';
  end if;
  update slot.combination set is_active = false where id = p_id;
end $$;

-- ---------------------------------------------------------------- reading it back
-- One query for the whole configuration: the back office and the winning-combinations
-- tab both render from this, so they can never disagree about the rules.
create or replace view slot.combination_detail as
  select c.id,
         c.name,
         c.bonus,
         c.is_active,
         count(cs.symbol_id)                                   as symbol_count,
         -- 5+ members means distinct symbols on the line; 1-4 allows duplicates.
         case when count(cs.symbol_id) >= 5 then 'distinct' else 'repeatable' end as match_rule,
         coalesce(
           jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name, 'image_path', y.image_path)
                     order by y.name) filter (where y.id is not null),
           '[]'::jsonb)                                        as symbols
    from slot.combination c
    left join slot.combination_symbol cs on cs.combination_id = c.id
    left join slot.symbol y on y.id = cs.symbol_id and y.is_active
   group by c.id, c.name, c.bonus, c.is_active;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on slot.combination_detail to authenticated;
    grant execute on function
      slot.save_symbol(uuid,text,text,integer,boolean,boolean,integer),
      slot.archive_symbol(uuid),
      slot.save_combination(uuid,text,numeric,uuid[]),
      slot.archive_combination(uuid)
    to authenticated;
  end if;
end $$;
