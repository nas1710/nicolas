# DOCUMENTO 05 – Usuarios, Roles y Seguridad

## Objetivo
Definir el modelo de usuarios, permisos y seguridad del SIGCM.

## Principios
- Seguridad basada en roles y Row Level Security.
- El frontend nunca define permisos reales.
- Todas las operaciones críticas quedan auditadas.

## Roles

### Master Admin
Usuario máximo del sistema.
- No puede ser eliminado ni degradado.
- Administra organizaciones, usuarios, roles, configuraciones y auditoría.
- Puede resetear contraseñas y desbloquear cuentas.

### Administrador
Gestiona la organización, consultorios, médicos, secretarias, obras sociales y parámetros.

### Médico
Accede únicamente a la información de sus pacientes y agenda.
No modifica información clínica de otros médicos.

### Secretaria
Por defecto visualiza todos los médicos de la sede.
Opcionalmente puede limitarse a determinados profesionales.
Gestiona turnos, comunicaciones, lista de espera y tareas administrativas.

### Paciente
En la versión inicial solicita turnos sin autenticación.
Futuras versiones podrán incorporar portal del paciente.

## Gestión de usuarios
Toda administración debe realizarse desde la aplicación:
- alta;
- baja lógica;
- activación;
- desactivación;
- cambio de rol;
- reseteo de contraseña;
- bloqueo/desbloqueo.

No depender del panel de Supabase para tareas operativas.

## Autenticación
Login mediante correo electrónico y contraseña.
Debe existir opción "Recordarme".
Recuperación de contraseña mediante flujo seguro.

## Auditoría
Registrar:
- inicio de sesión;
- cierre de sesión;
- altas;
- bajas;
- cambios de permisos;
- modificaciones críticas;
- envíos de informes.

## Seguridad técnica
- Service Role solo en Edge Functions.
- Variables sensibles fuera del frontend.
- Buckets privados.
- Enlaces temporales para archivos cuando corresponda.

## Reglas
- El usuario maestro permanece protegido.
- Un médico no administra otro médico.
- Una secretaria nunca accede a información clínica restringida sin autorización.
- Toda decisión de permisos debe poder ampliarse mediante configuración futura.
