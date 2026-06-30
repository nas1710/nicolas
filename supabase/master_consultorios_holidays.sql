-- Feriados sin etiqueta obligatoria y consultorios administrados solo por el maestro.
-- Ejecutar en Supabase > SQL Editor sobre una base existente.

begin;

alter table public.holidays alter column name set default 'Feriado';
update public.holidays set name = 'Feriado' where btrim(name) = '';

create or replace function public.current_user_is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and is_master
  );
$$;

create or replace function public.delete_location_if_unused(target_location_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_master() then
    raise exception 'Solo el usuario maestro puede eliminar consultorios.';
  end if;

  if exists (select 1 from public.profiles where location_id = target_location_id)
    or exists (select 1 from public.patients where location_id = target_location_id)
    or exists (select 1 from public.patient_locations where location_id = target_location_id)
    or exists (select 1 from public.medical_availability where location_id = target_location_id)
    or exists (select 1 from public.appointments where location_id = target_location_id)
    or exists (select 1 from public.reports where location_id = target_location_id) then
    raise exception 'El consultorio tiene usuarios, pacientes, horarios o turnos asociados. Debe darse de baja para conservar la historia.';
  end if;

  delete from public.locations where id = target_location_id;
  if not found then raise exception 'Consultorio no encontrado.'; end if;
end;
$$;

grant execute on function public.delete_location_if_unused(uuid) to authenticated;

drop policy if exists "locations admin write" on public.locations;
drop policy if exists "locations master write" on public.locations;
create policy "locations master write"
on public.locations for all
using (public.current_user_is_master())
with check (public.current_user_is_master());

commit;
