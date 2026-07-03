begin;

create or replace function public.public_commercial_catalog_for_slug(p_slug text) returns jsonb
language sql stable security definer set search_path=public as $$
with selected as(
  select id from public.organizations
  where lower(slug)=lower(p_slug) and commercial_status='ACTIVA' and active and published
  limit 1
)
select jsonb_build_object(
  'specialties',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'description',s.description) order by s.name) from public.specialties s,selected o where s.organization_id=o.id and s.active and s.published),'[]'::jsonb),
  'practices',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'specialty_id',p.specialty_id,'name',p.name,'description',p.description,'duration_min',p.duration_min) order by p.name) from public.practices p join public.specialties s on s.id=p.specialty_id join selected o on p.organization_id=o.id where p.active and p.published and s.active and s.published),'[]'::jsonb),
  'professionals',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'full_name',p.full_name,'specialty',coalesce(p.specialty,'Profesional de la salud'),
      'specialty_ids',(select coalesce(jsonb_agg(ps.specialty_id),'[]'::jsonb) from public.professional_specialties ps join public.specialties s on s.id=ps.specialty_id where ps.professional_id=p.id and s.organization_id=o.id),
      'practice_ids',(select coalesce(jsonb_agg(pp.practice_id),'[]'::jsonb) from public.professional_practices pp join public.practices pr on pr.id=pp.practice_id where pp.professional_id=p.id and pr.organization_id=o.id)
    ) order by p.full_name)
    from public.profiles p,selected o
    where p.organization_id=o.id and p.active and not coalesce(p.is_master,false)
      and p.role::text in('MEDICA_ADMIN','MEDICO') and p.public_booking_enabled
      and exists(select 1 from public.medical_availability ma join public.locations l on l.id=ma.location_id where ma.doctor_id=p.id and ma.enabled and l.organization_id=o.id)
  ),'[]'::jsonb),
  'locations',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'address',l.address) order by l.name) from public.locations l,selected o where l.organization_id=o.id and l.active),'[]'::jsonb)
); $$;

revoke all on function public.public_commercial_catalog_for_slug(text) from public;
grant execute on function public.public_commercial_catalog_for_slug(text) to anon,authenticated;

commit;
notify pgrst,'reload schema';
