-- Customer app follow-up: app-source bookings, home feed (showcase + designers), AI consult context.
-- Run AFTER 20261107120000_customer_app.sql. Safe to run twice.

-- ---------------------------------------------------------------- bookings from the customer app use source = 'app'
-- (the owner desk already shows the "앱" badge for source = 'app')
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
  values (p_store, v_member, v_cid, p_start, v_end, 'requested', 'app', nullif(trim(p_request), ''))
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
    if new.source <> 'app' and new.status in ('confirmed', 'requested') then
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

-- ---------------------------------------------------------------- showcase photos (AI copies the shop chose to publish)
create or replace function public.c_can_read_showcase(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from treatment_photos tp where tp.ai_path = p_name and tp.showcase = 'published');
$$;

drop policy if exists treatment_photos_showcase_read on storage.objects;
create policy treatment_photos_showcase_read on storage.objects for select to authenticated
  using (bucket_id = 'treatment-photos' and public.c_can_read_showcase(name));

-- home feed: published before/after pairs + designers (with rating) of approved stores
create or replace function public.c_home_feed()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'showcase', coalesce((
      select jsonb_agg(x.j order by x.ts desc) from (
        select tr.created_at as ts, jsonb_build_object(
          'record_id', tr.id, 'store_id', s.id, 'store', s.name, 'label', tr.service_label,
          'before', (select tp.ai_path from treatment_photos tp where tp.record_id = tr.id and tp.kind = 'before' and tp.showcase = 'published' and tp.ai_path is not null limit 1),
          'after', (select tp.ai_path from treatment_photos tp where tp.record_id = tr.id and tp.kind = 'after' and tp.showcase = 'published' and tp.ai_path is not null limit 1)
        ) as j
        from treatment_records tr
        join stores s on s.id = tr.store_id and s.status = 'approved'
        where exists (select 1 from treatment_photos tp where tp.record_id = tr.id and tp.showcase = 'published' and tp.ai_path is not null)
        order by tr.created_at desc
        limit 12
      ) x
    ), '[]'::jsonb),
    'designers', coalesce((
      select jsonb_agg(y.j order by y.score desc nulls last, y.n desc) from (
        select
          avg(r.score) as score, count(r.id) as n,
          jsonb_build_object('id', d.id, 'name', d.name, 'title', d.title, 'store_id', s.id, 'store', s.name,
            'rating', round(avg(r.score)::numeric, 1), 'reviews', count(r.id)) as j
        from stores s
        cross join lateral public.c_designers(s.id) d
        left join treatment_ratings r on r.member_id = d.id
        where s.status = 'approved'
        group by d.id, d.name, d.title, s.id, s.name
        order by avg(r.score) desc nulls last, count(r.id) desc
        limit 10
      ) y
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------- AI consult context (what the shop chose to share with me)
create or replace function public.c_ai_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'date', (b.starts_at at time zone 'Asia/Seoul')::date,
      'title', tr.service_label, 'damage', tr.damage_level,
      'diagnosis', tr.designer_diagnosis, 'home_care', tr.home_care
    ) order by b.starts_at desc), '[]'::jsonb)
  from (
    select b2.* from bookings b2
    where b2.customer_id in (select public.c_my_customer_ids()) and b2.customer_record_deleted_at is null
    order by b2.starts_at desc limit 20
  ) b
  join treatment_records tr on tr.booking_id = b.id and tr.sent_at is not null and tr.shared;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.c_can_read_showcase(text), public.c_home_feed(), public.c_ai_context() from public;
revoke execute on function public.c_request_booking(uuid, uuid, timestamptz, uuid[], text) from public;
grant execute on function public.c_can_read_showcase(text) to authenticated;
grant execute on function public.c_home_feed() to authenticated;
grant execute on function public.c_ai_context() to authenticated;
grant execute on function public.c_request_booking(uuid, uuid, timestamptz, uuid[], text) to authenticated;
