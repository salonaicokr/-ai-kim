-- Owner web: store application, setup, manual customers, blocks, and payments.
-- Supabase wraps this file in a transaction.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  form text not null check (form in ('solo', 'shop', 'multi')),
  category text not null check (category in ('hair', 'nail')),
  name text not null,
  address text,
  designer_count integer not null check (designer_count > 0),
  owner_also_designs boolean not null default false,
  phone text,
  biz_name text,
  representative text,
  biz_number text,
  biz_file_name text,
  biz_file_path text,
  permit_file_name text,
  permit_file_path text,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create index stores_owner_id_idx on stores (owner_id);

create table store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'staff', 'assistant')),
  display_name text not null,
  unique (store_id, user_id, role)
);

create table store_hours (
  store_id uuid not null references stores (id) on delete cascade,
  weekday text not null check (weekday in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  opens time not null,
  closes time not null,
  closed boolean not null default false,
  primary key (store_id, weekday)
);

create table store_menus (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  template_id text references menu_templates (id),
  name text not null,
  duration_min integer not null check (duration_min > 0),
  price_krw integer not null check (price_krw >= 0),
  revisit_cycle_days integer check (revisit_cycle_days is null or revisit_cycle_days > 0),
  sort_order integer not null,
  unique (store_id, template_id)
);

create table store_setup (
  store_id uuid primary key references stores (id) on delete cascade,
  hours boolean not null default true,
  menus boolean not null default true,
  staff boolean not null default false,
  notices boolean not null default false,
  import_done boolean not null default false,
  payment_deferred boolean not null default false
);

create table consent_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id uuid references stores (id) on delete cascade,
  code text not null,
  version text not null,
  accepted_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table external_blocks (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null check (source in ('naver', 'phone', 'other')),
  staff_name text,
  repeat text not null default 'none' check (repeat in ('none', 'weekly')),
  memo text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table payment_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores (id) on delete cascade,
  amount_krw integer not null check (amount_krw >= 0),
  service_name text not null,
  entry_type text not null check (entry_type in ('paid', 'refund', 'partial_refund')),
  method_label text not null check (method_label in ('cash', 'card_terminal', 'naver_pay', 'transfer', 'other')),
  note text,
  created_at timestamptz not null default now()
);

create or replace function public.is_store_owner(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from stores where id = sid and owner_id = auth.uid()
  );
$$;

create or replace function public.peek_invite(code text)
returns table (store_name text, category text)
language sql
stable
security definer
set search_path = public
as $$
  select name, category from stores where invite_code = upper(code);
$$;

create or replace function public.join_with_invite(code text, member_name text default '디자이너')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다';
  end if;
  select id into sid from stores where invite_code = upper(code);
  if sid is null then
    raise exception '초대 코드를 찾지 못했습니다';
  end if;
  insert into store_members (store_id, user_id, role, display_name)
  values (sid, auth.uid(), 'staff', coalesce(nullif(trim(member_name), ''), '디자이너'))
  on conflict (store_id, user_id, role) do nothing;
  return sid;
end;
$$;

alter table profiles enable row level security;
alter table stores enable row level security;
alter table store_members enable row level security;
alter table store_hours enable row level security;
alter table store_menus enable row level security;
alter table store_setup enable row level security;
alter table consent_acceptances enable row level security;
alter table customers enable row level security;
alter table external_blocks enable row level security;
alter table payment_entries enable row level security;

create policy profiles_self on profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy stores_owner_read on stores
  for select to authenticated
  using (owner_id = auth.uid());

create policy stores_owner_insert on stores
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy stores_owner_update on stores
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy store_members_owner on store_members
  for all to authenticated
  using (public.is_store_owner(store_id) or user_id = auth.uid())
  with check (public.is_store_owner(store_id));

create policy store_hours_owner on store_hours
  for all to authenticated
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy store_menus_owner on store_menus
  for all to authenticated
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy store_setup_owner on store_setup
  for all to authenticated
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy consent_acceptances_self on consent_acceptances
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy customers_owner on customers
  for all to authenticated
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy external_blocks_owner on external_blocks
  for all to authenticated
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

create policy payment_entries_owner on payment_entries
  for all to authenticated
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on profiles, stores, store_members, store_hours, store_menus, store_setup, consent_acceptances, customers, external_blocks, payment_entries to authenticated;
grant execute on function public.is_store_owner(uuid) to authenticated;
grant execute on function public.peek_invite(text) to anon, authenticated;
grant execute on function public.join_with_invite(text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('store-docs', 'store-docs', false, 10485760)
on conflict (id) do nothing;

create policy store_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'store-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy store_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'store-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
