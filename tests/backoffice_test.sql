-- bluePi Slot — admin back office tests
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

delete from slot.combination_symbol; delete from slot.combination; delete from slot.symbol;
delete from slot.ledger; delete from slot.free_spin_state;
delete from slot.wallet; delete from slot.app_user;

insert into slot.app_user (id, email, role) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'boss@bluepi.co.th',   'system_admin'),
  ('bbbb0000-0000-0000-0000-00000000000b', 'player@bluepi.co.th', 'player');
insert into slot.wallet (user_id) select id from slot.app_user;

set slot.test_user = 'aaaa0000-0000-0000-0000-00000000000a';

do $$
declare a uuid; b uuid; c uuid; d uuid; e uuid; w uuid; s uuid; g uuid; ok boolean := false; n int;
begin
  a := slot.save_symbol(null, 'Ake',   'symbols/ake.png');
  b := slot.save_symbol(null, 'Bench', 'symbols/bench.png');
  c := slot.save_symbol(null, 'Got',   'symbols/got.png');
  d := slot.save_symbol(null, 'Hope',  'symbols/hope.png');
  e := slot.save_symbol(null, 'Pong',  'symbols/pong.png');
  perform slot.assert('admin can create symbols',
    (select count(*)::int from slot.symbol), 5);

  w := slot.save_symbol(null, 'Wild', 'symbols/wild.png', 40, true, false, 0);
  s := slot.save_symbol(null, 'Scat', 'symbols/scat.png', 3, false, true, 5);
  perform slot.assert('wild flagged',    (select is_wild from slot.symbol where id = w), true);
  perform slot.assert('scatter rounds',  (select scatter_free_spins::int from slot.symbol where id = s), 5);
  perform slot.assert('scatter weight 3', (select weight from slot.symbol where id = s), 3);

  begin
    perform slot.save_symbol(null, 'Both', 'symbols/x.png', 100, true, true, 3);
  exception when check_violation then ok := true;
  end;
  perform slot.assert('a symbol cannot be wild and scatter', ok, true);

  ok := false;
  begin
    perform slot.save_symbol(null, 'Greedy', 'symbols/g.png', 100, false, true, 9);
  exception when check_violation then ok := true;
  end;
  perform slot.assert('scatter rounds capped at 5', ok, true);

  -- editing
  perform slot.save_symbol(a, 'Ake (updated)', 'symbols/ake2.png', 120);
  perform slot.assert('symbol can be edited',
    (select name from slot.symbol where id = a), 'Ake (updated)');
  perform slot.assert('no duplicate row created',
    (select count(*)::int from slot.symbol), 7);

  -- combinations
  g := slot.save_combination(null, 'Tech Leads', 0, array[a, b, c]);
  perform slot.assert('group saved with members',
    (select symbol_count::int from slot.combination_detail where id = g), 3);
  perform slot.assert('1-4 members means repeatable',
    (select match_rule from slot.combination_detail where id = g), 'repeatable');

  g := slot.save_combination(g, 'Tech Leads', 1.50, array[a, b, c, d, e]);
  perform slot.assert('membership replaced, not appended',
    (select symbol_count::int from slot.combination_detail where id = g), 5);
  perform slot.assert('5+ members means distinct',
    (select match_rule from slot.combination_detail where id = g), 'distinct');
  perform slot.assert('bonus updated',
    (select bonus from slot.combination_detail where id = g), 1.50::numeric);
  perform slot.assert('still one combination',
    (select count(*)::int from slot.combination), 1);

  ok := false;
  begin
    perform slot.save_combination(null, 'Empty', 0, array[]::uuid[]);
  exception when check_violation then ok := true;
  end;
  perform slot.assert('an empty group is refused', ok, true);

  ok := false;
  begin
    perform slot.save_combination(null, 'Ghost', 0,
      array['99999999-9999-9999-9999-999999999999'::uuid]);
  exception when foreign_key_violation then ok := true;
  end;
  perform slot.assert('an unknown symbol is refused', ok, true);

  -- archiving pulls the symbol out of its groups
  perform slot.archive_symbol(a);
  perform slot.assert('archived symbol is inactive',
    (select is_active from slot.symbol where id = a), false);
  perform slot.assert('and is removed from its group',
    (select symbol_count::int from slot.combination_detail where id = g), 4);
  perform slot.assert('but the symbol row survives for the ledger',
    (select count(*)::int from slot.symbol where id = a), 1);

  -- readiness reflects the configuration
  perform slot.assert('game is ready once configured',
    (slot.game_ready()->>'ready')::boolean, true);
end $$;

-- a player has none of these powers
set slot.test_user = 'bbbb0000-0000-0000-0000-00000000000b';
do $$
declare ok boolean := false;
begin
  begin
    perform slot.save_symbol(null, 'Cheat', 'x.png', 9999);
  exception when insufficient_privilege then ok := true;
  end;
  perform slot.assert('a player cannot add symbols', ok, true);

  ok := false;
  begin
    perform slot.save_combination(null, 'Cheat group', 1.5,
      array[(select id from slot.symbol limit 1)]);
  exception when insufficient_privilege then ok := true;
  end;
  perform slot.assert('a player cannot add combinations', ok, true);
end $$;
reset slot.test_user;

\echo ''
\echo 'All back office tests passed.'
