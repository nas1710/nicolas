-- Paciente unico por tipo y numero de documento, vinculado a uno o varios consultorios.
-- Ejecutar una vez desde Supabase > SQL Editor.

begin;

alter table public.patients
  add column if not exists document_type text not null default 'DNI';

-- Primero asegura que 28.471.726 y 28471726 sean considerados el mismo DNI.
do $$
begin
  if exists (
    select 1
    from public.patients
    where document is not null and document <> ''
    group by document_type, case
      when document_type in ('DNI', 'LC', 'LE') then regexp_replace(document, '[^0-9]', '', 'g')
      else upper(regexp_replace(trim(document), '[^A-Za-z0-9-]', '', 'g'))
    end
    having count(*) > 1
  ) then
    raise exception 'Hay pacientes duplicados por tipo y numero de documento. Resolverlos antes de ejecutar esta migracion.';
  end if;
end;
$$;

drop trigger if exists protect_patient_identity on public.patients;

update public.patients
set document = regexp_replace(document, '[^0-9]', '', 'g')
where document is not null
  and document_type in ('DNI', 'LC', 'LE')
  and document <> regexp_replace(document, '[^0-9]', '', 'g');

update public.patients
set document = upper(regexp_replace(trim(document), '[^A-Za-z0-9-]', '', 'g'))
where document is not null
  and document_type in ('PASAPORTE', 'CEDULA_IDENTIDAD', 'DOCUMENTO_EXTRANJERO');

alter table public.patients drop constraint if exists patients_document_key;
alter table public.patients drop constraint if exists patients_document_type_number_unique;
alter table public.patients drop constraint if exists patients_document_type_check;
alter table public.patients drop constraint if exists patients_document_format_check;

alter table public.patients
  drop constraint if exists patients_document_digits_check;

alter table public.patients
  add constraint patients_document_type_check
  check (document_type in ('DNI', 'LC', 'LE', 'PASAPORTE', 'CEDULA_IDENTIDAD', 'DOCUMENTO_EXTRANJERO'));

alter table public.patients
  add constraint patients_document_format_check check (
    document is null
    or (document_type in ('DNI', 'LC', 'LE') and document ~ '^[0-9]+$')
    or (document_type in ('PASAPORTE', 'CEDULA_IDENTIDAD', 'DOCUMENTO_EXTRANJERO') and document ~ '^[A-Z0-9-]+$')
  );

alter table public.patients
  add constraint patients_document_type_number_unique unique (document_type, document);

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
    raise exception 'Nombre, documento y fecha de nacimiento no se editan desde la ficha del paciente.';
  end if;
  return new;
end;
$$;

create trigger protect_patient_identity
before update of first_name, last_name, document_type, document, birth_date on public.patients
for each row execute function public.prevent_patient_identity_update();

create table if not exists public.patient_locations (
  patient_id uuid not null references public.patients(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  linked_at timestamptz not null default now(),
  linked_by uuid references public.profiles(id) on delete set null,
  primary key (patient_id, location_id)
);

create index if not exists patient_locations_location_patient_idx
on public.patient_locations(location_id, patient_id);

insert into public.patient_locations (patient_id, location_id)
select id, location_id
from public.patients
where location_id is not null
on conflict do nothing;

alter table public.patient_locations enable row level security;

create or replace function public.patient_accessible(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or (
    public.is_secretary()
    and exists (
      select 1
      from public.patient_locations link
      where link.patient_id = target_patient_id
        and link.location_id = public.current_location_id()
    )
  );
$$;

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
    if p_location_id is distinct from target_location then
      raise exception 'La secretaria solo puede vincular pacientes a su consultorio.';
    end if;
  end if;

  if target_location is null then
    raise exception 'Elegir el consultorio del paciente.';
  end if;

  select * into existing_patient
  from public.patients
  where document_type = clean_type and document = clean_document;

  if found then
    if existing_patient.birth_date is not null
      and p_birth_date is not null
      and existing_patient.birth_date <> p_birth_date then
      raise exception 'El documento ya pertenece a un paciente con otra fecha de nacimiento. Revisar los datos.';
    end if;

    insert into public.patient_locations (patient_id, location_id, linked_by)
    values (existing_patient.id, target_location, auth.uid())
    on conflict do nothing;

    return jsonb_build_object('patient_id', existing_patient.id, 'already_existed', true);
  end if;

  insert into public.patients (
    first_name, last_name, document_type, document, birth_date, phone, email,
    affiliate_number, insurance_plan_id, location_id
  ) values (
    p_first_name, p_last_name, clean_type, clean_document, p_birth_date, p_phone, p_email,
    p_affiliate_number, p_insurance_plan_id, target_location
  ) returning id into patient_uuid;

  insert into public.patient_locations (patient_id, location_id, linked_by)
  values (patient_uuid, target_location, auth.uid());

  return jsonb_build_object('patient_id', patient_uuid, 'already_existed', false);
end;
$$;

drop function if exists public.register_or_link_patient(text, text, text, date, text, text, text, uuid, uuid);
grant execute on function public.register_or_link_patient(text, text, text, text, date, text, text, text, uuid, uuid) to authenticated;

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

drop policy if exists "patients scoped read" on public.patients;
create policy "patients scoped read" on public.patients
for select using (public.patient_accessible(id));

drop policy if exists "patients scoped insert" on public.patients;
create policy "patients scoped insert" on public.patients
for insert with check (public.is_admin() or location_id = public.current_location_id());

drop policy if exists "patients scoped update" on public.patients;
create policy "patients scoped update" on public.patients
for update using (public.patient_accessible(id)) with check (public.patient_accessible(id));

drop policy if exists "studies scoped read" on public.studies;
create policy "studies scoped read" on public.studies
for select using (public.patient_accessible(patient_id));
drop policy if exists "studies scoped insert" on public.studies;
create policy "studies scoped insert" on public.studies
for insert with check (public.patient_accessible(patient_id));
drop policy if exists "studies scoped update" on public.studies;
create policy "studies scoped update" on public.studies
for update using (public.patient_accessible(patient_id)) with check (public.patient_accessible(patient_id));

drop policy if exists "attachments scoped read" on public.attachments;
create policy "attachments scoped read" on public.attachments
for select using (public.patient_accessible(patient_id));
drop policy if exists "attachments scoped insert" on public.attachments;
create policy "attachments scoped insert" on public.attachments
for insert with check (public.patient_accessible(patient_id));
drop policy if exists "attachments scoped update" on public.attachments;
create policy "attachments scoped update" on public.attachments
for update using (public.patient_accessible(patient_id)) with check (public.patient_accessible(patient_id));

drop policy if exists "admin notes scoped read" on public.administrative_notes;
create policy "admin notes scoped read" on public.administrative_notes
for select using (public.patient_accessible(patient_id));
drop policy if exists "admin notes scoped insert" on public.administrative_notes;
create policy "admin notes scoped insert" on public.administrative_notes
for insert with check (public.patient_accessible(patient_id));
drop policy if exists "admin notes scoped update" on public.administrative_notes;
create policy "admin notes scoped update" on public.administrative_notes
for update using (public.patient_accessible(patient_id)) with check (public.patient_accessible(patient_id));

drop policy if exists "communications scoped read" on public.communications;
create policy "communications scoped read" on public.communications
for select using (public.patient_accessible(patient_id));
drop policy if exists "communications scoped insert" on public.communications;
create policy "communications scoped insert" on public.communications
for insert with check (public.patient_accessible(patient_id));

drop policy if exists "patient files scoped read" on storage.objects;
create policy "patient files scoped read" on storage.objects for select using (
  bucket_id = 'patient-files'
  and exists (
    select 1 from public.patients patient
    where patient.id::text = (storage.foldername(name))[1]
      and public.patient_accessible(patient.id)
  )
);

drop policy if exists "patient files scoped insert" on storage.objects;
create policy "patient files scoped insert" on storage.objects for insert with check (
  bucket_id = 'patient-files'
  and exists (
    select 1 from public.patients patient
    where patient.id::text = (storage.foldername(name))[1]
      and public.patient_accessible(patient.id)
  )
);

commit;

select patient.document_type, patient.document, patient.last_name, patient.first_name, count(link.location_id) as consultorios
from public.patients patient
left join public.patient_locations link on link.patient_id = patient.id
group by patient.id
order by patient.last_name, patient.first_name;
