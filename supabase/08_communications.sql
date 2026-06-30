-- Comunicaciones manuales y plantillas. Idempotente y sin servicios externos.
alter type public.communication_channel add value if not exists 'PHONE';
alter table public.patients add column if not exists documentation_pending boolean not null default false;
alter table public.patients add column if not exists documentation_note text;
alter table public.practices add column if not exists requires_preparation boolean not null default false;
alter table public.practices add column if not exists preparation_instructions text;

create table if not exists public.communication_templates (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 kind text not null,
 channel public.communication_channel not null,
 subject text not null default '',
 body text not null,
 active boolean not null default true,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(kind,channel)
);
alter table public.communication_templates enable row level security;
drop policy if exists "templates authenticated read" on public.communication_templates;
drop policy if exists "templates admin write" on public.communication_templates;
create policy "templates authenticated read" on public.communication_templates for select using(auth.uid() is not null);
create policy "templates admin write" on public.communication_templates for all
using(public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR')
with check(public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR');

alter table public.communications add column if not exists appointment_id uuid references public.appointments(id) on delete set null;
alter table public.communications add column if not exists professional_id uuid references public.profiles(id) on delete set null;
alter table public.communications add column if not exists kind text not null default 'OTRO';
alter table public.communications add column if not exists status text not null default 'ENVIADO_MANUAL';
alter table public.communications add column if not exists observation text;
alter table public.communications add column if not exists created_at timestamptz not null default now();
alter table public.communications drop constraint if exists communications_status_check;
alter table public.communications add constraint communications_status_check check(status in('PREPARADO','ENVIADO_MANUAL','CONTACTADO','SIN_RESPUESTA','FALLIDO'));
create index if not exists communications_appointment_idx on public.communications(appointment_id,created_at desc);
create index if not exists communications_patient_status_idx on public.communications(patient_id,status,created_at desc);
drop policy if exists "communications scoped update" on public.communications;
create policy "communications scoped update" on public.communications for update using(public.patient_accessible(patient_id)) with check(public.patient_accessible(patient_id));

insert into public.communication_templates(name,kind,channel,subject,body) values
('Recordatorio de turno','APPOINTMENT_REMINDER','WHATSAPP','','Hola {{paciente_nombre}}, te recordamos tu turno con {{profesional_nombre}} el {{fecha_turno}} a las {{hora_turno}} en {{consultorio}}. Por favor confirma tu asistencia.'),
('Recordatorio de turno por email','APPOINTMENT_REMINDER','EMAIL','Recordatorio de turno - {{fecha_turno}}','Hola {{paciente_nombre}},\n\nTe recordamos tu turno con {{profesional_nombre}} el {{fecha_turno}} a las {{hora_turno}} en {{consultorio}} ({{direccion}}).\n\nPractica: {{practica}}.'),
('Confirmacion de solicitud','PENDING_CONFIRMATION','WHATSAPP','','Hola {{paciente_nombre}}, recibimos tu solicitud de turno para {{practica}}. El turno del {{fecha_turno}} a las {{hora_turno}} queda pendiente de confirmacion.'),
('Confirmacion de asistencia','ATTENDANCE_CONFIRMATION','WHATSAPP','','Hola {{paciente_nombre}}, necesitamos confirmar tu asistencia al turno del {{fecha_turno}} a las {{hora_turno}}. Responde SI para confirmar.'),
('Cancelacion de turno','CANCELLATION','WHATSAPP','','Hola {{paciente_nombre}}, te informamos que el turno del {{fecha_turno}} a las {{hora_turno}} fue cancelado. Comunicate con nosotros para coordinar otro horario.'),
('Reprogramacion de turno','RESCHEDULE','WHATSAPP','','Hola {{paciente_nombre}}, tu turno fue reprogramado para el {{fecha_turno}} a las {{hora_turno}} en {{consultorio}}.'),
('Indicaciones previas','PREPARATION_INSTRUCTIONS','WHATSAPP','','Hola {{paciente_nombre}}, para tu practica {{practica}} del {{fecha_turno}}: {{indicaciones}}'),
('Documentacion faltante','MISSING_DOCUMENTATION','WHATSAPP','','Hola {{paciente_nombre}}, para completar tu atencion necesitamos la documentacion pendiente. Por favor comunicate con el consultorio.'),
('Mensaje posterior','POST_ATTENTION','WHATSAPP','','Hola {{paciente_nombre}}, esperamos que te encuentres bien luego de tu atencion con {{profesional_nombre}}. Ante cualquier duda, comunicate con el consultorio.')
on conflict(kind,channel) do nothing;

create or replace function public.communication_alerts() returns jsonb language sql stable security definer set search_path=public as $$
with visible_appointments as (
 select a.*,p.first_name,p.last_name,l.name location_name
 from public.appointments a join public.patients p on p.id=a.patient_id join public.locations l on l.id=a.location_id
 where (public.current_user_is_master() or public.current_role()::text='ADMINISTRADOR'
  or (public.current_role()::text in('MEDICO','MEDICA_ADMIN') and a.doctor_id=auth.uid())
  or (public.current_role()::text='SECRETARIA' and a.location_id=public.current_location_id()))
), alerts as (
 select 'PENDING_CONFIRMATION' kind,a.id appointment_id,a.patient_id,
  ('Confirmar turno de '||a.last_name||', '||a.first_name) title,a.starts_at due_at,a.location_name detail
 from visible_appointments a where a.status::text='PENDIENTE' and a.starts_at>=now()
 union all
 select 'UPCOMING_NO_CONTACT',a.id,a.patient_id,('Sin contacto: '||a.last_name||', '||a.first_name),a.starts_at,a.location_name
 from visible_appointments a where a.status::text<>'CANCELADO' and a.starts_at between now() and now()+interval '48 hours'
 and not exists(select 1 from public.communications c where c.appointment_id=a.id and c.status in('ENVIADO_MANUAL','CONTACTADO'))
 union all
 select 'WEB_PATIENT_PENDING',null,p.id,('Validar paciente web: '||p.last_name||', '||p.first_name),p.web_created_at,'Datos cargados desde la turnera'
 from public.patients p where p.validation_status='PENDIENTE' and public.patient_accessible(p.id)
 union all
 select 'CANCELLED_RECENT',a.id,a.patient_id,('Cancelado: '||a.last_name||', '||a.first_name),a.starts_at,a.location_name
 from visible_appointments a where a.status::text='CANCELADO' and a.updated_at>=now()-interval '7 days'
 union all
 select 'MISSING_DOCUMENTATION',null,p.id,('Documentacion pendiente: '||p.last_name||', '||p.first_name),null,coalesce(p.documentation_note,'Revisar documentacion')
 from public.patients p where p.documentation_pending and public.patient_accessible(p.id)
 union all
 select 'PREPARATION_INSTRUCTIONS',a.id,a.patient_id,('Enviar indicaciones: '||a.last_name||', '||a.first_name),a.starts_at,string_agg(pr.name,', ')
 from visible_appointments a join public.appointment_practices ap on ap.appointment_id=a.id join public.practices pr on pr.id=ap.practice_id and pr.requires_preparation
 where a.starts_at between now() and now()+interval '7 days' and not exists(select 1 from public.communications c where c.appointment_id=a.id and c.kind='PREPARATION_INSTRUCTIONS' and c.status in('ENVIADO_MANUAL','CONTACTADO'))
 group by a.id,a.patient_id,a.last_name,a.first_name,a.starts_at
)
select coalesce(jsonb_agg(to_jsonb(alerts) order by due_at nulls last),'[]'::jsonb) from alerts;
$$;
revoke all on function public.communication_alerts() from public;
revoke execute on function public.communication_alerts() from anon;
grant execute on function public.communication_alerts() to authenticated;
notify pgrst,'reload schema';
