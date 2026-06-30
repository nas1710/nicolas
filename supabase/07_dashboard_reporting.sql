-- Dashboard operativo multi-profesional. Idempotente y sin borrado de datos.
alter table public.appointments add column if not exists source text not null default 'INTERNAL';
update public.appointments set source='WEB'
where source='INTERNAL' and reason ilike '%Solicitud web%';
alter table public.appointments drop constraint if exists appointments_source_check;
alter table public.appointments add constraint appointments_source_check check(source in('INTERNAL','WEB'));
create index if not exists appointments_reporting_idx on public.appointments(starts_at,doctor_id,location_id,status,source);

create or replace function public.assign_appointment_source() returns trigger language plpgsql as $$
begin
 if new.reason ilike '%Solicitud web%' then new.source:='WEB';
 elsif new.source is null then new.source:='INTERNAL'; end if;
 return new;
end; $$;
drop trigger if exists assign_appointment_source on public.appointments;
create trigger assign_appointment_source before insert or update of reason,source on public.appointments
for each row execute function public.assign_appointment_source();

create or replace function public.dashboard_report(
 p_from date,
 p_to date,
 p_professional_id uuid default null,
 p_specialty_id uuid default null,
 p_practice_id uuid default null,
 p_location_id uuid default null,
 p_status text default null,
 p_source text default null,
 p_validation_status text default null
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; caller_role text:=public.current_role()::text; caller_location uuid:=public.current_location_id();
begin
 if auth.uid() is null then raise exception 'Acceso no autorizado.'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Rango de fechas no valido.'; end if;
 with scoped as (
  select a.*,coalesce(pro.full_name,'Profesional sin asignar') professional_name,l.name location_name,
   case when a.starts_at<now() and a.status::text in('CONFIRMADO','RECORDATORIO_ENVIADO') then 'ATENDIDO' else a.status::text end operational_status,
   pat.first_name patient_first_name,pat.last_name patient_last_name
  from public.appointments a
  join public.patients pat on pat.id=a.patient_id
  join public.locations l on l.id=a.location_id
  left join public.profiles pro on pro.id=a.doctor_id
  where (a.starts_at at time zone 'America/Argentina/Buenos_Aires')::date between p_from and p_to
   and (public.current_user_is_master() or caller_role='ADMINISTRADOR' or (caller_role in('MEDICO','MEDICA_ADMIN') and a.doctor_id=auth.uid()) or (caller_role='SECRETARIA' and a.location_id=caller_location))
   and (p_professional_id is null or a.doctor_id=p_professional_id)
   and (p_location_id is null or a.location_id=p_location_id)
   and (p_status is null or (case when a.starts_at<now() and a.status::text in('CONFIRMADO','RECORDATORIO_ENVIADO') then 'ATENDIDO' else a.status::text end)=p_status)
   and (p_source is null or a.source=p_source)
   and (p_practice_id is null or exists(select 1 from public.appointment_practices ap where ap.appointment_id=a.id and ap.practice_id=p_practice_id))
   and (p_specialty_id is null or exists(select 1 from public.appointment_practices ap join public.practices pr on pr.id=ap.practice_id where ap.appointment_id=a.id and pr.specialty_id=p_specialty_id))
 ), accessible_patients as (
  select p.* from public.patients p where public.current_user_is_master() or caller_role='ADMINISTRADOR'
   or (caller_role in('MEDICO','MEDICA_ADMIN') and exists(select 1 from public.appointments a where a.patient_id=p.id and a.doctor_id=auth.uid()))
   or (caller_role='SECRETARIA' and exists(select 1 from public.patient_locations pl where pl.patient_id=p.id and pl.location_id=caller_location))
 ), patient_scope as (
  select p.* from accessible_patients p where p.created_at::date between p_from and p_to
   and (p_validation_status is null or p.validation_status=p_validation_status)
 ), capacity as (
  select coalesce(sum(floor(extract(epoch from (ma.end_time::time-ma.start_time::time))/60/greatest(ma.slot_interval_min,1))),0)::int slots,
   coalesce(sum(extract(epoch from (ma.end_time::time-ma.start_time::time))/60),0)::numeric minutes
  from public.medical_availability ma cross join lateral generate_series(p_from,p_to,interval '1 day') d
  where ma.enabled and extract(dow from d)::int=ma.weekday
   and (public.current_user_is_master() or caller_role='ADMINISTRADOR' or (caller_role in('MEDICO','MEDICA_ADMIN') and ma.doctor_id=auth.uid()) or (caller_role='SECRETARIA' and ma.location_id=caller_location))
   and (p_professional_id is null or ma.doctor_id=p_professional_id) and (p_location_id is null or ma.location_id=p_location_id)
 ), practices_group as (
  select pr.name label,count(*)::int value from scoped s join public.appointment_practices ap on ap.appointment_id=s.id join public.practices pr on pr.id=ap.practice_id group by pr.name order by value desc,pr.name
 ), specialties_group as (
  select sp.name label,count(distinct s.id)::int value from scoped s join public.appointment_practices ap on ap.appointment_id=s.id join public.practices pr on pr.id=ap.practice_id join public.specialties sp on sp.id=pr.specialty_id group by sp.name order by value desc,sp.name
 )
 select jsonb_build_object(
  'summary',jsonb_build_object(
   'total',(select count(*) from scoped),'pending',(select count(*) from scoped where operational_status='PENDIENTE'),
   'confirmed',(select count(*) from scoped where operational_status in('CONFIRMADO','RECORDATORIO_ENVIADO')),
   'cancelled',(select count(*) from scoped where operational_status='CANCELADO'),'attended',(select count(*) from scoped where operational_status='ATENDIDO'),
   'webAppointments',(select count(*) from scoped where source='WEB'),'internalAppointments',(select count(*) from scoped where source='INTERNAL'),
   'newPatients',(select count(*) from patient_scope),'webPatients',(select count(*) from patient_scope where source='WEB'),
   'pendingValidation',(select count(*) from accessible_patients p where p.validation_status='PENDIENTE'),
   'archivedValidation',(select count(*) from accessible_patients p where p.validation_status='ARCHIVADO_NO_VALIDADO'),
   'capacity',(select slots from capacity),'occupancy',case when (select minutes from capacity)>0 then round(100.0*(select coalesce(sum(duration_min),0) from scoped where operational_status<>'CANCELADO')/(select minutes from capacity),1) else 0 end
  ),
  'byProfessional',coalesce((select jsonb_agg(x) from(select professional_name label,count(*)::int value from scoped group by professional_name order by value desc) x),'[]'::jsonb),
  'byLocation',coalesce((select jsonb_agg(x) from(select location_name label,count(*)::int value from scoped group by location_name order by value desc) x),'[]'::jsonb),
  'byPractice',coalesce((select jsonb_agg(practices_group) from practices_group),'[]'::jsonb),
  'bySpecialty',coalesce((select jsonb_agg(specialties_group) from specialties_group),'[]'::jsonb),
  'byHour',coalesce((select jsonb_agg(x) from(select to_char(starts_at at time zone 'America/Argentina/Buenos_Aires','HH24:00') label,count(*)::int value from scoped group by 1 order by value desc) x),'[]'::jsonb),
  'appointments',coalesce((select jsonb_agg(x order by x.starts_at) from(select id,starts_at,duration_min,operational_status status,source,professional_name,location_name,patient_first_name,patient_last_name from scoped order by starts_at limit 500) x),'[]'::jsonb),
  'patients',coalesce((select jsonb_agg(x order by x.created_at desc) from(select id,first_name,last_name,source,validation_status,created_at from patient_scope order by created_at desc limit 100) x),'[]'::jsonb),
  'options',jsonb_build_object(
   'professionals',coalesce((select jsonb_agg(distinct jsonb_build_object('id',p.id,'name',p.full_name)) from public.profiles p where p.active and p.role::text in('MEDICO','MEDICA_ADMIN') and (public.current_user_is_master() or caller_role='ADMINISTRADOR' or p.id=auth.uid())),'[]'::jsonb),
   'locations',coalesce((select jsonb_agg(distinct jsonb_build_object('id',l.id,'name',l.name)) from public.locations l where l.active and (caller_role<>'SECRETARIA' or l.id=caller_location)),'[]'::jsonb),
   'specialties',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from public.specialties s where s.active),'[]'::jsonb),
   'practices',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'specialty_id',p.specialty_id) order by p.name) from public.practices p where p.active),'[]'::jsonb)
  )
 ) into result;
 return result;
end; $$;
revoke all on function public.dashboard_report(date,date,uuid,uuid,uuid,uuid,text,text,text) from public;
grant execute on function public.dashboard_report(date,date,uuid,uuid,uuid,uuid,text,text,text) to authenticated;
notify pgrst,'reload schema';
