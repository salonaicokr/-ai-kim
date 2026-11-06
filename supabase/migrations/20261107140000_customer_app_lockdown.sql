-- Lock down function access: Supabase grants EXECUTE to anon/authenticated by default on new functions.
-- Customer RPCs are for signed-in users only; helpers/triggers are not callable from the API at all.

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'c\_%' or p.proname like 'trg\_%' or p.proname in ('app_code6', 'lookup_login_email', 'is_login_id_available'))
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.proname in ('c_notify') or f.proname like 'trg\_%' then
      execute format('revoke execute on function %s from authenticated', f.sig);
    else
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if f.proname in ('lookup_login_email', 'is_login_id_available') then
      execute format('grant execute on function %s to anon', f.sig);
    end if;
  end loop;
end $$;
