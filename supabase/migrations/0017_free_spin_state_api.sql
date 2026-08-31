-- bluePi Slot — 0017 let the browser ask what free spins are owed
--
-- Free spins were never actually lost: slot.free_spin_state is written inside the
-- spin transaction and survives anything the browser does. But the page only knew
-- about them from the last spin's response, so a refresh or a tab switch wiped the
-- banner, unlocked the bet selector and relabelled the button "Spin" — while the
-- server still owed the player their spins. It looked exactly like losing them.
--
-- The page needs to be able to ask. This is the read side; the write side stays
-- where it belongs, inside slot.apply_spin.

create or replace function public.my_free_spins()
returns table (
  remaining     integer,
  round         integer,
  rounds_max    integer,
  stake         integer,
  ban_bets_left integer
) language sql stable as $$
  select coalesce(f.remaining, 0)::integer,
         coalesce(f.round, 0)::integer,
         slot.setting_int('free_spin_rounds_max')::integer,
         f.stake,
         coalesce(f.ban_bets_left, 0)::integer
    from slot.app_user u
    left join slot.free_spin_state f on f.user_id = u.id
   where u.id = slot.current_user_id();
$$;

-- Runs as the caller, so free_spin_read decides what comes back: your own row, or
-- everyone's if you are an admin. Signed out, it returns nothing at all.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.my_free_spins() to authenticated;
    revoke execute on function public.my_free_spins() from anon;
  end if;
end $$;
