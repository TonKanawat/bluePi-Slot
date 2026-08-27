-- bluePi Slot — 0012 admin API surface
-- The back office needs to read and write symbols and combinations from the browser,
-- so the same public-wrapper approach as 0010 is extended to cover them.

-- Who am I? The app needs the role to decide whether to show the back office.
create or replace function public.me()
returns jsonb language sql stable as $$
  select jsonb_build_object(
           'user_id', u.id, 'email', u.email,
           'display_name', u.display_name, 'role', u.role,
           'is_admin', u.role in ('system_admin', 'deputy_admin'))
    from slot.app_user u
   where u.id = slot.current_user_id();
$$;

-- security_invoker means these views obey the row-level policies of whoever queries
-- them, rather than running with the owner's privileges and leaking past RLS.
create or replace view public.game_symbols
  with (security_invoker = true) as
  select id, name, image_path, weight, is_wild, is_scatter,
         scatter_free_spins, is_active, created_at
    from slot.symbol;

create or replace view public.winning_combinations
  with (security_invoker = true) as
  select id, name, bonus, is_active, symbol_count, match_rule, symbols
    from slot.combination_detail;

-- The 29 paylines, so the rules tab can draw them.
create or replace view public.paylines
  with (security_invoker = true) as
  select id, family, cells from slot.payline;

create or replace view public.payout_ladder
  with (security_invoker = true) as
  select lines, multiplier from slot.payout_ladder;

-- ---------------------------------------------------------------- write wrappers
create or replace function public.save_symbol(
  p_id uuid, p_name text, p_image_path text,
  p_weight integer default 100,
  p_is_wild boolean default false,
  p_is_scatter boolean default false,
  p_scatter_free_spins integer default 0
) returns uuid language sql volatile as $$
  select slot.save_symbol(p_id, p_name, p_image_path, p_weight,
                          p_is_wild, p_is_scatter, p_scatter_free_spins);
$$;

create or replace function public.archive_symbol(p_id uuid)
returns void language sql volatile as $$
  select slot.archive_symbol(p_id);
$$;

create or replace function public.save_combination(
  p_id uuid, p_name text, p_bonus numeric, p_symbol_ids uuid[]
) returns uuid language sql volatile as $$
  select slot.save_combination(p_id, p_name, p_bonus, p_symbol_ids);
$$;

create or replace function public.archive_combination(p_id uuid)
returns void language sql volatile as $$
  select slot.archive_combination(p_id);
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.game_symbols, public.winning_combinations,
                    public.paylines, public.payout_ladder to authenticated;
    grant execute on function
      public.me(),
      public.save_symbol(uuid,text,text,integer,boolean,boolean,integer),
      public.archive_symbol(uuid),
      public.save_combination(uuid,text,numeric,uuid[]),
      public.archive_combination(uuid)
    to authenticated;
  end if;
end $$;
