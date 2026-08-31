-- bluePi Slot — rewards claiming
-- Run:  psql -f tests/rewards_test.sql
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

delete from slot.reward_claim;
-- Reset the catalogue to the seeded three, so a re-run starts where 0019 left off.
delete from slot.reward where name not in ('Gold Coin','Silver Coin','Bronze Coin');
update slot.reward set is_active = true,
       price = case name when 'Gold Coin' then 5000
                         when 'Silver Coin' then 3750 else 2000 end;
delete from slot.ledger;
delete from slot.free_spin_state;
delete from slot.wallet;
delete from slot.app_user;

insert into slot.app_user (id, email, role) values
  ('11110000-0000-0000-0000-000000000001', 'master@bluepi.co.th', 'system_admin'),
  ('33330000-0000-0000-0000-000000000003', 'p1@bluepi.co.th',     'player'),
  ('44440000-0000-0000-0000-000000000004', 'p2@bluepi.co.th',     'player');
insert into slot.wallet (user_id, free_points, points) values
  ('11110000-0000-0000-0000-000000000001', 0, 0),
  ('33330000-0000-0000-0000-000000000003', 100, 6000),
  ('44440000-0000-0000-0000-000000000004', 0, 2000);

-- ---------------------------------------------------------------- the catalogue
do $$
declare n int; p int;
begin
  select count(*)::int into n from slot.reward where is_active;
  perform slot.assert('three prizes are seeded', n, 3);
  select price into p from slot.reward where name = 'Gold Coin';
  perform slot.assert('Gold Coin costs 5,000', p, 5000);
  select price into p from slot.reward where name = 'Silver Coin';
  perform slot.assert('Silver Coin costs 3,750', p, 3750);
  select price into p from slot.reward where name = 'Bronze Coin';
  perform slot.assert('Bronze Coin costs 2,000', p, 2000);
end $$;

-- ---------------------------------------------------------------- submitting holds the points
set slot.test_user = '33330000-0000-0000-0000-000000000003';

do $$
declare r jsonb; w bigint; n int; cid bigint;
begin
  r := slot.submit_claim((select id from slot.reward where name = 'Gold Coin'));
  cid := (r->>'claim_id')::bigint;

  select points into w from slot.wallet
   where user_id = '33330000-0000-0000-0000-000000000003';
  perform slot.assert('the price leaves the Wallet on submit', w, 1000::bigint);

  select count(*)::int into n from slot.ledger where reason = 'reward_hold';
  perform slot.assert('the hold is written to the ledger', n, 1);

  select free_points into w from slot.wallet
   where user_id = '33330000-0000-0000-0000-000000000003';
  perform slot.assert('free points are untouched by a claim', w, 100::bigint);

  perform slot.assert('the claim starts pending',
    (select status::text from slot.reward_claim where id = cid), 'pending');
  perform slot.assert('the price is snapshotted',
    (select price from slot.reward_claim where id = cid), 5000);
end $$;

-- A second Gold Coin is now unaffordable, which is the point of holding.
do $$
declare ok boolean := false; msg text;
begin
  begin
    perform slot.submit_claim((select id from slot.reward where name = 'Gold Coin'));
  exception when check_violation then ok := true; msg := sqlerrm;
  end;
  perform slot.assert('a second claim the Wallet cannot cover is refused', ok, true);
  perform slot.assert('and the message names the shortfall',
    (position('1000' in msg) > 0), true);
end $$;

-- ---------------------------------------------------------------- cancelling refunds
do $$
declare cid bigint; w bigint; n int;
begin
  select id into cid from slot.reward_claim
   where user_id = '33330000-0000-0000-0000-000000000003' order by id desc limit 1;

  perform slot.cancel_claim(cid);

  perform slot.assert('the claim is cancelled',
    (select status::text from slot.reward_claim where id = cid), 'cancelled');

  select points into w from slot.wallet
   where user_id = '33330000-0000-0000-0000-000000000003';
  perform slot.assert('the points come back in full', w, 6000::bigint);

  select count(*)::int into n from slot.ledger where reason = 'reward_refund';
  perform slot.assert('the refund is written to the ledger', n, 1);
end $$;

-- A cancelled claim cannot be cancelled twice, nor decided afterwards.
do $$
declare cid bigint; ok boolean := false;
begin
  select id into cid from slot.reward_claim
   where user_id = '33330000-0000-0000-0000-000000000003' order by id desc limit 1;
  begin
    perform slot.cancel_claim(cid);
  exception when check_violation then ok := true;
  end;
  perform slot.assert('cancelling twice is refused', ok, true);
end $$;

-- ---------------------------------------------------------------- one player cannot touch another's claim
do $$
declare cid bigint; ok boolean := false;
begin
  perform slot.submit_claim((select id from slot.reward where name = 'Bronze Coin'));
  select id into cid from slot.reward_claim
   where user_id = '33330000-0000-0000-0000-000000000003' order by id desc limit 1;

  set local slot.test_user = '44440000-0000-0000-0000-000000000004';
  begin
    perform slot.cancel_claim(cid);
  exception when insufficient_privilege then ok := true;
  end;
  perform slot.assert('another player cannot cancel your claim', ok, true);
end $$;

-- ...and a player cannot decide one either.
do $$
declare cid bigint; ok boolean := false;
begin
  select id into cid from slot.reward_claim
   where user_id = '33330000-0000-0000-0000-000000000003' order by id desc limit 1;
  set local slot.test_user = '44440000-0000-0000-0000-000000000004';
  begin
    perform slot.decide_claim(cid, true);
  exception when insufficient_privilege then ok := true;
  end;
  perform slot.assert('a player cannot approve a claim', ok, true);
end $$;

-- ---------------------------------------------------------------- the admin decides
set slot.test_user = '11110000-0000-0000-0000-000000000001';

do $$
declare cid bigint; w bigint; before bigint;
begin
  select id into cid from slot.reward_claim
   where user_id = '33330000-0000-0000-0000-000000000003' order by id desc limit 1;
  select points into before from slot.wallet
   where user_id = '33330000-0000-0000-0000-000000000003';

  perform slot.decide_claim(cid, true, 'handed over in person');

  perform slot.assert('the claim is approved',
    (select status::text from slot.reward_claim where id = cid), 'approved');
  perform slot.assert('the decision names the admin',
    (select decided_by from slot.reward_claim where id = cid),
    '11110000-0000-0000-0000-000000000001'::uuid);

  select points into w from slot.wallet
   where user_id = '33330000-0000-0000-0000-000000000003';
  perform slot.assert('approval moves no points — they left at submit', w, before);
end $$;

-- An approved claim can no longer be cancelled by its owner.
do $$
declare cid bigint; ok boolean := false;
begin
  select id into cid from slot.reward_claim
   where user_id = '33330000-0000-0000-0000-000000000003' order by id desc limit 1;
  set local slot.test_user = '33330000-0000-0000-0000-000000000003';
  begin
    perform slot.cancel_claim(cid);
  exception when check_violation then ok := true;
  end;
  perform slot.assert('an approved claim cannot be cancelled', ok, true);
end $$;

-- Rejection refunds.
do $$
declare cid bigint; w bigint;
begin
  set local slot.test_user = '44440000-0000-0000-0000-000000000004';
  perform slot.submit_claim((select id from slot.reward where name = 'Bronze Coin'));
  select id into cid from slot.reward_claim
   where user_id = '44440000-0000-0000-0000-000000000004' order by id desc limit 1;

  select points into w from slot.wallet
   where user_id = '44440000-0000-0000-0000-000000000004';
  perform slot.assert('the second player is held down to zero', w, 0::bigint);

  set local slot.test_user = '11110000-0000-0000-0000-000000000001';
  perform slot.decide_claim(cid, false, 'out of stock');

  perform slot.assert('the claim is rejected',
    (select status::text from slot.reward_claim where id = cid), 'rejected');
  select points into w from slot.wallet
   where user_id = '44440000-0000-0000-0000-000000000004';
  perform slot.assert('rejection returns the points', w, 2000::bigint);
end $$;

-- ---------------------------------------------------------------- the catalogue is editable
do $$
declare rid uuid; p int; n int;
begin
  rid := slot.save_reward(null, 'Platinum Coin', 9000, 0);
  perform slot.assert('an admin can add a prize',
    (select r.price from slot.reward r where r.id = rid), 9000);

  perform slot.save_reward(rid, 'Platinum Coin', 8000, 0);
  perform slot.assert('and change its price',
    (select r.price from slot.reward r where r.id = rid), 8000);

  perform slot.archive_reward(rid);
  perform slot.assert('and retire it',
    (select r.is_active from slot.reward r where r.id = rid), false);

  select count(*)::int into n from slot.reward;
  perform slot.assert('retiring keeps the row, so history still reads', n, 4);
end $$;

-- A retired prize cannot be claimed.
do $$
declare ok boolean := false; rid uuid;
begin
  select r.id into rid from slot.reward r where r.name = 'Platinum Coin';
  set local slot.test_user = '33330000-0000-0000-0000-000000000003';
  begin
    perform slot.submit_claim(rid);
  exception when no_data_found then ok := true;
  end;
  perform slot.assert('a retired prize cannot be claimed', ok, true);
end $$;

-- A player cannot edit the catalogue.
do $$
declare ok boolean := false;
begin
  set local slot.test_user = '33330000-0000-0000-0000-000000000003';
  begin
    perform slot.save_reward(null, 'Free Coin', 1, 0);
  exception when insufficient_privilege then ok := true;
  end;
  perform slot.assert('a player cannot add a prize', ok, true);
end $$;

-- ---------------------------------------------------------------- the six-month history
do $$
declare n int; old bigint;
begin
  -- Backdate one approved claim beyond the window.
  insert into slot.reward_claim (user_id, reward_id, reward_name, price, status, created_at)
  values ('44440000-0000-0000-0000-000000000004',
          (select id from slot.reward where name = 'Gold Coin'),
          'Gold Coin', 5000, 'approved', now() - interval '7 months')
  returning id into old;

  select count(*)::int into n from slot.reward_claim
   where status = 'approved' and created_at > now() - interval '6 months';
  perform slot.assert('one approved claim is inside the window', n, 1);

  select count(*)::int into n from slot.reward_claim where status = 'approved';
  perform slot.assert('the older one is still stored, just not shown', n, 2);
end $$;

-- Another player sees the recent approved claim but nothing else of p1's.
-- Row-level security is skipped for the table owner, so this has to run as a
-- non-owner role or it proves nothing.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'slot_client') then
    create role slot_client nologin;
  end if;
end $$;
grant usage on schema slot to slot_client;
grant select on slot.reward, slot.reward_claim, slot.app_user to slot_client;

set slot.test_user = '44440000-0000-0000-0000-000000000004';
do $$
declare n int;
begin
  set local role slot_client;
  select count(*)::int into n from slot.reward_claim
   where user_id = '33330000-0000-0000-0000-000000000003';
  perform slot.assert('a player sees another player''s approved claim only', n, 1);
end $$;

-- ...and cannot write to the table directly, whatever the front end asks for.
do $$
declare ok boolean := false;
begin
  set local role slot_client;
  begin
    update slot.reward_claim set status = 'approved' where status = 'pending';
  exception when insufficient_privilege then ok := true;
  end;
  perform slot.assert('no role can decide a claim by writing to the table', ok, true);
end $$;

reset slot.test_user;

\echo ''
\echo 'All rewards tests passed.'
