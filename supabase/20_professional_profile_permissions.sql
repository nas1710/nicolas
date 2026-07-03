-- Separa privilegio administrativo de identidad profesional.
-- Solo MEDICO/MEDICA_ADMIN puede mantener matricula y firma propias.

create or replace function public.update_my_document_profile(
  p_specialty text,
  p_professional_license text,
  p_signature_name text,
  p_institution_name text,
  p_institutional_footer text
) returns public.profiles
language plpgsql security definer set search_path=public as $$
declare result public.profiles;
begin
  if public.current_role()::text not in ('MEDICO','MEDICA_ADMIN') then
    raise exception 'Solo un profesional medico puede configurar su perfil y documentos.';
  end if;
  update public.profiles set
    specialty=nullif(btrim(p_specialty),''), professional_license=nullif(btrim(p_professional_license),''),
    signature_name=nullif(btrim(p_signature_name),''), institution_name=nullif(btrim(p_institution_name),''),
    institutional_footer=nullif(btrim(p_institutional_footer),''), updated_at=now()
  where id=auth.uid() and active returning * into result;
  return result;
end; $$;

create or replace function public.set_my_signature_path(p_signature_path text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if public.current_role()::text not in ('MEDICO','MEDICA_ADMIN') then
    raise exception 'Solo un profesional medico puede guardar su firma.';
  end if;
  if nullif(btrim(p_signature_path),'') is not null and p_signature_path not like auth.uid()::text || '/%' then
    raise exception 'Ruta de firma no valida.';
  end if;
  update public.profiles set signature_path=nullif(btrim(p_signature_path),''),updated_at=now()
  where id=auth.uid() and active;
end; $$;

drop policy if exists "professional signatures read" on storage.objects;
drop policy if exists "professional signatures insert own" on storage.objects;
drop policy if exists "professional signatures update own" on storage.objects;
drop policy if exists "professional signatures delete own" on storage.objects;

create policy "professional signatures read" on storage.objects for select to authenticated using (
  bucket_id='professional-signatures' and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.current_user_is_master()
    or (
      public.current_role()::text='ADMINISTRADOR'
      and exists(
        select 1 from public.profiles professional
        where professional.id::text=(storage.foldername(name))[1]
          and professional.organization_id=public.current_organization_id()
          and professional.role::text in('MEDICO','MEDICA_ADMIN')
      )
    )
  )
);
create policy "professional signatures insert own" on storage.objects for insert to authenticated with check (
  bucket_id='professional-signatures'
  and (storage.foldername(name))[1]=auth.uid()::text
  and public.current_role()::text in('MEDICO','MEDICA_ADMIN')
);
create policy "professional signatures update own" on storage.objects for update to authenticated using (
  bucket_id='professional-signatures'
  and (storage.foldername(name))[1]=auth.uid()::text
  and public.current_role()::text in('MEDICO','MEDICA_ADMIN')
) with check (
  bucket_id='professional-signatures'
  and (storage.foldername(name))[1]=auth.uid()::text
  and public.current_role()::text in('MEDICO','MEDICA_ADMIN')
);
create policy "professional signatures delete own" on storage.objects for delete to authenticated using (
  bucket_id='professional-signatures'
  and (storage.foldername(name))[1]=auth.uid()::text
  and public.current_role()::text in('MEDICO','MEDICA_ADMIN')
);

grant execute on function public.update_my_document_profile(text,text,text,text,text) to authenticated;
grant execute on function public.set_my_signature_path(text) to authenticated;
notify pgrst,'reload schema';
