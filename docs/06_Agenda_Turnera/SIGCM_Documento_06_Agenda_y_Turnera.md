# DOCUMENTO 06 – Agenda, Turnera y Gestión de Turnos

## Objetivo
Definir el funcionamiento integral de la agenda médica, la turnera pública y la administración de turnos.

## Agenda
La agenda debe soportar vistas diaria, semanal y mensual, filtrando por sede, médico y práctica.

## Turnos
Estados:
- Pendiente
- Confirmado
- Reprogramado
- Cancelado
- No asistió
- Finalizado

Registrar fecha, usuario responsable y motivo de cada cambio.

## Turnera pública
Debe permitir solicitar turnos sin autenticación.

Opciones:
- URL general.
- URL por médico.
- QR individual por médico.
- QR por sede.

## Flujo
Paciente -> Selecciona médico (o viene preseleccionado por QR) -> práctica -> fecha -> horario -> datos personales -> solicitud.

## Confirmación
Configurable:
- Confirmación automática.
- Confirmación manual por secretaria o médico.

## Lista de espera
Administrada por secretaria.
Cuando se libera un turno el sistema sugerirá pacientes compatibles.

## Notificaciones
Configurable por médico:
- correo;
- WhatsApp;
- ambos;
- ninguna.

El médico decide cuándo desea recibir avisos.

## Validaciones
Evitar superposición de turnos, vacaciones, feriados y bloqueos de agenda.

## Auditoría
Registrar creación, modificación, cancelación, aprobación y reasignación de turnos.

## Objetivo UX
Gestionar la mayor cantidad de acciones desde la agenda sin cambiar de pantalla.
