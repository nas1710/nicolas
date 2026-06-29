-- Patch incremental para una base demo ya creada.
-- No borra datos. Ejecutar en Supabase SQL Editor si ya habias corrido schema.sql.

alter table public.patients
  add column if not exists document_type text not null default 'DNI';

drop policy if exists "insurance active user insert" on public.insurance_plans;
create policy "insurance active user insert"
on public.insurance_plans for insert
with check (public.current_role() is not null);

alter table public.profiles
  drop constraint if exists secretary_requires_location;

alter table public.profiles
  add constraint secretary_requires_location check (
    role <> 'SECRETARIA' or location_id is not null or active = false
  );

alter table public.appointments alter column duration_min set default 15;

alter table public.appointments
  alter column type type text using type::text;

alter table public.appointments
  drop constraint if exists appointments_type_check;

alter table public.appointments
  add constraint appointments_type_check
  check (type ~ '^(CONSULTA|ELECTROCARDIOGRAMA|ERGOMETRIA|MAPA|HOLTER)(\+(CONSULTA|ELECTROCARDIOGRAMA|ERGOMETRIA|MAPA|HOLTER))*$');

alter table public.medical_availability
  add column if not exists slot_interval_min int not null default 15;

alter table public.medical_availability
  drop constraint if exists medical_availability_slot_interval_min_check;

alter table public.medical_availability
  add constraint medical_availability_slot_interval_min_check
  check (slot_interval_min between 5 and 60 and slot_interval_min % 5 = 0);

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  kind text not null default 'FERIADO',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.holidays
  add column if not exists kind text not null default 'FERIADO';

alter table public.holidays
  drop constraint if exists holidays_kind_check;

alter table public.holidays
  add constraint holidays_kind_check
  check (kind in ('FERIADO', 'VACACIONES', 'CONGRESO', 'LICENCIA', 'OTRO'));

alter table public.holidays enable row level security;

drop policy if exists "holidays read all authenticated" on public.holidays;
create policy "holidays read all authenticated" on public.holidays for select using (auth.uid() is not null);

drop policy if exists "holidays admin write" on public.holidays;
create policy "holidays admin write" on public.holidays for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, location_id, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'Usuario pendiente'),
    'SECRETARIA',
    null,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

-- Recupera cuentas de Auth creadas antes de instalar el trigger.
-- Quedan pendientes hasta que una medica/admin les asigne rol, consultorio y las active.
insert into public.profiles (id, email, full_name, role, location_id, active)
select
  user_account.id,
  coalesce(user_account.email, ''),
  coalesce(user_account.raw_user_meta_data->>'full_name', user_account.email, 'Usuario pendiente'),
  'SECRETARIA',
  null,
  false
from auth.users user_account
where not exists (
  select 1 from public.profiles profile where profile.id = user_account.id
);

alter table public.attachments
  alter column storage_path drop not null;

alter table public.attachments
  add column if not exists external_url text;

alter table public.attachments
  add column if not exists storage_provider text not null default 'SUPABASE';

alter table public.attachments
  drop constraint if exists attachment_storage_provider_check;

alter table public.attachments
  add constraint attachment_storage_provider_check
  check (storage_provider in ('SUPABASE', 'GOOGLE_DRIVE'));

alter table public.attachments
  drop constraint if exists attachment_has_source;

alter table public.attachments
  add constraint attachment_has_source check (
    (storage_provider = 'SUPABASE' and storage_path is not null)
    or (storage_provider = 'GOOGLE_DRIVE' and external_url is not null)
  );

create or replace function public.appointment_inside_availability(
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
    from public.medical_availability ma
    where ma.enabled = true
      and ma.location_id = appointment_location_id
      and ma.weekday = extract(dow from appointment_starts_at at time zone 'America/Argentina/Buenos_Aires')::int
      and (appointment_starts_at at time zone 'America/Argentina/Buenos_Aires')::time >= ma.start_time::time
      and ((appointment_starts_at at time zone 'America/Argentina/Buenos_Aires') + make_interval(mins => appointment_duration_min))::time <= ma.end_time::time
  );
$$;

create or replace function public.enforce_appointment_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.appointment_inside_availability(new.location_id, new.starts_at, new.duration_min) then
    raise exception 'El turno esta fuera de la disponibilidad configurada para esa sede.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_appointment_availability on public.appointments;
create trigger validate_appointment_availability
before insert or update of starts_at, duration_min, location_id on public.appointments
for each row execute function public.enforce_appointment_availability();

create or replace function public.prevent_patient_identity_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name
    or new.document_type is distinct from old.document_type
    or new.document is distinct from old.document
    or new.birth_date is distinct from old.birth_date then
    raise exception 'Nombre, DNI y fecha de nacimiento no se editan desde la ficha del paciente.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_patient_identity on public.patients;

-- Corrige fechas antiguas que quedaron con un digito del dia delante del anio,
-- por ejemplo 42026-04-14 pasa a 2026-04-14.
update public.patients
set birth_date = make_date(
  mod(extract(year from birth_date)::int, 10000),
  extract(month from birth_date)::int,
  extract(day from birth_date)::int
)
where extract(year from birth_date)::int between 10000 and 99999
  and mod(extract(year from birth_date)::int, 10000)
    between 1900 and extract(year from current_date)::int;

create trigger protect_patient_identity
before update of first_name, last_name, document_type, document, birth_date on public.patients
for each row execute function public.prevent_patient_identity_update();
