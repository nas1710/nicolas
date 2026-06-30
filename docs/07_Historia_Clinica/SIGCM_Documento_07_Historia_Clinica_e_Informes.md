# DOCUMENTO 07 – Historia Clínica e Informes

## Objetivo
Definir la estructura funcional de la historia clínica electrónica y el manejo integral de informes.

## Historia Clínica
Debe organizarse cronológicamente y contener:
- antecedentes
- alergias
- medicación
- factores de riesgo
- diagnósticos
- evoluciones
- prácticas
- documentos
- informes
- próximos controles

## Evoluciones
Cada evolución registra fecha, profesional, consultorio y contenido clínico. Nunca se elimina físicamente; toda modificación queda auditada.

## Informes
Los informes pueden provenir de:
- estudios realizados por el consultorio;
- documentación aportada por el paciente;
- otros profesionales.

## Repositorio documental
El sistema administra referencias a documentos almacenados en Google Drive, OneDrive, iCloud, Dropbox, NAS, carpeta local (sincronizador futuro) o Supabase Storage.

## Bandeja de informes
Debe sincronizar repositorios, detectar archivos nuevos, sugerir paciente, permitir vinculación manual, agrupar múltiples estudios del mismo paciente y registrar estado de envío.

## Envío
Permitir correo, WhatsApp o ambos con plantillas editables. Registrar auditoría completa.

## Exportación
La historia clínica debe exportarse en PDF institucional con logo configurable, datos del profesional y anexos seleccionados.

Implementación vigente: los PDFs institucionales se generan bajo demanda en
la sesión interna y no se almacenan automáticamente. La plantilla A4 soporta
historia clínica, informe médico, constancia de atención, resumen e
indicaciones. El nombre del archivo incluye paciente, tipo y fecha de emisión.

## Seguridad
Los documentos no serán públicos. Los accesos y descargas deberán quedar auditados cuando sea posible.
