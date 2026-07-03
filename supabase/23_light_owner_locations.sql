-- Light: el medico propietario administra los consultorios de su organizacion.
-- Idempotente. No elimina datos ni amplía permisos fuera del tenant actual.

drop policy if exists "tenant locations write" on public.locations;
create policy "tenant locations write" on public.locations
for all
using (
  public.current_user_is_master()
  or (
    public.current_role()::text in ('ADMINISTRADOR', 'MEDICA_ADMIN')
    and organization_id = public.current_organization_id()
  )
)
with check (
  public.current_user_is_master()
  or (
    public.current_role()::text in ('ADMINISTRADOR', 'MEDICA_ADMIN')
    and organization_id = public.current_organization_id()
  )
);

create or replace function public.delete_location_if_unused(target_location_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization uuid;
begin
  select organization_id into target_organization
  from public.locations
  where id = target_location_id;

  if target_organization is null then
    raise exception 'Consultorio no encontrado.';
  end if;

  if not (
    public.current_user_is_master()
    or (
      public.current_role()::text in ('ADMINISTRADOR', 'MEDICA_ADMIN')
      and target_organization = public.current_organization_id()
    )
  ) then
    raise exception 'No tenes permiso para eliminar este consultorio.';
  end if;

  if exists(select 1 from public.profiles where location_id = target_location_id)
    or exists(select 1 from public.patient_locations where location_id = target_location_id)
    or exists(select 1 from public.medical_availability where location_id = target_location_id)
    or exists(select 1 from public.appointments where location_id = target_location_id)
    or exists(select 1 from public.reports where location_id = target_location_id) then
    raise exception 'El consultorio tiene actividad asociada. Debe darse de baja para conservar la historia.';
  end if;

  delete from public.locations where id = target_location_id;
end;
$$;

grant execute on function public.delete_location_if_unused(uuid) to authenticated;
