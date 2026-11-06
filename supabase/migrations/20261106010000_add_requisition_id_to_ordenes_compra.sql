-- Vínculo compra -> requisición (Gonper, Fase 1c ampliada).
--
-- QUÉ HACE
--   Añade la columna requisition_id a public.ordenes_compra, para saber
--   para qué requisición de cliente se generó cada orden de compra a un
--   proveedor. Es NULLABLE: las compras viejas y las generadas desde la
--   vista General (sin requisición) quedan con NULL y se muestran en la
--   app como "Sin requisición".
--
-- QUÉ NO TOCA
--   - No borra ni modifica ninguna orden de compra ya creada en
--     producción. En particular, NO toca las 7 órdenes Pendientes
--     duplicadas que ya existen (MazLimpio $29,690 x3 y Grupo Mach
--     $180 x4): esas se revisan aparte, no se borran con esta migración.
--   - No cambia ningún otro campo, ni surtirOrden(), ni el stock.
--
-- IDEMPOTENTE
--   ADD COLUMN IF NOT EXISTS y CREATE INDEX IF NOT EXISTS: si se corre
--   dos veces, la segunda no cambia nada.
--
-- CÓMO CORRERLA (Alex, en Supabase, SOLO DESPUÉS de fusionar el PR
-- y de revisar esta migración; Muse no tiene acceso a la base de
-- producción y no la corre por ti):
--   1. Supabase Dashboard -> SQL Editor -> New query.
--   2. Pega y corre TODO este archivo.
--   3. Verificación: corre la consulta de abajo. Debe mostrar el
--      total de órdenes de compra, cuántas tienen requisition_id y
--      cuántas quedan como "Sin requisición" (las viejas: NULL).
--   4. Las compras generadas con la app ANTES de correr esta migración
--      quedan con requisition_id NULL ("Sin requisición"); es lo
--      esperado, no es un error.
--
-- NOTA DE DESPLIEGUE
--   La app nueva tolera que la columna aún no exista: si se despliega
--   antes de correr la migración, Compras sigue cargando y las compras
--   por requisición se generan sin vínculo (y el anti-duplicado no
--   puede comprobar nada). Corre la migración cuanto antes después de
--   fusionar para que el vínculo funcione.

ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS requisition_id UUID REFERENCES public.ordenes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ordenes_compra_requisition_id
  ON public.ordenes_compra (requisition_id);

-- Verificación (no cambia nada): cuántas compras tienen requisición
-- vinculada y cuántas quedan como "Sin requisición".
SELECT
  COUNT(*) AS total,
  COUNT(requisition_id) AS con_requisicion,
  COUNT(*) - COUNT(requisition_id) AS sin_requisicion
FROM public.ordenes_compra;
