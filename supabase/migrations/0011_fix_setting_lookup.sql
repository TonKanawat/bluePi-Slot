-- bluePi Slot — 0011 make setting lookups fail loudly
--
-- Bug: slot.setting_int() returned NULL when it could not read a setting — either
-- because the key was absent, or because row-level security hid the row from the
-- caller. That NULL then flowed into `free_points + v_grant`, and the first thing
-- anyone saw was "null value in column free_points violates not-null constraint"
-- during sign-in, three statements away from the actual cause.
--
-- Two changes. The lookups now read the settings table as their owner, so RLS can
-- never starve them; and a missing key raises with the key's name instead of
-- quietly poisoning the arithmetic downstream.

create or replace function slot.setting_int(p_key text)
returns numeric language plpgsql stable security definer set search_path = '' as $$
declare v numeric;
begin
  select (value #>> '{}')::numeric into v from slot.setting where key = p_key;
  if v is null then
    raise exception 'game setting "%" is missing or is not a number', p_key
      using errcode = 'object_not_in_prerequisite_state',
            hint = 'Re-run migration 0002, which seeds the default settings.';
  end if;
  return v;
end $$;

create or replace function slot.setting_bool(p_key text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v boolean;
begin
  select (value #>> '{}')::boolean into v from slot.setting where key = p_key;
  if v is null then
    raise exception 'game setting "%" is missing or is not true/false', p_key
      using errcode = 'object_not_in_prerequisite_state',
            hint = 'Re-run migration 0002, which seeds the default settings.';
  end if;
  return v;
end $$;

-- Re-assert every default. 0002 used ON CONFLICT DO NOTHING, so a partially applied
-- run could leave a key absent; this repairs that without disturbing the values an
-- admin has deliberately changed via 0004.
insert into slot.setting (key, value) values
  ('bet_options',          '[25,50,75,100,125,150]'::jsonb),
  ('free_point_ceiling',   '1000'::jsonb),
  ('free_point_grant',     '200'::jsonb),
  ('first_login_grant',    '500'::jsonb),
  ('free_spins_per_round', '10'::jsonb),
  ('free_spin_rounds_max', '3'::jsonb),
  ('yellow_card_bets',     '5'::jsonb),
  ('max_wilds_per_line',   '2'::jsonb),
  ('cap_final_multiplier', 'true'::jsonb),
  ('max_multiplier',       '6'::jsonb),
  ('yellow_card_after_final_round', 'true'::jsonb)
on conflict (key) do nothing;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function slot.setting_int(text), slot.setting_bool(text)
      to authenticated;
  end if;
end $$;
