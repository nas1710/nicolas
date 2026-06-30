alter table public.patients add column if not exists source text not null default 'INTERNAL';
alter table public.patients add column if not exists validation_status text not null default 'VALIDADO';
alter table public.patients add column if not exists validated_at timestamptz;
alter table public.patients add column if not exists validated_by uuid references auth.users(id) on delete set null;
alter table public.patients add column if not exists web_created_at timestamptz;
create index if not exists patients_web_validation_idx on public.patients(source, validation_status, web_created_at);

create or replace function public.mark_public_booking_patient() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.reason, '') like '%Solicitud web%' then
    update public.patients set source='WEB', validation_status='PENDIENTE', web_created_at=coalesce(web_created_at,now())
    where id=new.patient_id and source='INTERNAL' and validation_status='VALIDADO'
      and created_at > now()-interval '5 minutes'
      and not exists (select 1 from public.appointments previous where previous.patient_id=new.patient_id);
  end if;
  return new;
end; $$;
drop trigger if exists mark_public_booking_patient on public.appointments;
create trigger mark_public_booking_patient before insert on public.appointments for each row execute function public.mark_public_booking_patient();

create or replace function public.archive_expired_web_patients() returns integer language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
  if public.current_role() is null then raise exception 'Acceso no autorizado.'; end if;
  update public.patients patient set validation_status='ARCHIVADO_NO_VALIDADO', updated_at=now()
  where source='WEB' and validation_status='PENDIENTE'
    and (now() at time zone 'America/Argentina/Buenos_Aires')::date > coalesce(
      (select max((a.starts_at at time zone 'America/Argentina/Buenos_Aires')::date)+1 from public.appointments a where a.patient_id=patient.id and a.status<>'CANCELADO'),
      (coalesce(patient.web_created_at,patient.created_at) at time zone 'America/Argentina/Buenos_Aires')::date+1);
  get diagnostics affected=row_count;
  return affected;
end; $$;

create or replace function public.validate_web_patient(target_patient_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if public.current_role() is null or not public.patient_accessible(target_patient_id) then raise exception 'No tenes acceso a este paciente.'; end if;
  update public.patients set validation_status='VALIDADO', validated_at=now(), validated_by=auth.uid(), updated_at=now()
  where id=target_patient_id and source='WEB' and validation_status='PENDIENTE';
end; $$;
grant execute on function public.archive_expired_web_patients() to authenticated;
grant execute on function public.validate_web_patient(uuid) to authenticated;
notify pgrst, 'reload schema';
