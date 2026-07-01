begin;

alter table public.commercial_plans add column if not exists monthly_price numeric(12,2);
alter table public.commercial_plans add column if not exists currency text not null default 'ARS';
alter table public.commercial_plans add column if not exists support_description text;

alter table public.organization_subscriptions add column if not exists agreed_amount numeric(12,2);
alter table public.organization_subscriptions add column if not exists currency text not null default 'ARS';
alter table public.organization_subscriptions add column if not exists payment_method text;
alter table public.organization_subscriptions add column if not exists commercial_manager text;
alter table public.organization_subscriptions add column if not exists billing_day smallint;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='commercial_plans_currency_check') then
  alter table public.commercial_plans add constraint commercial_plans_currency_check check(currency in('ARS','USD'));
 end if;
 if not exists(select 1 from pg_constraint where conname='organization_subscriptions_currency_check') then
  alter table public.organization_subscriptions add constraint organization_subscriptions_currency_check check(currency in('ARS','USD'));
 end if;
 if not exists(select 1 from pg_constraint where conname='organization_subscriptions_billing_day_check') then
  alter table public.organization_subscriptions add constraint organization_subscriptions_billing_day_check check(billing_day is null or billing_day between 1 and 28);
 end if;
end $$;

create table if not exists public.commercial_payments(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 subscription_id uuid references public.organization_subscriptions(id) on delete restrict,
 paid_on date not null default current_date,
 period_from date,
 period_to date,
 amount numeric(12,2) not null check(amount>0),
 currency text not null default 'ARS' check(currency in('ARS','USD')),
 payment_method text,
 reference text,
 notes text,
 status text not null default 'REGISTRADO' check(status in('REGISTRADO','ANULADO')),
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 voided_by uuid references public.profiles(id) on delete set null,
 voided_at timestamptz
);

create table if not exists public.commercial_subscription_history(
 id bigserial primary key,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 subscription_id uuid references public.organization_subscriptions(id) on delete restrict,
 event_type text not null,
 previous_data jsonb,
 new_data jsonb,
 notes text,
 changed_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now()
);

create index if not exists commercial_payments_org_paid_idx on public.commercial_payments(organization_id,paid_on desc);
create index if not exists commercial_history_org_created_idx on public.commercial_subscription_history(organization_id,created_at desc);

alter table public.commercial_payments enable row level security;
alter table public.commercial_subscription_history enable row level security;
drop policy if exists "commercial payments master" on public.commercial_payments;
drop policy if exists "commercial history master" on public.commercial_subscription_history;
create policy "commercial payments master" on public.commercial_payments for all using(public.current_user_is_master()) with check(public.current_user_is_master());
create policy "commercial history master" on public.commercial_subscription_history for select using(public.current_user_is_master());

create or replace function public.organization_commercial_account() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare org_id uuid; result jsonb;
begin
 select organization_id into org_id from public.profiles where id=auth.uid() and active;
 if org_id is null then return '{}'::jsonb; end if;
 select jsonb_build_object(
  'organization_id',o.id,'organization_name',o.commercial_name,'commercial_status',o.commercial_status,
  'plan_name',cp.name,'subscription_status',case when s.status in('SUSPENDIDA','CANCELADA') then s.status when s.expires_on<current_date then 'VENCIDA' else s.status end,
  'starts_on',s.starts_on,'renews_on',s.renews_on,'expires_on',s.expires_on,
  'days_remaining',case when s.expires_on is null then null else s.expires_on-current_date end,
  'agreed_amount',coalesce(s.agreed_amount,cp.monthly_price),'currency',coalesce(s.currency,cp.currency),
  'payment_method',s.payment_method,'commercial_manager',coalesce(s.commercial_manager,o.responsible_name)
 ) into result from public.organizations o left join public.organization_subscriptions s on s.organization_id=o.id left join public.commercial_plans cp on cp.id=s.plan_id where o.id=org_id;
 return coalesce(result,'{}'::jsonb);
end; $$;

create or replace function public.master_organization_catalog() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 if not public.current_user_is_master() then raise exception 'Solo el usuario Maestro puede administrar clientes.'; end if;
 return jsonb_build_object(
  'plans',coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.commercial_plans p),'[]'::jsonb),
  'organizations',coalesce((select jsonb_agg(to_jsonb(x) order by x.commercial_name) from (
   select o.*,s.id subscription_id,s.plan_id,s.starts_on,s.renews_on,s.expires_on,
    case when s.status in('SUSPENDIDA','CANCELADA') then s.status when s.expires_on<current_date then 'VENCIDA' else s.status end subscription_status,
    s.notes subscription_notes,s.agreed_amount,s.currency,s.payment_method,s.commercial_manager,s.billing_day,
    case when s.expires_on is null then null else s.expires_on-current_date end days_remaining,
    (select count(*) from public.profiles p where p.organization_id=o.id and not p.is_master) users_count,
    (select count(*) from public.profiles p where p.organization_id=o.id and p.active and p.role::text in('MEDICO','MEDICA_ADMIN')) professionals_count,
    (select count(*) from public.centers c where c.organization_id=o.id and c.active) centers_count,
    (select count(*) from public.profiles p where p.organization_id=o.id and p.role::text='ADMINISTRADOR' and p.active) administrators_count,
    coalesce((select jsonb_agg(to_jsonb(pm) order by pm.paid_on desc,pm.created_at desc) from (select * from public.commercial_payments where organization_id=o.id order by paid_on desc,created_at desc limit 20) pm),'[]'::jsonb) payments,
    coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from (select * from public.commercial_subscription_history where organization_id=o.id order by created_at desc limit 30) h),'[]'::jsonb) commercial_history
   from public.organizations o left join public.organization_subscriptions s on s.organization_id=o.id
  ) x),'[]'::jsonb)
 );
end; $$;

create or replace function public.master_update_organization_commercial(p_organization_id uuid,p_data jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare next_status text:=upper(coalesce(p_data->>'commercial_status','CONFIGURACION')); previous jsonb; current_subscription uuid;
begin
 if not public.current_user_is_master() then raise exception 'Solo el usuario Maestro puede modificar clientes.'; end if;
 if next_status not in('CONFIGURACION','ACTIVA','SUSPENDIDA','BAJA') then raise exception 'Estado comercial no valido.'; end if;
 if next_status='ACTIVA' and not exists(select 1 from public.profiles where organization_id=p_organization_id and role::text='ADMINISTRADOR' and active) then raise exception 'La organizacion necesita un Administrador activo antes de habilitarse.'; end if;
 select s.id,jsonb_build_object('organization',to_jsonb(o),'subscription',to_jsonb(s)) into current_subscription,previous from public.organizations o left join public.organization_subscriptions s on s.organization_id=o.id where o.id=p_organization_id;
 update public.organizations set commercial_status=next_status,active=next_status<>'BAJA',published=next_status='ACTIVA',commercial_notes=case when p_data?'commercial_notes' then nullif(p_data->>'commercial_notes','') else commercial_notes end,updated_at=now() where id=p_organization_id;
 if not found then raise exception 'Organizacion no encontrada.'; end if;
 update public.organization_subscriptions set
  plan_id=coalesce(nullif(p_data->>'plan_id','')::uuid,plan_id),
  status=coalesce(nullif(p_data->>'subscription_status',''),status),
  starts_on=case when p_data?'starts_on' then coalesce(nullif(p_data->>'starts_on','')::date,starts_on) else starts_on end,
  renews_on=case when p_data?'renews_on' then nullif(p_data->>'renews_on','')::date else renews_on end,
  expires_on=case when p_data?'expires_on' then nullif(p_data->>'expires_on','')::date else expires_on end,
  agreed_amount=case when p_data?'agreed_amount' then nullif(p_data->>'agreed_amount','')::numeric else agreed_amount end,
  currency=case when p_data?'currency' then coalesce(nullif(p_data->>'currency',''),currency) else currency end,
  payment_method=case when p_data?'payment_method' then nullif(btrim(p_data->>'payment_method'),'') else payment_method end,
  commercial_manager=case when p_data?'commercial_manager' then nullif(btrim(p_data->>'commercial_manager'),'') else commercial_manager end,
  billing_day=case when p_data?'billing_day' then nullif(p_data->>'billing_day','')::smallint else billing_day end,
  notes=case when p_data?'subscription_notes' then nullif(p_data->>'subscription_notes','') else notes end,updated_at=now()
 where organization_id=p_organization_id;
 insert into public.commercial_subscription_history(organization_id,subscription_id,event_type,previous_data,new_data,notes,changed_by)
 values(p_organization_id,current_subscription,case when next_status='SUSPENDIDA' then 'SUSPENSION' when next_status='ACTIVA' then 'ACTIVACION' when next_status='BAJA' then 'BAJA' else 'ACTUALIZACION' end,previous,p_data,p_data->>'change_note',auth.uid());
 insert into public.audit_logs(action,entity,entity_id,after,user_id,organization_id) values('ORGANIZATION_COMMERCIAL_UPDATE','organizations',p_organization_id,p_data,auth.uid(),p_organization_id);
end; $$;

create or replace function public.master_record_commercial_payment(p_organization_id uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result public.commercial_payments; subscription uuid;
begin
 if not public.current_user_is_master() then raise exception 'Solo el usuario Maestro puede registrar cobros.'; end if;
 select id into subscription from public.organization_subscriptions where organization_id=p_organization_id;
 if subscription is null then raise exception 'La organizacion no tiene contrato comercial.'; end if;
 insert into public.commercial_payments(organization_id,subscription_id,paid_on,period_from,period_to,amount,currency,payment_method,reference,notes,created_by)
 values(p_organization_id,subscription,coalesce(nullif(p_data->>'paid_on','')::date,current_date),nullif(p_data->>'period_from','')::date,nullif(p_data->>'period_to','')::date,(p_data->>'amount')::numeric,coalesce(nullif(p_data->>'currency',''),'ARS'),nullif(btrim(p_data->>'payment_method'),''),nullif(btrim(p_data->>'reference'),''),nullif(btrim(p_data->>'notes'),''),auth.uid()) returning * into result;
 insert into public.commercial_subscription_history(organization_id,subscription_id,event_type,new_data,notes,changed_by) values(p_organization_id,subscription,'PAGO_REGISTRADO',to_jsonb(result),result.notes,auth.uid());
 return to_jsonb(result);
end; $$;

create or replace function public.master_void_commercial_payment(p_payment_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare payment public.commercial_payments;
begin
 if not public.current_user_is_master() then raise exception 'Solo el usuario Maestro puede anular cobros.'; end if;
 update public.commercial_payments set status='ANULADO',voided_by=auth.uid(),voided_at=now(),notes=concat_ws(E'\n',notes,'Anulacion: '||coalesce(nullif(btrim(p_reason),''),'Sin detalle')) where id=p_payment_id and status='REGISTRADO' returning * into payment;
 if payment.id is null then raise exception 'El cobro no existe o ya fue anulado.'; end if;
 insert into public.commercial_subscription_history(organization_id,subscription_id,event_type,new_data,notes,changed_by) values(payment.organization_id,payment.subscription_id,'PAGO_ANULADO',to_jsonb(payment),p_reason,auth.uid());
end; $$;

create or replace function public.assert_organization_accepts_new_operations() returns trigger
language plpgsql security definer set search_path=public as $$
declare org_id uuid; org_status text; subscription_status text; center_limit int;
begin
 org_id:=new.organization_id;
 if org_id is null then org_id:=public.current_organization_id(); end if;
 if org_id is null or public.current_user_is_master() then return new; end if;
 select o.commercial_status,s.status into org_status,subscription_status from public.organizations o left join public.organization_subscriptions s on s.organization_id=o.id where o.id=org_id;
 if org_status in('SUSPENDIDA','BAJA') or subscription_status in('SUSPENDIDA','CANCELADA') then raise exception 'La cuenta esta suspendida. Se conserva el acceso de consulta, pero no se permiten nuevas operaciones.'; end if;
 if tg_table_name='centers' then
  select cp.max_centers into center_limit from public.organization_subscriptions s join public.commercial_plans cp on cp.id=s.plan_id where s.organization_id=org_id;
  if center_limit is not null and (select count(*) from public.centers where organization_id=org_id and active)>=center_limit then raise exception 'La organizacion alcanzo el limite de sedes de su plan.'; end if;
 end if;
 return new;
end; $$;

do $$ declare table_name text; begin
 foreach table_name in array array['patients','appointments','clinical_evolutions','studies','reports','attachments','administrative_notes','communications','medical_availability','locations','centers','insurance_plans','specialties','practices'] loop
  execute format('drop trigger if exists commercial_operation_guard on public.%I',table_name);
  execute format('create trigger commercial_operation_guard before insert on public.%I for each row execute function public.assert_organization_accepts_new_operations()',table_name);
 end loop;
end $$;

create or replace function public.master_save_commercial_plan(p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result public.commercial_plans; target_id uuid:=nullif(p_data->>'id','')::uuid;
begin
 if not public.current_user_is_master() then raise exception 'Solo el usuario Maestro puede editar planes.'; end if;
 if btrim(coalesce(p_data->>'name',''))='' then raise exception 'El nombre del plan es obligatorio.'; end if;
 if target_id is null then
  insert into public.commercial_plans(name,description,monthly_price,currency,support_description,max_professionals,max_centers,max_internal_users,max_monthly_appointments,patient_portal_enabled,institutional_pdf_enabled,communications_enabled,advanced_dashboard_enabled,active)
  values(btrim(p_data->>'name'),nullif(btrim(p_data->>'description'),''),nullif(p_data->>'monthly_price','')::numeric,coalesce(nullif(p_data->>'currency',''),'ARS'),nullif(btrim(p_data->>'support_description'),''),nullif(p_data->>'max_professionals','')::int,nullif(p_data->>'max_centers','')::int,nullif(p_data->>'max_internal_users','')::int,nullif(p_data->>'max_monthly_appointments','')::int,coalesce((p_data->>'patient_portal_enabled')::boolean,false),coalesce((p_data->>'institutional_pdf_enabled')::boolean,true),coalesce((p_data->>'communications_enabled')::boolean,true),coalesce((p_data->>'advanced_dashboard_enabled')::boolean,false),coalesce((p_data->>'active')::boolean,true)) returning * into result;
 else
  update public.commercial_plans set name=btrim(p_data->>'name'),description=nullif(btrim(p_data->>'description'),''),monthly_price=nullif(p_data->>'monthly_price','')::numeric,currency=coalesce(nullif(p_data->>'currency',''),currency),support_description=nullif(btrim(p_data->>'support_description'),''),max_professionals=nullif(p_data->>'max_professionals','')::int,max_centers=nullif(p_data->>'max_centers','')::int,max_internal_users=nullif(p_data->>'max_internal_users','')::int,max_monthly_appointments=nullif(p_data->>'max_monthly_appointments','')::int,patient_portal_enabled=coalesce((p_data->>'patient_portal_enabled')::boolean,false),institutional_pdf_enabled=coalesce((p_data->>'institutional_pdf_enabled')::boolean,true),communications_enabled=coalesce((p_data->>'communications_enabled')::boolean,true),advanced_dashboard_enabled=coalesce((p_data->>'advanced_dashboard_enabled')::boolean,false),active=coalesce((p_data->>'active')::boolean,true),updated_at=now() where id=target_id returning * into result;
 end if;
 return to_jsonb(result);
end; $$;

revoke all on function public.organization_commercial_account() from public,anon;
revoke all on function public.master_record_commercial_payment(uuid,jsonb) from public,anon;
revoke all on function public.master_void_commercial_payment(uuid,text) from public,anon;
grant execute on function public.organization_commercial_account() to authenticated;
grant execute on function public.master_record_commercial_payment(uuid,jsonb) to authenticated;
grant execute on function public.master_void_commercial_payment(uuid,text) to authenticated;

commit;
notify pgrst,'reload schema';
