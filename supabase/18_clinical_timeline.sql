-- Trazabilidad longitudinal minima para la historia clinica.
-- Idempotente: no elimina ni reescribe evoluciones existentes.

alter table public.clinical_evolutions
  add column if not exists requested_studies text;

alter table public.clinical_evolutions
  add column if not exists registered_at timestamptz not null default now();

alter table public.clinical_evolutions
  add column if not exists record_status text not null default 'FINAL';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clinical_evolutions_record_status_check'
      and conrelid = 'public.clinical_evolutions'::regclass
  ) then
    alter table public.clinical_evolutions
      add constraint clinical_evolutions_record_status_check
      check (record_status in ('BORRADOR', 'FINAL', 'CORREGIDO'));
  end if;
end $$;

create index if not exists clinical_evolutions_patient_occurred_idx
  on public.clinical_evolutions (patient_id, occurred_at desc);

notify pgrst, 'reload schema';
