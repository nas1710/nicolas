begin;

alter table public.organizations add column if not exists slug text;
alter table public.organizations add column if not exists commercial_status text not null default 'ACTIVA';
alter table public.organizations add column if not exists responsible_name text;
alter table public.organizations add column if not exists responsible_email text;
alter table public.organizations add column if not exists responsible_phone text;
alter table public.organizations add column if not exists commercial_notes text;

update public.organizations set slug=lower(regexp_replace(coalesce(nullif(slug,''),commercial_name),'[^a-zA-Z0-9]+','-','g')) where slug is null or slug='';
update public.organizations set slug=trim(both '-' from slug);
create unique index if not exists organizations_slug_unique_idx on public.organizations(lower(slug));
alter table public.specialties drop constraint if exists specialties_name_key;
create unique index if not exists specialties_organization_name_unique_idx on public.specialties(organization_id,lower(name));

do $$ begin
 if not exists(select 1 from pg_constraint where conname='organizations_commercial_status_check') then
  alter table public.organizations add constraint organizations_commercial_status_check check(commercial_status in('CONFIGURACION','ACTIVA','SUSPENDIDA','BAJA'));
 end if;
end $$;

create table if not exists public.commercial_plans(
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 description text,
 max_professionals int,
 max_centers int,
 max_internal_users int,
 max_monthly_appointments int,
 patient_portal_enabled boolean not null default false,
 institutional_pdf_enabled boolean not null default true,
 communications_enabled boolean not null default true,
 advanced_dashboard_enabled boolean not null default false,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.organization_subscriptions(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null unique references public.organizations(id) on delete restrict,
 plan_id uuid references public.commercial_plans(id) on delete restrict,
 starts_on date not null default current_date,
 renews_on date,
 expires_on date,
 status text not null default 'ACTIVA' check(status in('PRUEBA','ACTIVA','VENCIDA','SUSPENDIDA','CANCELADA')),
 notes text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

insert into public.commercial_plans(name,description,max_professionals,max_centers,max_internal_users,max_monthly_appointments,patient_portal_enabled,institutional_pdf_enabled,communications_enabled,advanced_dashboard_enabled)
values
 ('Profesional individual','Para un profesional y su equipo minimo.',1,1,3,300,false,true,true,false),
 ('Centro pequeno','Para equipos reducidos con mas de un consultorio.',5,3,12,1500,false,true,true,true),
 ('Centro avanzado','Para centros con operacion ampliada.',20,10,50,10000,true,true,true,true),
 ('Personalizado','Limites definidos comercialmente.',null,null,null,null,true,true,true,true)
on conflict(name) do nothing;

insert into public.organization_subscriptions(organization_id,plan_id,status)
select o.id,(select id from public.commercial_plans where name='Personalizado'),'ACTIVA'
from public.organizations o on conflict(organization_id) do nothing;

alter table public.commercial_plans enable row level security;
alter table public.organization_subscriptions enable row level security;
drop policy if exists "commercial plans authenticated read" on public.commercial_plans;
drop policy if exists "commercial plans master write" on public.commercial_plans;
drop policy if exists "organization subscriptions scoped read" on public.organization_subscriptions;
drop policy if exists "organization subscriptions master write" on public.organization_subscriptions;
create policy "commercial plans authenticated read" on public.commercial_plans for select using(auth.uid() is not null);
create policy "commercial plans master write" on public.commercial_plans for all using(public.current_user_is_master()) with check(public.current_user_is_master());
create policy "organization subscriptions scoped read" on public.organization_subscriptions for select using(public.current_user_is_master() or organization_id=(select organization_id from public.profiles where id=auth.uid()));
create policy "organization subscriptions master write" on public.organization_subscriptions for all using(public.current_user_is_master()) with check(public.current_user_is_master());

create or replace function public.master_organization_catalog() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.current_user_is_master() then raise exception 'Solo el usuario Maestro puede administrar clientes.'; end if;
 return jsonb_build_object(
  'plans',coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.commercial_plans p),'[]'::jsonb),
  'organizations',coalesce((select jsonb_agg(to_jsonb(x) order by x.commercial_name) from (
   select o.*,s.plan_id,s.starts_on,s.renews_on,s.expires_on,s.status as subscription_status,s.notes as subscription_notes,
    (select count(*) from public.profiles p where p.organization_id=o.id and not p.is_master) as users_count,
    (select count(*) from public.profiles p where p.organization_id=o.id and p.active and p.role::text in('MEDICO','MEDICA_ADMIN')) as professionals_count,
    (select count(*) from public.centers c where c.organization_id=o.id and c.active) as centers_count,
    (select count(*) from public.profiles p where p.organization_id=o.id and p.role::text='ADMINISTRADOR' and p.active) as administrators_count
   from public.organizations o left join public.organization_subscriptions s on s.organization_id=o.id
  ) x),'[]'::jsonb)
 );
end; $$;

create or replace function public.master_create_organization(p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result public.organizations; target_plan uuid; requested_slug text;
begin
 if not public.current_user_is_master() then raise exception 'Solo el usuario Maestro puede crear organizaciones.'; end if;
 if btrim(coalesce(p_data->>'commercial_name',''))='' then raise exception 'El nombre comercial es obligatorio.'; end if;
 requested_slug:=trim(both '-' from lower(regexp_replace(coalesce(nullif(p_data->>'slug',''),p_data->>'commercial_name'),'[^a-zA-Z0-9]+','-','g')));
 if requested_slug='' then raise exception 'El identificador publico no es valido.'; end if;
 insert into public.organizations(commercial_name,legal_name,tax_id,slug,email,phone,whatsapp,main_address,responsible_name,responsible_email,responsible_phone,commercial_notes,commercial_status,active,published)
 values(btrim(p_data->>'commercial_name'),nullif(btrim(p_data->>'legal_name'),''),nullif(btrim(p_data->>'tax_id'),''),requested_slug,nullif(btrim(p_data->>'email'),''),nullif(btrim(p_data->>'phone'),''),nullif(btrim(p_data->>'whatsapp'),''),nullif(btrim(p_data->>'main_address'),''),nullif(btrim(p_data->>'responsible_name'),''),nullif(btrim(p_data->>'responsible_email'),''),nullif(btrim(p_data->>'responsible_phone'),''),nullif(btrim(p_data->>'commercial_notes'),''),'CONFIGURACION',true,false)
 returning * into result;
 target_plan:=nullif(p_data->>'plan_id','')::uuid;
 insert into public.organization_subscriptions(organization_id,plan_id,status,starts_on,renews_on,notes)
 values(result.id,target_plan,'PRUEBA',coalesce(nullif(p_data->>'starts_on','')::date,current_date),nullif(p_data->>'renews_on','')::date,nullif(btrim(p_data->>'subscription_notes'),''));
 insert into public.audit_logs(action,entity,entity_id,after,user_id) values('ORGANIZATION_CREATE','organizations',result.id,to_jsonb(result),auth.uid());
 return to_jsonb(result);
end; $$;

create or replace function public.master_update_organization_commercial(p_organization_id uuid,p_data jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare next_status text:=upper(coalesce(p_data->>'commercial_status','CONFIGURACION'));
begin
 if not public.current_user_is_master() then raise exception 'Solo el usuario Maestro puede modificar clientes.'; end if;
 if next_status not in('CONFIGURACION','ACTIVA','SUSPENDIDA','BAJA') then raise exception 'Estado comercial no valido.'; end if;
 if next_status='ACTIVA' and not exists(select 1 from public.profiles where organization_id=p_organization_id and role::text='ADMINISTRADOR' and active) then raise exception 'La organizacion necesita un Administrador activo antes de habilitarse.'; end if;
 update public.organizations set commercial_status=next_status,active=next_status<>'BAJA',published=next_status='ACTIVA',commercial_notes=coalesce(p_data->>'commercial_notes',commercial_notes),updated_at=now() where id=p_organization_id;
 if not found then raise exception 'Organizacion no encontrada.'; end if;
 update public.organization_subscriptions set plan_id=coalesce(nullif(p_data->>'plan_id','')::uuid,plan_id),status=coalesce(nullif(p_data->>'subscription_status',''),status),renews_on=case when p_data ? 'renews_on' then nullif(p_data->>'renews_on','')::date else renews_on end,expires_on=case when p_data ? 'expires_on' then nullif(p_data->>'expires_on','')::date else expires_on end,notes=coalesce(p_data->>'subscription_notes',notes),updated_at=now() where organization_id=p_organization_id;
 insert into public.audit_logs(action,entity,entity_id,after,user_id) values('ORGANIZATION_COMMERCIAL_UPDATE','organizations',p_organization_id,p_data,auth.uid());
end; $$;

create or replace function public.master_save_commercial_plan(p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result public.commercial_plans; target_id uuid:=nullif(p_data->>'id','')::uuid;
begin
 if not public.current_user_is_master() then raise exception 'Solo el usuario Maestro puede editar planes.'; end if;
 if target_id is null then
  insert into public.commercial_plans(name,description,max_professionals,max_centers,max_internal_users,max_monthly_appointments,patient_portal_enabled,institutional_pdf_enabled,communications_enabled,advanced_dashboard_enabled,active)
  values(btrim(p_data->>'name'),nullif(btrim(p_data->>'description'),''),nullif(p_data->>'max_professionals','')::int,nullif(p_data->>'max_centers','')::int,nullif(p_data->>'max_internal_users','')::int,nullif(p_data->>'max_monthly_appointments','')::int,coalesce((p_data->>'patient_portal_enabled')::boolean,false),coalesce((p_data->>'institutional_pdf_enabled')::boolean,true),coalesce((p_data->>'communications_enabled')::boolean,true),coalesce((p_data->>'advanced_dashboard_enabled')::boolean,false),coalesce((p_data->>'active')::boolean,true)) returning * into result;
 else
  update public.commercial_plans set name=btrim(p_data->>'name'),description=nullif(btrim(p_data->>'description'),''),max_professionals=nullif(p_data->>'max_professionals','')::int,max_centers=nullif(p_data->>'max_centers','')::int,max_internal_users=nullif(p_data->>'max_internal_users','')::int,max_monthly_appointments=nullif(p_data->>'max_monthly_appointments','')::int,patient_portal_enabled=coalesce((p_data->>'patient_portal_enabled')::boolean,false),institutional_pdf_enabled=coalesce((p_data->>'institutional_pdf_enabled')::boolean,true),communications_enabled=coalesce((p_data->>'communications_enabled')::boolean,true),advanced_dashboard_enabled=coalesce((p_data->>'advanced_dashboard_enabled')::boolean,false),active=coalesce((p_data->>'active')::boolean,true),updated_at=now() where id=target_id returning * into result;
 end if;
 return to_jsonb(result);
end; $$;

create or replace function public.public_organization_settings_for_slug(p_slug text) returns jsonb
language sql stable security definer set search_path=public as $$
select coalesce((select jsonb_build_object('id',o.id,'slug',o.slug,'commercial_name',o.commercial_name,'description',o.description,'logo_path',o.logo_path,'primary_color',o.primary_color,'secondary_color',o.secondary_color,'phone',o.phone,'whatsapp',o.whatsapp,'email',o.email,'main_address',o.main_address,'social_links',o.social_links,'welcome_title',o.welcome_title,'welcome_text',o.welcome_text,'legal_text',o.legal_text,'booking_terms',o.booking_terms,'insurance_information',o.insurance_information,'public_notice',o.public_notice,'centers',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.centers c where c.organization_id=o.id and c.active and c.published),'[]'::jsonb),'insurance_plans',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name) order by i.name) from public.insurance_plans i where i.active),'[]'::jsonb)) from public.organizations o where lower(o.slug)=lower(p_slug) and o.commercial_status='ACTIVA' and o.active and o.published limit 1),'{}'::jsonb); $$;

create or replace function public.public_commercial_catalog_for_slug(p_slug text) returns jsonb
language sql stable security definer set search_path=public as $$
with selected as(select id from public.organizations where lower(slug)=lower(p_slug) and commercial_status='ACTIVA' and active and published limit 1)
select jsonb_build_object(
 'specialties',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description) order by s.name) from public.specialties s,selected o where s.organization_id=o.id and s.active and s.published),'[]'::jsonb),
 'practices',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'specialty_id',p.specialty_id,'name',p.name,'description',p.description,'duration_min',p.duration_min) order by p.name) from public.practices p join public.specialties s on s.id=p.specialty_id join selected o on p.organization_id=o.id where p.active and p.published and s.active and s.published),'[]'::jsonb),
 'professionals',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'specialty',coalesce(p.specialty,'Profesional de la salud'),'specialty_ids',(select coalesce(jsonb_agg(ps.specialty_id),'[]'::jsonb) from public.professional_specialties ps join public.specialties s on s.id=ps.specialty_id where ps.professional_id=p.id and s.organization_id=o.id),'practice_ids',(select coalesce(jsonb_agg(pp.practice_id),'[]'::jsonb) from public.professional_practices pp join public.practices pr on pr.id=pp.practice_id where pp.professional_id=p.id and pr.organization_id=o.id)) order by p.full_name) from public.profiles p,selected o where p.organization_id=o.id and p.active and p.role::text in('MEDICA_ADMIN','MEDICO') and p.public_booking_enabled and exists(select 1 from public.medical_availability ma join public.locations l on l.id=ma.location_id where ma.doctor_id=p.id and ma.enabled and l.organization_id=o.id)),'[]'::jsonb),
 'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'address',l.address) order by l.name) from public.locations l,selected o where l.organization_id=o.id and l.active),'[]'::jsonb)
); $$;

revoke all on function public.master_organization_catalog() from public,anon;
revoke all on function public.master_create_organization(jsonb) from public,anon;
revoke all on function public.master_update_organization_commercial(uuid,jsonb) from public,anon;
revoke all on function public.master_save_commercial_plan(jsonb) from public,anon;
grant execute on function public.master_organization_catalog() to authenticated;
grant execute on function public.master_create_organization(jsonb) to authenticated;
grant execute on function public.master_update_organization_commercial(uuid,jsonb) to authenticated;
grant execute on function public.master_save_commercial_plan(jsonb) to authenticated;
revoke all on function public.public_organization_settings_for_slug(text) from public;
revoke all on function public.public_commercial_catalog_for_slug(text) from public;
grant execute on function public.public_organization_settings_for_slug(text) to anon,authenticated;
grant execute on function public.public_commercial_catalog_for_slug(text) to anon,authenticated;

commit;
notify pgrst,'reload schema';
