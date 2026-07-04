-- Light: el medico propietario edita las practicas de su propia organizacion.
-- Idempotente y sin eliminacion de datos.

drop policy if exists "tenant practices write" on public.practices;
create policy "tenant practices write" on public.practices
for all
using (
  public.current_user_is_master()
  or (
    organization_id = public.current_organization_id()
    and public.current_role()::text in ('ADMINISTRADOR', 'MEDICA_ADMIN')
  )
)
with check (
  public.current_user_is_master()
  or (
    organization_id = public.current_organization_id()
    and public.current_role()::text in ('ADMINISTRADOR', 'MEDICA_ADMIN')
  )
);
