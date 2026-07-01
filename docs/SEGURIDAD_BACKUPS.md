# Seguridad y backups pre-produccion

## Estado y limites

- La home publica y `/turnos` solo consumen RPC publicos con datos expresamente publicados.
- `/login` usa Supabase Auth; las claves administrativas viven solo en Edge Functions.
- Los buckets `patient-files` y `professional-signatures` son privados.
- El portal de paciente todavia no esta implementado ni certificado. No publicar documentos a pacientes hasta completar y auditar ese flujo.
- Riesgo P0 pendiente: el modelo historico da acceso clinico amplio a roles medicos. Antes de cargar datos reales debe incorporarse una relacion paciente-profesional completa y luego restringir RLS sin perder historias existentes.

## Configuracion Supabase

1. Mantener RLS habilitado en todas las tablas funcionales.
2. Mantener `patient-files` y `professional-signatures` como buckets privados.
3. Configurar `Site URL` con el dominio productivo y Redirect URLs solo para dominios controlados y localhost de desarrollo.
4. Mantener `CORS_ORIGIN` limitado a produccion y localhost.
5. No copiar `SUPABASE_SERVICE_ROLE_KEY` a Vercel ni al frontend.
6. Activar MFA para Maestro y Administradores antes de usar datos reales.
7. Revisar semanalmente Auth, Edge Function logs, Security Advisor y auditoria.

## Backup recomendado

- Diario: exportacion automatizada o `pg_dump` cifrado de la base.
- Semanal: copia completa verificada y almacenada fuera del equipo de uso diario.
- Mensual: prueba de restauracion en un proyecto Supabase separado.
- Retencion sugerida: 7 diarios, 4 semanales y 6 mensuales.
- Tablas criticas: `profiles`, `patients`, `patient_locations`, `appointments`, `clinical_evolutions`, `studies`, `attachments`, `reports`, `communications`, `audit_logs`, catalogos y configuracion.
- Storage: respaldar objetos privados junto con sus metadatos de `attachments`; la base sola no contiene los archivos.

Ejemplo, desde una terminal segura con la cadena de conexion obtenida en Supabase:

```powershell
pg_dump --format=custom --no-owner --no-acl --file seguimiento_YYYYMMDD.dump "CONNECTION_STRING"
```

Restaurar primero en un entorno aislado:

```powershell
pg_restore --clean --if-exists --no-owner --no-acl --dbname "DESTINATION_CONNECTION_STRING" seguimiento_YYYYMMDD.dump
```

Nunca guardar connection strings, dumps, PDFs o archivos clinicos en Git, Drive publico ni carpetas sin cifrado.

## Checklist operativo

- Confirmar que un anonimo no puede seleccionar tablas internas.
- Confirmar que una Secretaria no puede leer `clinical_evolutions`.
- Confirmar que un Administrador no puede modificar al Maestro.
- Confirmar que firmas y adjuntos solo generan URLs temporales autenticadas.
- Revisar acciones `SESSION_*`, `USER_*` y cambios de configuracion en `audit_logs`.
- Probar restauracion y documentar fecha, responsable y resultado.
