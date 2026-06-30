-- Dependencias para altas internas sin confirmacion por correo.
-- Idempotente: no elimina usuarios, perfiles ni datos operativos.

begin;

alter table public.profiles add column if not exists is_master boolean not null default false;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists document_number text;

create index if not exists profiles_normalized_email_idx
  on public.profiles (lower(email));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, location_id, active, must_change_password)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'Usuario pendiente'),
    'SECRETARIA',
    null,
    false,
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

insert into public.profiles (id, email, full_name, role, location_id, active, must_change_password)
select
  account.id,
  coalesce(account.email, ''),
  coalesce(account.raw_user_meta_data->>'full_name', account.email, 'Usuario pendiente'),
  'SECRETARIA',
  null,
  false,
  false
from auth.users account
where not exists (select 1 from public.profiles profile where profile.id = account.id);

commit;

-- Diagnostico: las filas PENDIENTE se normalizan desde Usuarios mediante
-- Blanquear clave y Reactivar; la contrasena nunca se modifica por SQL.
select
  account.email,
  profile.role,
  profile.active,
  profile.must_change_password,
  case
    when profile.id is null then 'FALTA_PERFIL'
    when profile.active = false then 'PENDIENTE_O_BLOQUEADO'
    when account.email_confirmed_at is null then 'REQUIERE_NORMALIZACION_DESDE_APP'
    else 'LISTO'
  end as estado
from auth.users account
left join public.profiles profile on profile.id = account.id
order by account.created_at;
