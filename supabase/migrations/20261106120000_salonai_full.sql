-- SALONAI full feature tables (owner desk, customer app, HQ).
-- Run AFTER 20261102120000, 20261102140000 and 20261104120000 (bookings).
-- Supabase wraps this file in a transaction. Nothing here drops data.

-- ---------------------------------------------------------------- helpers
-- ---------------------------------------------------------------- HQ admins first (used by policies below)
create table hq_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'hq_staff' check (role in ('hq_master', 'hq_staff', 'hq_finance', 'hq_sales')),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);

create or replace function public.is_hq_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from hq_admins where user_id = auth.uid() and removed_at is null);
$$;

create or replace function public.is_hq_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from hq_admins where user_id = auth.uid() and removed_at is null and role = 'hq_master');
$$;

-- ---------------------------------------------------------------- stores: extra columns
alter table stores drop constraint if exists stores_status_check;
alter table stores add constraint stores_status_check check (status in ('pending', 'approved', 'suspended', 'rejected'));
alter table stores add column if not exists postcode text;
alter table stores add column if not exists address_detail text;
alter table stores add column if not exists inflow_sources text[] not null default '{}';
alter table stores add column if not exists length_mode text not null default 'none';
alter table stores add column if not exists naver_place_url text;
alter table stores add column if not exists naver_place_id text;
alter table stores add column if not exists naver_login_id text;
alter table stores add column if not exists naver_status text not null default 'none'
  check (naver_status in ('none', 'preparing', 'active'));
alter table stores add column if not exists store_code text unique;
alter table stores add column if not exists referral_code text;

-- ---------------------------------------------------------------- store_members: invites, permissions, ordering
alter table store_members alter column user_id drop not null;
alter table store_members drop constraint if exists store_members_role_check;
alter table store_members add constraint store_members_role_check
  check (role in ('owner', 'staff', 'assistant', 'manager', 'custom'));
alter table store_members add column if not exists status text not null default 'active'
  check (status in ('active', 'invited', 'left'));
alter table store_members add column if not exists invite_code text unique;
alter table store_members add column if not exists invited_phone text;
alter table store_members add column if not exists permissions jsonb not null default '{}';
alter table store_members add column if not exists is_designer boolean not null default true;
alter table store_members add column if not exists sort_order integer not null default 0;
alter table store_members add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------- bookings: customer app fields
alter table bookings drop constraint if exists bookings_source_check;
alter table bookings add constraint bookings_source_check
  check (source in ('app', 'customer_app', 'naver', 'phone', 'walk_in', 'dm', 'manual'));
alter table bookings add column if not exists customer_request text;
alter table bookings add column if not exists deposit_amount integer not null default 0;

-- ---------------------------------------------------------------- owner desk tables
create table store_business_hours (
  store_id uuid not null references stores (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_closed boolean not null default false,
  open_time time,
  close_time time,
  break_start time,
  break_end time,
  primary key (store_id, weekday)
);

create table store_holidays (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index store_holidays_store_idx on store_holidays (store_id, start_date);

create table store_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  event_date date not null,
  title text not null,
  created_at timestamptz not null default now()
);
create index store_events_store_idx on store_events (store_id, event_date);

create table member_offs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  member_id uuid not null references store_members (id) on delete cascade,
  off_date date not null,
  kind text not null default 'off' check (kind in ('off', 'duty')),
  memo text,
  created_at timestamptz not null default now()
);
create index member_offs_store_idx on member_offs (store_id, off_date);

create table pre_surveys (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  booking_id uuid references bookings (id) on delete cascade,
  customer_id uuid references customers (id) on delete set null,
  status text not null default 'sent' check (status in ('sent', 'answered', 'expired')),
  topic text,
  kinds text[] not null default '{}',
  items jsonb not null default '[]',
  answers jsonb not null default '[]',
  flags jsonb not null default '[]',
  summary jsonb not null default '{"safety": [], "style": []}',
  guides jsonb not null default '[]',
  is_sample boolean not null default false,
  sent_at timestamptz not null default now(),
  answered_at timestamptz
);
create index pre_surveys_store_idx on pre_surveys (store_id, status);
create index pre_surveys_booking_idx on pre_surveys (booking_id);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_store_idx on audit_logs (store_id, created_at desc);

create table showcase_grace (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  ai_path text,
  title text,
  remove_after timestamptz not null,
  resolved_at timestamptz
);

-- ---------------------------------------------------------------- customer app tables
create table customer_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text,
  phone text,
  nickname text,
  style_prefs text[] not null default '{}',
  terms_agreed_at timestamptz,
  location_agree boolean not null default false,
  marketing_agree boolean not null default false,
  night_push_agree boolean,
  verified boolean not null default false,
  share boolean not null default true,
  created_at timestamptz not null default now()
);

create table customer_store_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid not null references stores (id) on delete cascade,
  customer_id uuid references customers (id) on delete set null,
  following boolean not null default true,
  linked_at timestamptz not null default now(),
  unique (user_id, store_id)
);

create table customer_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid references stores (id) on delete set null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index customer_notifications_user_idx on customer_notifications (user_id, created_at desc);

create table customer_diary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid references stores (id) on delete set null,
  booking_id uuid references bookings (id) on delete set null,
  title text,
  note text,
  photo_paths text[] not null default '{}',
  shared boolean not null default true,
  hidden boolean not null default false,
  visited_at timestamptz not null default now()
);
create index customer_diary_user_idx on customer_diary (user_id, visited_at desc);

-- ---------------------------------------------------------------- HQ tables
create table hq_notices (
  id uuid primary key default gen_random_uuid(),
  no serial,
  title text not null,
  body text,
  important boolean not null default false,
  published_at timestamptz not null default now()
);

create table hq_regions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order integer not null default 0
);

create table hq_orgs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null default 'branch' check (kind in ('hq', 'branch', 'office')),
  region_id uuid references hq_regions (id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table hq_reps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references hq_orgs (id) on delete cascade,
  code text not null unique,
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  voided_at timestamptz
);

create table hq_store_assignments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  rep_id uuid not null references hq_reps (id) on delete cascade,
  share_pct integer not null default 100 check (share_pct between 0 and 100),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (store_id, rep_id)
);

create table hq_commission_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate_pct numeric(6, 3) not null default 0.1 check (rate_pct >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table hq_plans (
  id text primary key,
  name text not null,
  monthly_fee_krw integer not null default 0 check (monthly_fee_krw >= 0),
  sort_order integer not null default 0
);

create table hq_addons (
  id text primary key,
  name text not null,
  monthly_fee_krw integer not null default 0 check (monthly_fee_krw >= 0),
  active boolean not null default true,
  sort_order integer not null default 0
);

create table hq_store_billing (
  store_id uuid primary key references stores (id) on delete cascade,
  plan_id text references hq_plans (id),
  billing_status text not null default 'none' check (billing_status in ('none', 'trial', 'paid', 'overdue', 'suspended')),
  addons jsonb not null default '{}',
  referral jsonb,
  logs jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create table hq_settlement_runs (
  id uuid primary key default gen_random_uuid(),
  month text not null unique check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  status text not null default 'computed' check (status in ('computed', 'closed', 'confirmed', 'paid')),
  rows jsonb not null default '[]',
  total_krw bigint not null default 0,
  computed_at timestamptz not null default now(),
  closed_at timestamptz,
  confirmed_at timestamptz,
  paid_at timestamptz
);

-- ---------------------------------------------------------------- RLS
alter table hq_admins enable row level security;
alter table store_business_hours enable row level security;
alter table store_holidays enable row level security;
alter table store_events enable row level security;
alter table member_offs enable row level security;
alter table pre_surveys enable row level security;
alter table audit_logs enable row level security;
alter table showcase_grace enable row level security;
alter table customer_profiles enable row level security;
alter table customer_store_links enable row level security;
alter table customer_notifications enable row level security;
alter table customer_diary enable row level security;
alter table hq_notices enable row level security;
alter table hq_regions enable row level security;
alter table hq_orgs enable row level security;
alter table hq_reps enable row level security;
alter table hq_store_assignments enable row level security;
alter table hq_commission_rules enable row level security;
alter table hq_plans enable row level security;
alter table hq_addons enable row level security;
alter table hq_store_billing enable row level security;
alter table hq_settlement_runs enable row level security;

-- owner desk tables: the store owner
create policy store_business_hours_owner on store_business_hours for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
create policy store_holidays_owner on store_holidays for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
create policy store_events_owner on store_events for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
create policy member_offs_owner on member_offs for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
create policy pre_surveys_owner on pre_surveys for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
create policy audit_logs_owner on audit_logs for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
create policy showcase_grace_owner on showcase_grace for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));

-- customer tables: the signed-in customer
create policy customer_profiles_self on customer_profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy customer_store_links_self on customer_store_links for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy customer_notifications_self on customer_notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy customer_diary_self on customer_diary for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- HQ notices: every signed-in user reads, HQ admins write
create policy hq_notices_read on hq_notices for select to authenticated using (true);
create policy hq_notices_write on hq_notices for all to authenticated
  using (public.is_hq_admin()) with check (public.is_hq_admin());

-- the HQ plan list is public reference data for store screens
create policy hq_plans_read on hq_plans for select to authenticated using (true);
create policy hq_addons_read on hq_addons for select to authenticated using (true);
create policy hq_plans_write on hq_plans for all to authenticated
  using (public.is_hq_admin()) with check (public.is_hq_admin());
create policy hq_addons_write on hq_addons for all to authenticated
  using (public.is_hq_admin()) with check (public.is_hq_admin());

-- a store owner may read its own billing row; HQ admins do everything
create policy hq_store_billing_owner_read on hq_store_billing for select to authenticated
  using (public.is_store_owner(store_id));
create policy hq_store_billing_hq on hq_store_billing for all to authenticated
  using (public.is_hq_admin()) with check (public.is_hq_admin());

-- HQ-only tables
create policy hq_admins_self_read on hq_admins for select to authenticated
  using (user_id = auth.uid() or public.is_hq_admin());
create policy hq_admins_master_write on hq_admins for all to authenticated
  using (public.is_hq_master()) with check (public.is_hq_master());
create policy hq_regions_hq on hq_regions for all to authenticated
  using (public.is_hq_admin()) with check (public.is_hq_admin());
create policy hq_orgs_hq on hq_orgs for all to authenticated
  using (public.is_hq_admin()) with check (public.is_hq_admin());
create policy hq_reps_hq on hq_reps for all to authenticated
  using (public.is_hq_admin()) with check (public.is_hq_admin());
create policy hq_store_assignments_hq on hq_store_assignments for all to authenticated
  using (public.is_hq_admin()) with check (public.is_hq_admin());
create policy hq_commission_rules_hq on hq_commission_rules for all to authenticated
  using (public.is_hq_admin()) with check (public.is_hq_admin());
create policy hq_settlement_runs_hq on hq_settlement_runs for all to authenticated
  using (public.is_hq_admin()) with check (public.is_hq_admin());

-- HQ admins can also read and update every store, and read store data they manage
create policy stores_hq_read on stores for select to authenticated using (public.is_hq_admin());
create policy stores_hq_update on stores for update to authenticated
  using (public.is_hq_admin()) with check (public.is_hq_admin());
create policy store_members_hq_read on store_members for select to authenticated using (public.is_hq_admin());
create policy payment_entries_hq_read on payment_entries for select to authenticated using (public.is_hq_admin());
create policy bookings_hq_read on bookings for select to authenticated using (public.is_hq_admin());
create policy customers_hq_read on customers for select to authenticated using (public.is_hq_admin());

-- ---------------------------------------------------------------- grants
grant execute on function public.is_hq_admin() to authenticated;
grant execute on function public.is_hq_master() to authenticated;
grant select, insert, update, delete on
  hq_admins, store_business_hours, store_holidays, store_events, member_offs, pre_surveys, audit_logs, showcase_grace,
  customer_profiles, customer_store_links, customer_notifications, customer_diary,
  hq_notices, hq_regions, hq_orgs, hq_reps, hq_store_assignments, hq_commission_rules, hq_plans, hq_addons,
  hq_store_billing, hq_settlement_runs
  to authenticated;
grant usage, select on sequence hq_notices_no_seq to authenticated;

-- ---------------------------------------------------------------- seed reference data
insert into hq_plans (id, name, monthly_fee_krw, sort_order) values
  ('free', '무료 체험', 0, 0),
  ('basic', '베이직', 0, 1)
on conflict (id) do nothing;

insert into hq_commission_rules (name, rate_pct) values ('기본 인센티브', 0.1);

insert into hq_orgs (code, name, kind) values ('HQ01', '본사 직영', 'hq');
