alter table public.profiles add column if not exists signature_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('professional-signatures','professional-signatures',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "professional signatures read" on storage.objects;
drop policy if exists "professional signatures insert own" on storage.objects;
drop policy if exists "professional signatures update own" on storage.objects;
drop policy if exists "professional signatures delete own" on storage.objects;
create policy "professional signatures read" on storage.objects for select using (
  bucket_id='professional-signatures' and auth.uid() is not null and ((storage.foldername(name))[1]=auth.uid()::text or public.current_user_is_master())
);
create policy "professional signatures insert own" on storage.objects for insert with check (
  bucket_id='professional-signatures' and (storage.foldername(name))[1]=auth.uid()::text and public.current_role()::text in ('MEDICA_ADMIN','ADMINISTRADOR')
);
create policy "professional signatures update own" on storage.objects for update using (
  bucket_id='professional-signatures' and (storage.foldername(name))[1]=auth.uid()::text
) with check (bucket_id='professional-signatures' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "professional signatures delete own" on storage.objects for delete using (
  bucket_id='professional-signatures' and (storage.foldername(name))[1]=auth.uid()::text
);

create or replace function public.set_my_signature_path(p_signature_path text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if public.current_role() is null or public.current_role()::text not in ('MEDICA_ADMIN','ADMINISTRADOR') then raise exception 'Acceso no autorizado.'; end if;
  if nullif(btrim(p_signature_path),'') is not null and p_signature_path not like auth.uid()::text || '/%' then raise exception 'Ruta de firma no valida.'; end if;
  update public.profiles set signature_path=nullif(btrim(p_signature_path),''),updated_at=now() where id=auth.uid();
end; $$;
grant execute on function public.set_my_signature_path(text) to authenticated;
notify pgrst, 'reload schema';
