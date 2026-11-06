-- Customer app polish: address, survey kinds from menu names, cover photo in booking list.

alter table customer_profiles add column if not exists address text;

-- pre_surveys.kinds drives which questions the customer sees; derive it from the booked menu names
create or replace function public.trg_survey_kinds()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  n text;
  k text[] := coalesce(new.kinds, '{}');
begin
  if coalesce(array_length(k, 1), 0) = 0 then
    for n in select jsonb_array_elements_text(coalesce(new.items, '[]'::jsonb)) loop
      if n ~ '열펌|매직' then k := k || 'heat_perm';
      elsif n ~ '펌' then k := k || 'perm';
      end if;
      if n ~ '염색|탈색' then k := k || 'color'; end if;
      if n ~ '클리닉' then k := k || 'clinic'; end if;
      if n ~ '컷|커트' then k := k || 'cut'; end if;
      if n ~ '드라이' then k := k || 'dry'; end if;
    end loop;
    new.kinds := array(select distinct x from unnest(k) x);
  end if;
  return new;
end;
$$;

drop trigger if exists pre_surveys_kinds on pre_surveys;
create trigger pre_surveys_kinds before insert on pre_surveys
  for each row execute function public.trg_survey_kinds();

revoke execute on function public.trg_survey_kinds() from public, anon, authenticated;

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
        'record_sent', coalesce((select (tr.sent_at is not null and tr.shared) from treatment_records tr where tr.booking_id = b.id), false),
        'record_deleted', b.customer_record_deleted_at is not null,
        'damage', (select case when tr.sent_at is not null and tr.shared then tr.damage_level end from treatment_records tr where tr.booking_id = b.id),
        'summary', (select case when tr.sent_at is not null and tr.shared then tr.ai_summary end from treatment_records tr where tr.booking_id = b.id),
        'cover', (select tp.path from treatment_records tr join treatment_photos tp on tp.record_id = tr.id
                  where tr.booking_id = b.id and tr.sent_at is not null and tr.shared and b.customer_record_deleted_at is null
                    and tp.send_to_customer order by (tp.kind = 'after') desc, tp.created_at limit 1),
        'rating', (select tr2.score from treatment_ratings tr2 where tr2.booking_id = b.id),
        'open_request', (select cr.kind from booking_change_requests cr where cr.booking_id = b.id and cr.status = 'open' order by cr.created_at desc limit 1),
        'survey', (select jsonb_build_object('id', ps.id, 'status', ps.status) from pre_surveys ps where ps.booking_id = b.id order by ps.sent_at desc limit 1)
      ) as j
    from bookings b
    join stores s on s.id = b.store_id
    left join store_members m on m.id = b.member_id
    where b.customer_id in (select public.c_my_customer_ids())
      and b.status <> 'blocked'
  ) t;
$$;

revoke execute on function public.c_my_bookings() from public, anon;
grant execute on function public.c_my_bookings() to authenticated;
