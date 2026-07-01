-- Hardening pre-produccion. Idempotente y sin borrado de datos.

begin;

create or replace function public.is_security_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select public.current_user_is_master() or public.current_role()::text = 'ADMINISTRADOR';
$$;

drop policy if exists "audit admin read" on public.audit_logs;
drop policy if exists "audit security admin read" on public.audit_logs;
create policy "audit security admin read" on public.audit_logs
for select using (public.is_security_admin());

create or replace function public.record_session_event(p_action text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or upper(p_action) not in ('LOGIN','LOGOUT') then
    raise exception 'Evento de sesion no valido.';
  end if;
  insert into public.audit_logs(action,entity,entity_id,user_id,after)
  values ('SESSION_' || upper(p_action),'session',auth.uid(),auth.uid(),jsonb_build_object('at',now()));
end; $$;

create or replace function public.audit_configuration_row()
returns trigger language plpgsql security definer set search_path=public as $$
declare old_row jsonb; new_row jsonb; row_id uuid;
begin
  old_row := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  new_row := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  row_id := nullif(coalesce(new_row->>'id',old_row->>'id',''),'')::uuid;
  insert into public.audit_logs(action,entity,entity_id,before,after,user_id)
  values (tg_op,tg_table_name,row_id,old_row,new_row,auth.uid());
  return coalesce(new,old);
end; $$;

do $$
declare table_name text;
begin
  foreach table_name in array array['locations','insurance_plans','medical_availability','holidays','specialties','practices','professional_specialties','professional_practices','communication_templates']
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop trigger if exists %I on public.%I','audit_config_' || table_name,table_name);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_configuration_row()','audit_config_' || table_name,table_name);
    end if;
  end loop;
end $$;

-- Las firmas pertenecen a profesionales, no a administradores no clinicos.
drop policy if exists "professional signatures insert own" on storage.objects;
create policy "professional signatures insert own" on storage.objects for insert with check (
  bucket_id='professional-signatures'
  and (storage.foldername(name))[1]=auth.uid()::text
  and public.current_role()::text in ('MEDICA_ADMIN','MEDICO')
);

create or replace function public.set_my_signature_path(p_signature_path text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if public.current_role() is null or public.current_role()::text not in ('MEDICA_ADMIN','MEDICO') then raise exception 'Acceso no autorizado.'; end if;
  if nullif(btrim(p_signature_path),'') is not null and p_signature_path not like auth.uid()::text || '/%' then raise exception 'Ruta de firma no valida.'; end if;
  update public.profiles set signature_path=nullif(btrim(p_signature_path),''),updated_at=now() where id=auth.uid();
end; $$;

-- Quita EXECUTE implicito a anon/PUBLIC de RPC internos.
do $$
declare fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.proname not in ('public_commercial_catalog','public_booking_doctors','public_booking_insurance_plans','public_booking_slots','public_booking_available_dates','public_request_appointment','public_request_catalog_appointment','current_buenos_aires_clock')
  loop
    execute format('revoke all on function %s from public, anon',fn);
    execute format('grant execute on function %s to authenticated',fn);
  end loop;
end $$;

grant execute on function public.record_session_event(text) to authenticated;
grant execute on function public.complete_password_change() to authenticated;
grant execute on function public.update_my_document_profile(text,text,text,text,text) to authenticated;
grant execute on function public.set_my_signature_path(text) to authenticated;
grant execute on function public.archive_expired_web_patients() to authenticated;
grant execute on function public.validate_web_patient(uuid) to authenticated;
grant execute on function public.register_or_link_patient(text,text,text,text,date,text,text,text,uuid,uuid) to authenticated;
grant execute on function public.communication_alerts() to authenticated;
grant execute on function public.commercial_admin_catalog() to authenticated;
grant execute on function public.dashboard_report(date,date,uuid,uuid,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.set_professional_commercial_profile(uuid,boolean,uuid[],uuid[]) to authenticated;
grant execute on function public.delete_location_if_unused(uuid) to authenticated;

commit;
notify pgrst,'reload schema';
