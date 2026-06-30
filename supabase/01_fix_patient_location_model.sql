-- P0: paciente global y consultorios vinculados exclusivamente por patient_locations.
-- Conserva patients.location_id como dato legado, pero elimina su relacion FK ambigua.

begin;

create table if not exists public.patient_locations (
  patient_id uuid not null,
  location_id uuid not null,
  linked_at timestamptz not null default now(),
  linked_by uuid,
  primary key (patient_id, location_id)
);

alter table public.patient_locations
  add column if not exists linked_at timestamptz not null default now(),
  add column if not exists linked_by uuid;

-- Primero conserva todas las asociaciones historicas de la columna heredada.
insert into public.patient_locations (patient_id, location_id)
select patient.id, patient.location_id
from public.patients patient
join public.locations location on location.id = patient.location_id
where patient.location_id is not null
on conflict (patient_id, location_id) do nothing;

-- Deja una sola FK, estable y con nombre explicito, para cada relacion de la tabla puente.
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

-- Elimina cualquier FK heredada patients.location_id -> locations.id sin borrar la columna ni sus valores.
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
      and exists (
        select 1
        from unnest(constraint_row.conkey) column_number
        join pg_attribute attribute
          on attribute.attrelid = constraint_row.conrelid
         and attribute.attnum = column_number
        where attribute.attname = 'location_id'
      )
  loop
    execute format('alter table public.patients drop constraint %I', constraint_name);
  end loop;
end;
$$;

comment on column public.patients.location_id is
  'LEGACY: no usar para relaciones nuevas. La relacion canonica es public.patient_locations.';

create or replace function public.register_or_link_patient(
  p_first_name text,
  p_last_name text,
  p_document_type text,
  p_document text,
  p_birth_date date,
  p_phone text,
  p_email text,
  p_affiliate_number text,
  p_insurance_plan_id uuid,
  p_location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_type text := upper(coalesce(p_document_type, 'DNI'));
  clean_document text;
  target_location uuid := p_location_id;
  existing_patient public.patients%rowtype;
  patient_uuid uuid;
begin
  if public.current_role() is null then
    raise exception 'Usuario sin acceso activo.';
  end if;

  if clean_type not in ('DNI', 'LC', 'LE', 'PASAPORTE', 'CEDULA_IDENTIDAD', 'DOCUMENTO_EXTRANJERO') then
    raise exception 'Tipo de documento no valido.';
  end if;

  clean_document := case
    when clean_type in ('DNI', 'LC', 'LE') then regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g')
    else upper(regexp_replace(trim(coalesce(p_document, '')), '[^A-Za-z0-9-]', '', 'g'))
  end;

  if clean_document = '' then
    raise exception 'El numero de documento es obligatorio para evitar pacientes duplicados.';
  end if;

  if public.is_secretary() then
    target_location := public.current_location_id();
    if p_location_id is not null and p_location_id is distinct from target_location then
      raise exception 'La secretaria solo puede vincular pacientes a su consultorio.';
    end if;
  end if;

  if target_location is not null and not exists (
    select 1 from public.locations location where location.id = target_location and location.active
  ) then
    raise exception 'El consultorio seleccionado no existe o esta inactivo.';
  end if;

  -- Serializa altas simultaneas del mismo documento antes de consultar o insertar.
  perform pg_advisory_xact_lock(hashtext(clean_type || ':' || clean_document));

  select * into existing_patient
  from public.patients
  where document_type = clean_type and document = clean_document
  for update;

  if found then
    if existing_patient.birth_date is not null
      and p_birth_date is not null
      and existing_patient.birth_date <> p_birth_date then
      raise exception 'El documento ya pertenece a un paciente con otra fecha de nacimiento. Revisar los datos.';
    end if;

    if target_location is not null then
      insert into public.patient_locations (patient_id, location_id, linked_by)
      values (existing_patient.id, target_location, auth.uid())
      on conflict (patient_id, location_id) do nothing;
    end if;

    return jsonb_build_object('patient_id', existing_patient.id, 'already_existed', true);
  end if;

  insert into public.patients (
    first_name, last_name, document_type, document, birth_date, phone, email,
    affiliate_number, insurance_plan_id
  ) values (
    p_first_name, p_last_name, clean_type, clean_document, p_birth_date, p_phone, p_email,
    p_affiliate_number, p_insurance_plan_id
  ) returning id into patient_uuid;

  if target_location is not null then
    insert into public.patient_locations (patient_id, location_id, linked_by)
    values (patient_uuid, target_location, auth.uid())
    on conflict (patient_id, location_id) do nothing;
  end if;

  return jsonb_build_object('patient_id', patient_uuid, 'already_existed', false);
end;
$$;

grant execute on function public.register_or_link_patient(text, text, text, text, date, text, text, text, uuid, uuid)
  to authenticated;

drop policy if exists "patients scoped insert" on public.patients;
create policy "patients scoped insert" on public.patients
for insert with check (public.is_admin());

create or replace function public.delete_location_if_unused(target_location_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_master() then
    raise exception 'Solo el usuario maestro puede eliminar consultorios.';
  end if;

  if exists (select 1 from public.profiles where location_id = target_location_id)
    or exists (select 1 from public.patient_locations where location_id = target_location_id)
    or exists (select 1 from public.medical_availability where location_id = target_location_id)
    or exists (select 1 from public.appointments where location_id = target_location_id)
    or exists (select 1 from public.reports where location_id = target_location_id) then
    raise exception 'El consultorio tiene usuarios, pacientes, horarios o turnos asociados. Debe darse de baja para conservar la historia.';
  end if;

  delete from public.locations where id = target_location_id;
  if not found then raise exception 'Consultorio no encontrado.'; end if;
end;
$$;

grant execute on function public.delete_location_if_unused(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
