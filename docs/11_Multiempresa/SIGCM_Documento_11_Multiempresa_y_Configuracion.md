# DOCUMENTO 11 – Multiempresa y Configuración

## Objetivo
Definir cómo el SIGCM soportará múltiples organizaciones sin modificar el código base.

## Organización
Cada cliente representa una organización independiente con su identidad, usuarios, sedes, profesionales y configuración.

## Configuración editable
- Nombre comercial
- Logo
- Colores
- Dominio
- Correos institucionales
- Plantillas
- QR
- Obras sociales
- Prácticas
- Consultorios
- Repositorios documentales
- Notificaciones

## Profesionales
Cada médico configura:
- horarios;
- especialidades;
- prácticas;
- correo personal;
- correo laboral;
- firma;
- repositorios;
- preferencias de avisos.

## Secretarias
Por defecto administran todos los médicos de la sede. Opcionalmente pueden restringirse a profesionales específicos.

## Escalabilidad
Toda configuración debe almacenarse en base de datos, evitando personalizaciones de código para cada cliente.

## Marca blanca
Preparar el sistema para venderse con identidad visual propia de cada organización.
