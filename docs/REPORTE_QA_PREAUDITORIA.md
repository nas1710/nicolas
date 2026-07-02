# Reporte QA y preauditoria

Fecha: 2 de julio de 2026  
Entorno: produccion `cardioayala.vercel.app`, Supabase y build local.

## Alcance validado

- Navegacion publica: `/`, `/login` y `/turnos`.
- Catalogo comercial, profesionales publicados, practicas y disponibilidad real.
- Reserva publica y proteccion contra doble asignacion concurrente.
- Separacion organizacional y acceso clinico por profesional.
- Administracion de usuarios, proteccion del Maestro y restablecimiento de clave.
- Pacientes, agenda, historia clinica cronologica, estudios y PDF institucional.
- Ajustes de consultorios, disponibilidad, obras sociales y dias no laborables.
- Compilacion TypeScript/Vite y despliegue SPA.

## Pruebas ejecutadas

| Prueba | Resultado | Evidencia |
| --- | --- | --- |
| Catalogo y turnos anonimos | OK | La API anonima devuelve solo catalogo publicado y horarios disponibles. |
| Fechas pasadas | OK | La funcion publica rechaza horarios anteriores a la hora actual. |
| Doble reserva concurrente | OK | Dos solicitudes simultaneas: 1 creada y 1 rechazada con `Ese horario ya no esta disponible.` |
| Login Administrador | OK con cambio obligatorio | Auth acepto el acceso y redirigio a cambio de clave provisoria. |
| Usuario Maestro oculto | OK por implementacion | La funcion de usuarios excluye `is_master`; el Maestro queda protegido por backend y trigger. |
| Build frontend | OK | `tsc && vite build`; solo advertencia de tamano de bundle. |
| Responsive turnera | OK | Probada en escritorio y 390 px sin desborde horizontal. |
| Historia cronologica | OK funcional | Evoluciones, turnos, estudios y adjuntos aparecen en una linea temporal. |
| Firma por autor | OK funcional | El PDF usa el profesional autor; si no hay firma muestra solo el bloque profesional. |

Los recorridos completos de Medico y Secretaria requieren credenciales de prueba propias. Sus permisos se revisaron contra RLS, Edge Functions y renderizado por rol, pero deben repetirse como prueba de aceptacion antes de cargar datos reales.

## Hallazgos priorizados

### P0 - Resolver antes de una auditoria o datos reales

1. **Cierre e inalterabilidad de registros clinicos.** Existe auditoria y estado de registro, pero una evolucion aun no tiene un flujo completo de cierre, enmienda firmada y prohibicion irreversible de sobrescritura. Una correccion clinica debe agregarse como enmienda, nunca reemplazar silenciosamente el original.
2. **Prueba reproducible de recuperacion.** Hay estrategia de backup, pero falta evidencia periodica documentada de restauracion completa, con tiempos, responsable y resultado.
3. **Pruebas automatizadas de autorizacion.** No existe suite que pruebe sistematicamente aislamiento entre organizaciones, Medico A/Medico B, Secretaria, Administrador, Maestro y anonimo. Hoy la defensa depende demasiado de revision manual.

### P1 - Alto

1. **Auditoria de lectura clinica.** Se registran cambios importantes, pero debe quedar evidencia de acceso/consulta de historias y documentos sensibles, no solo altas y modificaciones.
2. **Gestion de sesiones y dispositivos.** Definir expiracion, revocacion de sesiones y procedimiento ante perdida de celular/equipo. La opcion recordar dispositivo no reemplaza esa politica.
3. **Firma escaneada.** Es un recurso grafico sensible y no equivale a firma digital legal. Debe conservarse privada, con acceso firmado y trazabilidad; la interfaz no debe presentarla como firma digital certificada.
4. **Correo transaccional.** La recuperacion depende de la entrega de Supabase/SMTP. Deben configurarse dominio remitente, SPF/DKIM/DMARC, monitoreo de rebotes y alternativa operativa controlada.
5. **Administradores con lectura clinica.** Es funcionalmente requerido, pero debe existir politica formal de necesidad, confidencialidad y auditoria reforzada para justificar ese acceso.

### P2 - Medio

1. **Bundle inicial grande.** Vite advierte un chunk superior a 500 kB; conviene carga diferida de PDF, reportes y administracion.
2. **Migraciones historicas superpuestas.** El orden esta documentado, pero una base nueva debe probarse regularmente desde cero para evitar regresiones por parches antiguos.
3. **Datos de prueba.** Las reservas QA usan documentos ficticios `99000031` y `99000032`; solo una produjo turno. Deben limpiarse junto con todos los datos ficticios antes de produccion real.
4. **Accesibilidad.** Completar prueba por teclado, lector de pantalla, foco de modales y contraste en todos los estados.

## Matriz de permisos esperada

| Accion | Maestro | Administrador | Medico | Secretaria | Anonimo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Administrar organizaciones | Si | No | No | No | No |
| Administrar usuarios de la organizacion | Si | Si, con limites | No | No | No |
| Ver pacientes formales | Si | Si | Vinculados | Operativos permitidos | No |
| Ver historia clinica | Si | Si, auditado | Propia | No | No |
| Crear evolucion | Por simulacion autorizada | Por simulacion autorizada | Si | No | No |
| Gestionar turnos | Si | Si | Propios | Consultorio asignado | Solo solicitar |
| Leer catalogo publico | Si | Si | Si | Si | Solo publicado |

## Checklist obligatorio antes de datos reales

1. Crear credenciales ficticias separadas para Maestro, Administrador, dos Medicos y dos Secretarias de consultorios distintos.
2. Ejecutar una matriz negativa: cada rol intenta leer y escribir datos de otra organizacion y otro profesional.
3. Cerrar una evolucion, intentar modificarla y comprobar que solo permite una enmienda trazable.
4. Restaurar un backup en un proyecto aislado y documentar el resultado.
5. Revisar logs de Auth, Edge Functions y auditoria durante alta, bloqueo, reset y reserva publica.
6. Probar recuperacion de clave con SMTP productivo y revisar spam, rebotes y expiracion del enlace.
7. Probar turnera con doble clic, red lenta, envio repetido y dos dispositivos simultaneos.
8. Probar impresion A4 de una historia extensa, con y sin firma, estudios solicitados y adjuntos.
9. Vaciar datos ficticios solo mediante un procedimiento aprobado y respaldado.

## Resultado

La aplicacion ya tiene una base operativa util y la turnera protege correctamente la ocupacion concurrente. No se recomienda cargar historias clinicas reales hasta resolver los P0, ejecutar la matriz completa con credenciales separadas y conservar evidencia de una restauracion exitosa.

Este QA no borro pacientes, turnos, historias, usuarios ni consultorios.
