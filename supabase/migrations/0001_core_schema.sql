-- bluePi Slot — 0001 core schema
-- Reference data + game configuration. Safe to run on a fresh Supabase project.

create schema if not exists slot;

-- ---------------------------------------------------------------- roles & users
do $$ begin
  create type slot.user_role as enum ('system_admin','deputy_admin','line_manager','player');
exception when duplicate_object then null; end $$;

-- Mirrors auth.users. On Supabase, auth.users is managed by GoTrue; this table
-- carries everything the game needs and is created by the admin BEFORE the person
-- can log in (invite-only registration).
create table if not exists slot.app_user (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique,                       -- set on first successful login
  email         text not null unique
                  check (email = lower(email) and email like '%@bluepi.co.th'),
  display_name  text,
  role          slot.user_role not null default 'player',
  is_active     boolean not null default true,
  first_login_at timestamptz,
  created_at    timestamptz not null default now()
);

-- Exactly one master admin.
create unique index if not exists app_user_one_master
  on slot.app_user ((role)) where role = 'system_admin';

-- ---------------------------------------------------------------- wallets
-- Two balances per user. free_points is spent first; winnings only ever land in points.
create table if not exists slot.wallet (
  user_id     uuid primary key references slot.app_user(id) on delete cascade,
  free_points bigint not null default 0 check (free_points >= 0),
  points      bigint not null default 0 check (points >= 0),
  updated_at  timestamptz not null default now()
);

do $$ begin
  create type slot.ledger_reason as enum (
    'first_login_grant','scheduled_grant','admin_edit','request_grant',
    'bet','win','reward_hold','reward_refund'
  );
exception when duplicate_object then null; end $$;

-- Append-only audit trail. Every movement of points, including admin edits,
-- lands here; the Play Dashboard reads from it.
create table if not exists slot.ledger (
  id            bigserial primary key,
  user_id       uuid not null references slot.app_user(id) on delete cascade,
  reason        slot.ledger_reason not null,
  free_delta    bigint not null default 0,
  points_delta  bigint not null default 0,
  free_after    bigint not null,
  points_after  bigint not null,
  actor_id      uuid references slot.app_user(id),   -- null = the system
  spin_id       bigint,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists ledger_user_time on slot.ledger (user_id, created_at desc);

-- ---------------------------------------------------------------- symbols
create table if not exists slot.symbol (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  image_path text not null,                 -- Supabase Storage object path
  -- Reel weighting: relative frequency on every reel. All five reels share one pool.
  weight     integer not null default 100 check (weight > 0),
  is_wild    boolean not null default false,
  -- Scatter grants free spins wherever it lands. Capped at 5 per symbol.
  is_scatter boolean not null default false,
  scatter_free_spins smallint not null default 0
               check (scatter_free_spins between 0 and 5),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint scatter_needs_spins check (not is_scatter or scatter_free_spins > 0),
  constraint spins_need_scatter check (is_scatter or scatter_free_spins = 0)
);

-- ---------------------------------------------------------------- combinations
-- A named group of symbols. 5+ members => distinct symbols required on the line.
-- 1-4 members => duplicates allowed, any members qualify.
create table if not exists slot.combination (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  -- Special multiplier added AFTER the base ladder. 0 = an ordinary combination.
  bonus       numeric(4,2) not null default 0
                check (bonus in (0, 0.25, 0.50, 0.75, 1.00, 1.25, 1.50)),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists slot.combination_symbol (
  combination_id uuid not null references slot.combination(id) on delete cascade,
  symbol_id      uuid not null references slot.symbol(id) on delete cascade,
  primary key (combination_id, symbol_id)
);

-- ---------------------------------------------------------------- paylines
-- The 29 lines recovered from the requirements doc. Cells are (row, col), 0-indexed,
-- row 0 = top. Corner is the only 4-cell line.
create table if not exists slot.payline (
  id     smallint primary key,
  family text not null,
  cells  smallint[][] not null,
  check (array_length(cells, 1) between 4 and 5)
);

-- ---------------------------------------------------------------- payout ladder
-- Base multiplier by number of NORMAL (non-special) winning lines.
create table if not exists slot.payout_ladder (
  lines      smallint primary key check (lines between 1 and 20),
  multiplier numeric(4,2) not null
);

-- ---------------------------------------------------------------- game settings
create table if not exists slot.setting (
  key   text primary key,
  value jsonb not null
);
