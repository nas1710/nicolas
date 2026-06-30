-- Usuario maestro protegido y contrasenas provisorias.
-- Ejecutar una vez en Supabase > SQL Editor.

begin;

alter table public.profiles add column if not exists is_master boolean not null default false;
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.profiles add column if not exists document_number text;

drop trigger if exists protect_master_profile on public.profiles;

insert into public.profiles (id, email, full_name, role, location_id, active, is_master)
select
  id,
  email,
  coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), 'Usuario Maestro'),
  'MEDICA_ADMIN',
  null,
  true,
  true
from auth.users
where lower(email) = 'nas1710@gmail.com'
on conflict (id) do update
set email = excluded.email,
    role = 'MEDICA_ADMIN',
    location_id = null,
    active = true,
    is_master = true;

update public.profiles
set role = 'MEDICA_ADMIN', location_id = null, active = true, is_master = true
where lower(email) = 'nas1710@gmail.com';

update public.profiles
set is_master = false
where lower(email) <> 'nas1710@gmail.com' and is_master;

create or replace function public.protect_master_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' and old.is_master then
    raise exception 'El usuario maestro no puede eliminarse.';
  end if;

  if tg_op = 'UPDATE' then
    if old.is_master and (
      new.email is distinct from old.email
      or new.role is distinct from old.role
      or new.location_id is distinct from old.location_id
      or new.active is distinct from old.active
      or new.is_master is distinct from old.is_master
    ) then
      raise exception 'Los privilegios del usuario maestro estan protegidos.';
    end if;

    if not old.is_master and new.is_master then
      raise exception 'No se puede crear otro usuario maestro.';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger protect_master_profile
before update or delete on public.profiles
for each row execute function public.protect_master_profile();

create or replace function public.complete_password_change()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set must_change_password = false, updated_at = now()
  where id = auth.uid();
$$;

grant execute on function public.complete_password_change() to authenticated;

commit;

select email, full_name, role, active, is_master, document_number
from public.profiles
order by is_master desc, full_name;
