create table if not exists public.specialties (
  id uuid primary key default gen_random_uuid(), name text not null unique, description text, active boolean not null default true,
  published boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.practices (
  id uuid primary key default gen_random_uuid(), specialty_id uuid not null references public.specialties(id) on delete restrict,
  name text not null, description text, duration_min int not null default 15 check(duration_min between 5 and 180 and duration_min % 5=0),
  active boolean not null default true, published boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(specialty_id,name)
);
create table if not exists public.professional_specialties (
  professional_id uuid not null references public.profiles(id) on delete cascade, specialty_id uuid not null references public.specialties(id) on delete cascade,
  is_primary boolean not null default false, primary key(professional_id,specialty_id)
);
create table if not exists public.professional_practices (
  professional_id uuid not null references public.profiles(id) on delete cascade, practice_id uuid not null references public.practices(id) on delete cascade,
  primary key(professional_id,practice_id)
);
create table if not exists public.appointment_practices (
  appointment_id uuid not null references public.appointments(id) on delete cascade, practice_id uuid not null references public.practices(id) on delete restrict,
  primary key(appointment_id,practice_id)
);
create index if not exists practices_specialty_active_idx on public.practices(specialty_id,active,published);
create index if not exists professional_specialties_specialty_idx on public.professional_specialties(specialty_id,professional_id);
create index if not exists professional_practices_practice_idx on public.professional_practices(practice_id,professional_id);

alter table public.specialties enable row level security; alter table public.practices enable row level security;
alter table public.professional_specialties enable row level security; alter table public.professional_practices enable row level security;
alter table public.appointment_practices enable row level security;
drop policy if exists "catalog authenticated read specialties" on public.specialties;
drop policy if exists "catalog authenticated read practices" on public.practices;
drop policy if exists "catalog authenticated read professional specialties" on public.professional_specialties;
drop policy if exists "catalog authenticated read professional practices" on public.professional_practices;
drop policy if exists "catalog admin specialties" on public.specialties; drop policy if exists "catalog admin practices" on public.practices;
drop policy if exists "catalog admin professional specialties" on public.professional_specialties; drop policy if exists "catalog admin professional practices" on public.professional_practices;
create policy "catalog authenticated read specialties" on public.specialties for select using(auth.uid() is not null);
create policy "catalog authenticated read practices" on public.practices for select using(auth.uid() is not null);
create policy "catalog authenticated read professional specialties" on public.professional_specialties for select using(auth.uid() is not null);
create policy "catalog authenticated read professional practices" on public.professional_practices for select using(auth.uid() is not null);
create policy "catalog admin specialties" on public.specialties for all using(public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR') with check(public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR');
create policy "catalog admin practices" on public.practices for all using(public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR') with check(public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR');
create policy "catalog admin professional specialties" on public.professional_specialties for all using(public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR') with check(public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR');
create policy "catalog admin professional practices" on public.professional_practices for all using(public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR') with check(public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR');
drop policy if exists "appointment practices scoped read" on public.appointment_practices;
drop policy if exists "appointment practices scoped write" on public.appointment_practices;
create policy "appointment practices scoped read" on public.appointment_practices for select using(exists(select 1 from public.appointments a where a.id=appointment_id and (public.is_admin() or a.location_id=public.current_location_id())));
create policy "appointment practices scoped write" on public.appointment_practices for all using(public.is_admin()) with check(public.is_admin());

-- El catalogo y los consultorios son administrables por Master o Administrador.
drop policy if exists "locations master write" on public.locations;
drop policy if exists "locations admin write" on public.locations;
create policy "locations admin write" on public.locations for all
using(public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR')
with check(public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR');

create or replace function public.delete_location_if_unused(target_location_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not (public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR') then
  raise exception 'Solo Master o Administrador pueden eliminar consultorios.';
 end if;
 if exists(select 1 from public.profiles where location_id=target_location_id)
 or exists(select 1 from public.patient_locations where location_id=target_location_id)
 or exists(select 1 from public.medical_availability where location_id=target_location_id)
 or exists(select 1 from public.appointments where location_id=target_location_id)
 or exists(select 1 from public.reports where location_id=target_location_id) then
  raise exception 'El consultorio tiene actividad asociada. Debe darse de baja para conservar la historia.';
 end if;
 delete from public.locations where id=target_location_id;
 if not found then raise exception 'Consultorio no encontrado.'; end if;
end; $$;
grant execute on function public.delete_location_if_unused(uuid) to authenticated;

insert into public.specialties(name,description) select distinct coalesce(nullif(btrim(specialty),''),'Medicina general'),'Especialidad profesional' from public.profiles where role::text in('MEDICA_ADMIN','MEDICO') on conflict(name) do nothing;
insert into public.practices(specialty_id,name,duration_min)
select specialty.id, seed.name, seed.duration from public.specialties specialty
cross join (values('Consulta',15),('Electrocardiograma',15),('Ergometria',30),('MAPA',30),('Holter',30)) seed(name,duration)
where not exists(select 1 from public.practices p where p.specialty_id=specialty.id and lower(p.name)=lower(seed.name));
insert into public.professional_specialties(professional_id,specialty_id,is_primary)
select profile.id,specialty.id,true from public.profiles profile join public.specialties specialty on lower(specialty.name)=lower(coalesce(nullif(btrim(profile.specialty),''),'Medicina general'))
where profile.role::text in('MEDICA_ADMIN','MEDICO') on conflict do nothing;
insert into public.professional_practices(professional_id,practice_id)
select ps.professional_id,p.id from public.professional_specialties ps join public.practices p on p.specialty_id=ps.specialty_id on conflict do nothing;

create or replace function public.public_commercial_catalog() returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object(
 'specialties',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description) order by s.name) from public.specialties s where s.active and s.published),'[]'::jsonb),
 'practices',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'specialty_id',p.specialty_id,'name',p.name,'description',p.description,'duration_min',p.duration_min) order by p.name) from public.practices p join public.specialties s on s.id=p.specialty_id where p.active and p.published and s.active and s.published),'[]'::jsonb),
 'professionals',coalesce((select jsonb_agg(jsonb_build_object('id',profile.id,'full_name',profile.full_name,'specialty',coalesce(profile.specialty,'Profesional de la salud'),'specialty_ids',(select coalesce(jsonb_agg(ps.specialty_id),'[]'::jsonb) from public.professional_specialties ps where ps.professional_id=profile.id),'practice_ids',(select coalesce(jsonb_agg(pp.practice_id),'[]'::jsonb) from public.professional_practices pp where pp.professional_id=profile.id)) order by profile.full_name) from public.profiles profile where profile.active and profile.role::text in('MEDICA_ADMIN','MEDICO') and profile.public_booking_enabled and exists(select 1 from public.medical_availability ma where ma.doctor_id=profile.id and ma.enabled)),'[]'::jsonb),
 'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'address',l.address) order by l.name) from public.locations l where l.active),'[]'::jsonb)
); $$;
revoke all on function public.public_commercial_catalog() from public; grant execute on function public.public_commercial_catalog() to anon,authenticated;

create or replace function public.commercial_admin_catalog() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not (public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR') then raise exception 'Acceso no autorizado.'; end if;
 return jsonb_build_object(
  'specialties',coalesce((select jsonb_agg(to_jsonb(s) order by s.name) from public.specialties s),'[]'::jsonb),
  'practices',coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.practices p),'[]'::jsonb),
  'professionals',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'public_booking_enabled',p.public_booking_enabled,'specialty_ids',(select coalesce(jsonb_agg(ps.specialty_id),'[]'::jsonb) from public.professional_specialties ps where ps.professional_id=p.id),'practice_ids',(select coalesce(jsonb_agg(pp.practice_id),'[]'::jsonb) from public.professional_practices pp where pp.professional_id=p.id)) order by p.full_name) from public.profiles p where p.active and p.role::text in('MEDICA_ADMIN','MEDICO')),'[]'::jsonb)
 );
end; $$;
grant execute on function public.commercial_admin_catalog() to authenticated;

create or replace function public.set_professional_commercial_profile(p_professional_id uuid,p_published boolean,p_specialty_ids uuid[],p_practice_ids uuid[]) returns void language plpgsql security definer set search_path=public as $$
begin
 if not (public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR') then raise exception 'Acceso no autorizado.'; end if;
 if not exists(select 1 from public.profiles where id=p_professional_id and role::text in('MEDICA_ADMIN','MEDICO')) then raise exception 'Profesional no valido.'; end if;
 update public.profiles set public_booking_enabled=p_published,updated_at=now() where id=p_professional_id;
 delete from public.professional_specialties where professional_id=p_professional_id;
 insert into public.professional_specialties(professional_id,specialty_id,is_primary) select p_professional_id,id,row_number() over(order by name)=1 from public.specialties where id=any(coalesce(p_specialty_ids,array[]::uuid[])) and active;
 delete from public.professional_practices where professional_id=p_professional_id;
 insert into public.professional_practices(professional_id,practice_id) select p_professional_id,id from public.practices where id=any(coalesce(p_practice_ids,array[]::uuid[])) and active;
end; $$;
grant execute on function public.set_professional_commercial_profile(uuid,boolean,uuid[],uuid[]) to authenticated;

create or replace function public.public_request_catalog_appointment(
 p_doctor_id uuid,p_starts_at timestamptz,p_practice_ids uuid[],p_first_name text,p_last_name text,p_document_type text,p_document text,p_phone text,p_email text,p_insurance_plan_id uuid,p_website text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare clean_type text:=upper(coalesce(p_document_type,'DNI')); clean_document text; clean_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'); clean_email text:=lower(btrim(coalesce(p_email,'')));
 duration int; target_location uuid; location_name text; location_address text; target_patient_id uuid; target_appointment_id uuid; doctor_name text; practice_names text;
begin
 if btrim(coalesce(p_website,''))<>'' then raise exception 'Solicitud no valida.'; end if;
 if p_starts_at<=now() then raise exception 'Elegir un horario futuro.'; end if;
 if btrim(coalesce(p_first_name,''))='' or btrim(coalesce(p_last_name,''))='' then raise exception 'Nombre y apellido son obligatorios.'; end if;
 if clean_phone='' and clean_email='' then raise exception 'Ingresar telefono o email.'; end if;
 if coalesce(cardinality(p_practice_ids),0)=0 then raise exception 'Elegir al menos una practica.'; end if;
 if clean_type not in('DNI','LC','LE','PASAPORTE','CEDULA_IDENTIDAD','DOCUMENTO_EXTRANJERO') then raise exception 'Tipo de documento no valido.'; end if;
 clean_document:=case when clean_type in('DNI','LC','LE') then regexp_replace(coalesce(p_document,''),'[^0-9]','','g') else upper(regexp_replace(btrim(coalesce(p_document,'')),'[^A-Za-z0-9-]','','g')) end;
 if clean_document='' then raise exception 'El numero de documento es obligatorio.'; end if;
 select sum(p.duration_min),string_agg(p.name,' + ' order by p.name) into duration,practice_names from public.practices p join public.professional_practices pp on pp.practice_id=p.id and pp.professional_id=p_doctor_id where p.id=any(p_practice_ids) and p.active and p.published;
 if duration is null or (select count(distinct id) from public.practices where id=any(p_practice_ids))<>cardinality(p_practice_ids) then raise exception 'Practica no disponible para el profesional.'; end if;
 perform pg_advisory_xact_lock(hashtext(p_doctor_id::text||p_starts_at::text));
 select slot.location_id,slot.location_name,slot.location_address into target_location,location_name,location_address from public.public_booking_slots(p_doctor_id,(p_starts_at at time zone 'America/Argentina/Buenos_Aires')::date,duration) slot where slot.starts_at=p_starts_at limit 1;
 if target_location is null then raise exception 'Ese horario ya no esta disponible.'; end if;
 select full_name into doctor_name from public.profiles where id=p_doctor_id and active and role::text in('MEDICA_ADMIN','MEDICO') and public_booking_enabled;
 if doctor_name is null then raise exception 'El profesional no recibe turnos web.'; end if;
 select id into target_patient_id from public.patients where document_type=clean_type and document=clean_document for update;
 if target_patient_id is null then insert into public.patients(first_name,last_name,document_type,document,phone,email,insurance_plan_id,status,source,validation_status) values(initcap(lower(btrim(p_first_name))),initcap(lower(btrim(p_last_name))),clean_type,clean_document,nullif(clean_phone,''),nullif(clean_email,''),p_insurance_plan_id,'activo','WEB','PENDIENTE') returning id into target_patient_id;
 else update public.patients set phone=coalesce(nullif(clean_phone,''),phone),email=coalesce(nullif(clean_email,''),email),insurance_plan_id=coalesce(p_insurance_plan_id,insurance_plan_id) where id=target_patient_id; end if;
 insert into public.patient_locations(patient_id,location_id) values(target_patient_id,target_location) on conflict do nothing;
 insert into public.appointments(starts_at,duration_min,type,reason,status,patient_id,location_id,doctor_id) values(p_starts_at,duration,'CONSULTA',practice_names||E'\nSolicitud web','PENDIENTE',target_patient_id,target_location,p_doctor_id) returning id into target_appointment_id;
 insert into public.appointment_practices(appointment_id,practice_id) select target_appointment_id,unnest(p_practice_ids);
 return jsonb_build_object('appointment_id',target_appointment_id,'starts_at',p_starts_at,'duration_min',duration,'doctor_name',doctor_name,'location_name',location_name,'location_address',location_address,'status','PENDIENTE');
end; $$;
revoke all on function public.public_request_catalog_appointment(uuid,timestamptz,uuid[],text,text,text,text,text,text,uuid,text) from public;
grant execute on function public.public_request_catalog_appointment(uuid,timestamptz,uuid[],text,text,text,text,text,text,uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
