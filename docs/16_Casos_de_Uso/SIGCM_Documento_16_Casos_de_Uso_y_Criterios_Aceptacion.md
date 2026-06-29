# DOCUMENTO 16 – Casos de Uso y Criterios de Aceptación

## Objetivo
Definir los principales casos de uso del SIGCM y los criterios mínimos para considerar una funcionalidad aceptada.

## Caso de uso: Alta de paciente
Actor: Secretaria o Médico.
Resultado esperado: paciente único creado o reutilizado si ya existe.

Criterios:
- valida documento;
- evita duplicados;
- normaliza datos;
- registra auditoría.

## Caso de uso: Solicitud de turno
Actor: Paciente.
Resultado esperado: turno pendiente o confirmado según configuración.

## Caso de uso: Confirmación de turno
Actor: Secretaria o Médico.
Resultado esperado: paciente notificado por el canal configurado.

## Caso de uso: Vinculación de informes
Actor: Secretaria o Médico.
Resultado esperado: documentos asociados al paciente correcto y disponibles desde la historia clínica.

## Caso de uso: Envío de informes
Actor: Secretaria o Médico.
Resultado esperado: envío por correo, WhatsApp o ambos, con auditoría.

## Caso de uso: Administración de usuarios
Actor: Master Admin.
Resultado esperado: alta, baja, activación, desactivación, cambio de rol y reseteo de contraseña desde la aplicación.

## Criterios generales
Toda funcionalidad deberá:
- respetar permisos;
- registrar auditoría;
- manejar errores claramente;
- mantener consistencia de datos;
- superar las pruebas funcionales antes del despliegue.
