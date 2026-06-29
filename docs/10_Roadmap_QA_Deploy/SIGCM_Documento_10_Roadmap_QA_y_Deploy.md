# DOCUMENTO 10 – Roadmap, QA y Despliegue

## Objetivo
Definir la evolución planificada del SIGCM, los criterios de calidad y el proceso de despliegue.

## Roadmap

### Versión 2.0
- Estabilización del sistema.
- Gestión completa de usuarios.
- Paciente único.
- Agenda profesional.
- Turnera pública.
- Historia clínica.
- Informes.
- Repositorios documentales.
- Correos y WhatsApp.

### Versión 2.1
- Dashboards avanzados.
- Estadísticas.
- QR por médico.
- Configuración institucional ampliada.

### Versión 3.0
- Multiempresa.
- WhatsApp Business API.
- Sincronizador de escritorio.
- Integraciones externas.

## QA

Validar:
- autenticación;
- permisos;
- RLS;
- alta de pacientes;
- turnos;
- historia clínica;
- informes;
- exportaciones;
- auditoría;
- rendimiento.

## Despliegue

Entregar siempre:
- cambios React;
- SQL;
- Edge Functions;
- variables de entorno;
- pasos para Supabase;
- pasos para GitHub;
- pasos para Vercel;
- checklist de producción.

## Rollback

Toda modificación crítica debe poder revertirse mediante scripts documentados y respaldo previo.

## Mantenimiento

Mantener changelog, versionado semántico y documentación sincronizada con el código.
