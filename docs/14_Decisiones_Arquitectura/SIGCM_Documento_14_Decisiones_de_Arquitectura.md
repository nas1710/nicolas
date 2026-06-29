# DOCUMENTO 14 – Decisiones de Arquitectura

## Objetivo
Registrar las decisiones arquitectónicas oficiales del SIGCM para mantener coherencia durante la evolución del producto.

## Decisión 001
El paciente es único por tipo y número de documento.

## Decisión 002
El paciente no pertenece a un consultorio; los turnos y atenciones sí.

## Decisión 003
Los documentos masivos permanecen en repositorios externos; SIGCM administra metadatos, vínculos y auditoría.

## Decisión 004
Supabase Storage se utilizará para archivos livianos o generados por el sistema.

## Decisión 005
La seguridad se implementa mediante RLS y Edge Functions, nunca exclusivamente desde el frontend.

## Decisión 006
El usuario Master Admin permanece protegido y no puede ser eliminado o degradado.

## Decisión 007
Las secretarias ven por defecto todos los médicos de su sede; opcionalmente pueden restringirse por asignación.

## Decisión 008
Toda funcionalidad debe ser configurable antes que personalizada por código.

## Decisión 009
Cada botón ejecuta únicamente la acción que describe.

## Decisión 010
El producto se diseña como SaaS multiempresa preparado para comercialización.

## Gobierno de arquitectura
Toda modificación importante deberá justificar impacto, riesgos, compatibilidad y estrategia de rollback antes de implementarse.
