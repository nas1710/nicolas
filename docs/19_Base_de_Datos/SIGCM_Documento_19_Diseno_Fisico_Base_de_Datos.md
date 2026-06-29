# DOCUMENTO 19 – Diseño Físico de Base de Datos

## Objetivo
Definir la estructura física recomendada de la base de datos del SIGCM para PostgreSQL/Supabase.

## Esquema principal
El modelo físico deberá organizarse en módulos funcionales:

- Seguridad (profiles, roles, permissions)
- Organizaciones
- Sedes y consultorios
- Profesionales
- Secretarias
- Pacientes
- Agendas
- Turnos
- Historia clínica
- Evoluciones
- Diagnósticos
- Medicación
- Prácticas
- Informes
- Documentos
- Repositorios documentales
- Obras sociales
- Configuración
- Auditoría

## Recomendaciones

Todas las tablas deberán incluir:

- id UUID
- created_at
- updated_at
- created_by
- updated_by
- active (cuando corresponda)

## Índices

Crear índices sobre:

- documento del paciente
- agenda
- fecha de turno
- profesional
- organización
- sede
- estado del turno

## Claves foráneas

Mantener integridad referencial en todas las relaciones críticas.

## Row Level Security

Aplicar políticas específicas por tabla según:

- Master Admin
- Administrador
- Médico
- Secretaria
- Paciente (futuro)

## Buckets

Separar buckets por finalidad:

- avatars
- attachments
- generated-pdf
- temporary

No almacenar estudios masivos.

## Migraciones

Toda modificación estructural deberá entregarse mediante scripts SQL versionados y ejecutables.

## Auditoría

Toda modificación crítica deberá registrarse en audit_log.

## Evolución

El diseño deberá permitir incorporar nuevos módulos sin rediseñar la estructura existente.
