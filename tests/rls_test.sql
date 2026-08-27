-- bluePi Slot — row-level security tests
-- Proves the policies actually block things, rather than merely existing.
-- Run last:  psql -f tests/rls_test.sql

\set ON_ERROR_STOP on
set search_path to slot, public;

create or replace function slot.assert(p_label text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL % — got %, want %', p_label, p_got, p_want;
  end if;
  raise notice 'ok   %  (%)', p_label, p_got;
end $$;

-- A non-superuser stand-in for PostgREST's "authenticated" role. Superusers bypass
-- RLS entirely, so testing as postgres would prove nothing.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'slot_client') then
    create role slot_client nologin;
  end if;
end $$;

grant usage on schema slot to slot_client;
grant select on slot.app_user, slot.wallet, slot.ledger, slot.free_spin_state,
                slot.symbol, slot.combination, slot.combination_symbol,
                slot.payline, slot.payout_ladder, slot.setting to slot_client;
grant insert, update, delete on slot.symbol, slot.combination to slot_client;

-- ---------------------------------------------------------------- fixtures
delete from slot.ledger;
delete from slot.free_spin_state;
delete from slot.wallet;
delete from slot.app_user;

insert into slot.app_user (id, email, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@bluepi.co.th', 'player'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@bluepi.co.th',   'player'),
  ('cccccccc-0000-0000-0000-000000000003', 'boss@bluepi.co.th',  'system_admin');

insert into slot.wallet (user_id, free_points, points) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 500, 120),
  ('bbbbbbbb-0000-0000-0000-000000000002', 800, 340),
  ('cccccccc-0000-0000-0000-000000000003', 500, 0);

insert into slot.ledger (user_id, reason, free_delta, points_delta, free_after, points_after)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'bet', -25, 0, 475, 120),
       ('bbbbbbbb-0000-0000-0000-000000000002', 'bet', -50, 0, 750, 340);

-- ---------------------------------------------------------------- a player
set role slot_client;
set slot.test_user = 'aaaaaaaa-0000-0000-0000-000000000001';

do $$
declare n int; ok boolean;
begin
  perform slot.assert('alice resolves to herself',
    slot.current_user_id(), 'aaaaaaaa-0000-0000-0000-000000000001'::uuid);
  perform slot.assert('alice is not an admin', slot.is_admin(), false);

  select count(*)::int into n from slot.wallet;
  perform slot.assert('alice sees exactly one wallet', n, 1);

  select count(*)::int into n from slot.wallet
   where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  perform slot.assert('alice cannot see bob''s wallet', n, 0);

  -- The Play Dashboard is public by decision, so Alice sees everyone's bets here.
  -- Her wallet BALANCE is still private; only the ledger is shared.
  select count(*)::int into n from slot.ledger;
  perform slot.assert('the play dashboard is public', n, 2);

  select count(*)::int into n from slot.app_user;
  perform slot.assert('alice sees only her own profile', n, 1);

  -- The rules are public to anyone signed in.
  select count(*)::int into n from slot.payline;
  perform slot.assert('alice can read the paylines', n, 29);
  select count(*)::int into n from slot.payout_ladder;
  perform slot.assert('alice can read the ladder', n, 20);

  -- But she cannot change them.
  ok := false;
  begin
    insert into slot.combination (name, bonus) values ('alice cheats', 1.5);
  exception when insufficient_privilege then ok := true;
  end;
  perform slot.assert('alice cannot add a winning combination', ok, true);
end $$;

-- Giving herself points must fail. No write policy exists on wallet at all, and the
-- table privilege is withheld too, so this is refused twice over.
do $$
declare ok boolean := false;
begin
  begin
    update slot.wallet set points = points + 1000000
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  exception when insufficient_privilege then ok := true;
  end;
  perform slot.assert('alice cannot top up her own wallet', ok, true);
end $$;

-- Nor can she call the engine directly to spin on someone else's behalf.
do $$
declare ok boolean := false;
begin
  begin
    perform slot.apply_spin('bbbbbbbb-0000-0000-0000-000000000002', 25,
                            '{"multiplier":6,"free_spins":0}'::jsonb, false);
  exception when insufficient_privilege then ok := true;
  end;
  perform slot.assert('alice cannot spin as bob', ok, true);
end $$;

-- ---------------------------------------------------------------- an admin
set slot.test_user = 'cccccccc-0000-0000-0000-000000000003';

do $$
declare n int;
begin
  perform slot.assert('boss is an admin',  slot.is_admin(),  true);
  perform slot.assert('boss is the master', slot.is_master(), true);

  select count(*)::int into n from slot.wallet;
  perform slot.assert('boss sees every wallet', n, 3);

  select count(*)::int into n from slot.ledger;
  perform slot.assert('boss sees the whole play dashboard too', n, 2);

  select count(*)::int into n from slot.app_user;
  perform slot.assert('boss sees every user', n, 3);

  insert into slot.combination (name, bonus) values ('boss adds a group', 0.5);
  select count(*)::int into n from slot.combination where name = 'boss adds a group';
  perform slot.assert('boss can add a winning combination', n, 1);
  delete from slot.combination where name = 'boss adds a group';
end $$;

-- ---------------------------------------------------------------- signed out
set slot.test_user = '';

do $$
declare n int;
begin
  perform slot.assert('no session resolves to nobody', slot.current_user_id(), null::uuid);
  select count(*)::int into n from slot.payline;
  perform slot.assert('a signed-out caller sees no paylines', n, 0);
  select count(*)::int into n from slot.symbol;
  perform slot.assert('a signed-out caller sees no symbols', n, 0);
  select count(*)::int into n from slot.wallet;
  perform slot.assert('a signed-out caller sees no wallets', n, 0);
  select count(*)::int into n from slot.ledger;
  perform slot.assert('and no dashboard either', n, 0);
end $$;

reset role;
reset slot.test_user;

\echo ''
\echo 'All RLS tests passed.'
