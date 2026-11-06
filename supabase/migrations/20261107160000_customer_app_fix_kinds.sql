-- Fix: text[] || 'literal' is parsed as an array literal; use array_append.
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
      if n ~ '열펌|매직' then k := array_append(k, 'heat_perm');
      elsif n ~ '펌' then k := array_append(k, 'perm');
      end if;
      if n ~ '염색|탈색' then k := array_append(k, 'color'); end if;
      if n ~ '클리닉' then k := array_append(k, 'clinic'); end if;
      if n ~ '컷|커트' then k := array_append(k, 'cut'); end if;
      if n ~ '드라이' then k := array_append(k, 'dry'); end if;
    end loop;
    new.kinds := array(select distinct x from unnest(k) x);
  end if;
  return new;
end;
$$;

revoke execute on function public.trg_survey_kinds() from public, anon, authenticated;
