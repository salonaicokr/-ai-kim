-- Reservations for the owner desk. Uses the existing stores, not a second shop table.

create table bookings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  member_id uuid references store_members (id) on delete set null,
  customer_id uuid references customers (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in (
    'requested', 'confirmed', 'in_service', 'completed',
    'cancelled_customer', 'cancelled_shop', 'no_show', 'blocked'
  )),
  source text not null default 'manual' check (source in ('app', 'naver', 'phone', 'walk_in', 'dm', 'manual')),
  memo text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index bookings_store_start_idx on bookings (store_id, starts_at);
create index bookings_member_start_idx on bookings (member_id, starts_at);

create table booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  menu_id uuid references store_menus (id) on delete set null,
  name text not null,
  price_krw integer not null default 0 check (price_krw >= 0),
  duration_min integer check (duration_min is null or duration_min > 0)
);

create index booking_items_booking_idx on booking_items (booking_id);

alter table customers add column memo text;
alter table customers add column member_id uuid references store_members (id) on delete set null;
alter table store_menus add column paused boolean not null default false;
alter table store_members add column title text;
alter table payment_entries add column booking_id uuid references bookings (id) on delete set null;
create index payment_entries_booking_idx on payment_entries (booking_id);

alter table bookings enable row level security;
alter table booking_items enable row level security;

create policy bookings_owner on bookings
  for all to authenticated
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy booking_items_owner on booking_items
  for all to authenticated
  using (exists (
    select 1 from bookings b
    where b.id = booking_id and public.is_store_owner(b.store_id)
  ))
  with check (exists (
    select 1 from bookings b
    where b.id = booking_id and public.is_store_owner(b.store_id)
  ));

grant select, insert, update, delete on bookings, booking_items to authenticated;
