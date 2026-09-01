-- bluePi Slot — editable payout rules and the line-count simulation
-- Run:  psql -f tests/rules_test.sql
-- Local Postgres only. This truncates tables; never run it against Supabase.

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

delete from slot.reward_claim;   -- claims reference app_user; clear them first
delete from slot.spin_log;
delete from slot.ledger;
delete from slot.free_spin_state;
delete from slot.wallet;
delete from slot.app_user;
delete from slot.combination_symbol;
delete from slot.combination;
delete from slot.symbol;

insert into slot.app_user (id, email, role) values
  ('11110000-0000-0000-0000-000000000001', 'master@bluepi.co.th', 'system_admin'),
  ('33330000-0000-0000-0000-000000000003', 'p1@bluepi.co.th',     'player');
insert into slot.wallet (user_id, free_points, points)
select id, 1000, 0 from slot.app_user;

-- Two symbols in a two-member group. A 1-4 group allows repeats, so a grid made
-- entirely of one of them wins every payline — a deterministic 29-line spin, which
-- is what makes the ladder cap testable without relying on luck.
insert into slot.symbol (name, image_path) values ('A', 'a.png'), ('B', 'b.png');
insert into slot.combination (name, bonus) values ('Pair', 0);
insert into slot.combination_symbol
  select (select id from slot.combination where name = 'Pair'), id from slot.symbol;

-- game_ready wants five active symbols. The extra three go in a group of their own:
-- adding them to "Pair" would push it to five members and bring the no-repeats rule
-- with it, which is exactly what the fixed-grid tests below need to avoid.
insert into slot.symbol (name, image_path) values ('C','c.png'), ('D','d.png'), ('E','e.png');
insert into slot.combination (name, bonus) values ('Rest', 0);
insert into slot.combination_symbol
  select (select id from slot.combination where name = 'Rest'), id
    from slot.symbol where name in ('C','D','E');

-- ---------------------------------------------------------------- the setting exists
do $$
begin
  perform slot.assert('the maximum defaults to 20',
    slot.setting_int('max_paylines_per_round'), 20::numeric);
  perform slot.assert('and game_rules reports it',
    (slot.game_rules()->>'max_paylines')::int, 20);
end $$;

-- ---------------------------------------------------------------- the cap drives the rung
do $$
declare g uuid[]; a uuid; r jsonb; row_ int; col_ int;
begin
  select id into a from slot.symbol where name = 'A';
  g := array_fill(a, array[5,5]);

  -- Every one of the 29 paylines is five A's, which "Pair" accepts.
  r := slot.evaluate_grid(g);
  perform slot.assert('a grid of one symbol wins all 29 lines',
    (r->>'line_count')::int, 29);
  perform slot.assert('all of them are ordinary lines',
    (r->>'normal_lines')::int, 29);

  -- 29 normal lines, capped at 20, is rung 20.
  perform slot.assert('at the default maximum the rung is 20',
    (r->>'base')::numeric, 6.00::numeric);

  -- Drop the maximum and the same grid pays a lower rung.
  update slot.setting set value = '5'::jsonb where key = 'max_paylines_per_round';
  r := slot.evaluate_grid(g);
  perform slot.assert('with a maximum of 5 the same grid pays rung 5',
    (r->>'base')::numeric, 1.50::numeric);
  perform slot.assert('but every line still counts as a win',
    (r->>'line_count')::int, 29);

  -- Raising it past the ladder falls back to the highest rung that exists.
  update slot.setting set value = '29'::jsonb where key = 'max_paylines_per_round';
  r := slot.evaluate_grid(g);
  perform slot.assert('a maximum above the ladder falls back to the top rung',
    (r->>'base')::numeric, 6.00::numeric);

  update slot.setting set value = '20'::jsonb where key = 'max_paylines_per_round';
end $$;

-- ---------------------------------------------------------------- editing the ladder
set slot.test_user = '11110000-0000-0000-0000-000000000001';

do $$
declare m numeric; ok boolean := false;
begin
  perform slot.save_ladder_rung(3, 2.5);
  select multiplier into m from slot.payout_ladder where lines = 3;
  perform slot.assert('an admin can change a rung', m, 2.50::numeric);

  perform slot.save_ladder_rung(25, 7.5);
  select multiplier into m from slot.payout_ladder where lines = 25;
  perform slot.assert('and add one beyond the original twenty', m, 7.50::numeric);

  begin
    perform slot.save_ladder_rung(30, 1);
  exception when check_violation then ok := true;
  end;
  perform slot.assert('a rung above 29 is refused — there are only 29 paylines', ok, true);

  ok := false;
  begin
    perform slot.save_ladder_rung(2, -1);
  exception when check_violation then ok := true;
  end;
  perform slot.assert('a negative multiplier is refused', ok, true);

  -- put rung 3 back
  perform slot.save_ladder_rung(3, 1.1);
end $$;

-- ---------------------------------------------------------------- editing the rules
do $$
declare r jsonb; ok boolean := false;
begin
  r := slot.save_rules(25, 8, true);
  perform slot.assert('the maximum is saved', (r->>'max_paylines')::int, 25);
  perform slot.assert('the ceiling is saved', (r->>'max_multiplier')::int, 8);
  perform slot.assert('and the ceiling switch', (r->>'cap_final')::boolean, true);

  begin
    perform slot.save_rules(30, 6, true);
  exception when check_violation then ok := true;
  end;
  perform slot.assert('a maximum above 29 is refused', ok, true);

  ok := false;
  begin
    perform slot.save_rules(20, 0, true);
  exception when check_violation then ok := true;
  end;
  perform slot.assert('a ceiling below 1 is refused', ok, true);

  perform slot.save_rules(20, 6, true);
end $$;

-- The ceiling actually bites: 29 lines at rung 20 is x6 already, so a bonus on top
-- is what tests it. Turn the cap off and the same grid pays more.
do $$
declare g uuid[]; a uuid; r jsonb;
begin
  select id into a from slot.symbol where name = 'A';
  g := array_fill(a, array[5,5]);
  update slot.combination set bonus = 1.5 where name = 'Pair';

  perform slot.save_rules(20, 6, true);
  r := slot.evaluate_grid(g);
  perform slot.assert('with the ceiling on, a huge win is held at x6',
    (r->>'multiplier')::numeric, 6.00::numeric);

  perform slot.save_rules(20, 6, false);
  r := slot.evaluate_grid(g);
  perform slot.assert('with it off, the bonuses run past x6',
    ((r->>'multiplier')::numeric > 6), true);

  perform slot.save_rules(20, 6, true);
  update slot.combination set bonus = 0 where name = 'Pair';
end $$;

-- ---------------------------------------------------------------- who may edit
set slot.test_user = '33330000-0000-0000-0000-000000000003';
do $$
declare ok boolean := false;
begin
  begin
    perform slot.save_ladder_rung(1, 99);
  exception when insufficient_privilege then ok := true;
  end;
  perform slot.assert('a player cannot edit the ladder', ok, true);

  ok := false;
  begin
    perform slot.save_rules(1, 1, false);
  exception when insufficient_privilege then ok := true;
  end;
  perform slot.assert('a player cannot edit the rules', ok, true);

  ok := false;
  begin
    perform slot.simulate_lines(50);
  exception when insufficient_privilege then ok := true;
  end;
  perform slot.assert('a player cannot run the simulation', ok, true);
end $$;

-- ---------------------------------------------------------------- the simulation
set slot.test_user = '11110000-0000-0000-0000-000000000001';

do $$
declare r jsonb; total int;
begin
  r := slot.simulate_lines(60);
  perform slot.assert('the sample size is honoured', (r->>'spins')::int, 60);

  select sum((e->>'spins')::int) into total from jsonb_array_elements(r->'distribution') e;
  perform slot.assert('the distribution accounts for every spin', total, 60);

  perform slot.assert('the reported maximum matches the setting',
    (r->>'max_paylines')::int, 20);
  perform slot.assert('the most likely line count is within range',
    ((r->>'most_likely')::int between 0 and 29), true);
  perform slot.assert('the percentages are percentages',
    ((r->>'most_likely_pct')::numeric between 0 and 100), true);
  perform slot.assert('the median is no greater than the 95th percentile',
    ((r->>'median_lines')::int <= (r->>'p95_lines')::int), true);
  perform slot.assert('this configuration does win lines',
    ((r->>'mean_lines')::numeric > 0), true);

  -- A sample size below the floor is raised, not obeyed blindly.
  perform slot.assert('a silly sample size is clamped',
    (slot.simulate_lines(1)->>'spins')::int, 50);
end $$;

-- The simulation writes nothing: no spins, no ledger, no wallet movement.
do $$
declare n int; w bigint;
begin
  select count(*)::int into n from slot.spin_log;
  perform slot.assert('the simulation logs no spins', n, 0);
  select count(*)::int into n from slot.ledger;
  perform slot.assert('and moves no points', n, 0);
  select points into w from slot.wallet
   where user_id = '11110000-0000-0000-0000-000000000001';
  perform slot.assert('the admin wallet is untouched', w, 0::bigint);
end $$;

-- An unconfigured game cannot be simulated: the answer would be meaningless.
do $$
declare ok boolean := false;
begin
  delete from slot.combination_symbol;
  begin
    perform slot.simulate_lines(50);
  exception when others then ok := true;
  end;
  perform slot.assert('an unconfigured game refuses to simulate', ok, true);
end $$;

reset slot.test_user;

\echo ''
\echo 'All payout-rule tests passed.'
