-- Pacientes web y agenda operativa por profesional.
-- Idempotente. No borra ni reasigna datos existentes.

create table if not exists public.professional_secretaries (
  professional_id uuid not null references public.profiles(id) on delete cascade,
  secretary_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (professional_id, secretary_id)
);

create index if not exists professional_secretaries_secretary_idx
  on public.professional_secretaries(secretary_id, active);

-- Compatibilidad inicial: relaciona secretarias con los profesionales que atienden
-- en su consultorio actual. Luego el administrador puede ajustar la relacion.
insert into public.professional_secretaries(professional_id,secretary_id,organization_id)
select distinct professional.id,secretary.id,secretary.organization_id
from public.profiles secretary
join public.profiles professional
  on professional.organization_id=secretary.organization_id
 and professional.active
 and professional.role::text in('MEDICO','MEDICA_ADMIN')
where secretary.active
  and secretary.role::text='SECRETARIA'
  and secretary.location_id is not null
  and (
    exists(select 1 from public.professional_locations relation where relation.professional_id=professional.id and relation.location_id=secretary.location_id and relation.active)
    or exists(select 1 from public.medical_availability availability where availability.doctor_id=professional.id and availability.location_id=secretary.location_id)
  )
on conflict (professional_id,secretary_id) do nothing;

alter table public.professional_secretaries enable row level security;
drop policy if exists "professional secretaries scoped read" on public.professional_secretaries;
drop policy if exists "professional secretaries admin write" on public.professional_secretaries;
create policy "professional secretaries scoped read"
on public.professional_secretaries for select to authenticated
using (
  public.current_user_is_master()
  or organization_id = public.current_organization_id()
);
create policy "professional secretaries admin write"
on public.professional_secretaries for all to authenticated
using (
  public.current_user_is_master()
  or (public.current_role()::text = 'ADMINISTRADOR' and organization_id = public.current_organization_id())
)
with check (
  public.current_user_is_master()
  or (public.current_role()::text = 'ADMINISTRADOR' and organization_id = public.current_organization_id())
);

create or replace function public.secretary_serves_professional(target_professional_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.professional_secretaries relation
    where relation.secretary_id = auth.uid()
      and relation.professional_id = target_professional_id
      and relation.active
      and relation.organization_id = public.current_organization_id()
  );
$$;

create or replace function public.can_manage_web_patient(target_patient_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select
    public.current_user_is_master()
    or public.current_role()::text = 'ADMINISTRADOR'
    or exists (
      select 1
      from public.appointments appointment
      where appointment.patient_id = target_patient_id
        and appointment.status::text <> 'CANCELADO'
        and appointment.organization_id = public.current_organization_id()
        and (
          appointment.doctor_id = auth.uid()
          or (
            public.current_role()::text = 'SECRETARIA'
            and public.secretary_serves_professional(appointment.doctor_id)
          )
        )
    );
$$;

create or replace function public.validate_web_patient(target_patient_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_web_patient(target_patient_id) then
    raise exception 'Este paciente corresponde a otro profesional.';
  end if;
  update public.patients
  set validation_status='VALIDADO', validated_at=now(), validated_by=auth.uid(), updated_at=now()
  where id=target_patient_id and source='WEB' and validation_status='PENDIENTE';
end; $$;

create or replace function public.set_secretary_professionals(p_secretary_id uuid, p_professional_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare target_organization uuid;
begin
  if not (public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR') then
    raise exception 'Acceso no autorizado.';
  end if;
  select organization_id into target_organization
  from public.profiles
  where id=p_secretary_id and role::text='SECRETARIA' and active;
  if target_organization is null then raise exception 'Secretaria no encontrada.'; end if;
  if not public.current_user_is_master() and target_organization<>public.current_organization_id() then
    raise exception 'La secretaria pertenece a otra organizacion.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_professional_ids,array[]::uuid[])) requested(id)
    left join public.profiles professional on professional.id=requested.id
    where professional.id is null
       or professional.organization_id<>target_organization
       or professional.role::text not in('MEDICO','MEDICA_ADMIN')
  ) then raise exception 'Uno de los profesionales no es valido.'; end if;

  delete from public.professional_secretaries where secretary_id=p_secretary_id;
  insert into public.professional_secretaries(professional_id,secretary_id,organization_id)
  select distinct requested.id,p_secretary_id,target_organization
  from unnest(coalesce(p_professional_ids,array[]::uuid[])) requested(id);
end; $$;

revoke all on function public.set_secretary_professionals(uuid,uuid[]) from public;
grant execute on function public.set_secretary_professionals(uuid,uuid[]) to authenticated;
grant execute on function public.can_manage_web_patient(uuid) to authenticated;

-- Un pendiente web solo es visible para el profesional del turno, sus secretarias y administracion.
drop policy if exists "tenant patients read" on public.patients;
create policy "tenant patients read"
on public.patients for select to authenticated
using (
  public.current_user_is_master()
  or (
    organization_id=public.current_organization_id()
    and (validation_status<>'PENDIENTE' or public.can_manage_web_patient(id))
  )
);

-- Turnos: cada medico ve los propios; la secretaria, los profesionales que asiste.
drop policy if exists "tenant appointments" on public.appointments;
drop policy if exists "tenant appointments read" on public.appointments;
drop policy if exists "tenant appointments write" on public.appointments;
create policy "tenant appointments read"
on public.appointments for select to authenticated
using (
  public.current_user_is_master()
  or (organization_id=public.current_organization_id() and (
    public.current_role()::text='ADMINISTRADOR'
    or doctor_id=auth.uid()
    or (public.current_role()::text='SECRETARIA' and public.secretary_serves_professional(doctor_id))
  ))
);
create policy "tenant appointments write"
on public.appointments for all to authenticated
using (
  public.current_user_is_master()
  or (organization_id=public.current_organization_id() and (
    public.current_role()::text='ADMINISTRADOR'
    or doctor_id=auth.uid()
    or (public.current_role()::text='SECRETARIA' and public.secretary_serves_professional(doctor_id))
  ))
)
with check (
  public.current_user_is_master()
  or (organization_id=public.current_organization_id() and (
    public.current_role()::text='ADMINISTRADOR'
    or doctor_id=auth.uid()
    or (public.current_role()::text='SECRETARIA' and public.secretary_serves_professional(doctor_id))
  ))
);

-- Las alertas pendientes quedan limitadas al profesional o sus secretarias.
create or replace function public.communication_alerts()
returns jsonb language sql stable security definer set search_path=public as $$
with visible_appointments as (
  select a.*,p.first_name,p.last_name,l.name location_name
  from public.appointments a
  join public.patients p on p.id=a.patient_id
  join public.locations l on l.id=a.location_id
  where public.current_user_is_master()
    or (a.organization_id=public.current_organization_id() and (
      public.current_role()::text='ADMINISTRADOR'
      or a.doctor_id=auth.uid()
      or (public.current_role()::text='SECRETARIA' and public.secretary_serves_professional(a.doctor_id))
    ))
), alerts as (
  select 'WEB_PATIENT_PENDING' kind,a.id appointment_id,a.patient_id,
    ('Validar datos: '||a.last_name||', '||a.first_name) title,a.starts_at due_at,a.location_name detail
  from visible_appointments a
  join public.patients p on p.id=a.patient_id
  where p.validation_status='PENDIENTE' and a.status::text<>'CANCELADO'
  union all
  select 'UPCOMING_NO_CONTACT',a.id,a.patient_id,('Turno proximo: '||a.last_name||', '||a.first_name),a.starts_at,a.location_name
  from visible_appointments a
  where a.status::text<>'CANCELADO' and a.starts_at between now() and now()+interval '48 hours'
    and not exists(select 1 from public.communications c where c.appointment_id=a.id and c.status in('ENVIADO_MANUAL','CONTACTADO'))
  union all
  select 'CANCELLED_RECENT',a.id,a.patient_id,('Cancelado: '||a.last_name||', '||a.first_name),a.starts_at,a.location_name
  from visible_appointments a where a.status::text='CANCELADO' and a.updated_at>=now()-interval '7 days'
)
select coalesce(jsonb_agg(to_jsonb(alerts) order by due_at nulls last),'[]'::jsonb) from alerts;
$$;

-- Las reservas web nacen confirmadas: la confirmacion de asistencia es posterior y opcional.
create or replace function public.mark_public_appointment_confirmed()
returns trigger language plpgsql set search_path=public as $$
begin
  if coalesce(new.reason,'') like '%Solicitud web%' then
    new.status='CONFIRMADO';
    new.source='WEB';
  end if;
  return new;
end; $$;
drop trigger if exists mark_public_appointment_confirmed on public.appointments;
create trigger mark_public_appointment_confirmed
before insert on public.appointments for each row execute function public.mark_public_appointment_confirmed();

notify pgrst,'reload schema';
