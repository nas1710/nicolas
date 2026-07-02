-- Paciente unico por identidad; historias clinicas separadas por profesional.
-- Idempotente, sin borrado ni reescritura de datos existentes.

create index if not exists clinical_evolutions_patient_author_date_idx
  on public.clinical_evolutions (patient_id, created_by, occurred_at desc);

drop policy if exists "tenant patients read" on public.patients;
create policy "tenant patients read"
on public.patients for select to authenticated
using (
  public.current_user_is_master()
  or organization_id = public.current_organization_id()
);

-- Los datos de identidad/contacto se reutilizan entre especialidades de la misma organizacion.
drop policy if exists "tenant patients update" on public.patients;
create policy "tenant patients update"
on public.patients for update to authenticated
using (
  public.current_user_is_master()
  or organization_id = public.current_organization_id()
)
with check (
  public.current_user_is_master()
  or organization_id = public.current_organization_id()
);

drop policy if exists "tenant evolutions" on public.clinical_evolutions;
drop policy if exists "professional histories read" on public.clinical_evolutions;
drop policy if exists "professional histories insert" on public.clinical_evolutions;
drop policy if exists "professional histories update" on public.clinical_evolutions;
drop policy if exists "professional histories delete" on public.clinical_evolutions;

create policy "professional histories read"
on public.clinical_evolutions for select to authenticated
using (
  public.current_user_is_master()
  or (
    organization_id = public.current_organization_id()
    and (
      public.current_role()::text = 'ADMINISTRADOR'
    or (public.current_role()::text in ('MEDICO', 'MEDICA_ADMIN') and created_by = auth.uid())
    )
  )
);

create policy "professional histories insert"
on public.clinical_evolutions for insert to authenticated
with check (
  organization_id = public.current_organization_id()
  and public.current_role()::text in ('MEDICO', 'MEDICA_ADMIN')
  and created_by = auth.uid()
);

create policy "professional histories update"
on public.clinical_evolutions for update to authenticated
using (
  organization_id = public.current_organization_id()
  and public.current_role()::text in ('MEDICO', 'MEDICA_ADMIN')
  and created_by = auth.uid()
)
with check (
  organization_id = public.current_organization_id()
  and public.current_role()::text in ('MEDICO', 'MEDICA_ADMIN')
  and created_by = auth.uid()
);

create policy "professional histories delete"
on public.clinical_evolutions for delete to authenticated
using (
  organization_id = public.current_organization_id()
  and public.current_role()::text in ('MEDICO', 'MEDICA_ADMIN')
  and created_by = auth.uid()
);

notify pgrst, 'reload schema';
