# Seguimiento Pacientes - Supabase Free + Vercel

Arquitectura economica para bajar costo mensual:

- Frontend: React + TypeScript + Vite.
- Deploy frontend: Vercel Hobby Free.
- Backend/API/Auth/DB: Supabase Free.
- Base principal: PostgreSQL de Supabase.
- Login: Supabase Auth.
- Permisos: Row Level Security.

No hay backend Node/Express en esta version. La seguridad no depende de ocultar botones en React: las reglas importantes estan en SQL/RLS.

## Carpetas

```text
frontend/
  src/
    api/supabase.ts
    main.tsx
    styles.css
supabase/
  schema.sql
  reset_for_retry.sql
  patch_existing_db.sql
  master_and_passwords.sql
  functions/admin-manage-user/index.ts
```

## Variables de entorno del frontend

Crear `frontend/.env` localmente, sin subirlo:

```env
VITE_SUPABASE_URL="https://TU-PROYECTO.supabase.co"
VITE_SUPABASE_ANON_KEY="TU_ANON_KEY_PUBLICA"
```

La anon key de Supabase es publica, pero no debe usarse service role key en frontend.

## Crear proyecto en Supabase

1. Ir a Supabase.
2. Crear proyecto Free.
3. Guardar:
   - Project URL
   - anon public key
4. Ir a SQL Editor.
5. Para una base nueva, ejecutar completos y en este orden:

```text
supabase/schema.sql
supabase/public_booking.sql
```

En **Authentication > URL Configuration**, configurar la URL publicada como
`Site URL` y agregar tanto `http://localhost:5173` como la URL de Vercel en
`Redirect URLs`. Esto permite que los correos de confirmacion y recuperacion
vuelvan a la pantalla de nueva contrasena de la app.

Para la base que ya esta publicada, usar la ruta consolidada:

```text
supabase/01_consolidar_base_actual.sql
supabase/public_booking.sql
```

El orden completo y el inventario estan en `supabase/README_MIGRACIONES.md`.
Los parches anteriores se conservan como historial y no deben ejecutarse todos
en cadena sobre una base consolidada.

La base publicada conserva protegido como usuario maestro a `nas1710@gmail.com`:
otro administrador no puede cambiarle rol, consultorio, estado ni privilegios.

## Rutas publicas e internas

- `/`: home publica que lee de Supabase especialidades, profesionales publicados, practicas y consultorios activos.
- `/turnos`: turnera publica; comienza por especialidad y ofrece profesionales, practicas y horarios reales.
- `/login`: acceso interno para Master, Administrador, Medico y Secretaria.

`frontend/vercel.json` reescribe estas rutas a la SPA, por lo que pueden abrirse o actualizarse directamente sin error 404.

Ese SQL crea:

- tablas
- relaciones
- roles
- funciones de permiso
- RLS
- auditoria
- validacion de turnos contra disponibilidad medica
- bucket privado `patient-files` para adjuntos
- catalogos ficticios

## Crear primera medica/admin

La primera medica/admin se crea una sola vez desde Supabase, porque todavia no hay nadie logueado con permisos para administrar usuarios.

La ruta oficial ya incluye pacientes unicos por tipo y numero de documento y
deja `patient_locations` como unica relacion vigente entre pacientes y
consultorios. No ejecutar parches historicos sobre una base consolidada.

En Supabase:

1. Authentication > Users.
2. Crear usuaria medica.
3. Copiar el UUID del usuario.

Luego en SQL Editor crear su perfil:

```sql
insert into public.profiles (id, email, full_name, role, location_id)
values
  ('UUID_DE_MEDICA', 'medica.demo@example.com', 'Dra. Demo', 'MEDICA_ADMIN', null);
```

Despues, desde la app, la medica/admin puede entrar a **Ajustes > Usuarios** y crear secretarias o medicos nuevos.

## Permisos

`MEDICA_ADMIN` y `MEDICO`:

- ve todo
- edita todo
- ve evoluciones clinicas, diagnosticos y notas medicas
- ve auditoria
- administra sedes, obras sociales y usuarios desde la app

`SECRETARIA`:

- solo ve datos de su sede
- puede gestionar pacientes, turnos, estudios administrativos, reportes y comunicaciones de su sede
- no puede ver `clinical_evolutions`
- no puede ver pacientes/turnos/reportes de otra sede
- puede adjuntar estudios/archivos administrativos de pacientes de su sede

## Adjuntar estudios externos o previos

Desde la ficha del paciente se puede usar **Adjuntar estudio** para cargar:

- PDF enviado por el paciente
- foto de estudio previo
- video
- orden medica
- informe propio buscado manualmente en otra carpeta
- archivo externo que no viene de Cardiovex/Eccosur

Hay dos modos:

- **Google Drive**: se pega el enlace del archivo guardado en Drive. La app no copia el PDF a Supabase; registra el vinculo en `attachments`.
- **Subir copia**: se sube una copia al bucket privado `patient-files` y se registra en `attachments`.

Importante:

- No queda marcado como pendiente de envio.
- Queda archivado en la historia/ficha del paciente.
- RLS controla que una secretaria solo pueda subir/ver adjuntos de pacientes de su sede.
- Si se usa Google Drive, el acceso al archivo lo siguen controlando los permisos de Drive. Revisar que la medica/secretaria autorizada pueda abrir el enlace.
- En una app de escritorio futura se puede sumar carpeta vigilada para Cardiovex/Eccosur y seleccion de rutas locales mas comoda.

## PDF institucional

Desde la ficha clinica, los usuarios internos con acceso clinico pueden usar
**Generar documento PDF** para descargar bajo demanda historia clinica,
informe medico, constancia de atencion, resumen o indicaciones.

El archivo A4 se genera localmente en el navegador y no se guarda
automaticamente en Supabase. Toma los datos disponibles del paciente,
profesional, especialidad, matricula, practica y consultorio. Los campos
profesionales opcionales se agregan con
`supabase/04_institutional_pdf_profiles.sql`.

Cada profesional puede cargar una firma escaneada JPG, PNG o WEBP de hasta
2 MB. Se guarda en el bucket privado `professional-signatures`; el PDF solicita
una URL temporal solo al generarse y nunca publica la firma anonimamente.

## Pacientes y turnos

## Dashboard y reportes

El Inicio usa `dashboard_report` para mostrar métricas según el rol. Master y
Administrador ven toda la operación; cada profesional ve sus turnos y cada
Secretaria ve su consultorio. Incluye filtros por fechas, profesional,
especialidad, práctica, consultorio, estado y origen, además de exportación CSV
de los turnos visibles. Ejecutar `supabase/07_dashboard_reporting.sql`.

Desde **Pacientes**:

- la medica/admin puede cargar evoluciones clinicas, diagnostico, indicaciones y proximo control
- secretaria y medica/admin pueden cargar notas administrativas
- se pueden editar telefono, email, obra social, nro. de afiliado y sede
- nombre, DNI y fecha de nacimiento quedan bloqueados en frontend y SQL para evitar errores de identidad
- fecha de nacimiento se carga como `dd/mm/aaaa`
- **Dar de baja** no borra la historia: marca el paciente como `baja`

Desde **Agenda > Nuevo turno**:

- se puede elegir un paciente existente
- tambien se puede cargar un paciente nuevo en el mismo formulario del turno
- la sede y el horario se validan contra la disponibilidad medica configurada
- si la fecha/hora elegida no corresponde a esa sede, la app no deja guardar el turno
- Supabase tambien lo valida con trigger SQL, asi que no alcanza con saltear el frontend
- los turnos se organizan en bloques de 15 minutos
- la agenda muestra visualmente horarios libres y ocupados

Desde **Ajustes > Disponibilidad medica**:

- se define en que sede atiende la medica
- se define que dia atiende
- se define horario desde/hasta
- esos horarios alimentan la agenda y bloquean turnos fuera de disponibilidad

## Desarrollo local

```bash
cd frontend
npm install
npm run dev
```

Abrir la URL local de Vite.

## Alta y blanqueo de usuarios

La medica/admin crea usuarios desde **Usuarios**. El alta confirma internamente
el email y no depende del correo de confirmacion de Supabase. Al blanquear una
clave, la contrasena provisoria pasa a ser el DNI del usuario y la app obliga a
reemplazarla en el siguiente ingreso.

Publicar la funcion segura desde una terminal con Supabase CLI:

```bash
npx --yes supabase@latest login
npx --yes supabase@latest functions deploy admin-manage-user --project-ref TU_PROJECT_REF
npx --yes supabase@latest secrets set "CORS_ORIGIN=https://cardioayala.vercel.app,http://localhost:5173" --project-ref TU_PROJECT_REF
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son provistas
automaticamente por Supabase dentro de la Edge Function. La service role nunca
se copia al frontend ni a Vercel.

Antes de usar la administracion de usuarios, ejecutar la ruta oficial indicada
en `supabase/README_MIGRACIONES.md` y desplegar la Edge Function.

## Deploy en Vercel Hobby Free

1. Subir este proyecto a un repositorio Git.
2. Crear proyecto en Vercel.
3. Root directory:

```text
frontend
```

4. Build command:

```bash
npm run build
```

5. Output directory:

```text
dist
```

6. Environment variables:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY_PUBLICA
```

7. Deploy.

## Probar login

1. Entrar al frontend publicado.
2. Login medica:
   - debe ver usuarios y todas las sedes.
   - debe ver evoluciones clinicas.
3. Login secretaria:
   - solo debe ver pacientes/turnos/reportes de su sede.
   - no debe ver evoluciones clinicas.

Si una secretaria ve datos de otra sede, revisar:

- `profiles.location_id`
- politicas RLS
- que la tabla tenga `location_id` correcto

## Turnos publicos sin login

La pagina publica queda disponible en:

```text
https://cardioayala.vercel.app/turnos
```

En una base nueva, ejecutar en Supabase SQL Editor y en este orden:

```text
supabase/schema.sql
supabase/public_booking.sql
```

`public_booking.sql`:

- vincula cada disponibilidad y cada turno con un profesional
- asigna los horarios existentes al usuario maestro
- publica solo nombres de profesionales y horarios libres
- no permite leer pacientes ni turnos desde el acceso anonimo
- vuelve a validar disponibilidad y superposiciones al confirmar
- crea o vincula al paciente por tipo y numero de documento
- registra el turno como `PENDIENTE`
- limita solicitudes repetidas para un mismo documento

Para que un profesional aparezca en la pagina publica debe estar activo, tener
rol `MEDICO` (se conserva compatibilidad con `MEDICA_ADMIN`), estar publicado,
tener especialidades/practicas asociadas y al menos un horario de disponibilidad.

Master y Administrador gestionan el catalogo comercial desde Ajustes. Las
especialidades, practicas y duraciones son datos editables de Supabase; no son
la lista fija de Cardiologia del prototipo.

El archivo `frontend/vercel.json` hace que Vercel sirva correctamente la ruta
`/turnos` al abrirla o actualizarla directamente.

## Checklist RLS

Probar con una cuenta `SECRETARIA`:

- no puede seleccionar filas de `clinical_evolutions`
- no puede ver pacientes de otra sede
- no puede ver turnos de otra sede
- no puede ver adjuntos de pacientes de otra sede
- no puede modificar `profiles.role`
- no puede crear turnos fuera de la disponibilidad de su sede

Probar con una cuenta `MEDICA_ADMIN`:

- puede ver evoluciones clinicas
- puede administrar sedes y obras sociales
- puede crear usuarios desde la app
- puede ver auditoria

## Backup/exportacion

Opciones gratuitas/bajo costo:

1. Supabase Dashboard > Table Editor > Export CSV por tabla.
2. Supabase SQL Editor:

```sql
select * from public.patients;
select * from public.appointments;
select * from public.studies;
select * from public.reports;
```

3. Para backup completo, usar `pg_dump` desde una computadora autorizada con la connection string de Supabase.

No guardar backups con datos de salud en carpetas publicas.

## Datos reales

No usar datos reales en seeds. El SQL incluye solo catalogos ficticios y sedes demo.

Los datos de salud son sensibles. No subir `.env`, service role keys, exports, backups ni PDFs reales a repositorios o carpetas publicas. Para produccion, activar MFA en cuentas admin y guardar backups cifrados.

## Pendientes recomendados

- Plantillas de WhatsApp/email.
- Exportacion automatizada cifrada.
