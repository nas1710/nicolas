begin;

create or replace function public.current_organization_id() returns uuid language sql stable security definer set search_path=public as $$
 select organization_id from public.profiles where id=auth.uid() and active;
$$;
create or replace function public.is_organization_admin() returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select is_master or role::text='ADMINISTRADOR' from public.profiles where id=auth.uid() and active),false);
$$;

alter table public.insurance_plans add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.patient_locations add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.medical_availability add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.holidays add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.studies add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.reports add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.attachments add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.clinical_evolutions add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.administrative_notes add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.communications add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.audit_logs add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.professional_specialties add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.professional_practices add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.appointment_practices add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

alter table public.insurance_plans drop constraint if exists insurance_plans_name_key;
alter table public.holidays drop constraint if exists holidays_date_key;
alter table public.patients drop constraint if exists patients_document_type_number_unique;
create unique index if not exists insurance_plans_org_name_unique_idx on public.insurance_plans(organization_id,lower(name));
create unique index if not exists holidays_org_date_unique_idx on public.holidays(organization_id,date,coalesce(doctor_id,'00000000-0000-0000-0000-000000000000'::uuid));
create unique index if not exists patients_org_document_unique_idx on public.patients(organization_id,document_type,document) where document is not null;

update public.insurance_plans set organization_id='00000000-0000-0000-0000-000000000001' where organization_id is null;
update public.patient_locations pl set organization_id=p.organization_id from public.patients p where p.id=pl.patient_id and pl.organization_id is null;
update public.medical_availability ma set organization_id=l.organization_id from public.locations l where l.id=ma.location_id and ma.organization_id is null;
update public.holidays h set organization_id=coalesce(p.organization_id,'00000000-0000-0000-0000-000000000001') from public.profiles p where p.id=h.doctor_id and h.organization_id is null;
update public.holidays set organization_id='00000000-0000-0000-0000-000000000001' where organization_id is null;
update public.studies x set organization_id=p.organization_id from public.patients p where p.id=x.patient_id and x.organization_id is null;
update public.reports x set organization_id=p.organization_id from public.patients p where p.id=x.patient_id and x.organization_id is null;
update public.reports x set organization_id=l.organization_id from public.locations l where l.id=x.location_id and x.organization_id is null;
update public.reports set organization_id='00000000-0000-0000-0000-000000000001' where organization_id is null;
update public.attachments x set organization_id=p.organization_id from public.patients p where p.id=x.patient_id and x.organization_id is null;
update public.clinical_evolutions x set organization_id=p.organization_id from public.patients p where p.id=x.patient_id and x.organization_id is null;
update public.administrative_notes x set organization_id=p.organization_id from public.patients p where p.id=x.patient_id and x.organization_id is null;
update public.communications x set organization_id=p.organization_id from public.patients p where p.id=x.patient_id and x.organization_id is null;
update public.audit_logs x set organization_id=coalesce(p.organization_id,'00000000-0000-0000-0000-000000000001') from public.profiles p where p.id=x.user_id and x.organization_id is null;
update public.audit_logs set organization_id='00000000-0000-0000-0000-000000000001' where organization_id is null;
update public.professional_specialties x set organization_id=p.organization_id from public.profiles p where p.id=x.professional_id and x.organization_id is null;
update public.professional_practices x set organization_id=p.organization_id from public.profiles p where p.id=x.professional_id and x.organization_id is null;
update public.appointment_practices x set organization_id=a.organization_id from public.appointments a where a.id=x.appointment_id and x.organization_id is null;

create or replace function public.assign_tenant_organization() returns trigger language plpgsql security definer set search_path=public as $$
declare inferred uuid;
begin
 inferred:=public.current_organization_id();
 if tg_table_name='medical_availability' then select organization_id into inferred from public.locations where id=new.location_id;
 elsif tg_table_name='patient_locations' then select organization_id into inferred from public.patients where id=new.patient_id;
 elsif tg_table_name in('studies','attachments','clinical_evolutions','administrative_notes','communications') then execute format('select organization_id from public.patients where id=$1') into inferred using new.patient_id;
 elsif tg_table_name='reports' then select coalesce((select organization_id from public.patients where id=new.patient_id),(select organization_id from public.locations where id=new.location_id),inferred) into inferred;
 elsif tg_table_name='appointments' then select organization_id into inferred from public.locations where id=new.location_id;
 elsif tg_table_name='professional_specialties' or tg_table_name='professional_practices' then select organization_id into inferred from public.profiles where id=new.professional_id;
 elsif tg_table_name='appointment_practices' then select organization_id into inferred from public.appointments where id=new.appointment_id;
 elsif tg_table_name='holidays' and new.doctor_id is not null then select organization_id into inferred from public.profiles where id=new.doctor_id;
 end if;
 if inferred is not null then new.organization_id:=inferred; end if;
 return new;
end; $$;

do $$ declare t text; begin
 foreach t in array array['locations','centers','insurance_plans','patients','appointments','medical_availability','holidays','specialties','practices','patient_locations','studies','reports','attachments','clinical_evolutions','administrative_notes','communications','professional_specialties','professional_practices','appointment_practices'] loop
  execute format('drop trigger if exists assign_tenant_organization on public.%I',t);
  execute format('create trigger assign_tenant_organization before insert on public.%I for each row execute function public.assign_tenant_organization()',t);
 end loop;
end $$;

create or replace function public.patient_accessible(target_patient_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.current_user_is_master() or exists(
  select 1 from public.patients p join public.profiles me on me.id=auth.uid() and me.active
  where p.id=target_patient_id and p.organization_id=me.organization_id and (
   me.role::text in('ADMINISTRADOR','MEDICA_ADMIN','MEDICO') or exists(select 1 from public.patient_locations pl where pl.patient_id=p.id and pl.location_id=me.location_id)
  )
 );
$$;

do $$ declare r record; t text; begin
 foreach t in array array['profiles','locations','centers','insurance_plans','patients','patient_locations','medical_availability','holidays','appointments','studies','reports','attachments','clinical_evolutions','administrative_notes','communications','audit_logs','specialties','practices','professional_specialties','professional_practices','appointment_practices'] loop
  for r in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy if exists %I on public.%I',r.policyname,t); end loop;
 end loop;
end $$;

create policy "tenant profiles read" on public.profiles for select using(id=auth.uid() or public.current_user_is_master() or (public.current_role()::text='ADMINISTRADOR' and organization_id=public.current_organization_id()));
create policy "tenant locations read" on public.locations for select using(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant locations write" on public.locations for all using(public.current_user_is_master() or (public.current_role()::text='ADMINISTRADOR' and organization_id=public.current_organization_id())) with check(public.current_user_is_master() or (public.current_role()::text='ADMINISTRADOR' and organization_id=public.current_organization_id()));
create policy "tenant centers read" on public.centers for select using(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant centers write" on public.centers for all using(public.current_user_is_master() or (public.current_role()::text='ADMINISTRADOR' and organization_id=public.current_organization_id())) with check(public.current_user_is_master() or (public.current_role()::text='ADMINISTRADOR' and organization_id=public.current_organization_id()));
create policy "tenant insurance read" on public.insurance_plans for select using(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant insurance write" on public.insurance_plans for all using(public.current_user_is_master() or organization_id=public.current_organization_id()) with check(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant patients read" on public.patients for select using(public.patient_accessible(id));
create policy "tenant patients insert" on public.patients for insert with check(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant patients update" on public.patients for update using(public.patient_accessible(id)) with check(public.patient_accessible(id));
create policy "tenant patient locations" on public.patient_locations for all using(public.patient_accessible(patient_id)) with check(public.patient_accessible(patient_id));
create policy "tenant availability read" on public.medical_availability for select using(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant availability write" on public.medical_availability for all using(public.current_user_is_master() or organization_id=public.current_organization_id()) with check(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant holidays read" on public.holidays for select using(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant holidays write" on public.holidays for all using(public.current_user_is_master() or organization_id=public.current_organization_id()) with check(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant appointments" on public.appointments for all using(public.current_user_is_master() or (organization_id=public.current_organization_id() and (public.current_role()::text in('ADMINISTRADOR','MEDICA_ADMIN','MEDICO') or location_id=public.current_location_id()))) with check(public.current_user_is_master() or (organization_id=public.current_organization_id() and (public.current_role()::text in('ADMINISTRADOR','MEDICA_ADMIN','MEDICO') or location_id=public.current_location_id())));
create policy "tenant studies" on public.studies for all using(public.patient_accessible(patient_id)) with check(public.patient_accessible(patient_id));
create policy "tenant reports" on public.reports for all using(public.current_user_is_master() or organization_id=public.current_organization_id()) with check(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant attachments" on public.attachments for all using(public.patient_accessible(patient_id)) with check(public.patient_accessible(patient_id));
create policy "tenant evolutions" on public.clinical_evolutions for all using(public.patient_accessible(patient_id) and public.current_role()::text in('ADMINISTRADOR','MEDICA_ADMIN','MEDICO')) with check(public.patient_accessible(patient_id) and public.current_role()::text in('ADMINISTRADOR','MEDICA_ADMIN','MEDICO'));
create policy "tenant admin notes" on public.administrative_notes for all using(public.patient_accessible(patient_id)) with check(public.patient_accessible(patient_id));
create policy "tenant communications" on public.communications for all using(public.patient_accessible(patient_id)) with check(public.patient_accessible(patient_id));
create policy "tenant audit" on public.audit_logs for select using(public.current_user_is_master() or (organization_id=public.current_organization_id() and public.current_role()::text='ADMINISTRADOR'));
create policy "tenant specialties read" on public.specialties for select using(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant specialties write" on public.specialties for all using(public.current_user_is_master() or (organization_id=public.current_organization_id() and public.current_role()::text='ADMINISTRADOR')) with check(public.current_user_is_master() or (organization_id=public.current_organization_id() and public.current_role()::text='ADMINISTRADOR'));
create policy "tenant practices read" on public.practices for select using(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant practices write" on public.practices for all using(public.current_user_is_master() or (organization_id=public.current_organization_id() and public.current_role()::text='ADMINISTRADOR')) with check(public.current_user_is_master() or (organization_id=public.current_organization_id() and public.current_role()::text='ADMINISTRADOR'));
create policy "tenant professional specialties" on public.professional_specialties for all using(public.current_user_is_master() or organization_id=public.current_organization_id()) with check(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant professional practices" on public.professional_practices for all using(public.current_user_is_master() or organization_id=public.current_organization_id()) with check(public.current_user_is_master() or organization_id=public.current_organization_id());
create policy "tenant appointment practices" on public.appointment_practices for all using(public.current_user_is_master() or organization_id=public.current_organization_id()) with check(public.current_user_is_master() or organization_id=public.current_organization_id());

create index if not exists patients_organization_idx on public.patients(organization_id);
create index if not exists appointments_organization_starts_idx on public.appointments(organization_id,starts_at);
create index if not exists profiles_organization_role_idx on public.profiles(organization_id,role,active);

create or replace function public.public_request_catalog_appointment(
 p_doctor_id uuid,p_starts_at timestamptz,p_practice_ids uuid[],p_first_name text,p_last_name text,p_document_type text,p_document text,p_phone text,p_email text,p_insurance_plan_id uuid,p_website text default ''
) returns jsonb language plpgsql security definer set search_path=public as $$
declare clean_type text:=upper(coalesce(p_document_type,'DNI')); clean_document text; clean_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'); clean_email text:=lower(btrim(coalesce(p_email,'')));
 duration int; target_location uuid; target_organization uuid; location_name text; location_address text; target_patient_id uuid; target_appointment_id uuid; doctor_name text; practice_names text; monthly_limit int;
begin
 if btrim(coalesce(p_website,''))<>'' then raise exception 'Solicitud no valida.'; end if;
 if p_starts_at<=now() then raise exception 'Elegir un horario futuro.'; end if;
 if btrim(coalesce(p_first_name,''))='' or btrim(coalesce(p_last_name,''))='' then raise exception 'Nombre y apellido son obligatorios.'; end if;
 if clean_phone='' and clean_email='' then raise exception 'Ingresar telefono o email.'; end if;
 if coalesce(cardinality(p_practice_ids),0)=0 then raise exception 'Elegir al menos una practica.'; end if;
 clean_document:=case when clean_type in('DNI','LC','LE') then regexp_replace(coalesce(p_document,''),'[^0-9]','','g') else upper(regexp_replace(btrim(coalesce(p_document,'')),'[^A-Za-z0-9-]','','g')) end;
 if clean_document='' then raise exception 'El numero de documento es obligatorio.'; end if;
 select organization_id,full_name into target_organization,doctor_name from public.profiles where id=p_doctor_id and active and role::text in('MEDICA_ADMIN','MEDICO') and public_booking_enabled;
 if target_organization is null then raise exception 'El profesional no recibe turnos web.'; end if;
 if not exists(select 1 from public.organizations where id=target_organization and commercial_status='ACTIVA' and active and published) then raise exception 'La agenda no esta habilitada.'; end if;
 select sum(p.duration_min),string_agg(p.name,' + ' order by p.name) into duration,practice_names from public.practices p join public.professional_practices pp on pp.practice_id=p.id and pp.professional_id=p_doctor_id where p.id=any(p_practice_ids) and p.organization_id=target_organization and p.active and p.published;
 if duration is null then raise exception 'Practica no disponible para el profesional.'; end if;
 select cp.max_monthly_appointments into monthly_limit from public.organization_subscriptions os join public.commercial_plans cp on cp.id=os.plan_id where os.organization_id=target_organization and os.status in('PRUEBA','ACTIVA');
 if monthly_limit is not null and (select count(*) from public.appointments where organization_id=target_organization and starts_at>=date_trunc('month',p_starts_at) and starts_at<date_trunc('month',p_starts_at)+interval '1 month' and status::text<>'CANCELADO')>=monthly_limit then raise exception 'La agenda alcanzo el limite mensual del plan.'; end if;
 perform pg_advisory_xact_lock(hashtext(p_doctor_id::text||p_starts_at::text));
 select slot.location_id,slot.location_name,slot.location_address into target_location,location_name,location_address from public.public_booking_slots(p_doctor_id,(p_starts_at at time zone 'America/Argentina/Buenos_Aires')::date,duration) slot where slot.starts_at=p_starts_at limit 1;
 if target_location is null or not exists(select 1 from public.locations where id=target_location and organization_id=target_organization) then raise exception 'Ese horario ya no esta disponible.'; end if;
 if p_insurance_plan_id is not null and not exists(select 1 from public.insurance_plans where id=p_insurance_plan_id and organization_id=target_organization and active) then raise exception 'Obra social no disponible.'; end if;
 select id into target_patient_id from public.patients where organization_id=target_organization and document_type=clean_type and document=clean_document for update;
 if target_patient_id is null then insert into public.patients(first_name,last_name,document_type,document,phone,email,insurance_plan_id,status,source,validation_status,organization_id) values(initcap(lower(btrim(p_first_name))),initcap(lower(btrim(p_last_name))),clean_type,clean_document,nullif(clean_phone,''),nullif(clean_email,''),p_insurance_plan_id,'activo','WEB','PENDIENTE',target_organization) returning id into target_patient_id;
 else update public.patients set phone=coalesce(nullif(clean_phone,''),phone),email=coalesce(nullif(clean_email,''),email),insurance_plan_id=coalesce(p_insurance_plan_id,insurance_plan_id) where id=target_patient_id; end if;
 insert into public.patient_locations(patient_id,location_id,organization_id) values(target_patient_id,target_location,target_organization) on conflict do nothing;
 insert into public.appointments(starts_at,duration_min,type,reason,status,patient_id,location_id,doctor_id,organization_id) values(p_starts_at,duration,'CONSULTA',practice_names||E'\nSolicitud web','PENDIENTE',target_patient_id,target_location,p_doctor_id,target_organization) returning id into target_appointment_id;
 insert into public.appointment_practices(appointment_id,practice_id,organization_id) select target_appointment_id,unnest(p_practice_ids),target_organization;
 return jsonb_build_object('appointment_id',target_appointment_id,'starts_at',p_starts_at,'duration_min',duration,'doctor_name',doctor_name,'location_name',location_name,'location_address',location_address,'status','PENDIENTE');
end; $$;
revoke all on function public.public_request_catalog_appointment(uuid,timestamptz,uuid[],text,text,text,text,text,text,uuid,text) from public;
grant execute on function public.public_request_catalog_appointment(uuid,timestamptz,uuid[],text,text,text,text,text,text,uuid,text) to anon,authenticated;

create or replace function public.public_booking_insurance_plans_for_slug(p_slug text) returns table(id uuid,name text)
language sql stable security definer set search_path=public as $$
 select i.id,i.name from public.insurance_plans i join public.organizations o on o.id=i.organization_id where lower(o.slug)=lower(p_slug) and o.commercial_status='ACTIVA' and o.published and i.active order by i.name;
$$;
revoke all on function public.public_booking_insurance_plans_for_slug(text) from public;
grant execute on function public.public_booking_insurance_plans_for_slug(text) to anon,authenticated;

create or replace function public.public_commercial_catalog() returns jsonb language sql stable security definer set search_path=public as $$
 select public.public_commercial_catalog_for_slug((select slug from public.organizations where commercial_status='ACTIVA' and active and published order by created_at limit 1));
$$;
create or replace function public.public_booking_insurance_plans() returns table(id uuid,name text) language sql stable security definer set search_path=public as $$
 select * from public.public_booking_insurance_plans_for_slug((select slug from public.organizations where commercial_status='ACTIVA' and active and published order by created_at limit 1));
$$;

commit;
notify pgrst,'reload schema';
