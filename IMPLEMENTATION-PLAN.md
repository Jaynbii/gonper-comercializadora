# Plan de implementación — Requisa Software

Estado: terminada (declarado por Alex el 2026-11-11); solo ajustes
cuando Alex los pida. Este documento registra el pase de mejora
aplicado desde los reels y los pendientes abiertos.

## Pase de mejora (2026-11-11, desde los reels)

- Patrones de UI (reel de librerías de componentes): avisos toast
  tras acciones que quedaban en silencio, esqueleto de carga en el
  panel y `aria-live` en el estado de lectura. Sin librería nueva:
  los patrones se aplicaron sobre el sistema Tailwind existente
  para no reescribir un sistema interno terminado.
- Conceptos que los vibe coders ignoran (reel de 107 conceptos):
  aplicado lo que cabe a esta escala, un límite de uso en la
  lectura con IA. Ya estaban cubiertos: headers de seguridad,
  timeout, validación de subida, tests automatizados, RLS y
  HTTPS/HSTS. Descartado por escala: balanceo de carga, réplicas,
  tracing distribuido, SSO e infraestructura como código.
- Documentación (reel de los 4 documentos): este plan junto con
  `TECHNICAL-REQUIREMENTS.md`, `APPFLOW.md` y `TESTING-GUIDE.md`.

## Pendientes abiertos

- Alex: prueba fría de su cuñada (sin explicación) sobre la versión
  terminada; veredicto de fin de semana en main; revisar 37312
  contra 37317 en Inventario; borrar (si confirma) las 21 órdenes
  de compra viejas sin requisición; resultado de la charla con Alan
  Perea sobre facturas PDF el mismo día.
- Muse: ajustes solo cuando Alex los pida (reabrir el seguimiento,
  no crear otro); velocidad de lectura con IA y carga en teléfono
  según lo que salga del uso real; validar el naranja y el rojo de
  urgente y errores con Alex.

## Reglas de trabajo

- Merge directo a main, sin PRs; cambios de base de datos como SQL
  revisado para el editor de Supabase; nunca editar producción
  directo ni borrar registros en automático; resumen corto al
  entregar, sin explicación archivo por archivo.
