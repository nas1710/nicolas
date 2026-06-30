-- Seguimiento Pacientes - Supabase Free
-- Ejecutar en Supabase SQL Editor.
-- No contiene datos reales ni claves.

create extension if not exists pgcrypto;

create type public.user_role as enum ('MEDICA_ADMIN', 'SECRETARIA');
create type public.appointment_status as enum ('PENDIENTE', 'CONFIRMADO', 'RECORDATORIO_ENVIADO', 'CANCELADO', 'AUSENTE');
create type public.study_type as enum ('CONSULTA', 'ELECTROCARDIOGRAMA', 'ERGOMETRIA', 'MAPA', 'HOLTER');
create type public.study_status as enum ('PENDIENTE_INFORME', 'REALIZADO', 'INFORMADO', 'ENVIADO', 'ARCHIVADO');
create type public.report_status as enum ('PENDIENTE', 'ASOCIADO', 'DESCARTADO');
create type public.communication_channel as enum ('WHATSAPP', 'EMAIL');
create type public.history_kind as enum ('CONSULTA', 'CONTROL', 'ESTUDIO', 'RESULTADO_ENVIADO', 'NOTA_INTERNA');
create type public.attachment_origin as enum ('PACIENTE', 'MEDICA', 'CARDIOVEX', 'ECCOSUR', 'OTRO');
create type public.attachment_kind as enum ('ESTUDIO_PREVIO', 'INFORME_PROPIO', 'ORDEN_MEDICA', 'IMAGEN', 'VIDEO', 'OTRO');

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null,
  location_id uuid references public.locations(id) on delete set null,
  active boolean not null default true,
  is_master boolean not null default false,
  must_change_password boolean not null default false,
  document_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_requires_location check (
    role <> 'SECRETARIA' or location_id is not null or active = false
  )
);

create table public.insurance_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  document_type text not null default 'DNI' check (document_type in ('DNI', 'LC', 'LE', 'PASAPORTE', 'CEDULA_IDENTIDAD', 'DOCUMENTO_EXTRANJERO')),
  document text,
  birth_date date,
  phone text,
  email text,
  status text not null default 'activo',
  affiliate_number text,
  insurance_plan_id uuid references public.insurance_plans(id) on delete set null,
  location_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_document_type_number_unique unique (document_type, document),
  constraint patients_document_format_check check (
    document is null
    or (document_type in ('DNI', 'LC', 'LE') and document ~ '^[0-9]+$')
    or (document_type in ('PASAPORTE', 'CEDULA_IDENTIDAD', 'DOCUMENTO_EXTRANJERO') and document ~ '^[A-Z0-9-]+$')
  )
);

create table public.patient_locations (
  patient_id uuid not null references public.patients(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  linked_at timestamptz not null default now(),
  linked_by uuid references public.profiles(id) on delete set null,
  primary key (patient_id, location_id)
);

comment on column public.patients.location_id is
  'LEGACY: no usar para relaciones nuevas. La relacion canonica es public.patient_locations.';

create table public.medical_availability (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 0 and 6),
  enabled boolean not null default true,
  start_time text not null,
  end_time text not null,
  slot_interval_min int not null default 15 check (slot_interval_min between 5 and 60 and slot_interval_min % 5 = 0),
  location_id uuid not null references public.locations(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null default 'Feriado',
  kind text not null default 'FERIADO' check (kind in ('FERIADO', 'VACACIONES', 'CONGRESO', 'LICENCIA', 'OTRO')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  duration_min int not null default 15,
  type text not null check (type ~ '^(CONSULTA|ELECTROCARDIOGRAMA|ERGOMETRIA|MAPA|HOLTER)(\+(CONSULTA|ELECTROCARDIOGRAMA|ERGOMETRIA|MAPA|HOLTER))*$'),
  reason text,
  instructions text,
  status public.appointment_status not null default 'PENDIENTE',
  patient_id uuid not null references public.patients(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.studies (
  id uuid primary key default gen_random_uuid(),
  type public.study_type not null,
  performed_at timestamptz,
  referring_doctor text,
  indication text,
  conclusion text,
  status public.study_status not null default 'PENDIENTE_INFORME',
  patient_id uuid not null references public.patients(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  source text not null,
  storage_path text,
  status public.report_status not null default 'PENDIENTE',
  detected_at timestamptz not null default now(),
  associated_at timestamptz,
  suggested_patient text,
  suggested_type public.study_type,
  location_id uuid references public.locations(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  study_id uuid references public.studies(id) on delete set null
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  study_id uuid references public.studies(id) on delete set null,
  file_name text not null,
  storage_path text,
  external_url text,
  storage_provider text not null default 'SUPABASE' check (storage_provider in ('SUPABASE', 'GOOGLE_DRIVE')),
  mime_type text,
  size_bytes bigint,
  origin public.attachment_origin not null default 'PACIENTE',
  kind public.attachment_kind not null default 'ESTUDIO_PREVIO',
  description text,
  pending_send boolean not null default false,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint attachment_has_source check (
    (storage_provider = 'SUPABASE' and storage_path is not null)
    or (storage_provider = 'GOOGLE_DRIVE' and external_url is not null)
  )
);

create table public.clinical_evolutions (
  id uuid primary key default gen_random_uuid(),
  kind public.history_kind not null default 'CONSULTA',
  occurred_at timestamptz not null,
  reason text not null,
  diagnosis text,
  notes text,
  indications text,
  next_visit_at timestamptz,
  attachments jsonb,
  patient_id uuid not null references public.patients(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.attachments
  add column clinical_evolution_id uuid references public.clinical_evolutions(id) on delete set null;

create table public.administrative_notes (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.communications (
  id uuid primary key default gen_random_uuid(),
  channel public.communication_channel not null,
  subject text not null,
  body text not null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  study_id uuid references public.studies(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  sent_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index on public.patient_locations(location_id, patient_id);
create index on public.appointments(location_id, starts_at);
create index on public.reports(location_id, status);
create index on public.attachments(patient_id, created_at desc);
create index on public.attachments(study_id);
create index on public.clinical_evolutions(patient_id, occurred_at desc);
create index on public.audit_logs(entity, entity_id);

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.current_location_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select location_id from public.profiles where id = auth.uid() and active = true;
$$;

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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'MEDICA_ADMIN';
$$;

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

create or replace function public.is_secretary()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'SECRETARIA';
$$;

create or replace function public.complete_password_change()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set must_change_password = false, updated_at = now() where id = auth.uid();
$$;

grant execute on function public.complete_password_change() to authenticated;

create or replace function public.protect_master_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.is_master then raise exception 'El usuario maestro no puede eliminarse.'; end if;
  if tg_op = 'UPDATE' then
    if old.is_master and (
      new.email is distinct from old.email or new.role is distinct from old.role
      or new.location_id is distinct from old.location_id or new.active is distinct from old.active
      or new.is_master is distinct from old.is_master
    ) then raise exception 'Los privilegios del usuario maestro estan protegidos.'; end if;
    if not old.is_master and new.is_master then raise exception 'No se puede crear otro usuario maestro.'; end if;
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.patient_visible(patient_location uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or (public.is_secretary() and patient_location = public.current_location_id());
$$;

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
    if p_location_id is not null and p_location_id is distinct from target_location then
      raise exception 'La secretaria solo puede vincular pacientes a su consultorio.';
    end if;
  end if;

  if target_location is not null and not exists (
    select 1 from public.locations location where location.id = target_location and location.active
  ) then
    raise exception 'El consultorio seleccionado no existe o esta inactivo.';
  end if;

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
      on conflict do nothing;
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
    values (patient_uuid, target_location, auth.uid());
  end if;

  return jsonb_build_object('patient_id', patient_uuid, 'already_existed', false);
end;
$$;

grant execute on function public.register_or_link_patient(text, text, text, text, date, text, text, text, uuid, uuid) to authenticated;

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs(action, entity, entity_id, before, after, user_id)
  values (
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

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

create trigger audit_patients after insert or update or delete on public.patients for each row execute function public.audit_row();
create trigger protect_master_profile before update or delete on public.profiles for each row execute function public.protect_master_profile();
create trigger audit_appointments after insert or update or delete on public.appointments for each row execute function public.audit_row();
create trigger audit_studies after insert or update or delete on public.studies for each row execute function public.audit_row();
create trigger audit_reports after insert or update or delete on public.reports for each row execute function public.audit_row();
create trigger audit_attachments after insert or update or delete on public.attachments for each row execute function public.audit_row();
create trigger audit_administrative_notes after insert or update or delete on public.administrative_notes for each row execute function public.audit_row();
create trigger audit_clinical_evolutions after insert or update or delete on public.clinical_evolutions for each row execute function public.audit_row();
create trigger audit_communications after insert or update or delete on public.communications for each row execute function public.audit_row();
create trigger validate_appointment_availability before insert or update of starts_at, duration_min, location_id on public.appointments for each row execute function public.enforce_appointment_availability();
create trigger protect_patient_identity before update of first_name, last_name, document_type, document, birth_date on public.patients for each row execute function public.prevent_patient_identity_update();
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.insurance_plans enable row level security;
alter table public.patients enable row level security;
alter table public.patient_locations enable row level security;
alter table public.medical_availability enable row level security;
alter table public.holidays enable row level security;
alter table public.appointments enable row level security;
alter table public.studies enable row level security;
alter table public.reports enable row level security;
alter table public.attachments enable row level security;
alter table public.clinical_evolutions enable row level security;
alter table public.administrative_notes enable row level security;
alter table public.communications enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles read own or admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles admin write" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

create policy "locations visible by role" on public.locations for select using (public.is_admin() or id = public.current_location_id());
create policy "locations master write" on public.locations for all using (public.current_user_is_master()) with check (public.current_user_is_master());

create policy "insurance read all authenticated" on public.insurance_plans for select using (auth.uid() is not null);
create policy "insurance admin write" on public.insurance_plans for all using (public.is_admin()) with check (public.is_admin());
create policy "insurance active user insert" on public.insurance_plans for insert with check (public.current_role() is not null);

create policy "patient locations scoped read" on public.patient_locations for select using (
  public.is_admin() or location_id = public.current_location_id()
);
create policy "patient locations scoped insert" on public.patient_locations for insert with check (
  public.is_admin() or location_id = public.current_location_id()
);
create policy "patient locations scoped update" on public.patient_locations for update using (
  public.is_admin() or location_id = public.current_location_id()
) with check (
  public.is_admin() or location_id = public.current_location_id()
);

create policy "patients scoped read" on public.patients for select using (public.patient_accessible(id));
create policy "patients scoped insert" on public.patients for insert with check (public.is_admin());
create policy "patients scoped update" on public.patients for update using (public.patient_accessible(id)) with check (public.patient_accessible(id));

create policy "availability scoped read" on public.medical_availability for select using (public.is_admin() or location_id = public.current_location_id());
create policy "availability admin write" on public.medical_availability for all using (public.is_admin()) with check (public.is_admin());

create policy "holidays read all authenticated" on public.holidays for select using (auth.uid() is not null);
create policy "holidays admin write" on public.holidays for all using (public.is_admin()) with check (public.is_admin());

create policy "appointments scoped read" on public.appointments for select using (public.is_admin() or location_id = public.current_location_id());
create policy "appointments scoped insert" on public.appointments for insert with check (public.is_admin() or location_id = public.current_location_id());
create policy "appointments scoped update" on public.appointments for update using (public.is_admin() or location_id = public.current_location_id()) with check (public.is_admin() or location_id = public.current_location_id());

create policy "studies scoped read" on public.studies for select using (
  public.patient_accessible(patient_id)
);
create policy "studies scoped insert" on public.studies for insert with check (
  public.patient_accessible(patient_id)
);
create policy "studies scoped update" on public.studies for update using (
  public.patient_accessible(patient_id)
) with check (
  public.patient_accessible(patient_id)
);

create policy "reports scoped read" on public.reports for select using (public.is_admin() or location_id = public.current_location_id());
create policy "reports scoped insert" on public.reports for insert with check (public.is_admin() or location_id = public.current_location_id());
create policy "reports scoped update" on public.reports for update using (public.is_admin() or location_id = public.current_location_id()) with check (public.is_admin() or location_id = public.current_location_id());

create policy "attachments scoped read" on public.attachments for select using (
  public.patient_accessible(patient_id)
);
create policy "attachments scoped insert" on public.attachments for insert with check (
  public.patient_accessible(patient_id)
);
create policy "attachments scoped update" on public.attachments for update using (
  public.patient_accessible(patient_id)
) with check (
  public.patient_accessible(patient_id)
);

create policy "clinical admin only" on public.clinical_evolutions for all using (public.is_admin()) with check (public.is_admin());

create policy "admin notes scoped read" on public.administrative_notes for select using (
  public.patient_accessible(patient_id)
);
create policy "admin notes scoped insert" on public.administrative_notes for insert with check (
  public.patient_accessible(patient_id)
);
create policy "admin notes scoped update" on public.administrative_notes for update using (
  public.patient_accessible(patient_id)
) with check (
  public.patient_accessible(patient_id)
);

create policy "communications scoped read" on public.communications for select using (
  public.patient_accessible(patient_id)
);
create policy "communications scoped insert" on public.communications for insert with check (
  public.patient_accessible(patient_id)
);

create policy "audit admin read" on public.audit_logs for select using (public.is_admin());

-- Datos ficticios de catalogos. Los usuarios se crean desde Supabase Auth.
insert into public.locations (id, name, address) values
  ('00000000-0000-0000-0000-000000000101', 'Consultorio Centro Demo', 'Calle Ficticia 123'),
  ('00000000-0000-0000-0000-000000000102', 'Consultorio Norte Demo', 'Avenida Demo 456')
on conflict do nothing;

insert into public.insurance_plans (name) values
  ('AMEPLA Demo'),
  ('Particular'),
  ('Obra Social Demo')
on conflict do nothing;

insert into public.medical_availability (weekday, enabled, start_time, end_time, slot_interval_min, location_id) values
  (1, true, '09:00', '13:00', 15, '00000000-0000-0000-0000-000000000101'),
  (3, true, '15:00', '19:00', 15, '00000000-0000-0000-0000-000000000102')
on conflict do nothing;

-- Bucket privado para PDFs, imagenes y videos de pacientes.
insert into storage.buckets (id, name, public)
values ('patient-files', 'patient-files', false)
on conflict (id) do nothing;

create policy "patient files scoped read" on storage.objects for select using (
  bucket_id = 'patient-files'
  and exists (
    select 1
    from public.patients p
    where p.id::text = (storage.foldername(name))[1]
      and public.patient_accessible(p.id)
  )
);

create policy "patient files scoped insert" on storage.objects for insert with check (
  bucket_id = 'patient-files'
  and exists (
    select 1
    from public.patients p
    where p.id::text = (storage.foldername(name))[1]
      and public.patient_accessible(p.id)
  )
);
