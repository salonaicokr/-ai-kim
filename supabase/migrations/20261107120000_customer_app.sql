-- SALONAI customer app (고객용 앱) <-> owner desk integration.
-- Run AFTER 20261106130000_member_offs_kind.sql. Supabase wraps this file in a transaction.
-- Nothing here drops data. Customers never read store tables directly: they use the c_* functions below.

-- =====================================================================================
-- 0. helpers
-- =====================================================================================
create or replace function public.app_code6()
returns text
language sql
volatile
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6);
$$;
create or replace function public.c_hm_to_min(t time)
returns integer
language sql
immutable
as $$
  select (extract(hour from t) * 60 + extract(minute from t))::integer;
$$;

-- =====================================================================================
-- 1. columns on existing tables
-- =====================================================================================
-- store / designer invite codes for the customer app (QR or typed code)
alter table stores add column if not exists customer_code text;
alter table store_members add column if not exists customer_code text;
update stores set customer_code = public.app_code6() where customer_code is null;
update store_members set customer_code = public.app_code6() where customer_code is null;
alter table stores alter column customer_code set default public.app_code6();
alter table store_members alter column customer_code set default public.app_code6();
create unique index if not exists stores_customer_code_key on stores (customer_code);
create unique index if not exists store_members_customer_code_key on store_members (customer_code);

alter table bookings add column if not exists customer_record_deleted_at timestamptz;

alter table payment_entries add column if not exists source text not null default 'desk';

alter table customer_profiles add column if not exists login_id text;
alter table customer_profiles add column if not exists email text;
alter table customer_profiles add column if not exists avatar_path text;
alter table customer_profiles add column if not exists msg_booking boolean not null default true;
alter table customer_profiles add column if not exists msg_aftercare boolean not null default true;
alter table customer_profiles add column if not exists msg_revisit boolean not null default false;
alter table customer_profiles add column if not exists msg_all_off boolean not null default false;
create unique index if not exists customer_profiles_login_id_key on customer_profiles (lower(login_id)) where login_id is not null;

alter table customer_notifications add column if not exists category text not null default 'general';
alter table customer_notifications add column if not exists booking_id uuid references bookings (id) on delete set null;
alter table customer_notifications add column if not exists confirmed_at timestamptz;
alter table customer_notifications add column if not exists dedupe_key text;
alter table customer_notifications add column if not exists data jsonb not null default '{}';
create unique index if not exists customer_notifications_dedupe_key on customer_notifications (dedupe_key) where dedupe_key is not null;

-- =====================================================================================
-- 2. new tables
-- =====================================================================================
create table if not exists treatment_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  booking_id uuid not null unique references bookings (id) on delete cascade,
  customer_id uuid references customers (id) on delete set null,
  member_id uuid references store_members (id) on delete set null,
  customer_name text,
  service_label text,
  service_snapshot jsonb,
  payment_id uuid,
  ai_summary text,
  shared boolean not null default true,
  is_sample boolean not null default false,
  sent_at timestamptz,
  products text[] not null default '{}',
  damage_level smallint check (damage_level is null or damage_level between 1 and 10),
  designer_diagnosis text,
  home_care text,
  customer_note text,
  created_at timestamptz not null default now()
);
create index if not exists treatment_records_store_idx on treatment_records (store_id, created_at desc);
create index if not exists treatment_records_customer_idx on treatment_records (customer_id);

create table if not exists treatment_photos (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  record_id uuid not null references treatment_records (id) on delete cascade,
  member_id uuid references store_members (id) on delete set null,
  customer_id uuid references customers (id) on delete set null,
  kind text not null check (kind in ('before', 'after')),
  path text not null,
  ai_path text,
  ai_status text not null default 'none',
  ai_engine text,
  showcase text not null default 'none',
  showcase_channels text[] not null default '{}',
  send_to_customer boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists treatment_photos_record_idx on treatment_photos (record_id);

create table if not exists payment_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  booking_id uuid not null references bookings (id) on delete cascade,
  customer_id uuid references customers (id) on delete set null,
  member_id uuid references store_members (id) on delete set null,
  lines jsonb not null default '[]',
  subtotal integer not null default 0,
  points_used integer not null default 0,
  deposit_applied integer not null default 0,
  amount integer not null check (amount >= 0),
  booked_total integer,
  memo text,
  status text not null default 'requested' check (status in ('requested', 'approved', 'cancelled')),
  payment_entry_id uuid references payment_entries (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists payment_requests_open_uq on payment_requests (booking_id) where status = 'requested';
create index if not exists payment_requests_customer_idx on payment_requests (customer_id, status);

create table if not exists booking_style_photos (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  booking_id uuid not null references bookings (id) on delete cascade,
  customer_id uuid references customers (id) on delete set null,
  kind text not null check (kind in ('current', 'wish')),
  source text not null default 'photo',
  path text not null,
  title text,
  created_at timestamptz not null default now()
);
create index if not exists booking_style_photos_booking_idx on booking_style_photos (booking_id);

create table if not exists consult_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  booking_id uuid references bookings (id) on delete cascade,
  survey_id uuid references pre_surveys (id) on delete set null,
  member_id uuid references store_members (id) on delete set null,
  kind text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists consult_logs_booking_idx on consult_logs (booking_id);

create table if not exists customer_consents (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  type text not null,
  agreed boolean not null default true,
  channels text[] not null default '{}',
  source text not null default 'desk',
  agreed_at timestamptz not null default now()
);
create index if not exists customer_consents_customer_idx on customer_consents (customer_id, agreed_at desc);

create table if not exists prepaid_ledger (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  kind text not null,
  amount integer not null,
  pay_method text,
  memo text,
  created_at timestamptz not null default now()
);
create index if not exists prepaid_ledger_customer_idx on prepaid_ledger (customer_id, created_at desc);

create table if not exists booking_change_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  booking_id uuid not null references bookings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('reschedule', 'cancel')),
  message text,
  status text not null default 'open' check (status in ('open', 'handled', 'declined')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists booking_change_requests_store_idx on booking_change_requests (store_id, status, created_at desc);
create index if not exists booking_change_requests_booking_idx on booking_change_requests (booking_id);

create table if not exists treatment_ratings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings (id) on delete cascade,
  store_id uuid not null references stores (id) on delete cascade,
  member_id uuid references store_members (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists treatment_ratings_store_idx on treatment_ratings (store_id, created_at desc);

create table if not exists customer_ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_message text not null,
  ai_response text not null,
  context jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists customer_ai_messages_user_idx on customer_ai_messages (user_id, created_at desc);

-- =====================================================================================
-- 3. RLS: store owner reads/writes store tables, customer reads/writes only own rows
-- =====================================================================================
alter table treatment_records enable row level security;
alter table treatment_photos enable row level security;
alter table payment_requests enable row level security;
alter table booking_style_photos enable row level security;
alter table consult_logs enable row level security;
alter table customer_consents enable row level security;
alter table prepaid_ledger enable row level security;
alter table booking_change_requests enable row level security;
alter table treatment_ratings enable row level security;
alter table customer_ai_messages enable row level security;

drop policy if exists treatment_records_owner on treatment_records;
create policy treatment_records_owner on treatment_records for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
drop policy if exists treatment_photos_owner on treatment_photos;
create policy treatment_photos_owner on treatment_photos for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
drop policy if exists payment_requests_owner on payment_requests;
create policy payment_requests_owner on payment_requests for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
drop policy if exists booking_style_photos_owner on booking_style_photos;
create policy booking_style_photos_owner on booking_style_photos for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
drop policy if exists consult_logs_owner on consult_logs;
create policy consult_logs_owner on consult_logs for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
drop policy if exists customer_consents_owner on customer_consents;
create policy customer_consents_owner on customer_consents for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
drop policy if exists prepaid_ledger_owner on prepaid_ledger;
create policy prepaid_ledger_owner on prepaid_ledger for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
drop policy if exists booking_change_requests_owner on booking_change_requests;
create policy booking_change_requests_owner on booking_change_requests for all to authenticated
  using (public.is_store_owner(store_id)) with check (public.is_store_owner(store_id));
drop policy if exists booking_change_requests_self on booking_change_requests;
create policy booking_change_requests_self on booking_change_requests for select to authenticated
  using (user_id = auth.uid());
drop policy if exists treatment_ratings_owner on treatment_ratings;
create policy treatment_ratings_owner on treatment_ratings for select to authenticated
  using (public.is_store_owner(store_id));
drop policy if exists treatment_ratings_self on treatment_ratings;
create policy treatment_ratings_self on treatment_ratings for select to authenticated
  using (user_id = auth.uid());
drop policy if exists customer_ai_messages_self on customer_ai_messages;
create policy customer_ai_messages_self on customer_ai_messages for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on
  treatment_records, treatment_photos, payment_requests, booking_style_photos, consult_logs,
  customer_consents, prepaid_ledger, booking_change_requests, treatment_ratings, customer_ai_messages
  to authenticated;

-- =====================================================================================
-- 4. storage buckets + policies
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit) values
  ('treatment-photos', 'treatment-photos', false, 10485760),
  ('booking-style-photos', 'booking-style-photos', false, 10485760),
  ('customer-avatars', 'customer-avatars', false, 5242880)
on conflict (id) do nothing;

-- customers may read the original of a photo the store sent them (never the AI showcase copy)
create or replace function public.c_can_read_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from treatment_photos tp
    join treatment_records tr on tr.id = tp.record_id
    join bookings b on b.id = tr.booking_id
    join customer_store_links l on l.customer_id = tr.customer_id and l.user_id = auth.uid()
    where tp.path = p_name
      and tp.send_to_customer
      and tr.sent_at is not null
      and tr.shared
      and b.customer_record_deleted_at is null
  );
$$;

create or replace function public.c_owner_reads_style_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from booking_style_photos p
    where p.path = p_name and public.is_store_owner(p.store_id)
  );
$$;

create or replace function public.c_owner_of_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.is_store_owner(split_part(p_name, '/', 1)::uuid) else false end;
$$;
grant execute on function public.c_owner_of_path(text) to authenticated;

drop policy if exists treatment_photos_owner_all on storage.objects;
create policy treatment_photos_owner_all on storage.objects for all to authenticated
  using (bucket_id = 'treatment-photos' and public.c_owner_of_path(name))
  with check (bucket_id = 'treatment-photos' and public.c_owner_of_path(name));
drop policy if exists treatment_photos_customer_read on storage.objects;
create policy treatment_photos_customer_read on storage.objects for select to authenticated
  using (bucket_id = 'treatment-photos' and public.c_can_read_photo(name));

drop policy if exists booking_style_photos_customer on storage.objects;
create policy booking_style_photos_customer on storage.objects for all to authenticated
  using (bucket_id = 'booking-style-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'booking-style-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists booking_style_photos_owner_read on storage.objects;
create policy booking_style_photos_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'booking-style-photos' and public.c_owner_reads_style_photo(name));

drop policy if exists customer_avatars_self on storage.objects;
create policy customer_avatars_self on storage.objects for all to authenticated
  using (bucket_id = 'customer-avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'customer-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================================
-- 5. login helpers (callable before sign-in)
-- =====================================================================================
create or replace function public.lookup_login_email(p_login_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(cp.email, u.email)
  from customer_profiles cp
  join auth.users u on u.id = cp.user_id
  where lower(cp.login_id) = lower(trim(p_login_id))
  limit 1;
$$;

create or replace function public.is_login_id_available(p_login_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from customer_profiles where lower(login_id) = lower(trim(p_login_id)));
$$;

-- =====================================================================================
-- 6. customer lookup helpers
-- =====================================================================================
create or replace function public.c_my_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select customer_id from customer_store_links where user_id = auth.uid() and customer_id is not null;
$$;

-- designers a customer may book (same rule the owner desk uses for its calendar columns)
create or replace function public.c_designers(p_store uuid)
returns table (id uuid, name text, title text, customer_code text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.display_name, coalesce(nullif(m.title, ''), '디자이너'), m.customer_code
  from store_members m
  join stores s on s.id = m.store_id
  where m.store_id = p_store
    and s.status = 'approved'
    and coalesce(m.status, 'active') = 'active'
    and m.role in ('owner', 'staff', 'manager', 'custom')
    and coalesce(m.is_designer, true)
    and (
      m.role <> 'owner'
      or (
        (s.form = 'solo' or s.owner_also_designs)
        and not exists (
          select 1 from store_members x
          where x.store_id = m.store_id and x.user_id = m.user_id and x.role in ('staff', 'manager')
        )
      )
    )
  order by coalesce(m.sort_order, 0), m.created_at;
$$;

create or replace function public.c_member_free(p_store uuid, p_member uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from bookings b
      where b.member_id = p_member
        and b.status in ('requested', 'confirmed', 'in_service', 'blocked')
        and (p_exclude is null or b.id <> p_exclude)
        and b.starts_at < p_end and b.ends_at > p_start
    )
    and not exists (
      select 1 from member_offs o
      where o.member_id = p_member and o.kind = 'off'
        and o.off_date = (p_start at time zone 'Asia/Seoul')::date
    )
    and not exists (
      select 1 from external_blocks e
      join store_members m on m.id = p_member
      where e.store_id = p_store
        and e.starts_at < p_end and e.ends_at > p_start
        and (coalesce(e.staff_name, '') = '' or e.staff_name = m.display_name)
    );
$$;

create or replace function public.c_slots(p_store uuid, p_member uuid, p_date date, p_minutes integer, p_exclude uuid default null)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dow integer := extract(dow from p_date)::integer;
  h store_business_hours%rowtype;
  v_open integer := 600;
  v_close integer := 1200;
  v_has_hours boolean;
  v_day0 timestamptz := (p_date::text || ' 00:00:00+09')::timestamptz;
  v_designers uuid[];
  v_out text[] := '{}';
  s integer;
  v_start timestamptz;
  v_end timestamptz;
  v_min integer := greatest(coalesce(p_minutes, 60), 10);
  d uuid;
  v_ok boolean;
begin
  if not exists (select 1 from stores where id = p_store and status = 'approved') then
    return '{}';
  end if;
  if exists (select 1 from store_holidays where store_id = p_store and p_date between start_date and end_date) then
    return '{}';
  end if;
  select * into h from store_business_hours where store_id = p_store and weekday = v_dow;
  v_has_hours := found;
  if v_has_hours then
    if h.is_closed or h.open_time is null or h.close_time is null then
      return '{}';
    end if;
    v_open := public.c_hm_to_min(h.open_time);
    v_close := public.c_hm_to_min(h.close_time);
    if v_close <= v_open then
      v_close := 1440;
    end if;
  end if;
  if p_member is not null then
    v_designers := array[p_member];
  else
    v_designers := array(select id from public.c_designers(p_store));
  end if;
  if coalesce(array_length(v_designers, 1), 0) = 0 then
    return '{}';
  end if;
  s := ((v_open + 29) / 30) * 30;
  while s + v_min <= v_close loop
    v_start := v_day0 + make_interval(mins => s);
    v_end := v_start + make_interval(mins => v_min);
    if v_start >= now() + interval '30 minutes' then
      v_ok := true;
      if v_has_hours and h.break_start is not null and h.break_end is not null then
        if s < public.c_hm_to_min(h.break_end) and s + v_min > public.c_hm_to_min(h.break_start) then
          v_ok := false;
        end if;
      end if;
      if v_ok then
        v_ok := false;
        foreach d in array v_designers loop
          if public.c_member_free(p_store, d, v_start, v_end, p_exclude) then
            v_ok := true;
            exit;
          end if;
        end loop;
      end if;
      if v_ok then
        v_out := v_out || to_char(v_start at time zone 'Asia/Seoul', 'HH24:MI');
      end if;
    end if;
    s := s + 30;
  end loop;
  return v_out;
end;
$$;

-- =====================================================================================
-- 7. stores directory + catalog
-- =====================================================================================
create or replace function public.c_list_stores(p_q text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.name), '[]'::jsonb)
  from (
    select s.id, s.name, s.category, s.address, s.phone,
      exists (select 1 from customer_store_links l where l.store_id = s.id and l.user_id = auth.uid()) as linked,
      (select count(*) from public.c_designers(s.id)) as designer_count
    from stores s
    where s.status = 'approved'
      and (p_q is null or trim(p_q) = '' or s.name ilike '%' || trim(p_q) || '%' or coalesce(s.address, '') ilike '%' || trim(p_q) || '%')
    order by s.name
    limit 60
  ) t;
$$;

create or replace function public.c_store_catalog(p_store uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'store', jsonb_build_object('id', s.id, 'name', s.name, 'category', s.category, 'address', s.address, 'phone', s.phone, 'form', s.form),
    'designers', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'title', d.title)) from public.c_designers(s.id) d), '[]'::jsonb),
    'menus', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'price', m.price_krw, 'minutes', m.duration_min, 'revisit_days', m.revisit_cycle_days) order by m.sort_order, m.name)
      from store_menus m where m.store_id = s.id and not m.paused
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', h.weekday, 'closed', h.is_closed, 'open', h.open_time, 'close', h.close_time, 'break_start', h.break_start, 'break_end', h.break_end) order by h.weekday)
      from store_business_hours h where h.store_id = s.id
    ), '[]'::jsonb),
    'holidays', coalesce((
      select jsonb_agg(jsonb_build_object('start', x.start_date, 'end', x.end_date, 'reason', x.reason))
      from store_holidays x where x.store_id = s.id and x.end_date >= current_date
    ), '[]'::jsonb)
  )
  from stores s
  where s.id = p_store and s.status = 'approved';
$$;

-- =====================================================================================
-- 8. linking a customer to a store
-- =====================================================================================
-- find (or make) the store's customer card for this app user and link it
create or replace function public.c_link_user_to_store(p_store uuid, p_member uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cid uuid;
  v_name text;
  v_phone text;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  select customer_id into v_cid from customer_store_links where user_id = v_uid and store_id = p_store;
  if v_cid is not null then
    return v_cid;
  end if;
  select coalesce(nullif(trim(name), ''), nullif(trim(nickname), ''), '앱 고객'), regexp_replace(coalesce(phone, ''), '\D', '', 'g')
    into v_name, v_phone
    from customer_profiles where user_id = v_uid;
  v_name := coalesce(v_name, '앱 고객');
  -- the owner already has this person (same phone + same name) and nobody else claimed the card: reuse it
  if coalesce(v_phone, '') <> '' then
    select c.id into v_cid from customers c
    where c.store_id = p_store
      and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone
      and c.name = v_name
      and not exists (select 1 from customer_store_links l where l.customer_id = c.id and l.user_id <> v_uid)
    order by c.created_at
    limit 1;
  end if;
  if v_cid is null then
    insert into customers (store_id, name, phone, member_id)
    values (p_store, v_name, nullif(v_phone, ''), p_member)
    returning id into v_cid;
  end if;
  insert into customer_store_links (user_id, store_id, customer_id)
  values (v_uid, p_store, v_cid)
  on conflict (user_id, store_id) do update set customer_id = excluded.customer_id, following = true;
  return v_cid;
end;
$$;

create or replace function public.c_link_with_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_store uuid;
  v_member uuid;
  v_name text;
  v_designer text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다';
  end if;
  if length(v_code) < 6 then
    raise exception '초대 코드 6자리를 입력해 주세요';
  end if;
  select id, name into v_store, v_name from stores where customer_code = v_code and status = 'approved';
  if v_store is null then
    select m.store_id, m.id, m.display_name, s.name into v_store, v_member, v_designer, v_name
    from store_members m join stores s on s.id = m.store_id
    where m.customer_code = v_code and s.status = 'approved' and coalesce(m.status, 'active') = 'active';
  end if;
  if v_store is null then
    raise exception '초대 코드를 찾지 못했습니다';
  end if;
  perform public.c_link_user_to_store(v_store, v_member);
  return jsonb_build_object('store_id', v_store, 'store', v_name, 'designer_id', v_member, 'designer', v_designer);
end;
$$;

-- store cards that match my name + phone and nobody has claimed yet (customer confirms before linking)
create or replace function public.c_pending_links()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select coalesce(nullif(trim(name), ''), nullif(trim(nickname), '')) as name,
           regexp_replace(coalesce(phone, ''), '\D', '', 'g') as phone
    from customer_profiles where user_id = auth.uid()
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'customer_id', c.id, 'store_id', s.id, 'store', s.name,
      'visits', (select count(*) from bookings b where b.customer_id = c.id and b.status = 'completed'),
      'designer', (select m.display_name from store_members m where m.id = c.member_id)
    )), '[]'::jsonb)
  from customers c
  join stores s on s.id = c.store_id and s.status = 'approved'
  cross join me
  where me.phone <> ''
    and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = me.phone
    and c.name = me.name
    and not exists (select 1 from customer_store_links l where l.user_id = auth.uid() and l.store_id = c.store_id)
    and not exists (select 1 from customer_store_links l where l.customer_id = c.id and l.user_id <> auth.uid());
$$;

create or replace function public.c_link_customer(p_customer uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row customers%rowtype;
  v_ok boolean;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  select (public.c_pending_links() @> jsonb_build_array(jsonb_build_object('customer_id', p_customer))) into v_ok;
  if not coalesce(v_ok, false) then
    raise exception '연결할 수 있는 기록이 아닙니다';
  end if;
  select * into v_row from customers where id = p_customer;
  insert into customer_store_links (user_id, store_id, customer_id)
  values (v_uid, v_row.store_id, v_row.id)
  on conflict (user_id, store_id) do update set customer_id = excluded.customer_id;
  return jsonb_build_object('store_id', v_row.store_id);
end;
$$;

create or replace function public.c_unlink_store(p_store uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update customer_store_links set following = false where user_id = auth.uid() and store_id = p_store;
$$;

create or replace function public.c_my_stores()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'store_id', s.id, 'store', s.name, 'category', s.category, 'address', s.address, 'phone', s.phone,
      'customer_id', l.customer_id, 'following', l.following,
      'designer_id', c.member_id,
      'designer', (select m.display_name from store_members m where m.id = c.member_id),
      'visits', (select count(*) from bookings b where b.customer_id = l.customer_id and b.status = 'completed'),
      'last_visit', (select max(b.starts_at) from bookings b where b.customer_id = l.customer_id and b.status = 'completed')
    ) order by l.linked_at desc), '[]'::jsonb)
  from customer_store_links l
  join stores s on s.id = l.store_id
  left join customers c on c.id = l.customer_id
  where l.user_id = auth.uid() and l.following;
$$;

-- =====================================================================================
-- 9. booking: request / list / detail / change / cancel
-- =====================================================================================
create or replace function public.c_request_booking(p_store uuid, p_member uuid, p_start timestamptz, p_menus uuid[], p_request text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_minutes integer;
  v_menu_count integer;
  v_member uuid := p_member;
  v_cid uuid;
  v_end timestamptz;
  v_hm text;
  v_date date;
  v_booking uuid;
  v_survey uuid;
  v_names text[];
  r record;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다';
  end if;
  if not exists (select 1 from stores where id = p_store and status = 'approved') then
    raise exception '예약할 수 없는 매장입니다';
  end if;
  select count(*), coalesce(sum(duration_min), 0), array_agg(name order by sort_order)
    into v_menu_count, v_minutes, v_names
    from store_menus where store_id = p_store and id = any (p_menus) and not paused;
  if coalesce(array_length(p_menus, 1), 0) = 0 or v_menu_count <> (select count(distinct x) from unnest(p_menus) x) then
    raise exception '시술 메뉴를 확인해 주세요';
  end if;
  v_minutes := greatest(v_minutes, 10);
  v_end := p_start + make_interval(mins => v_minutes);
  v_hm := to_char(p_start at time zone 'Asia/Seoul', 'HH24:MI');
  v_date := (p_start at time zone 'Asia/Seoul')::date;
  if v_member is not null and not exists (select 1 from public.c_designers(p_store) d where d.id = v_member) then
    raise exception '선택한 디자이너를 예약할 수 없습니다';
  end if;
  if v_member is null then
    for r in select d.id from public.c_designers(p_store) d loop
      if v_hm = any (public.c_slots(p_store, r.id, v_date, v_minutes)) then
        v_member := r.id;
        exit;
      end if;
    end loop;
    if v_member is null then
      raise exception '그 시간에 가능한 디자이너가 없어요. 다른 시간을 골라주세요.';
    end if;
  elsif not (v_hm = any (public.c_slots(p_store, v_member, v_date, v_minutes))) then
    raise exception '방금 다른 예약이 들어왔거나 예약할 수 없는 시간이에요. 다른 시간을 골라주세요.';
  end if;

  v_cid := public.c_link_user_to_store(p_store, v_member);

  insert into bookings (store_id, member_id, customer_id, starts_at, ends_at, status, source, customer_request)
  values (p_store, v_member, v_cid, p_start, v_end, 'requested', 'customer_app', nullif(trim(p_request), ''))
  returning id into v_booking;

  insert into booking_items (booking_id, menu_id, name, price_krw, duration_min)
  select v_booking, m.id, m.name, m.price_krw, m.duration_min
  from store_menus m where m.store_id = p_store and m.id = any (p_menus) and not m.paused;

  insert into pre_surveys (store_id, booking_id, customer_id, status, topic, kinds, items)
  values (p_store, v_booking, v_cid, 'sent', v_names[1], '{}', to_jsonb(v_names))
  returning id into v_survey;

  return jsonb_build_object('booking', v_booking, 'survey', v_survey, 'member', v_member);
end;
$$;

create or replace function public.c_attach_style_photos(p_booking uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking and customer_id in (select public.c_my_customer_ids());
  if not found then
    raise exception '예약을 찾지 못했습니다';
  end if;
  insert into booking_style_photos (store_id, booking_id, customer_id, kind, source, path, title)
  select b.store_id, b.id, b.customer_id,
         case when x->>'kind' = 'current' then 'current' else 'wish' end,
         coalesce(x->>'source', 'photo'), x->>'path', x->>'title'
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
  where coalesce(x->>'path', '') <> '';
end;
$$;

create or replace function public.c_my_bookings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(t.j order by t.starts_at desc), '[]'::jsonb)
  from (
    select b.starts_at,
      jsonb_build_object(
        'id', b.id, 'status', b.status, 'start', b.starts_at, 'end', b.ends_at, 'request', b.customer_request, 'source', b.source,
        'store_id', s.id, 'store', s.name, 'store_phone', s.phone,
        'designer_id', m.id, 'designer', m.display_name,
        'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'price', i.price_krw, 'minutes', i.duration_min) order by i.name) from booking_items i where i.booking_id = b.id), '[]'::jsonb),
        'total', coalesce((select sum(i.price_krw) from booking_items i where i.booking_id = b.id), 0),
        'pay_request', (select jsonb_build_object('id', pr.id, 'amount', pr.amount) from payment_requests pr where pr.booking_id = b.id and pr.status = 'requested' limit 1),
        'paid', coalesce((select sum(case when pe.entry_type = 'paid' then pe.amount_krw else -pe.amount_krw end) from payment_entries pe where pe.booking_id = b.id), 0),
        'has_payment', exists (select 1 from payment_entries pe where pe.booking_id = b.id),
        'record_sent', (select (tr.sent_at is not null and tr.shared) from treatment_records tr where tr.booking_id = b.id),
        'record_deleted', b.customer_record_deleted_at is not null,
        'damage', (select case when tr.sent_at is not null and tr.shared then tr.damage_level end from treatment_records tr where tr.booking_id = b.id),
        'rating', (select tr2.score from treatment_ratings tr2 where tr2.booking_id = b.id),
        'open_request', (select cr.kind from booking_change_requests cr where cr.booking_id = b.id and cr.status = 'open' order by cr.created_at desc limit 1)
      ) as j
    from bookings b
    join stores s on s.id = b.store_id
    left join store_members m on m.id = b.member_id
    where b.customer_id in (select public.c_my_customer_ids())
      and b.status <> 'blocked'
  ) t;
$$;

create or replace function public.c_booking_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  rec treatment_records%rowtype;
  b bookings%rowtype;
  v_visible boolean := false;
begin
  select * into b from bookings where id = p_id and customer_id in (select public.c_my_customer_ids());
  if not found then
    return null;
  end if;
  select * into rec from treatment_records where booking_id = b.id;
  v_visible := found and rec.sent_at is not null and rec.shared and b.customer_record_deleted_at is null;
  select jsonb_build_object(
    'id', b.id, 'status', b.status, 'start', b.starts_at, 'end', b.ends_at, 'request', b.customer_request, 'source', b.source,
    'store', jsonb_build_object('id', s.id, 'name', s.name, 'address', s.address, 'phone', s.phone, 'category', s.category),
    'designer', case when m.id is null then null else jsonb_build_object('id', m.id, 'name', m.display_name, 'title', coalesce(nullif(m.title, ''), '디자이너')) end,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'price', i.price_krw, 'minutes', i.duration_min, 'menu_id', i.menu_id) order by i.name) from booking_items i where i.booking_id = b.id), '[]'::jsonb),
    'total', coalesce((select sum(i.price_krw) from booking_items i where i.booking_id = b.id), 0),
    'pay_request', (select jsonb_build_object('id', pr.id, 'amount', pr.amount, 'subtotal', pr.subtotal, 'points_used', pr.points_used, 'deposit', pr.deposit_applied, 'lines', pr.lines, 'booked_total', pr.booked_total, 'memo', pr.memo, 'created_at', pr.created_at)
                     from payment_requests pr where pr.booking_id = b.id and pr.status = 'requested' limit 1),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', pe.id, 'amount', pe.amount_krw, 'type', pe.entry_type, 'method', pe.method_label, 'service', pe.service_name, 'paid_at', pe.created_at, 'source', pe.source) order by pe.created_at)
                          from payment_entries pe where pe.booking_id = b.id), '[]'::jsonb),
    'record', case when v_visible then jsonb_build_object(
        'sent_at', rec.sent_at, 'label', rec.service_label, 'products', rec.products, 'damage_level', rec.damage_level,
        'diagnosis', rec.designer_diagnosis, 'home_care', rec.home_care, 'note', rec.customer_note, 'summary', rec.ai_summary,
        'snapshot', rec.service_snapshot,
        'photos', coalesce((select jsonb_agg(jsonb_build_object('id', tp.id, 'kind', tp.kind, 'path', tp.path) order by tp.created_at)
                            from treatment_photos tp where tp.record_id = rec.id and tp.send_to_customer), '[]'::jsonb))
      else null end,
    'record_deleted', b.customer_record_deleted_at is not null,
    'my_note', rec.customer_note,
    'rating', (select jsonb_build_object('score', r.score, 'comment', r.comment) from treatment_ratings r where r.booking_id = b.id),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', cr.id, 'kind', cr.kind, 'message', cr.message, 'status', cr.status, 'created_at', cr.created_at) order by cr.created_at desc)
                          from booking_change_requests cr where cr.booking_id = b.id), '[]'::jsonb),
    'survey', (select jsonb_build_object('id', ps.id, 'status', ps.status) from pre_surveys ps where ps.booking_id = b.id order by ps.sent_at desc limit 1)
  ) into v
  from stores s
  left join store_members m on m.id = b.member_id
  where s.id = b.store_id;
  return v;
end;
$$;

create or replace function public.c_cancel_booking(p_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
begin
  select * into b from bookings where id = p_id and customer_id in (select public.c_my_customer_ids());
  if not found then
    raise exception '예약을 찾지 못했습니다';
  end if;
  if b.status = 'requested' then
    update bookings set status = 'cancelled_customer', memo = coalesce(nullif(trim(p_reason), ''), memo) where id = b.id;
    return 'cancelled';
  elsif b.status = 'confirmed' then
    if exists (select 1 from booking_change_requests where booking_id = b.id and kind = 'cancel' and status = 'open') then
      return 'requested';
    end if;
    insert into booking_change_requests (store_id, booking_id, user_id, kind, message)
    values (b.store_id, b.id, auth.uid(), 'cancel', nullif(trim(p_reason), ''));
    return 'requested';
  end if;
  raise exception '취소할 수 없는 예약입니다';
end;
$$;

create or replace function public.c_request_change(p_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
begin
  select * into b from bookings where id = p_id and customer_id in (select public.c_my_customer_ids());
  if not found then
    raise exception '예약을 찾지 못했습니다';
  end if;
  if b.status not in ('requested', 'confirmed') then
    raise exception '시간 변경을 요청할 수 없는 예약입니다';
  end if;
  if coalesce(trim(p_message), '') = '' then
    raise exception '원하는 날짜/시간을 적어주세요';
  end if;
  insert into booking_change_requests (store_id, booking_id, user_id, kind, message)
  values (b.store_id, b.id, auth.uid(), 'reschedule', trim(p_message));
end;
$$;

-- move my booking to a new time (a confirmed booking goes back to "waiting for the shop")
create or replace function public.c_reschedule_booking(p_id uuid, p_start timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
  v_minutes integer;
  v_hm text := to_char(p_start at time zone 'Asia/Seoul', 'HH24:MI');
  v_date date := (p_start at time zone 'Asia/Seoul')::date;
begin
  select * into b from bookings where id = p_id and customer_id in (select public.c_my_customer_ids());
  if not found then
    raise exception '예약을 찾지 못했습니다';
  end if;
  if b.status not in ('requested', 'confirmed') then
    raise exception '시간을 바꿀 수 없는 예약입니다';
  end if;
  v_minutes := greatest((extract(epoch from (b.ends_at - b.starts_at)) / 60)::integer, 10);
  if b.member_id is null or not (v_hm = any (public.c_slots(b.store_id, b.member_id, v_date, v_minutes, b.id))) then
    raise exception '그 시간은 예약할 수 없어요. 다른 시간을 골라주세요.';
  end if;
  update bookings
     set starts_at = p_start, ends_at = p_start + make_interval(mins => v_minutes), status = 'requested'
   where id = b.id;
  insert into booking_change_requests (store_id, booking_id, user_id, kind, message, status, handled_at)
  values (b.store_id, b.id, auth.uid(), 'reschedule',
          '고객이 예약 시간을 ' || to_char(p_start at time zone 'Asia/Seoul', 'MM/DD HH24:MI') || '(으)로 바꿨어요', 'handled', now());
  return jsonb_build_object('booking', b.id);
end;
$$;

-- =====================================================================================
-- 10. payments
-- =====================================================================================
create or replace function public.c_payments()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id, 'booking_id', pr.booking_id, 'amount', pr.amount, 'subtotal', pr.subtotal, 'created_at', pr.created_at,
        'store', s.name, 'designer', m.display_name, 'start', b.starts_at, 'lines', pr.lines) order by pr.created_at desc)
      from payment_requests pr
      join bookings b on b.id = pr.booking_id
      join stores s on s.id = pr.store_id
      left join store_members m on m.id = b.member_id
      where pr.status = 'requested' and pr.customer_id in (select public.c_my_customer_ids())
    ), '[]'::jsonb),
    'paid', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id, 'booking_id', pe.booking_id, 'amount', pe.amount_krw, 'type', pe.entry_type, 'method', pe.method_label,
        'service', pe.service_name, 'paid_at', pe.created_at, 'store', s.name, 'designer', m.display_name, 'start', b.starts_at) order by pe.created_at desc)
      from payment_entries pe
      join bookings b on b.id = pe.booking_id
      join stores s on s.id = pe.store_id
      left join store_members m on m.id = b.member_id
      where b.customer_id in (select public.c_my_customer_ids())
    ), '[]'::jsonb)
  );
$$;

-- beta: records the "payment complete" state only (no real PG call), exactly like the original app's beta
create or replace function public.c_approve_payment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pr payment_requests%rowtype;
  v_entry uuid;
  v_service text;
begin
  select * into pr from payment_requests
   where id = p_id and customer_id in (select public.c_my_customer_ids()) for update;
  if not found then
    raise exception '결제 요청을 찾지 못했습니다';
  end if;
  if pr.status <> 'requested' then
    raise exception '이미 처리된 결제 요청입니다';
  end if;
  select coalesce(string_agg(x->>'name', ' + '), '시술') into v_service from jsonb_array_elements(pr.lines) x;
  insert into payment_entries (store_id, booking_id, amount_krw, service_name, entry_type, method_label, note, source)
  values (pr.store_id, pr.booking_id, pr.amount, v_service, 'paid', 'other', '앱 결제 (베타 결제완료)', 'app')
  returning id into v_entry;
  update payment_requests set status = 'approved', approved_at = now(), payment_entry_id = v_entry where id = pr.id;
  update bookings set status = 'completed' where id = pr.booking_id and status <> 'completed';
  update treatment_records set payment_id = v_entry where booking_id = pr.booking_id;
  return jsonb_build_object('payment', v_entry, 'booking', pr.booking_id);
end;
$$;

-- =====================================================================================
-- 11. diary note, rating, delete record, profile helpers
-- =====================================================================================
create or replace function public.c_save_note(p_booking uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking and customer_id in (select public.c_my_customer_ids());
  if not found then
    raise exception '예약을 찾지 못했습니다';
  end if;
  insert into treatment_records (store_id, booking_id, customer_id, member_id, customer_note)
  values (b.store_id, b.id, b.customer_id, b.member_id, nullif(trim(p_note), ''))
  on conflict (booking_id) do update set customer_note = nullif(trim(p_note), '');
end;
$$;

create or replace function public.c_rate_treatment(p_booking uuid, p_score integer, p_comment text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking and customer_id in (select public.c_my_customer_ids());
  if not found then
    raise exception '예약을 찾지 못했습니다';
  end if;
  if b.status <> 'completed' then
    raise exception '시술이 끝난 뒤에 평가할 수 있어요';
  end if;
  insert into treatment_ratings (booking_id, store_id, member_id, user_id, score, comment)
  values (b.id, b.store_id, b.member_id, auth.uid(), greatest(1, least(5, p_score)), nullif(trim(p_comment), ''))
  on conflict (booking_id) do update set score = excluded.score, comment = excluded.comment;
end;
$$;

create or replace function public.c_delete_record(p_booking uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update bookings set customer_record_deleted_at = now()
   where id = p_booking and customer_id in (select public.c_my_customer_ids());
$$;

create or replace function public.c_survey(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', ps.id, 'status', ps.status, 'topic', ps.topic, 'kinds', ps.kinds, 'items', ps.items,
           'store', s.name, 'start', b.starts_at, 'booking_id', ps.booking_id)
  from pre_surveys ps
  join stores s on s.id = ps.store_id
  left join bookings b on b.id = ps.booking_id
  where ps.id = p_id and ps.customer_id in (select public.c_my_customer_ids());
$$;

create or replace function public.c_answer_survey(p_id uuid, p_answers jsonb, p_flags jsonb, p_summary jsonb, p_guides jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update pre_surveys
     set status = 'answered', answers = coalesce(p_answers, '[]'), flags = coalesce(p_flags, '[]'),
         summary = coalesce(p_summary, '{"safety": [], "style": []}'), guides = coalesce(p_guides, '[]'), answered_at = now()
   where id = p_id and customer_id in (select public.c_my_customer_ids());
  if not found then
    raise exception '문진을 찾지 못했습니다';
  end if;
end;
$$;

create or replace function public.c_mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = public
as $$
  update customer_notifications set read_at = coalesce(read_at, now())
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;

create or replace function public.c_confirm_notification(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update customer_notifications set read_at = coalesce(read_at, now()), confirmed_at = now()
   where user_id = auth.uid() and id = p_id;
$$;

-- =====================================================================================
-- 12. notifications (care inbox): triggers on the owner desk's data
-- =====================================================================================
create or replace function public.c_notify(p_customer uuid, p_category text, p_title text, p_body text, p_booking uuid, p_key text, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  cp customer_profiles%rowtype;
begin
  for l in select user_id, store_id from customer_store_links where customer_id = p_customer loop
    select * into cp from customer_profiles where user_id = l.user_id;
    if not p_force and found then
      if cp.msg_all_off then continue; end if;
      if p_category = 'reservation' and not cp.msg_booking then continue; end if;
      if p_category = 'aftercare' and not cp.msg_aftercare then continue; end if;
      if p_category = 'revisit' and not cp.msg_revisit then continue; end if;
    end if;
    insert into customer_notifications (user_id, store_id, title, body, category, booking_id, dedupe_key)
    values (l.user_id, l.store_id, p_title, p_body, p_category, p_booking, p_key)
    on conflict do nothing;
  end loop;
end;
$$;

create or replace function public.trg_booking_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store text;
  v_when text;
begin
  if new.customer_id is null then
    return new;
  end if;
  select name into v_store from stores where id = new.store_id;
  v_when := to_char(new.starts_at at time zone 'Asia/Seoul', 'MM월 DD일 HH24:MI');
  if tg_op = 'INSERT' then
    if new.source <> 'customer_app' and new.status in ('confirmed', 'requested') then
      perform public.c_notify(new.customer_id, 'reservation', '예약이 등록됐어요', v_store || ' · ' || v_when, new.id, 'bk-new:' || new.id);
    end if;
    return new;
  end if;
  if old.status is distinct from new.status then
    if new.status = 'confirmed' and old.status = 'requested' then
      perform public.c_notify(new.customer_id, 'reservation', '예약이 확정됐어요', v_store || ' · ' || v_when, new.id, 'bk-ok:' || new.id || ':' || to_char(new.starts_at, 'YYMMDDHH24MI'));
    elsif new.status = 'cancelled_shop' then
      perform public.c_notify(new.customer_id, 'reservation', '예약이 취소됐어요', v_store || ' · ' || v_when || ' 예약을 매장에서 취소했어요', new.id, 'bk-cx:' || new.id, true);
    elsif new.status = 'cancelled_customer' and old.status = 'confirmed' then
      perform public.c_notify(new.customer_id, 'reservation', '예약 취소가 완료됐어요', v_store || ' · ' || v_when, new.id, 'bk-cxc:' || new.id, true);
    elsif new.status = 'completed' then
      perform public.c_notify(new.customer_id, 'reservation', '시술이 완료됐어요', v_store || ' 시술이 끝났어요. 다이어리에서 기록을 확인해 보세요', new.id, 'bk-done:' || new.id);
    end if;
  elsif old.starts_at is distinct from new.starts_at and new.status in ('confirmed', 'requested') and old.status = new.status then
    perform public.c_notify(new.customer_id, 'reservation', '예약 시간이 변경됐어요', v_store || ' · ' || v_when, new.id, 'bk-mv:' || new.id || ':' || to_char(new.starts_at, 'YYMMDDHH24MI'));
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_notify on bookings;
create trigger bookings_notify after insert or update on bookings
  for each row execute function public.trg_booking_notify();

create or replace function public.trg_payment_request_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store text;
begin
  if new.status = 'requested' and new.customer_id is not null then
    select name into v_store from stores where id = new.store_id;
    perform public.c_notify(new.customer_id, 'payment', '결제 요청이 도착했어요',
      v_store || ' · ' || to_char(new.amount, 'FM999,999,999') || '원 결제를 확인해 주세요', new.booking_id, 'pay-req:' || new.id, true);
  end if;
  return new;
end;
$$;

drop trigger if exists payment_requests_notify on payment_requests;
create trigger payment_requests_notify after insert on payment_requests
  for each row execute function public.trg_payment_request_notify();

create or replace function public.trg_record_sent_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store text;
begin
  if new.sent_at is not null and (tg_op = 'INSERT' or old.sent_at is null) and new.customer_id is not null then
    select name into v_store from stores where id = new.store_id;
    perform public.c_notify(new.customer_id, 'aftercare', '시술 기록이 도착했어요',
      coalesce(nullif(new.home_care, ''), v_store || ' 시술 내역 · 사진 · 홈케어를 다이어리에서 확인해 보세요'), new.booking_id, 'rec:' || new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists treatment_records_notify on treatment_records;
create trigger treatment_records_notify after insert or update of sent_at on treatment_records
  for each row execute function public.trg_record_sent_notify();

-- revisit reminders: called when the customer opens the app (no cron needed)
create or replace function public.c_refresh_care()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;
  for r in
    select distinct on (b.customer_id, b.store_id) b.id as booking_id, b.customer_id, b.store_id, b.starts_at, s.name as store_name,
           (select min(m.revisit_cycle_days) from booking_items i join store_menus m on m.id = i.menu_id where i.booking_id = b.id and m.revisit_cycle_days is not null) as cycle,
           (select string_agg(i.name, ' + ') from booking_items i where i.booking_id = b.id) as names
    from bookings b
    join stores s on s.id = b.store_id
    where b.customer_id in (select public.c_my_customer_ids()) and b.status = 'completed'
    order by b.customer_id, b.store_id, b.starts_at desc
  loop
    if r.cycle is not null
       and now() >= r.starts_at + make_interval(days => r.cycle) - interval '3 days'
       and not exists (select 1 from bookings x where x.customer_id = r.customer_id and x.store_id = r.store_id and x.starts_at > r.starts_at and x.status in ('requested', 'confirmed', 'in_service')) then
      perform public.c_notify(r.customer_id, 'revisit', '재방문 시기가 다가왔어요',
        coalesce(r.names, '지난 시술') || ' · ' || r.store_name || ' 재방문 시기예요. 예약해 보세요', r.booking_id, 'revisit:' || r.booking_id);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- =====================================================================================
-- 13. grants
-- =====================================================================================
revoke execute on function public.lookup_login_email(text), public.is_login_id_available(text), public.c_notify(uuid, text, text, text, uuid, text, boolean), public.trg_booking_notify(), public.trg_payment_request_notify(), public.trg_record_sent_notify() from public;
grant execute on function public.lookup_login_email(text) to anon, authenticated;
grant execute on function public.is_login_id_available(text) to anon, authenticated;
grant execute on function public.c_my_customer_ids() to authenticated;
grant execute on function public.c_designers(uuid) to authenticated;
grant execute on function public.c_member_free(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.c_slots(uuid, uuid, date, integer, uuid) to authenticated;
grant execute on function public.c_list_stores(text) to authenticated;
grant execute on function public.c_store_catalog(uuid) to authenticated;
grant execute on function public.c_link_user_to_store(uuid, uuid) to authenticated;
grant execute on function public.c_link_with_code(text) to authenticated;
grant execute on function public.c_pending_links() to authenticated;
grant execute on function public.c_link_customer(uuid) to authenticated;
grant execute on function public.c_unlink_store(uuid) to authenticated;
grant execute on function public.c_my_stores() to authenticated;
grant execute on function public.c_request_booking(uuid, uuid, timestamptz, uuid[], text) to authenticated;
grant execute on function public.c_attach_style_photos(uuid, jsonb) to authenticated;
grant execute on function public.c_my_bookings() to authenticated;
grant execute on function public.c_booking_detail(uuid) to authenticated;
grant execute on function public.c_cancel_booking(uuid, text) to authenticated;
grant execute on function public.c_request_change(uuid, text) to authenticated;
grant execute on function public.c_reschedule_booking(uuid, timestamptz) to authenticated;
grant execute on function public.c_payments() to authenticated;
grant execute on function public.c_approve_payment(uuid) to authenticated;
grant execute on function public.c_save_note(uuid, text) to authenticated;
grant execute on function public.c_rate_treatment(uuid, integer, text) to authenticated;
grant execute on function public.c_delete_record(uuid) to authenticated;
grant execute on function public.c_survey(uuid) to authenticated;
grant execute on function public.c_answer_survey(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.c_mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.c_confirm_notification(uuid) to authenticated;
grant execute on function public.c_refresh_care() to authenticated;
grant execute on function public.c_can_read_photo(text) to authenticated;
grant execute on function public.c_owner_reads_style_photo(text) to authenticated;
grant execute on function public.app_code6() to authenticated;

-- =====================================================================================
-- 14. realtime for the in-app inbox
-- =====================================================================================
do $$
begin
  alter publication supabase_realtime add table customer_notifications;
exception when others then
  null;
end $$;
