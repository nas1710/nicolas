-- Organizacion unica preparada para evolucion multi-organizacion.
-- Idempotente y sin borrado de datos.

begin;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  commercial_name text not null,
  legal_name text,
  tax_id text,
  description text,
  logo_path text,
  primary_color text not null default '#176f78',
  secondary_color text not null default '#dff4ee',
  phone text,
  whatsapp text,
  email text,
  main_address text,
  social_links jsonb not null default '{}'::jsonb,
  welcome_title text,
  welcome_text text,
  legal_text text,
  booking_terms text,
  insurance_information text,
  public_notice text,
  active boolean not null default true,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organizations(id,commercial_name,description,welcome_title,welcome_text)
values('00000000-0000-0000-0000-000000000001','Atencion medica','Organizacion de profesionales y centros de salud.','Atencion medica','Consulta profesionales, prestaciones y horarios disponibles.')
on conflict(id) do nothing;

create table if not exists public.centers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict default '00000000-0000-0000-0000-000000000001',
  name text not null,
  address text,
  phone text,
  email text,
  active boolean not null default true,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.locations add column if not exists organization_id uuid references public.organizations(id) on delete restrict default '00000000-0000-0000-0000-000000000001';
alter table public.locations add column if not exists center_id uuid references public.centers(id) on delete set null;
alter table public.profiles add column if not exists organization_id uuid references public.organizations(id) on delete restrict default '00000000-0000-0000-0000-000000000001';
alter table public.patients add column if not exists organization_id uuid references public.organizations(id) on delete restrict default '00000000-0000-0000-0000-000000000001';
alter table public.appointments add column if not exists organization_id uuid references public.organizations(id) on delete restrict default '00000000-0000-0000-0000-000000000001';
alter table public.specialties add column if not exists organization_id uuid references public.organizations(id) on delete restrict default '00000000-0000-0000-0000-000000000001';
alter table public.practices add column if not exists organization_id uuid references public.organizations(id) on delete restrict default '00000000-0000-0000-0000-000000000001';

create table if not exists public.professional_locations (
  professional_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict default '00000000-0000-0000-0000-000000000001',
  active boolean not null default true,
  primary key(professional_id,location_id)
);

create table if not exists public.user_locations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict default '00000000-0000-0000-0000-000000000001',
  primary key(user_id,location_id)
);

insert into public.professional_locations(professional_id,location_id)
select distinct doctor_id,location_id from public.medical_availability where doctor_id is not null on conflict do nothing;
insert into public.user_locations(user_id,location_id)
select id,location_id from public.profiles where location_id is not null on conflict do nothing;

alter table public.organizations enable row level security;
alter table public.centers enable row level security;
alter table public.professional_locations enable row level security;
alter table public.user_locations enable row level security;

drop policy if exists "organization authenticated read" on public.organizations;
drop policy if exists "organization admin write" on public.organizations;
create policy "organization authenticated read" on public.organizations for select using(auth.uid() is not null);
create policy "organization admin write" on public.organizations for all using(public.is_security_admin()) with check(public.is_security_admin());
drop policy if exists "centers authenticated read" on public.centers;
drop policy if exists "centers admin write" on public.centers;
create policy "centers authenticated read" on public.centers for select using(auth.uid() is not null);
create policy "centers admin write" on public.centers for all using(public.is_security_admin()) with check(public.is_security_admin());
drop policy if exists "professional locations authenticated read" on public.professional_locations;
drop policy if exists "professional locations admin write" on public.professional_locations;
create policy "professional locations authenticated read" on public.professional_locations for select using(auth.uid() is not null);
create policy "professional locations admin write" on public.professional_locations for all using(public.is_security_admin()) with check(public.is_security_admin());
drop policy if exists "user locations own or admin read" on public.user_locations;
drop policy if exists "user locations admin write" on public.user_locations;
create policy "user locations own or admin read" on public.user_locations for select using(user_id=auth.uid() or public.is_security_admin());
create policy "user locations admin write" on public.user_locations for all using(public.is_security_admin()) with check(public.is_security_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('organization-assets','organization-assets',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=2097152,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "organization assets admin insert" on storage.objects;
drop policy if exists "organization assets admin update" on storage.objects;
drop policy if exists "organization assets admin delete" on storage.objects;
create policy "organization assets admin insert" on storage.objects for insert with check(bucket_id='organization-assets' and public.is_security_admin());
create policy "organization assets admin update" on storage.objects for update using(bucket_id='organization-assets' and public.is_security_admin()) with check(bucket_id='organization-assets' and public.is_security_admin());
create policy "organization assets admin delete" on storage.objects for delete using(bucket_id='organization-assets' and public.is_security_admin());

create or replace function public.public_organization_settings() returns jsonb
language sql stable security definer set search_path=public as $$
select coalesce((select jsonb_build_object(
 'id',o.id,'commercial_name',o.commercial_name,'description',o.description,'logo_path',o.logo_path,
 'primary_color',o.primary_color,'secondary_color',o.secondary_color,'phone',o.phone,'whatsapp',o.whatsapp,'email',o.email,
 'main_address',o.main_address,'social_links',o.social_links,'welcome_title',o.welcome_title,'welcome_text',o.welcome_text,
 'legal_text',o.legal_text,'booking_terms',o.booking_terms,'insurance_information',o.insurance_information,'public_notice',o.public_notice,
 'centers',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.centers c where c.organization_id=o.id and c.active and c.published),'[]'::jsonb),
 'insurance_plans',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name) order by i.name) from public.insurance_plans i where i.active),'[]'::jsonb)
) from public.organizations o where o.active and o.published order by o.created_at limit 1),'{}'::jsonb); $$;
revoke all on function public.public_organization_settings() from public;
grant execute on function public.public_organization_settings() to anon,authenticated;

create or replace function public.update_organization_settings(p_settings jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare target_id uuid; result jsonb;
begin
 if not public.is_security_admin() then raise exception 'Acceso no autorizado.'; end if;
 select id into target_id from public.organizations where active order by created_at limit 1;
 update public.organizations as o set
  commercial_name=coalesce(nullif(btrim(p_settings->>'commercial_name'),''),commercial_name),legal_name=nullif(btrim(p_settings->>'legal_name'),''),tax_id=nullif(btrim(p_settings->>'tax_id'),''),
  description=nullif(btrim(p_settings->>'description'),''),logo_path=case when p_settings ? 'logo_path' then nullif(btrim(p_settings->>'logo_path'),'') else logo_path end,
  primary_color=coalesce(nullif(p_settings->>'primary_color',''),primary_color),secondary_color=coalesce(nullif(p_settings->>'secondary_color',''),secondary_color),
  phone=nullif(btrim(p_settings->>'phone'),''),whatsapp=nullif(btrim(p_settings->>'whatsapp'),''),email=nullif(btrim(p_settings->>'email'),''),main_address=nullif(btrim(p_settings->>'main_address'),''),
  welcome_title=nullif(btrim(p_settings->>'welcome_title'),''),welcome_text=nullif(btrim(p_settings->>'welcome_text'),''),legal_text=nullif(btrim(p_settings->>'legal_text'),''),booking_terms=nullif(btrim(p_settings->>'booking_terms'),''),
  insurance_information=nullif(btrim(p_settings->>'insurance_information'),''),public_notice=nullif(btrim(p_settings->>'public_notice'),''),updated_at=now()
 where o.id=target_id returning to_jsonb(o) into result;
 return result;
end; $$;
revoke all on function public.update_organization_settings(jsonb) from public,anon;
grant execute on function public.update_organization_settings(jsonb) to authenticated;

create or replace function public.set_professional_locations(p_professional_id uuid,p_location_ids uuid[]) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_security_admin() then raise exception 'Acceso no autorizado.'; end if;
 if not exists(select 1 from public.profiles where id=p_professional_id and role::text in('MEDICA_ADMIN','MEDICO')) then raise exception 'Profesional no valido.'; end if;
 delete from public.professional_locations where professional_id=p_professional_id;
 insert into public.professional_locations(professional_id,location_id)
 select p_professional_id,id from public.locations where id=any(coalesce(p_location_ids,array[]::uuid[])) and active;
end; $$;
revoke all on function public.set_professional_locations(uuid,uuid[]) from public,anon;
grant execute on function public.set_professional_locations(uuid,uuid[]) to authenticated;

commit;
notify pgrst,'reload schema';
