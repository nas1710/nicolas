-- Los adjuntos de Google Drive usan external_url y no tienen storage_path.
alter table public.attachments
  alter column storage_path drop not null;
