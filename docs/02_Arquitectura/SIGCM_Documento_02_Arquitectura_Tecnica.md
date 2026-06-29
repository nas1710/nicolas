# DOCUMENTO 02 – Arquitectura Técnica del SIGCM

## Objetivo
Definir la arquitectura técnica oficial del producto para garantizar escalabilidad, seguridad, mantenibilidad y facilidad de evolución.

## Arquitectura General
Frontend: React + TypeScript + Vite.
Backend: Supabase (PostgreSQL, Auth, RLS, Edge Functions, Realtime).
Hosting: Vercel.
Repositorio: GitHub.

## Principios
- Seguridad basada en RLS.
- Service Role nunca en frontend.
- Componentes reutilizables.
- Configuración antes que código.
- Arquitectura modular.
- Multiempresa preparada.

## Frontend
Organización por features:
api/
components/
features/
hooks/
layouts/
pages/
services/
types/
utils/

Cada feature encapsula componentes, hooks, servicios y tipos.

## Backend
Supabase administra autenticación, base de datos, almacenamiento ligero, auditoría y funciones privilegiadas.

## Repositorio documental
El sistema administra referencias a documentos.
Los archivos pueden residir en Google Drive, OneDrive, Dropbox, iCloud, NAS, carpeta local (sincronizador futuro) o Supabase Storage.

## Seguridad
Toda lógica crítica debe ejecutarse en backend.
Las Edge Functions manejarán creación de usuarios, reseteo de contraseñas, envío de correos e integraciones.

## Auditoría
Registrar altas, bajas, modificaciones, envíos, accesos y operaciones críticas.

## Rendimiento
Implementar paginación, índices, lazy loading, consultas optimizadas y evitar duplicación de archivos.

## Despliegue
GitHub -> Vercel.
Supabase como backend.
Toda modificación debe acompañarse de SQL, checklist y pasos de despliegue.
