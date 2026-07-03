# Migraciones de Supabase

## Estrategia oficial

Hay dos recorridos y no deben mezclarse:

1. Base nueva: `schema.sql` y luego las migraciones numeradas.
2. Base existente: `01_consolidar_base_actual.sql` y luego las migraciones numeradas.

`public_booking.sql` se mantiene separado porque contiene la agenda por profesional y los RPC anonimos de `/turnos`. `01_consolidar_base_actual.sql` y `public_booking.sql` son idempotentes; `schema.sql` se ejecuta una sola vez sobre una base nueva vacia.

Los demas SQL de esta carpeta son historial de reparaciones. No deben ejecutarse en cadena sobre una base consolidada.

## Base nueva

Ejecutar en SQL Editor con rol `postgres`:

1. `supabase/schema.sql`
2. `supabase/public_booking.sql`
3. `supabase/02_role_hierarchy.sql`
4. `supabase/03_web_patient_validation.sql`
5. `supabase/04_institutional_pdf_profiles.sql`
6. `supabase/05_professional_signatures.sql`
7. `supabase/06_commercial_catalog.sql`
8. `supabase/07_dashboard_reporting.sql`
9. `supabase/08_communications.sql`
10. `supabase/09_internal_user_access.sql`
11. `supabase/10_security_hardening.sql`
12. `supabase/11_commercial_branding.sql`
13. `supabase/12_commercial_onboarding.sql`
14. `supabase/13_tenant_isolation.sql`
15. `supabase/14_commercial_billing.sql`
16. `supabase/15_google_drive_attachments.sql`
17. `supabase/16_public_booking_search.sql`
18. `supabase/17_patient_identity_and_professional_histories.sql`
19. `supabase/18_clinical_timeline.sql`
20. Desplegar las Edge Functions

Despues crear la primera cuenta en Supabase Auth y asignar su perfil de forma administrativa. No hay credenciales fijas en los seeds.

## Base actual

Para la base publicada de Cardio Ayala:

1. `supabase/01_consolidar_base_actual.sql`
2. `supabase/public_booking.sql`
3. `supabase/02_role_hierarchy.sql`
4. `supabase/03_web_patient_validation.sql`
5. `supabase/04_institutional_pdf_profiles.sql`
6. `supabase/05_professional_signatures.sql`
7. `supabase/06_commercial_catalog.sql`
8. `supabase/07_dashboard_reporting.sql`
9. `supabase/08_communications.sql`
10. `supabase/09_internal_user_access.sql`
11. `supabase/10_security_hardening.sql`
12. `supabase/11_commercial_branding.sql`
13. `supabase/12_commercial_onboarding.sql`
14. `supabase/13_tenant_isolation.sql`
15. `supabase/14_commercial_billing.sql`
16. `supabase/15_google_drive_attachments.sql`
17. `supabase/16_public_booking_search.sql`
18. `supabase/17_patient_identity_and_professional_histories.sql`
19. `supabase/18_clinical_timeline.sql`
20. Desplegar nuevamente las Edge Functions cuando cambie su codigo.

El consolidador puede ejecutarse varias veces. No elimina tablas, pacientes, turnos, historias, documentos, consultorios ni usuarios.

Comando de despliegue de la funcion:

```powershell
npx --yes supabase@latest functions deploy admin-manage-user --project-ref TU_PROJECT_REF
```

Configurar el origen permitido una vez:

```powershell
npx --yes supabase@latest secrets set "CORS_ORIGIN=https://cardioayala.vercel.app,http://localhost:5173" --project-ref TU_PROJECT_REF
```

## Inventario requerido

### Extensiones y tipos

- Extension: `pgcrypto`.
- Enums: `user_role`, `appointment_status`, `study_type`, `study_status`, `report_status`, `communication_channel`, `history_kind`, `attachment_origin`, `attachment_kind`.

### Tablas

- Seguridad: `profiles`, `audit_logs`.
- Comercial: `organizations`, `commercial_plans`, `organization_subscriptions`, `commercial_payments`, `commercial_subscription_history`, `centers`.
- Configuracion: `locations`, `insurance_plans`, `medical_availability`, `holidays`, `specialties`, `practices`, `professional_specialties`, `professional_practices`.
- Pacientes: `patients`, `patient_locations`.
- Atencion: `appointments`, `clinical_evolutions`, `administrative_notes`.
- Estudios y comunicacion: `studies`, `reports`, `attachments`, `communications`.

### Relaciones criticas

- Paciente unico por `(organization_id, document_type, document)`; sus datos formales se reutilizan entre profesionales de la organizacion.
- `patient_locations` es la unica relacion vigente paciente-consultorio.
- Cada evolucion pertenece a su autor mediante `clinical_evolutions.created_by`; el paciente puede tener historias diferenciadas por profesional sin duplicar su identidad.
- Turnos pertenecen a paciente, profesional y consultorio; sus practicas dinamicas se registran en `appointment_practices`.
- `professional_secretaries` representa la relacion muchos-a-muchos: una secretaria puede asistir a varios profesionales y un profesional puede trabajar con varias secretarias.
- Disponibilidades pertenecen a profesional y consultorio.
- `patients.location_id` permanece solo como dato legado, sin FK.

### Funciones y triggers

- Sesion/permisos: `current_profile`, `current_role`, `current_location_id`, `is_admin`, `is_secretary`, `current_user_is_master`.
- Pacientes: `patient_accessible`, `register_or_link_patient`, `prevent_patient_identity_update`.
- Agenda: `appointment_inside_availability`, `enforce_appointment_availability`.
- Turnera publica: `public_booking_doctors`, `public_booking_insurance_plans`, `public_booking_slots`, `public_booking_available_dates`, `public_request_appointment`.
- Operacion: `handle_new_auth_user`, `protect_master_profile`, `complete_password_change`, `delete_location_if_unused`, `current_buenos_aires_clock`.
- Triggers criticos: `on_auth_user_created`, `protect_master_profile`, `protect_patient_identity`, `assign_availability_doctor`, `validate_doctor_schedule_overlap`, `assign_holiday_doctor`, `validate_appointment_availability`.

### RLS y Storage

- RLS debe estar habilitado en todas las tablas funcionales.
- Las secretarias acceden a pacientes mediante `patient_locations`.
- Los pacientes web pendientes solo son visibles y validables por el profesional del turno, sus secretarias asignadas y administracion.
- Ejecutar `19_professional_secretaries_and_web_workflow.sql` despues de `18_clinical_timeline.sql` en una base existente.
- Ejecutar `20_professional_profile_permissions.sql` a continuacion para separar perfil medico y permisos administrativos.
- Las evoluciones clinicas quedan restringidas a medica/admin.
- El rol anonimo solo ejecuta los RPC publicos expresamente concedidos.
- Buckets privados requeridos: `patient-files` y `professional-signatures`.
- Las policies de `storage.objects` validan acceso mediante el paciente de la ruta.

## Administracion de usuarios

- Auth y `profiles` se sincronizan exclusivamente mediante `admin-manage-user`.
- Las altas internas se confirman con Admin API y no dependen de correos.
- La clave inicial o el DNI blanqueado son provisorios y activan `must_change_password`.
- Administradores gestionan solo Medicos y Secretarias; la jerarquia superior queda reservada al Maestro.
- El bloqueo es logico: se bloquea Auth y se marca `profiles.active = false`.
- No se usa borrado fisico para usuarios operativos.
- El usuario Maestro no puede bloquearse, desactivarse ni cambiar privilegios.
- Un administrador no puede bloquearse a si mismo ni dejar el sistema sin otra medica/admin activa.

## Riesgos y controles

- No volver a crear una FK directa entre `patients.location_id` y `locations.id`.
- No ejecutar `reset_for_retry.sql` sobre una base con datos: es destructivo y solo sirve para demos descartables.
- No aplicar parches historicos "por las dudas"; pueden reemplazar funciones nuevas por versiones anteriores.
- Hacer backup antes de migrar otra instalacion con una estructura desconocida.
- Despues de cada migracion verificar login, alta de paciente, agenda interna, usuarios y `/turnos`.

## Variables y secretos

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Edge Function:

- `CORS_ORIGIN`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son provistas por Supabase.
