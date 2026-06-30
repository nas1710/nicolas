-- Datos opcionales para documentos institucionales. No elimina ni modifica datos existentes.
alter table public.profiles add column if not exists specialty text;
alter table public.profiles add column if not exists professional_license text;
alter table public.profiles add column if not exists signature_name text;
alter table public.profiles add column if not exists institution_name text;
alter table public.profiles add column if not exists institutional_footer text;

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
  if public.current_role() is null or public.current_role() = 'SECRETARIA' then
    raise exception 'Solo un profesional autorizado puede configurar documentos clinicos.';
  end if;
  update public.profiles set
    specialty=nullif(btrim(p_specialty),''), professional_license=nullif(btrim(p_professional_license),''),
    signature_name=nullif(btrim(p_signature_name),''), institution_name=nullif(btrim(p_institution_name),''),
    institutional_footer=nullif(btrim(p_institutional_footer),''), updated_at=now()
  where id=auth.uid() and active returning * into result;
  return result;
end; $$;
grant execute on function public.update_my_document_profile(text,text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
