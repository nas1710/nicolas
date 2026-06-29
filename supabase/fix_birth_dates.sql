-- Corrige el error historico de fechas como 42026-04-14.
-- Ejecutar una vez desde Supabase > SQL Editor.

begin;

alter table public.patients
  add column if not exists document_type text not null default 'DNI';

drop trigger if exists protect_patient_identity on public.patients;

update public.patients
set birth_date = make_date(
  mod(extract(year from birth_date)::int, 10000),
  extract(month from birth_date)::int,
  extract(day from birth_date)::int
)
where extract(year from birth_date)::int between 10000 and 99999
  and mod(extract(year from birth_date)::int, 10000)
    between 1900 and extract(year from current_date)::int;

create trigger protect_patient_identity
before update of first_name, last_name, document_type, document, birth_date on public.patients
for each row execute function public.prevent_patient_identity_update();

commit;

select first_name, last_name, birth_date
from public.patients
order by last_name, first_name;
