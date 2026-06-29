# DOCUMENTO 17 – Modelo Entidad Relación (Conceptual)

## Objetivo
Definir el modelo conceptual de entidades y relaciones del SIGCM para servir como base del diseño físico de la base de datos.

## Entidades principales
- Organización
- Sede
- Consultorio
- Usuario
- Rol
- Profesional
- Secretaria
- Paciente
- Agenda
- Turno
- Práctica
- Historia Clínica
- Evolución
- Diagnóstico
- Medicación
- Documento
- Informe
- Repositorio Documental
- Obra Social
- Configuración
- Auditoría

## Relaciones
Organización 1:N Sedes
Sede 1:N Profesionales
Profesional N:M Secretarias
Paciente 1:N Turnos
Paciente 1:N Evoluciones
Paciente 1:N Informes
Paciente 1:N Documentos
Profesional 1:N Agendas
Agenda 1:N Turnos
Repositorio 1:N Documentos

## Reglas
- Paciente único por documento.
- Historia clínica única por paciente.
- Turnos asociados a agenda y profesional.
- Documentos vinculados por metadatos.
- Auditoría transversal sobre entidades críticas.

## Evolución
El modelo debe admitir nuevas especialidades, organizaciones y módulos sin rediseño estructural.
