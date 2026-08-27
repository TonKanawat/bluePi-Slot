-- bluePi Slot — 0006 row-level security
-- Points convert into real prizes, so the database must assume every client is
-- hostile. Nothing here trusts a value sent by the browser: identity always comes
-- from the session, and no table accepts a direct write that moves points.

-- ---------------------------------------------------------------- identity helpers
-- Resolves the caller to a slot.app_user id. On Supabase that means auth.uid();
-- the local branch exists only so the policies below can be tested against a plain
-- Postgres, and is unreachable in production because the auth schema always exists.
create or replace function slot.current_user_id()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  if to_regnamespace('auth') is null then
    return nullif(current_setting('slot.test_user', true), '')::uuid;
  end if;
  select id into v from slot.app_user
   where auth_user_id = auth.uid() and is_active;
  return v;
end $$;

create or replace function slot.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from slot.app_user
     where id = slot.current_user_id()
       and role in ('system_admin', 'deputy_admin')
  );
$$;

create or replace function slot.is_master()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from slot.app_user
     where id = slot.current_user_id() and role = 'system_admin'
  );
$$;

-- ---------------------------------------------------------------- enable RLS
alter table slot.app_user        enable row level security;
alter table slot.wallet          enable row level security;
alter table slot.ledger          enable row level security;
alter table slot.free_spin_state enable row level security;
alter table slot.symbol          enable row level security;
alter table slot.combination     enable row level security;
alter table slot.combination_symbol enable row level security;
alter table slot.payline         enable row level security;
alter table slot.payout_ladder   enable row level security;
alter table slot.setting         enable row level security;

-- ---------------------------------------------------------------- people
drop policy if exists app_user_read on slot.app_user;
create policy app_user_read on slot.app_user for select
  using (id = slot.current_user_id() or slot.is_admin());

-- Only an admin may register, deactivate or re-role anyone. The one thing an admin
-- cannot do through this policy is demote the master; that is enforced in 0007.
drop policy if exists app_user_write on slot.app_user;
create policy app_user_write on slot.app_user for all
  using (slot.is_admin()) with check (slot.is_admin());

-- ---------------------------------------------------------------- money
-- Read-only to their owner. There is deliberately no INSERT/UPDATE/DELETE policy on
-- any of these: balances move only through the security-definer functions, so even a
-- leaked session token cannot write a wallet directly.
drop policy if exists wallet_read on slot.wallet;
create policy wallet_read on slot.wallet for select
  using (user_id = slot.current_user_id() or slot.is_admin());

drop policy if exists free_spin_read on slot.free_spin_state;
create policy free_spin_read on slot.free_spin_state for select
  using (user_id = slot.current_user_id() or slot.is_admin());

-- The Play Dashboard shows every bet in the system plus every admin wallet edit, so
-- it stays with the admins. Players see their own history.
drop policy if exists ledger_read on slot.ledger;
create policy ledger_read on slot.ledger for select
  using (user_id = slot.current_user_id() or slot.is_admin());

-- ---------------------------------------------------------------- game configuration
-- Everyone signed in can read the rules — the board needs the symbols and the
-- winning-combinations tab needs the groups. Only admins can change them.
do $$
declare t text;
begin
  foreach t in array array['symbol','combination','combination_symbol',
                           'payline','payout_ladder','setting'] loop
    execute format('drop policy if exists %I_read on slot.%I', t, t);
    execute format(
      'create policy %I_read on slot.%I for select using (slot.current_user_id() is not null)',
      t, t);
    execute format('drop policy if exists %I_write on slot.%I', t, t);
    execute format(
      'create policy %I_write on slot.%I for all using (slot.is_admin()) with check (slot.is_admin())',
      t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- grants
-- PostgREST reaches the database as these roles. Table privileges are the outer gate;
-- the policies above are the inner one. Both have to allow an action for it to happen.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema slot to authenticated, anon;

    grant select on slot.app_user, slot.wallet, slot.ledger, slot.free_spin_state,
                    slot.symbol, slot.combination, slot.combination_symbol,
                    slot.payline, slot.payout_ladder, slot.setting
      to authenticated;

    grant insert, update, delete on slot.app_user, slot.symbol, slot.combination,
                                    slot.combination_symbol, slot.setting
      to authenticated;

    -- Deliberately NOT granted on wallet, ledger or free_spin_state: no role can
    -- write those directly, only the definer functions can.
    grant execute on function slot.play(integer) to authenticated;
    revoke execute on function slot.spin(uuid, integer) from authenticated, anon;
    revoke execute on function slot.apply_spin(uuid, integer, jsonb, boolean)
      from authenticated, anon;
  end if;
end $$;
