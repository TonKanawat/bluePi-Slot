-- bluePi Slot — 0010 public API surface
--
-- PostgREST only serves schemas listed as "exposed" in the project's API settings,
-- and that list is `public` by default. Everything the game is built from lives in
-- `slot`, so a browser calling rpc('claim_account') never reaches it.
--
-- The fix could be to expose `slot` in the dashboard, but that would publish every
-- table in it. Instead these are thin wrappers in `public`: the browser gets exactly
-- the four calls it needs and nothing else. They run as the caller, so row-level
-- security still applies exactly as before.

create or replace function public.claim_account()
returns jsonb language sql volatile as $$
  select slot.claim_account();
$$;

create or replace function public.game_ready()
returns jsonb language sql stable as $$
  select slot.game_ready();
$$;

create or replace function public.play(p_bet integer)
returns jsonb language sql volatile as $$
  select slot.play(p_bet);
$$;

-- The signed-in player's own balances. Returns no row when not signed in, which is
-- the wallet policy doing its job rather than a special case here.
create or replace function public.my_wallet()
returns table (free_points bigint, points bigint)
language sql stable as $$
  select w.free_points, w.points
    from slot.wallet w
   where w.user_id = slot.current_user_id();
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.claim_account(), public.game_ready(),
                              public.play(integer), public.my_wallet()
      to authenticated;
    -- Nothing here is useful before signing in, so anon gets none of it.
    revoke execute on function public.claim_account(), public.game_ready(),
                               public.play(integer), public.my_wallet()
      from anon;
  end if;
end $$;
