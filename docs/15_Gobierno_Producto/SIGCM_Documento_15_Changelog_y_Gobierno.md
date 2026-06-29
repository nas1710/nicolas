# DOCUMENTO 15 – Gobierno del Producto, Versionado y Changelog

## Objetivo
Establecer las reglas para la evolución, mantenimiento y gobierno del SIGCM.

## Gobierno del producto
Toda nueva funcionalidad deberá:
- respetar la arquitectura definida;
- mantener compatibilidad con la versión vigente;
- documentarse antes de implementarse;
- incluir plan de pruebas y rollback.

## Versionado
Utilizar versionado semántico:
- MAJOR: cambios incompatibles.
- MINOR: nuevas funcionalidades compatibles.
- PATCH: correcciones y mejoras menores.

## Changelog
Cada versión deberá registrar:
- fecha;
- responsable;
- funcionalidades agregadas;
- errores corregidos;
- cambios de base de datos;
- cambios de infraestructura;
- impacto para usuarios.

## Gestión de cambios
Toda modificación funcional deberá actualizar:
- documentación;
- README;
- roadmap;
- casos de prueba;
- scripts SQL cuando corresponda.

## Calidad
No aceptar cambios sin validación funcional y técnica.

## Cierre
Estos quince documentos constituyen la base documental oficial del Sistema Integral de Gestión para Consultorios Médicos (SIGCM) y deberán evolucionar junto con el producto.
