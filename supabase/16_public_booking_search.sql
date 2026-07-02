-- Busqueda publica agregada por especialidad, profesional y centro.
-- Es idempotente y no elimina ni modifica datos existentes.

create table if not exists public.professional_location_practices (
  professional_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (professional_id, location_id, practice_id)
);

create index if not exists professional_location_practices_lookup_idx
  on public.professional_location_practices (professional_id, practice_id, location_id, active);

update public.professional_location_practices assignment
set organization_id = profile.organization_id
from public.profiles profile
where profile.id = assignment.professional_id
  and assignment.organization_id is null;

alter table public.professional_location_practices enable row level security;

drop policy if exists "professional location practices tenant read" on public.professional_location_practices;
create policy "professional location practices tenant read"
on public.professional_location_practices for select to authenticated
using (
  public.current_user_is_master()
  or organization_id = public.current_organization_id()
);

drop policy if exists "professional location practices tenant write" on public.professional_location_practices;
create policy "professional location practices tenant write"
on public.professional_location_practices for all to authenticated
using (
  public.current_user_is_master()
  or (organization_id = public.current_organization_id() and public.current_role()::text = 'ADMINISTRADOR')
)
with check (
  public.current_user_is_master()
  or (organization_id = public.current_organization_id() and public.current_role()::text = 'ADMINISTRADOR')
);

create or replace function public.practice_available_at_location(
  p_professional_id uuid,
  p_practice_id uuid,
  p_location_id uuid
) returns boolean
language sql stable security definer set search_path = public
as $$
  select
    exists (
      select 1 from public.professional_practices pp
      where pp.professional_id = p_professional_id and pp.practice_id = p_practice_id
    )
    and (
      not exists (
        select 1 from public.professional_location_practices configured
        where configured.professional_id = p_professional_id
          and configured.practice_id = p_practice_id
      )
      or exists (
        select 1 from public.professional_location_practices allowed
        where allowed.professional_id = p_professional_id
          and allowed.practice_id = p_practice_id
          and allowed.location_id = p_location_id
          and allowed.active
      )
    );
$$;

revoke all on function public.practice_available_at_location(uuid, uuid, uuid) from public;
grant execute on function public.practice_available_at_location(uuid, uuid, uuid) to anon, authenticated;

create or replace function public.public_search_booking_slots(
  p_organization_slug text,
  p_specialty_id uuid,
  p_practice_ids uuid[],
  p_from date,
  p_to date,
  p_doctor_id uuid default null,
  p_location_id uuid default null
) returns table (
  starts_at timestamptz,
  doctor_id uuid,
  doctor_name text,
  specialty_name text,
  location_id uuid,
  location_name text,
  location_address text
)
language plpgsql stable security definer set search_path = public
as $$
declare
  target_organization uuid;
  booking_duration integer;
  safe_from date;
  safe_to date;
begin
  if p_specialty_id is null then raise exception 'Elegir una especialidad.'; end if;
  if coalesce(cardinality(p_practice_ids), 0) = 0 then raise exception 'Elegir al menos una practica.'; end if;

  select organization.id into target_organization
  from public.organizations organization
  where organization.active
    and organization.published
    and organization.commercial_status = 'ACTIVA'
    and (nullif(trim(p_organization_slug), '') is null or organization.slug = trim(p_organization_slug))
  order by case when organization.slug = trim(p_organization_slug) then 0 else 1 end, organization.created_at
  limit 1;
  if target_organization is null then raise exception 'La organizacion no esta disponible.'; end if;

  select sum(practice.duration_min)::integer into booking_duration
  from public.practices practice
  where practice.id = any(p_practice_ids)
    and practice.specialty_id = p_specialty_id
    and practice.organization_id = target_organization
    and practice.active and practice.published;
  if booking_duration is null
    or (select count(*) from public.practices practice where practice.id = any(p_practice_ids) and practice.organization_id = target_organization and practice.active and practice.published) <> cardinality(p_practice_ids)
  then raise exception 'Las practicas elegidas no estan disponibles.'; end if;

  safe_from := greatest(p_from, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  safe_to := least(p_to, safe_from + 60);
  if safe_to < safe_from then return; end if;

  return query
  with eligible as (
    select availability.*, profile.full_name, specialty.name as specialty_label,
           location.name as location_label, location.address as location_address_value
    from public.medical_availability availability
    join public.profiles profile on profile.id = availability.doctor_id
    join public.locations location on location.id = availability.location_id
    join public.professional_specialties professional_specialty
      on professional_specialty.professional_id = profile.id
      and professional_specialty.specialty_id = p_specialty_id
    join public.specialties specialty on specialty.id = professional_specialty.specialty_id
    where availability.enabled
      and profile.active and profile.public_booking_enabled and not profile.is_master
      and profile.organization_id = target_organization
      and location.organization_id = target_organization and location.active
      and specialty.organization_id = target_organization and specialty.active and specialty.published
      and (p_doctor_id is null or profile.id = p_doctor_id)
      and (p_location_id is null or location.id = p_location_id)
      and not exists (
        select 1 from unnest(p_practice_ids) requested(practice_id)
        where not public.practice_available_at_location(profile.id, requested.practice_id, location.id)
      )
  ), candidates as (
    select day::date as local_day, eligible.*
    from eligible
    cross join lateral generate_series(safe_from, safe_to, interval '1 day') day
    where extract(dow from day)::integer = eligible.weekday
      and not exists (
        select 1 from public.holidays holiday
        where holiday.date = day::date
          and holiday.active
          and (holiday.doctor_id is null or holiday.doctor_id = eligible.doctor_id)
      )
  ), generated as (
    select candidate.*,
      slot.local_start at time zone 'America/Argentina/Buenos_Aires' as candidate_start
    from candidates candidate
    cross join lateral generate_series(
      candidate.local_day + candidate.start_time::time,
      candidate.local_day + candidate.end_time::time - make_interval(mins => booking_duration),
      make_interval(mins => candidate.slot_interval_min)
    ) slot(local_start)
  )
  select generated.candidate_start,
         generated.doctor_id,
         generated.full_name,
         generated.specialty_label,
         generated.location_id,
         generated.location_label,
         generated.location_address_value
  from generated
  where generated.candidate_start > now()
    and not exists (
      select 1 from public.appointments appointment
      where appointment.doctor_id = generated.doctor_id
        and appointment.status <> 'CANCELADO'
        and tstzrange(appointment.starts_at, appointment.starts_at + make_interval(mins => appointment.duration_min), '[)')
          && tstzrange(generated.candidate_start, generated.candidate_start + make_interval(mins => booking_duration), '[)')
    )
  order by generated.candidate_start, generated.full_name, generated.location_label
  limit 1000;
end;
$$;

revoke all on function public.public_search_booking_slots(text, uuid, uuid[], date, date, uuid, uuid) from public;
grant execute on function public.public_search_booking_slots(text, uuid, uuid[], date, date, uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
