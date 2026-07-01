# Configuracion comercial

La aplicacion usa una organizacion activa. Su identidad se administra desde `Ajustes > Organizacion y marca` y alimenta la pagina publica, la turnera, los documentos y las comunicaciones.

## Conceptos

- **Organizacion:** titular comercial o institucional. Define nombre, logo, colores, contacto, textos publicos y pie legal.
- **Sede o centro:** agrupador comercial o fisico, por ejemplo una clinica con varias areas de atencion.
- **Consultorio:** lugar concreto donde se agenda y atiende. Conserva direccion, disponibilidad y turnos.
- **Profesional:** usuario asistencial publicado. Puede asociarse a varias especialidades, practicas y consultorios, sin permitir superposiciones horarias.

La agenda y los turnos siguen vinculados al consultorio. La sede organiza consultorios sin reemplazar esa relacion.

## Configuracion inicial

1. Ejecutar `supabase/11_commercial_branding.sql` despues de las migraciones anteriores.
2. Ingresar como Master o Administrador.
3. Abrir `Ajustes > Organizacion y marca`.
4. Completar nombre comercial, contacto, colores, textos y logo.
5. Crear las sedes necesarias.
6. En el catalogo comercial, publicar especialidades y practicas y asignarlas a cada profesional.
7. Asignar los consultorios en los que trabaja cada profesional.

## Preparacion multi-organizacion

Las entidades principales incluyen `organization_id` y las nuevas asociaciones no dependen de nombres hardcodeados. La version actual opera una organizacion activa por proyecto; habilitar varias organizaciones en una misma instalacion requerira seleccionar organizacion en login, reforzar todas las policies RLS por pertenencia y aislar Storage por prefijo.

No debe activarse ese modo solamente agregando registros a `organizations`: el aislamiento de acceso debe completarse primero.
