-- bluePi Slot — spin transaction tests
-- Run after engine_test.sql:  psql -f tests/spin_test.sql

\set ON_ERROR_STOP on
set search_path to slot, public;

-- ---------------------------------------------------------------- fixtures
delete from slot.ledger;
delete from slot.free_spin_state;
delete from slot.wallet;
delete from slot.app_user;

insert into slot.app_user (id, email, role)
values ('11111111-1111-1111-1111-111111111111', 'tester@bluepi.co.th', 'player');
insert into slot.wallet (user_id, free_points, points)
values ('11111111-1111-1111-1111-111111111111', 100, 0);

create or replace function slot.tester() returns uuid
language sql immutable as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;

-- A hand-built evaluation result, so these tests exercise the wallet and the
-- free-spin chain rather than the RNG.
create or replace function slot.fake(p_mult numeric, p_free int default 0)
returns jsonb language sql immutable as $$
  select jsonb_build_object('multiplier', p_mult, 'free_spins', p_free,
                            'lines', '[]'::jsonb, 'line_count', 0);
$$;

create or replace function slot.bal(out free bigint, out pts bigint)
language sql stable as $$ select free_points, points from slot.wallet where user_id = slot.tester() $$;

-- ---------------------------------------------------------------- charging
do $$
declare r jsonb; f bigint; p bigint;
begin
  -- 25-point bet against 100 free / 0 wallet, paying x2 -> 50 into the Wallet.
  r := slot.apply_spin(slot.tester(), 25, slot.fake(2.0), false);
  select free, pts into f, p from slot.bal();
  perform slot.assert('free points charged first', f, 75::bigint);
  perform slot.assert('win lands in the Wallet',   p, 50::bigint);
  perform slot.assert('payout reported',           (r->>'payout')::int, 50);

  -- Drain the free wallet: 75 left, bet 100 -> 75 free + 25 from the Wallet.
  r := slot.apply_spin(slot.tester(), 100, slot.fake(0), false);
  select free, pts into f, p from slot.bal();
  perform slot.assert('free wallet drained first', f, 0::bigint);
  perform slot.assert('remainder from the Wallet', p, 25::bigint);
  perform slot.assert('split reported (free)',   (r->>'paid_from_free')::int, 75);
  perform slot.assert('split reported (wallet)', (r->>'paid_from_wallet')::int, 25);
end $$;

do $$
declare ok boolean := false;
begin
  -- 25 points left, 150 bet: must refuse rather than go negative.
  begin
    perform slot.apply_spin(slot.tester(), 150, slot.fake(1.0), false);
  exception when check_violation then ok := true;
  end;
  perform slot.assert('overspending is refused', ok, true);
end $$;

-- ---------------------------------------------------------------- rounding
do $$
declare f bigint; p bigint; before bigint;
begin
  update slot.wallet set free_points = 1000, points = 0 where user_id = slot.tester();
  -- 25 x 1.10 = 27.5, rounded to nearest.
  perform slot.apply_spin(slot.tester(), 25, slot.fake(1.10), false);
  select pts into p from slot.bal();
  perform slot.assert('x1.10 on a 25 bet pays 28', p, 28::bigint);
  select free into before from slot.bal();

  -- A losing spin still charges.
  perform slot.apply_spin(slot.tester(), 25, slot.fake(0), false);
  select free into f from slot.bal();
  perform slot.assert('a loss still costs the stake', before - f, 25::bigint);
end $$;

-- ---------------------------------------------------------------- free-spin chain
do $$
declare r jsonb; f bigint; p bigint; i int;
begin
  update slot.wallet set free_points = 1000, points = 0 where user_id = slot.tester();
  update slot.free_spin_state set remaining = 0, pending = 0, round = 0,
         stake = null, ban_bets_left = 0 where user_id = slot.tester();

  -- A paid 50 bet that lands 3 scatter rounds.
  r := slot.apply_spin(slot.tester(), 50, slot.fake(0, 3), false);
  perform slot.assert('free spins banked',      (r->>'free_spins_left')::int, 3);
  perform slot.assert('chain starts at round 1',(r->>'free_spin_round')::int, 1);
  select free into f from slot.bal();
  perform slot.assert('paid spin charged', f, 950::bigint);

  -- Free spin: no charge, pays at the triggering stake of 50.
  r := slot.apply_spin(slot.tester(), 50, slot.fake(2.0), true);
  select free, pts into f, p from slot.bal();
  perform slot.assert('free spin costs nothing', f, 950::bigint);
  perform slot.assert('free spin pays 50 x 2',   p, 100::bigint);
  perform slot.assert('two free spins left',   (r->>'free_spins_left')::int, 2);

  -- Burn the rest with no retrigger; the chain should simply end.
  r := slot.apply_spin(slot.tester(), 50, slot.fake(0), true);
  r := slot.apply_spin(slot.tester(), 50, slot.fake(0), true);
  perform slot.assert('chain ended',        (r->>'chain_ended')::boolean, true);
  perform slot.assert('no Yellow Card after round 1', (r->>'yellow_card')::boolean, false);
  perform slot.assert('no ban',             (r->>'ban_bets_left')::int, 0);
end $$;

-- ---------------------------------------------------------------- three rounds, then the card
do $$
declare r jsonb;
begin
  update slot.wallet set free_points = 5000, points = 0 where user_id = slot.tester();
  update slot.free_spin_state set remaining = 0, pending = 0, round = 0,
         stake = null, ban_bets_left = 0 where user_id = slot.tester();

  -- Round 1: one free spin, which retriggers one more (round 2), which retriggers
  -- again (round 3), which retriggers a fourth time and is refused.
  r := slot.apply_spin(slot.tester(), 25, slot.fake(0, 1), false);
  perform slot.assert('round 1 open', (r->>'free_spin_round')::int, 1);

  r := slot.apply_spin(slot.tester(), 25, slot.fake(0, 1), true);
  perform slot.assert('retrigger opens round 2', (r->>'free_spin_round')::int, 2);

  r := slot.apply_spin(slot.tester(), 25, slot.fake(0, 1), true);
  perform slot.assert('retrigger opens round 3', (r->>'free_spin_round')::int, 3);

  r := slot.apply_spin(slot.tester(), 25, slot.fake(0, 1), true);
  perform slot.assert('a 4th round is refused', (r->>'free_spins_left')::int, 0);
  perform slot.assert('Yellow Card raised',     (r->>'yellow_card')::boolean, true);
  perform slot.assert('banned for 5 bets',      (r->>'ban_bets_left')::int, 5);
end $$;

-- ---------------------------------------------------------------- the ban
do $$
declare r jsonb; i int;
begin
  -- While banned, scatters award nothing.
  r := slot.apply_spin(slot.tester(), 25, slot.fake(0, 5), false);
  perform slot.assert('banned: no free spins awarded', (r->>'free_spins_left')::int, 0);
  perform slot.assert('ban counts down',              (r->>'ban_bets_left')::int, 4);

  for i in 1..4 loop
    r := slot.apply_spin(slot.tester(), 25, slot.fake(0, 5), false);
  end loop;
  perform slot.assert('ban served', (r->>'ban_bets_left')::int, 0);

  -- The next paid spin gets its free spins again.
  r := slot.apply_spin(slot.tester(), 25, slot.fake(0, 5), false);
  perform slot.assert('free spins resume after the ban', (r->>'free_spins_left')::int, 5);
end $$;

-- ---------------------------------------------------------------- audit trail
do $$
declare n int; bad int;
begin
  select count(*)::int into n from slot.ledger where user_id = slot.tester();
  perform slot.assert('every movement is logged', (n > 0), true);

  -- Free spins must never produce a 'bet' row.
  select count(*)::int into bad from slot.ledger
   where reason = 'bet' and is_free_spin;
  perform slot.assert('no charge rows for free spins', bad, 0);

  -- The wallet can never go negative.
  select count(*)::int into bad from slot.ledger
   where free_after < 0 or points_after < 0;
  perform slot.assert('balances never went negative', bad, 0);
end $$;

\echo ''
\echo 'All spin tests passed.'
