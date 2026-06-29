# DOCUMENTO 12 – Manual para Codex y Estándares de Desarrollo

## Objetivo
Establecer las reglas que deberá seguir Codex durante todo el desarrollo del SIGCM.

## Principios
- Leer siempre el README y la documentación antes de modificar código.
- No romper funcionalidades existentes.
- Proponer mejoras justificadas.
- Mantener arquitectura modular.
- Documentar cada cambio.

## Entregables por cada implementación
- Código fuente.
- SQL en orden de ejecución.
- Edge Functions.
- Cambios de configuración.
- Pasos para Supabase.
- Pasos para GitHub.
- Pasos para Vercel.
- Checklist de pruebas.

## Calidad
- Componentes reutilizables.
- Tipado fuerte.
- Sin lógica crítica en el frontend.
- Auditoría de operaciones importantes.
- Código legible y documentado.

## Restricciones
- Nunca exponer Service Role.
- Nunca eliminar el usuario Master.
- No duplicar pacientes.
- No almacenar masivamente PDFs en Supabase.

## Revisión
Cada entrega debe incluir riesgos, impacto, rollback y validaciones recomendadas.
