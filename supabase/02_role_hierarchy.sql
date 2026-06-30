-- Jerarquia operativa: Maestro > Administrador > Medico/Secretaria.
-- Idempotente. No elimina ni transforma datos existentes.

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role' and e.enumlabel = 'ADMINISTRADOR'
  ) then
    alter type public.user_role add value 'ADMINISTRADOR';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname='user_role' and e.enumlabel='MEDICO') then
    alter type public.user_role add value 'MEDICO';
  end if;
end $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role()::text in ('MEDICA_ADMIN', 'MEDICO', 'ADMINISTRADOR');
$$;

drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles admin write" on public.profiles;
drop policy if exists "profiles own or master read" on public.profiles;
drop policy if exists "profiles master write" on public.profiles;

create policy "profiles own or master read"
on public.profiles for select
using (id = auth.uid() or public.current_user_is_master());

create policy "profiles master write"
on public.profiles for all
using (public.current_user_is_master())
with check (public.current_user_is_master());

comment on function public.is_admin() is
'Privilegio operativo: Maestro, Administrador y rol medico heredado MEDICA_ADMIN. La gestion de usuarios se protege aparte y es solo del Maestro.';
