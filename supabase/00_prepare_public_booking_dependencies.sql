-- Dependencias minimas para ejecutar public_booking.sql sobre una base existente.
-- Ejecutar despues de patient_uniqueness.sql y antes de public_booking.sql.
-- Es idempotente y no elimina ni reemplaza datos existentes.

begin;

-- Necesaria para gen_random_uuid() cuando la tabla holidays aun no existe.
create extension if not exists pgcrypto;

-- Las instalaciones anteriores guardaban el horario sin intervalo configurable.
-- public_booking.sql usa esta columna para generar cada bloque disponible.
alter table public.medical_availability
  add column if not exists slot_interval_min integer not null default 15;

-- public_booking.sql agrega doctor_id y consulta date, kind y active.
-- Algunas instalaciones anteriores no incluyen esta tabla.
create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null default 'Feriado',
  kind text not null default 'FERIADO',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Completa instalaciones donde holidays existe con una estructura parcial.
alter table public.holidays add column if not exists date date;
alter table public.holidays add column if not exists name text default 'Feriado';
alter table public.holidays add column if not exists kind text default 'FERIADO';
alter table public.holidays add column if not exists active boolean default true;
alter table public.holidays add column if not exists created_at timestamptz default now();
alter table public.holidays add column if not exists updated_at timestamptz default now();

alter table public.holidays alter column name set default 'Feriado';
alter table public.holidays alter column kind set default 'FERIADO';
alter table public.holidays alter column active set default true;
alter table public.holidays alter column created_at set default now();
alter table public.holidays alter column updated_at set default now();

-- Mantiene validos los nuevos tipos sin rechazar filas historicas al instalarlo.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.holidays'::regclass
      and conname = 'holidays_kind_check'
  ) then
    alter table public.holidays
      add constraint holidays_kind_check
      check (kind in ('FERIADO', 'VACACIONES', 'CONGRESO', 'LICENCIA', 'OTRO'))
      not valid;
  end if;
end;
$$;

commit;
