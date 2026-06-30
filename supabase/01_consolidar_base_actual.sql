-- Consolidación idempotente de una base existente.
-- No elimina tablas ni datos. Ejecutar antes de public_booking.sql.

begin;

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists is_master boolean not null default false;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists document_number text;
alter table public.profiles add column if not exists public_booking_enabled boolean not null default true;
alter table public.profiles add column if not exists specialty text not null default 'Cardiologia';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and confrelid = 'auth.users'::regclass
      and contype = 'f'
  ) then
    alter table public.profiles
      add constraint profiles_id_auth_users_fkey
      foreign key (id) references auth.users(id) on delete cascade
      not valid;
    alter table public.profiles validate constraint profiles_id_auth_users_fkey;
  end if;
end;
$$;

alter table public.profiles drop constraint if exists secretary_requires_location;
alter table public.profiles add constraint secretary_requires_location check (
  role <> 'SECRETARIA' or location_id is not null or active = false
);

alter table public.patients add column if not exists document_type text not null default 'DNI';
alter table public.patients add column if not exists location_id uuid;

create unique index if not exists patients_document_type_number_uidx
  on public.patients(document_type, document)
  where document is not null and document <> '';

create table if not exists public.patient_locations (
  patient_id uuid not null,
  location_id uuid not null,
  linked_at timestamptz not null default now(),
  linked_by uuid,
  primary key (patient_id, location_id)
);

alter table public.patient_locations add column if not exists linked_at timestamptz not null default now();
alter table public.patient_locations add column if not exists linked_by uuid;

insert into public.patient_locations(patient_id, location_id)
select patient.id, patient.location_id
from public.patients patient
join public.locations location on location.id = patient.location_id
where patient.location_id is not null
on conflict (patient_id, location_id) do nothing;

alter table public.patient_locations
  drop constraint if exists patient_locations_patient_id_fkey,
  drop constraint if exists patient_locations_location_id_fkey;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.contype = 'f'
      and constraint_row.conrelid = 'public.patient_locations'::regclass
      and constraint_row.confrelid in ('public.patients'::regclass, 'public.locations'::regclass)
  loop
    execute format('alter table public.patient_locations drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.patient_locations
  add constraint patient_locations_patient_id_fkey
    foreign key (patient_id) references public.patients(id) on delete cascade,
  add constraint patient_locations_location_id_fkey
    foreign key (location_id) references public.locations(id) on delete cascade;

create unique index if not exists patient_locations_patient_location_uidx
  on public.patient_locations(patient_id, location_id);
create index if not exists patient_locations_location_patient_idx
  on public.patient_locations(location_id, patient_id);

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.contype = 'f'
      and constraint_row.conrelid = 'public.patients'::regclass
      and constraint_row.confrelid = 'public.locations'::regclass
  loop
    execute format('alter table public.patients drop constraint %I', constraint_name);
  end loop;
end;
$$;

comment on column public.patients.location_id is
  'LEGACY: no usar para relaciones nuevas. La relación canónica es public.patient_locations.';

alter table public.medical_availability add column if not exists slot_interval_min integer not null default 15;
alter table public.medical_availability add column if not exists doctor_id uuid references public.profiles(id) on delete restrict;
alter table public.appointments add column if not exists doctor_id uuid references public.profiles(id) on delete restrict;

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null default 'Feriado',
  kind text not null default 'FERIADO',
  active boolean not null default true,
  doctor_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.holidays add column if not exists date date;
alter table public.holidays add column if not exists name text default 'Feriado';
alter table public.holidays add column if not exists kind text default 'FERIADO';
alter table public.holidays add column if not exists active boolean default true;
alter table public.holidays add column if not exists doctor_id uuid references public.profiles(id) on delete restrict;
alter table public.holidays add column if not exists created_at timestamptz default now();
alter table public.holidays add column if not exists updated_at timestamptz default now();
alter table public.holidays alter column name set default 'Feriado';

alter table public.attachments add column if not exists external_url text;
alter table public.attachments add column if not exists storage_provider text not null default 'SUPABASE';
alter table public.attachments add column if not exists mime_type text;
alter table public.attachments add column if not exists size_bytes bigint;
alter table public.attachments add column if not exists description text;
alter table public.attachments add column if not exists pending_send boolean not null default false;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email, full_name, role, location_id, active)
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
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.profiles(id, email, full_name, role, location_id, active)
select
  account.id,
  coalesce(account.email, ''),
  coalesce(account.raw_user_meta_data->>'full_name', account.email, 'Usuario pendiente'),
  'SECRETARIA',
  null,
  false
from auth.users account
where not exists (select 1 from public.profiles profile where profile.id = account.id);

create or replace function public.current_user_is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and is_master
  );
$$;

create or replace function public.protect_master_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.is_master then
    raise exception 'El usuario maestro no puede eliminarse.';
  end if;
  if tg_op = 'UPDATE' then
    if old.is_master and (
      new.email is distinct from old.email
      or new.role is distinct from old.role
      or new.location_id is distinct from old.location_id
      or new.active is distinct from old.active
      or new.is_master is distinct from old.is_master
    ) then
      raise exception 'Los privilegios del usuario maestro están protegidos.';
    end if;
    if not old.is_master and new.is_master then
      raise exception 'No se puede crear otro usuario maestro.';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists protect_master_profile on public.profiles;
create trigger protect_master_profile
before update or delete on public.profiles
for each row execute function public.protect_master_profile();

create or replace function public.complete_password_change()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set must_change_password = false, updated_at = now() where id = auth.uid();
$$;

grant execute on function public.complete_password_change() to authenticated;

create or replace function public.patient_accessible(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or (
    public.is_secretary() and exists (
      select 1 from public.patient_locations link
      where link.patient_id = target_patient_id
        and link.location_id = public.current_location_id()
    )
  );
$$;

create or replace function public.current_buenos_aires_clock()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'now', now(),
    'local_date', to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'),
    'timezone', 'America/Argentina/Buenos_Aires'
  );
$$;

grant execute on function public.current_buenos_aires_clock() to anon, authenticated;

alter table public.patient_locations enable row level security;
alter table public.holidays enable row level security;
alter table public.locations enable row level security;

drop policy if exists "patient locations scoped read" on public.patient_locations;
create policy "patient locations scoped read" on public.patient_locations
for select using (public.is_admin() or location_id = public.current_location_id());

drop policy if exists "patient locations scoped insert" on public.patient_locations;
create policy "patient locations scoped insert" on public.patient_locations
for insert with check (public.is_admin() or location_id = public.current_location_id());

drop policy if exists "patient locations scoped update" on public.patient_locations;
create policy "patient locations scoped update" on public.patient_locations
for update using (public.is_admin() or location_id = public.current_location_id())
with check (public.is_admin() or location_id = public.current_location_id());

drop policy if exists "holidays read all authenticated" on public.holidays;
create policy "holidays read all authenticated" on public.holidays
for select using (auth.uid() is not null);

drop policy if exists "holidays admin write" on public.holidays;
create policy "holidays admin write" on public.holidays
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "locations admin write" on public.locations;
drop policy if exists "locations master write" on public.locations;
create policy "locations master write" on public.locations
for all using (public.current_user_is_master()) with check (public.current_user_is_master());

insert into storage.buckets(id, name, public)
values ('patient-files', 'patient-files', false)
on conflict (id) do update set public = false;

notify pgrst, 'reload schema';

commit;
