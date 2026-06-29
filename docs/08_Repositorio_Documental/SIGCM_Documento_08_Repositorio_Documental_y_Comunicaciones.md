# DOCUMENTO 08 – Repositorio Documental y Comunicaciones

## Objetivo
Definir la arquitectura funcional para administrar documentos médicos y la comunicación con pacientes.

## Repositorios soportados
- Google Drive
- OneDrive
- Dropbox
- iCloud Drive
- NAS
- Carpeta local (sincronizador futuro)
- Supabase Storage (uso puntual)

## Configuración
Cada médico podrá definir:
- proveedor;
- carpeta raíz;
- subcarpetas por práctica;
- correo laboral;
- correo personal;
- plantillas;
- permisos de secretaria.

## Sincronización
La aplicación debe detectar únicamente archivos nuevos o no vinculados, evitando recorrer repositorios completos en cada ejecución.

## Bandeja inteligente
Agrupar documentos por paciente sugerido, permitir corrección manual, vincular múltiples informes y registrar estados.

## Comunicación
Canales:
- Correo electrónico.
- WhatsApp.
- Ambos.

Las plantillas deben ser editables por organización y por médico.

## Auditoría
Registrar envío, destinatario, usuario, fecha, canal y resultado.

## Futuro
Preparar integración con WhatsApp Business API y sincronizador de escritorio para carpetas locales.
