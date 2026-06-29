-- Usar solo si el primer intento de schema.sql fallo en una base nueva/demo.
-- Borra las tablas/tipos de esta app para poder ejecutar schema.sql nuevamente.
-- No usar si ya cargaste datos reales.

drop policy if exists "patient files scoped read" on storage.objects;
drop policy if exists "patient files scoped insert" on storage.objects;
delete from storage.objects where bucket_id = 'patient-files';
delete from storage.buckets where id = 'patient-files';

drop table if exists public.audit_logs cascade;
drop table if exists public.communications cascade;
drop table if exists public.administrative_notes cascade;
drop table if exists public.clinical_evolutions cascade;
drop table if exists public.attachments cascade;
drop table if exists public.reports cascade;
drop table if exists public.studies cascade;
drop table if exists public.appointments cascade;
drop table if exists public.medical_availability cascade;
drop table if exists public.patients cascade;
drop table if exists public.insurance_plans cascade;
drop table if exists public.profiles cascade;
drop table if exists public.locations cascade;

drop function if exists public.current_profile() cascade;
drop function if exists public.current_role() cascade;
drop function if exists public.current_location_id() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.is_secretary() cascade;
drop function if exists public.patient_visible(uuid) cascade;
drop function if exists public.audit_row() cascade;
drop function if exists public.appointment_inside_availability(uuid, timestamptz, int) cascade;
drop function if exists public.enforce_appointment_availability() cascade;
drop function if exists public.prevent_patient_identity_update() cascade;

drop type if exists public.attachment_kind cascade;
drop type if exists public.attachment_origin cascade;
drop type if exists public.history_kind cascade;
drop type if exists public.communication_channel cascade;
drop type if exists public.report_status cascade;
drop type if exists public.study_status cascade;
drop type if exists public.study_type cascade;
drop type if exists public.appointment_status cascade;
drop type if exists public.user_role cascade;
