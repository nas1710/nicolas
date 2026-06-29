-- Reparacion independiente de autenticacion y perfiles.
-- Es seguro ejecutarlo mas de una vez desde Supabase > SQL Editor.

begin;

alter table public.profiles
  drop constraint if exists secretary_requires_location;

alter table public.profiles
  add constraint secretary_requires_location check (
    role <> 'SECRETARIA' or location_id is not null or active = false
  );

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, location_id, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'Usuario pendiente'),
    'SECRETARIA',
    null,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Crea el perfil que pudiera faltar para cuentas ya existentes.
insert into public.profiles (id, email, full_name, role, location_id, active)
select
  user_account.id,
  coalesce(user_account.email, ''),
  coalesce(user_account.raw_user_meta_data->>'full_name', user_account.email, 'Usuario pendiente'),
  'SECRETARIA',
  null,
  false
from auth.users user_account
where not exists (
  select 1 from public.profiles profile where profile.id = user_account.id
);

commit;

-- Resultado de control: cada cuenta de Auth debe tener su fila de perfil.
select
  user_account.email,
  profile.full_name,
  profile.role,
  profile.active,
  profile.location_id,
  case
    when profile.id is null then 'FALTA PERFIL'
    when profile.active = false then 'PENDIENTE'
    when profile.role = 'SECRETARIA' and profile.location_id is null then 'FALTA CONSULTORIO'
    else 'LISTO'
  end as estado_acceso
from auth.users user_account
left join public.profiles profile on profile.id = user_account.id
order by user_account.created_at;
