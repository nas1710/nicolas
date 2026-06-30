-- Turnos publicos sin login, con agenda por profesional y sin exponer datos internos.
-- Ejecutar en Supabase > SQL Editor sobre la base existente.

begin;

alter table public.profiles add column if not exists public_booking_enabled boolean not null default true;
alter table public.profiles add column if not exists specialty text not null default 'Cardiologia';
update public.profiles set public_booking_enabled = false where role <> 'MEDICA_ADMIN';

alter table public.medical_availability
  add column if not exists doctor_id uuid references public.profiles(id) on delete restrict;

alter table public.appointments
  add column if not exists doctor_id uuid references public.profiles(id) on delete restrict;

alter table public.holidays
  add column if not exists doctor_id uuid references public.profiles(id) on delete restrict;

alter table public.holidays drop constraint if exists holidays_date_key;
create unique index if not exists holidays_date_doctor_unique
on public.holidays (date, coalesce(doctor_id, '00000000-0000-0000-0000-000000000000'::uuid));

do $$
declare
  default_doctor uuid;
begin
  select id into default_doctor
  from public.profiles
  where role = 'MEDICA_ADMIN' and active
  order by (lower(email) = 'nas1710@gmail.com') desc, created_at
  limit 1;

  if default_doctor is not null then
    update public.medical_availability set doctor_id = default_doctor where doctor_id is null;
    update public.holidays set doctor_id = default_doctor where doctor_id is null and kind <> 'FERIADO';
    update public.appointments appointment
    set doctor_id = coalesce(
      (
        select availability.doctor_id
        from public.medical_availability availability
        where availability.location_id = appointment.location_id
          and availability.weekday = extract(dow from appointment.starts_at at time zone 'America/Argentina/Buenos_Aires')::int
          and (appointment.starts_at at time zone 'America/Argentina/Buenos_Aires')::time >= availability.start_time::time
          and (appointment.starts_at at time zone 'America/Argentina/Buenos_Aires')::time < availability.end_time::time
        order by availability.created_at
        limit 1
      ),
      default_doctor
    )
    where appointment.doctor_id is null;
  end if;
end;
$$;

create or replace function public.assign_availability_doctor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_doctor_id uuid;
begin
  if new.doctor_id is null then
    select id into target_doctor_id
    from public.profiles
    where id = auth.uid() and role = 'MEDICA_ADMIN' and active;
    new.doctor_id := target_doctor_id;
  end if;

  if new.doctor_id is null then
    raise exception 'Elegir el profesional de la agenda.';
  end if;

  return new;
end;
$$;

drop trigger if exists assign_availability_doctor on public.medical_availability;
create trigger assign_availability_doctor
before insert or update of doctor_id on public.medical_availability
for each row execute function public.assign_availability_doctor();

create or replace function public.enforce_doctor_schedule_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.enabled and exists (
    select 1 from public.medical_availability existing
    where existing.id is distinct from new.id
      and existing.enabled
      and existing.doctor_id = new.doctor_id
      and existing.weekday = new.weekday
      and existing.start_time::time < new.end_time::time
      and new.start_time::time < existing.end_time::time
  ) then
    raise exception 'El profesional ya tiene otro consultorio u horario superpuesto.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_doctor_schedule_overlap on public.medical_availability;
create trigger validate_doctor_schedule_overlap
before insert or update of doctor_id, weekday, start_time, end_time, enabled on public.medical_availability
for each row execute function public.enforce_doctor_schedule_no_overlap();

create or replace function public.assign_holiday_doctor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_doctor_id uuid;
begin
  if new.kind = 'FERIADO' then
    new.doctor_id := null;
  elsif new.doctor_id is null then
    select id into target_doctor_id from public.profiles
    where id = auth.uid() and role = 'MEDICA_ADMIN' and active;
    new.doctor_id := target_doctor_id;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_holiday_doctor on public.holidays;
create trigger assign_holiday_doctor
before insert or update of kind, doctor_id on public.holidays
for each row execute function public.assign_holiday_doctor();

create or replace function public.appointment_inside_availability(
  appointment_doctor_id uuid,
  appointment_location_id uuid,
  appointment_starts_at timestamptz,
  appointment_duration_min int
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.medical_availability availability
    where availability.enabled
      and availability.doctor_id = appointment_doctor_id
      and availability.location_id = appointment_location_id
      and availability.weekday = extract(dow from appointment_starts_at at time zone 'America/Argentina/Buenos_Aires')::int
      and (appointment_starts_at at time zone 'America/Argentina/Buenos_Aires')::time >= availability.start_time::time
      and ((appointment_starts_at at time zone 'America/Argentina/Buenos_Aires') + make_interval(mins => appointment_duration_min))::time <= availability.end_time::time
  );
$$;

create or replace function public.enforce_appointment_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_doctor_id uuid;
begin
  if new.doctor_id is null then
    select availability.doctor_id into target_doctor_id
    from public.medical_availability availability
    where availability.enabled
      and availability.location_id = new.location_id
      and availability.weekday = extract(dow from new.starts_at at time zone 'America/Argentina/Buenos_Aires')::int
      and (new.starts_at at time zone 'America/Argentina/Buenos_Aires')::time >= availability.start_time::time
      and ((new.starts_at at time zone 'America/Argentina/Buenos_Aires') + make_interval(mins => new.duration_min))::time <= availability.end_time::time
    order by (availability.doctor_id = auth.uid()) desc, availability.created_at
    limit 1;
    new.doctor_id := target_doctor_id;
  end if;

  if new.status <> 'CANCELADO' and exists (
    select 1 from public.holidays holiday
    where holiday.active
      and holiday.date = (new.starts_at at time zone 'America/Argentina/Buenos_Aires')::date
      and (holiday.doctor_id is null or holiday.doctor_id = new.doctor_id)
  ) then
    raise exception 'La fecha esta bloqueada por feriado, vacaciones o licencia.';
  end if;

  if new.status <> 'CANCELADO' and not public.appointment_inside_availability(new.doctor_id, new.location_id, new.starts_at, new.duration_min) then
    raise exception 'El turno esta fuera de la disponibilidad configurada para ese profesional.';
  end if;

  if new.status <> 'CANCELADO' and exists (
    select 1
    from public.appointments occupied
    where occupied.id is distinct from new.id
      and occupied.doctor_id = new.doctor_id
      and occupied.status <> 'CANCELADO'
      and occupied.starts_at < new.starts_at + make_interval(mins => new.duration_min)
      and occupied.starts_at + make_interval(mins => occupied.duration_min) > new.starts_at
  ) then
    raise exception 'Ese horario acaba de ser ocupado. Elegir otro turno.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_appointment_availability on public.appointments;
create trigger validate_appointment_availability
before insert or update of starts_at, duration_min, location_id, doctor_id, status on public.appointments
for each row execute function public.enforce_appointment_availability();

create or replace function public.public_booking_doctors()
returns table (id uuid, full_name text, specialty text)
language sql
stable
security definer
set search_path = public
as $$
  select profile.id, profile.full_name, profile.specialty
  from public.profiles profile
  where profile.active
    and profile.role = 'MEDICA_ADMIN'
    and profile.public_booking_enabled
    and exists (
      select 1 from public.medical_availability availability
      where availability.doctor_id = profile.id and availability.enabled
    )
  order by profile.full_name;
$$;

create or replace function public.public_booking_slots(
  p_doctor_id uuid,
  p_date date,
  p_duration_min int
)
returns table (
  starts_at timestamptz,
  location_id uuid,
  location_name text,
  location_address text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    generated.slot_start,
    location.id,
    location.name,
    location.address
  from public.medical_availability availability
  join public.locations location on location.id = availability.location_id and location.active
  cross join lateral generate_series(
    (p_date + availability.start_time::time) at time zone 'America/Argentina/Buenos_Aires',
    ((p_date + availability.end_time::time) at time zone 'America/Argentina/Buenos_Aires') - make_interval(mins => greatest(5, least(p_duration_min, 120))),
    make_interval(mins => availability.slot_interval_min)
  ) generated(slot_start)
  where availability.enabled
    and availability.doctor_id = p_doctor_id
    and exists (
      select 1 from public.profiles profile
      where profile.id = p_doctor_id
        and profile.active
        and profile.role = 'MEDICA_ADMIN'
        and profile.public_booking_enabled
    )
    and availability.weekday = extract(dow from p_date)::int
    and p_date >= (now() at time zone 'America/Argentina/Buenos_Aires')::date
    and generated.slot_start > now()
    and not exists (
      select 1 from public.holidays holiday
      where holiday.active
        and holiday.date = p_date
        and (holiday.doctor_id is null or holiday.doctor_id = p_doctor_id)
    )
    and not exists (
      select 1 from public.appointments appointment
      where appointment.doctor_id = p_doctor_id
        and appointment.status <> 'CANCELADO'
        and appointment.starts_at < generated.slot_start + make_interval(mins => greatest(5, least(p_duration_min, 120)))
        and appointment.starts_at + make_interval(mins => appointment.duration_min) > generated.slot_start
    )
  order by generated.slot_start;
$$;

create or replace function public.public_request_appointment(
  p_doctor_id uuid,
  p_starts_at timestamptz,
  p_types text[],
  p_first_name text,
  p_last_name text,
  p_document_type text,
  p_document text,
  p_birth_date date,
  p_phone text,
  p_email text,
  p_website text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_types text[];
  clean_document_type text := upper(coalesce(p_document_type, 'DNI'));
  clean_document text;
  clean_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  clean_email text := lower(btrim(coalesce(p_email, '')));
  booking_duration int;
  target_location_id uuid;
  target_location_name text;
  target_location_address text;
  target_patient_id uuid;
  target_appointment_id uuid;
  doctor_name text;
  type_marker text;
  existing_birth_date date;
begin
  if btrim(coalesce(p_website, '')) <> '' then raise exception 'Solicitud no valida.'; end if;
  if p_starts_at <= now() then raise exception 'Elegir un horario futuro.'; end if;
  if btrim(coalesce(p_first_name, '')) = '' or btrim(coalesce(p_last_name, '')) = '' then raise exception 'Nombre y apellido son obligatorios.'; end if;
  if clean_phone = '' and clean_email = '' then raise exception 'Ingresar telefono o email.'; end if;

  clean_types := array(select distinct upper(btrim(value)) from unnest(coalesce(p_types, array[]::text[])) value where btrim(value) <> '');
  if cardinality(clean_types) = 0 or not clean_types <@ array['CONSULTA','ELECTROCARDIOGRAMA','ERGOMETRIA','MAPA','HOLTER']::text[] then
    raise exception 'Elegir al menos un motivo de turno valido.';
  end if;

  select sum(case value when 'CONSULTA' then 15 when 'ELECTROCARDIOGRAMA' then 15 else 30 end)
  into booking_duration from unnest(clean_types) value;

  if clean_document_type not in ('DNI','LC','LE','PASAPORTE','CEDULA_IDENTIDAD','DOCUMENTO_EXTRANJERO') then
    raise exception 'Tipo de documento no valido.';
  end if;

  clean_document := case
    when clean_document_type in ('DNI','LC','LE') then regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g')
    else upper(regexp_replace(btrim(coalesce(p_document, '')), '[^A-Za-z0-9-]', '', 'g'))
  end;
  if clean_document = '' then raise exception 'El numero de documento es obligatorio.'; end if;

  perform pg_advisory_xact_lock(hashtext(p_doctor_id::text || p_starts_at::text));

  select slot.location_id, slot.location_name, slot.location_address
  into target_location_id, target_location_name, target_location_address
  from public.public_booking_slots(p_doctor_id, (p_starts_at at time zone 'America/Argentina/Buenos_Aires')::date, booking_duration) slot
  where slot.starts_at = p_starts_at
  limit 1;

  if target_location_id is null then raise exception 'Ese horario ya no esta disponible. Elegir otro.'; end if;

  select profile.full_name into doctor_name
  from public.profiles profile
  where profile.id = p_doctor_id and profile.active and profile.role = 'MEDICA_ADMIN' and profile.public_booking_enabled;
  if doctor_name is null then raise exception 'El profesional no recibe turnos web.'; end if;

  if (
    select count(*) from public.appointments appointment
    join public.patients patient on patient.id = appointment.patient_id
    where patient.document_type = clean_document_type
      and patient.document = clean_document
      and appointment.created_at > now() - interval '1 hour'
      and appointment.status <> 'CANCELADO'
  ) >= 3 then raise exception 'Se alcanzo el limite de solicitudes. Comunicarse con el consultorio.'; end if;

  select patient.id, patient.birth_date into target_patient_id, existing_birth_date
  from public.patients patient
  where patient.document_type = clean_document_type and patient.document = clean_document
  for update;

  if target_patient_id is not null and existing_birth_date is not null and p_birth_date is not null and existing_birth_date <> p_birth_date then
    raise exception 'Los datos no coinciden con el documento registrado. Comunicarse con el consultorio.';
  end if;

  if target_patient_id is null then
    insert into public.patients (
      first_name, last_name, document_type, document, birth_date, phone, email, status, location_id
    ) values (
      initcap(lower(btrim(p_first_name))), initcap(lower(btrim(p_last_name))), clean_document_type, clean_document,
      p_birth_date, nullif(clean_phone, ''), nullif(clean_email, ''), 'activo', target_location_id
    ) returning id into target_patient_id;
  end if;

  insert into public.patient_locations(patient_id, location_id)
  values (target_patient_id, target_location_id)
  on conflict do nothing;

  type_marker := array_to_string(clean_types, '+');
  insert into public.appointments (
    starts_at, duration_min, type, reason, status, patient_id, location_id, doctor_id
  ) values (
    p_starts_at, booking_duration, clean_types[1], '[[MOTIVOS_TURNO:' || type_marker || ']]' || chr(10) || 'Solicitud web',
    'PENDIENTE', target_patient_id, target_location_id, p_doctor_id
  ) returning id into target_appointment_id;

  return jsonb_build_object(
    'appointment_id', target_appointment_id,
    'starts_at', p_starts_at,
    'duration_min', booking_duration,
    'doctor_name', doctor_name,
    'location_name', target_location_name,
    'location_address', target_location_address,
    'status', 'PENDIENTE'
  );
end;
$$;

revoke all on function public.public_booking_doctors() from public;
revoke all on function public.public_booking_slots(uuid, date, int) from public;
revoke all on function public.public_request_appointment(uuid, timestamptz, text[], text, text, text, text, date, text, text, text) from public;
grant execute on function public.public_booking_doctors() to anon, authenticated;
grant execute on function public.public_booking_slots(uuid, date, int) to anon, authenticated;
grant execute on function public.public_request_appointment(uuid, timestamptz, text[], text, text, text, text, date, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
