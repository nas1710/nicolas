-- Recordatorios automaticos de turnos. Idempotente y sin claves en codigo.

alter table public.communications drop constraint if exists communications_status_check;
alter table public.communications add constraint communications_status_check
  check(status in('PREPARADO','ENVIADO_MANUAL','ENVIADO_AUTOMATICO','CONTACTADO','SIN_RESPUESTA','FALLIDO'));

create table if not exists public.appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  channel text not null check(channel in('EMAIL','WHATSAPP')),
  scheduled_for timestamptz not null,
  status text not null default 'PENDING' check(status in('PENDING','PROCESSING','SENT','FAILED')),
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(appointment_id,channel)
);

create index if not exists appointment_reminders_due_idx
  on public.appointment_reminders(status,scheduled_for);

alter table public.appointment_reminders enable row level security;
drop policy if exists "appointment reminders scoped read" on public.appointment_reminders;
create policy "appointment reminders scoped read"
on public.appointment_reminders for select to authenticated
using (
  public.current_user_is_master()
  or (organization_id=public.current_organization_id() and (
    public.current_role()::text='ADMINISTRADOR'
    or exists(
      select 1 from public.appointments appointment
      where appointment.id=appointment_id and (
        appointment.doctor_id=auth.uid()
        or (public.current_role()::text='SECRETARIA' and public.secretary_serves_professional(appointment.doctor_id))
      )
    )
  ))
);

-- La Edge Function usa service_role. Ningun cliente puede escribir la cola.
revoke insert,update,delete on public.appointment_reminders from anon,authenticated;

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
  from visible_appointments a join public.patients p on p.id=a.patient_id
  where p.validation_status='PENDIENTE' and a.status::text<>'CANCELADO'
  union all
  select 'UPCOMING_NO_CONTACT',a.id,a.patient_id,('Recordatorio pendiente: '||a.last_name||', '||a.first_name),a.starts_at,a.location_name
  from visible_appointments a
  where a.status::text not in('CANCELADO','RECORDATORIO_ENVIADO')
    and a.starts_at between now() and now()+interval '48 hours'
    and not exists(select 1 from public.communications c where c.appointment_id=a.id and c.status in('ENVIADO_MANUAL','ENVIADO_AUTOMATICO','CONTACTADO'))
  union all
  select 'REMINDER_FAILED',a.id,a.patient_id,('Fallo el recordatorio: '||a.last_name||', '||a.first_name),a.starts_at,r.last_error
  from visible_appointments a join public.appointment_reminders r on r.appointment_id=a.id
  where r.status='FAILED'
  union all
  select 'CANCELLED_RECENT',a.id,a.patient_id,('Cancelado: '||a.last_name||', '||a.first_name),a.starts_at,a.location_name
  from visible_appointments a where a.status::text='CANCELADO' and a.updated_at>=now()-interval '7 days'
)
select coalesce(jsonb_agg(to_jsonb(alerts) order by due_at nulls last),'[]'::jsonb) from alerts;
$$;

notify pgrst,'reload schema';
