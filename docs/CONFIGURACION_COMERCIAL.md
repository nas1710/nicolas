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

## Alta de un cliente

1. Ingresar como Maestro y abrir `Clientes`.
2. Crear la organizacion, elegir plan y definir el identificador publico (`slug`).
3. Crear el primer Administrador desde la ficha del cliente.
4. El Administrador ingresa y completa marca, sedes, consultorios, catalogo y disponibilidad.
5. El Maestro cambia el estado de `CONFIGURACION` a `ACTIVA`.
6. La home queda disponible en `/?org=slug` y la turnera en `/turnos?org=slug`.

Una organizacion `SUSPENDIDA` o `BAJA` no permite acceso operativo ni publicacion. El cambio de plan nunca elimina informacion; los limites impiden nuevas altas criticas y conservan lo existente.

Las migraciones `12_commercial_onboarding.sql` y `13_tenant_isolation.sql` agregan planes, suscripciones, estados, auditoria y aislamiento RLS por `organization_id`.
