# DOCUMENTO 04 – Modelo de Datos y Reglas de Negocio

## Objetivo
Definir el modelo conceptual de información del SIGCM y las reglas de negocio que deberán respetarse en toda implementación.

## Entidades principales

- Organización
- Consultorio / Sede
- Profesional
- Secretaria
- Usuario
- Rol
- Paciente
- Turno
- Agenda
- Historia Clínica
- Evolución
- Práctica
- Informe
- Documento
- Obra Social
- Configuración
- Auditoría

## Reglas fundamentales

### Paciente
- Único por tipo y número de documento.
- No pertenece a un consultorio.
- Puede atenderse en múltiples sedes y con múltiples profesionales.

### Turno
- Pertenece a un consultorio y a un profesional.
- Puede originarse por secretaria, médico o turnera pública.
- Estados: pendiente, confirmado, cancelado, reprogramado, no asistió, finalizado.

### Historia Clínica
- Pertenece al paciente.
- Se organiza cronológicamente.
- Debe admitir evoluciones, diagnósticos, antecedentes, medicación, alergias e informes.

### Documentos
- Se vinculan al paciente.
- El archivo físico puede residir en un repositorio externo.
- El sistema almacena metadatos y auditoría.

### Usuarios
- Master Admin protegido.
- Administrador.
- Médico.
- Secretaria.
- Paciente (sin login para turnera pública en versión inicial).

## Relaciones conceptuales

Paciente 1:N Turnos

Paciente 1:N Evoluciones

Paciente 1:N Informes

Profesional 1:N Turnos

Consultorio 1:N Profesionales

Secretaria N:M Profesionales (configurable)

## Auditoría

Registrar:
- altas;
- bajas;
- modificaciones;
- envíos;
- aprobaciones;
- cambios de permisos;
- accesos relevantes.

## Normalización

Normalizar:
- nombres propios;
- obras sociales;
- teléfonos;
- documentos;
- fechas.

Evitar duplicados mediante reglas de negocio y restricciones en base de datos.

## Escalabilidad

Preparar todas las entidades para soportar múltiples organizaciones sin rediseñar el modelo.
