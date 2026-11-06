-- Ampliar los tipos de movimiento permitidos en movimientos_inventario (Gonper).
--
-- POR QUÉ
--   Al surtir, el diálogo mostraba el mensaje real: "Error al
--   registrar el movimiento: new row for relation
--   movimientos_inventario violates check constraint
--   movimientos_inventario_tipo_movimiento_check".
--   El código insertaba tipo_movimiento 'SALIDA_ORDEN', pero en la
--   base real SELECT DISTINCT tipo_movimiento FROM
--   movimientos_inventario solo devuelve 'ENTRADA' (los movimientos
--   de recibir mercancía, que sí funcionan). La base real usa valores
--   cortos ENTRADA / SALIDA, no los de DOCUMENTACION_GONPER.md
--   (ENTRADA_COMPRA / SALIDA_ORDEN / AJUSTE_MANUAL). La definición
--   exacta del CHECK en la base real sigue sin confirmarse con
--   pg_get_constraintdef, pero el rechazo de 'SALIDA_ORDEN' y la
--   existencia de 'ENTRADA' lo demuestran.
--
-- QUÉ HACE ESTA MIGRACIÓN
--   Sustituye el CHECK de tipo_movimiento por uno que acepta los
--   valores cortos reales (ENTRADA, SALIDA, AJUSTE) Y los valores
--   largos históricos (ENTRADA_COMPRA, SALIDA_ORDEN, AJUSTE_MANUAL),
--   para que ni el código viejo ni el nuevo fallen al registrar un
--   movimiento.
--
-- EL FIX DEL CÓDIGO NO DEPENDE DE ESTA MIGRACIÓN
--   El surtido ya registra 'SALIDA' (utils/surtir.ts y la RPC
--   surtir_orden, migración 20261106020000), que es el contraparte
--   de 'ENTRADA' y el valor que la base ya debería aceptar por
--   simetría. El preview debe surtir bien SIN correr esta migración.
--   Si 'SALIDA' no estuviera permitido, el surtido seguirá fallando
--   con el mismo error de CHECK y habrá que correr esta migración
--   (o corregir el CHECK con los valores exactos de
--   pg_get_constraintdef).
--
-- CÓMO CORRERLA (Alex, en Supabase, SOLO DESPUÉS de fusionar el PR
-- y de revisar esta migración; Muse no tiene acceso a la base de
-- producción y no la corre por ti):
--   1. Supabase Dashboard -> SQL Editor -> New query.
--   2. Pega y corre TODO este archivo. Es idempotente (DROP
--      CONSTRAINT IF EXISTS + ADD CONSTRAINT): si se corre dos
--      veces, la segunda no cambia nada.
--   3. Verificación: SELECT conname, pg_get_constraintdef(oid)
--      FROM pg_constraint WHERE conrelid =
--      'public.movimientos_inventario'::regclass AND conname =
--      'movimientos_inventario_tipo_movimiento_check'; debe mostrar
--      el CHECK con los seis valores.
--   4. Verificación: SELECT DISTINCT tipo_movimiento FROM
--      public.movimientos_inventario; debe seguir dando 'ENTRADA'
--      (y 'SALIDA' cuando se surta algo).
--
-- Si la tabla tuviera filas con un tipo fuera de esta lista, el ADD
-- CONSTRAINT fallaría; en ese caso no corras esta migración y avisa,
-- porque habría que revisar esas filas primero.

ALTER TABLE public.movimientos_inventario
  DROP CONSTRAINT IF EXISTS movimientos_inventario_tipo_movimiento_check;

ALTER TABLE public.movimientos_inventario
  ADD CONSTRAINT movimientos_inventario_tipo_movimiento_check
  CHECK (tipo_movimiento IN (
    'ENTRADA', 'SALIDA', 'AJUSTE',
    'ENTRADA_COMPRA', 'SALIDA_ORDEN', 'AJUSTE_MANUAL'
  ));

-- Verificación (no cambia nada): debe dar 1 fila con el CHECK nuevo.
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'public.movimientos_inventario'::regclass
-- AND conname = 'movimientos_inventario_tipo_movimiento_check';
