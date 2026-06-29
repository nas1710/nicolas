# DOCUMENTO 01 – Visión y Filosofía del SIGCM

Versión 1.0

## Propósito

Este documento define la visión estratégica del Sistema Integral de Gestión para Consultorios Médicos (SIGCM). Constituye la base conceptual sobre la cual deberán tomarse todas las decisiones funcionales y técnicas del producto.

## Visión

SIGCM será una plataforma SaaS configurable destinada a consultorios, centros médicos y clínicas, permitiendo administrar pacientes, agendas, historias clínicas, documentación, comunicación con pacientes y procesos administrativos desde una única aplicación.

El producto no estará diseñado para un único consultorio sino para ser comercializado a múltiples organizaciones de salud mediante un modelo multiempresa.

## Principios

- El paciente es único por documento.
- Los turnos pertenecen a un consultorio; el paciente no.
- Toda acción relevante debe quedar auditada.
- Cada botón debe ejecutar exactamente la acción que describe.
- La configuración debe prevalecer sobre el desarrollo específico.
- La interfaz debe ser simple, profesional y consistente.
- La seguridad se implementa en backend mediante RLS.
- El sistema debe funcionar inicialmente sobre Supabase Free y Vercel Hobby.

## Actores

Master Admin, Administrador, Médico, Secretaria y Paciente.

## Objetivos funcionales

Administración de usuarios, pacientes, agendas, turnos, historia clínica, documentos, informes, repositorios documentales, comunicaciones por correo y WhatsApp, reportes, dashboards y configuración institucional.

## Repositorio documental

El sistema administrará referencias a documentos. Los archivos podrán residir en Google Drive, OneDrive, iCloud, Dropbox, NAS, carpetas locales (mediante sincronizador futuro) o Supabase Storage.

## Criterios de calidad

Escalabilidad, mantenibilidad, seguridad, trazabilidad, experiencia de usuario y capacidad de comercialización.

## Alcance inicial

Producto SaaS configurable para múltiples especialidades médicas, con foco inicial en cardiología.

Este documento debe ser considerado la fuente de verdad para la visión del producto y será complementado por los documentos siguientes.
