-- FIX a la RPC surtir_orden: "FOR UPDATE cannot be applied to the
-- nullable side of an outer join" (visto en producción al surtir
-- REQ-0001, 2026-11-06).
--
-- CAUSA
--   La consulta del loop hacía LEFT JOIN a productos y cerraba con
--   `FOR UPDATE OF oi, p`. Postgres no permite FOR UPDATE sobre el
--   lado anulable de un outer join (p es anulable por el LEFT JOIN),
--   así que la función fallaba ANTES de ejecutar nada. Como la
--   función es transaccional, no se escribió nada: la requisición
--   quedó intacta y se puede reintentar tras este fix.
--
-- FIX
--   - El loop ahora bloquea solo oi (`FOR UPDATE OF oi`).
--   - Los productos se bloquean aparte, ANTES del loop, con un
--     PERFORM ... FOR UPDATE sobre productos (sin join), para que dos
--     surtidos concurrentes no lean el mismo stock y lo descuenten
--     dos veces (sin ese bloqueo, el UPDATE posterior sobrescribiría
--     el stock con un valor calculado de una lectura vieja).
--   - Todo lo demás (surtido parcial, movimientos SALIDA, estados)
--     queda igual. CREATE OR REPLACE: se puede correr sobre la
--     función ya creada sin tocar nada más.
--
-- Surtir una requisición en UNA transacción (Gonper).
--
-- POR QUÉ
--   El `surtirOrden()` anterior hacía los writes con `Promise.all`
--   y sin transacción, y tragaba en silencio los errores de los
--   updates de stock. Al surtir REQ-0003 en el preview, un fallo a
--   mitad (p. ej. el insert en movimientos_inventario) dejaba el
--   stock ya descontado y los items marcados como surtidos, pero la
--   requisición en PENDIENTE, y el cliente solo veía "Minified React
--   error #441" (Next.js redacta el mensaje real del servidor).
--   Esta función hace TODO en una sola transacción de Postgres: si
--   algo falla, no se escribe nada.
--
-- QUÉ HACE
--   - Bloquea la requisición, sus items y sus productos (FOR UPDATE)
--     para que dos surtidos concurrentes no se pisen.
--   - Surtido PARCIAL preservado: por artículo surte
--     min(stock, pendiente), donde pendiente = solicitada - ya
--     surtida. Piden 10, hay 6, se surten 6 y la requisición queda
--     PARCIAL. Volver a surtir una PARCIAL solo surte lo que falta.
--   - Descuenta el stock, actualiza cantidad_surtida (SUMANDO lo ya
--     surtido, no sobrescribiéndolo) y estado_item, registra el
--     movimiento SALIDA solo si se surtió algo, y marca la
--     requisición ENTREGADA si se cubrió todo lo pendiente o PARCIAL
--     si no. Si no se puede surtir nada, lanza excepción y no escribe
--     nada.
--   - El movimiento es 'SALIDA', no 'SALIDA_ORDEN': en la base real
--     SELECT DISTINCT tipo_movimiento solo devuelve 'ENTRADA' (los
--     movimientos de recibir, que sí funcionan); la base usa valores
--     cortos ENTRADA / SALIDA y el CHECK rechazaba 'SALIDA_ORDEN'
--     ("violates check constraint
--     movimientos_inventario_tipo_movimiento_check"). Ver la
--     migración 20261106030000, que amplía el CHECK para aceptar
--     también los valores largos por compatibilidad.
--   - Devuelve 'ENTREGADA' o 'PARCIAL'.
--
-- DEFENSAS DE ESQUEMA
--   El repo ya tiene precedentes de deriva código-vs-esquema (p. ej.
--   `productos.codigo_sat` se usa en el código pero no lo crea el SQL
--   inicial). Por eso la migración añade por si acaso las columnas
--   que el insert de movimientos necesita, sin tocar nada si ya
--   existen. Si la tabla movimientos_inventario no tuviera la columna
--   `orden_id`, el surtido anterior fallaba justo ahí.
--
-- CÓMO CORRERLA (Alex, en Supabase, SOLO DESPUÉS de fusionar el PR
-- y de revisar esta migración; Muse no tiene acceso a la base de
-- producción y no la corre por ti):
--   1. Supabase Dashboard -> SQL Editor -> New query.
--   2. Pega y corre TODO este archivo. Es idempotente (CREATE OR
--      REPLACE + ADD COLUMN IF NOT EXISTS): si se corre dos veces,
--      la segunda no cambia nada.
--   3. Verificación: SELECT proname FROM pg_proc WHERE proname =
--      'surtir_orden'; debe dar 1 fila.
--   4. La app tolera que la función aún no exista: si la RPC no
--      está, `surtirOrden()` usa la vía secuencial de respaldo (con
--      cada error verificado). Corre la migración cuanto antes
--      después de fusionar para que el surtido sea transaccional.
--
-- Columnas que necesita el insert de movimientos (por si faltan).
ALTER TABLE public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS orden_id UUID REFERENCES public.ordenes(id) ON DELETE SET NULL;
ALTER TABLE public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.surtir_orden(p_orden_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado TEXT;
  v_total_pendiente NUMERIC := 0;
  v_total_surtido NUMERIC := 0;
  v_hay_items BOOLEAN := false;
  v_total_items INT := 0;
  v_ya_surtidos INT := 0;
  v_sin_stock TEXT := '';
  r RECORD;
  v_pendiente NUMERIC;
  v_a_surtir NUMERIC;
  v_nuevo_stock NUMERIC;
  v_estado_item estado_item;
  v_estado_final TEXT;
BEGIN
  -- Bloquea la requisición para que dos surtidos concurrentes no se pisen.
  SELECT estado INTO v_estado
  FROM public.ordenes
  WHERE id = p_orden_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requisición no encontrada';
  END IF;
  IF v_estado = 'ENTREGADA' THEN
    RAISE EXCEPTION 'Esta requisición ya fue surtida y entregada previamente.';
  END IF;

  -- Bloquea los productos de esta requisición para que dos surtidos
  -- concurrentes no lean el mismo stock y lo descuenten dos veces.
  -- (No se puede hacer FOR UPDATE OF p dentro del LEFT JOIN del
  -- loop: Postgres lo rechaza, ver encabezado de esta migración.)
  PERFORM 1
  FROM public.productos p
  WHERE p.id IN (SELECT producto_id FROM public.orden_items WHERE orden_id = p_orden_id)
  FOR UPDATE;

  FOR r IN
    SELECT
      oi.id AS item_id,
      oi.producto_id,
      oi.cantidad_solicitada,
      COALESCE(oi.cantidad_surtida, 0) AS cantidad_surtida,
      p.stock_actual,
      p.nombre AS nombre_producto
    FROM public.orden_items oi
    LEFT JOIN public.productos p ON p.id = oi.producto_id
    WHERE oi.orden_id = p_orden_id
    ORDER BY oi.created_at, oi.id
    FOR UPDATE OF oi
  LOOP
    v_hay_items := true;
    v_total_items := v_total_items + 1;

    -- Sin producto (eliminado) no se puede surtir este artículo.
    IF r.stock_actual IS NULL THEN
      CONTINUE;
    END IF;

    v_pendiente := r.cantidad_solicitada - r.cantidad_surtida;
    IF v_pendiente <= 0 THEN
      -- Ya estaba totalmente surtido: no se vuelve a descontar nada.
      v_ya_surtidos := v_ya_surtidos + 1;
      CONTINUE;
    END IF;

    v_total_pendiente := v_total_pendiente + v_pendiente;
    v_a_surtir := LEAST(r.stock_actual, v_pendiente);
    v_total_surtido := v_total_surtido + v_a_surtir;

    IF v_a_surtir <= 0 THEN
      -- Sin stock para este artículo pendiente: se deja constancia
      -- para el mensaje de error (ver abajo).
      v_sin_stock := v_sin_stock ||
        CASE WHEN v_sin_stock = '' THEN '' ELSE ', ' END ||
        COALESCE(r.nombre_producto, 'artículo') ||
        ' (pendiente ' || v_pendiente::TEXT || ')';
      UPDATE public.orden_items
      SET estado_item = 'SIN_STOCK'
      WHERE id = r.item_id;
      CONTINUE;
    END IF;

    v_nuevo_stock := r.stock_actual - v_a_surtir;
    v_estado_item :=
      CASE WHEN v_a_surtir = v_pendiente
        THEN 'SURTIMIENTO_COMPLETO'::estado_item
        ELSE 'PARCIAL'::estado_item
      END;

    UPDATE public.productos
    SET stock_actual = v_nuevo_stock
    WHERE id = r.producto_id;

    UPDATE public.orden_items
    SET cantidad_surtida = r.cantidad_surtida + v_a_surtir,
        estado_item = v_estado_item
    WHERE id = r.item_id;

    INSERT INTO public.movimientos_inventario
      (producto_id, tipo_movimiento, cantidad, motivo, orden_id, usuario_id)
    VALUES
      (r.producto_id, 'SALIDA', v_a_surtir, 'Surtido de requisición', p_orden_id, auth.uid());
  END LOOP;

  IF NOT v_hay_items THEN
    RAISE EXCEPTION 'La requisición no tiene artículos';
  END IF;

  IF v_total_surtido = 0 THEN
    -- Diagnóstico con el estado real (digest 2179146847): con
    -- REQ-0003 esto era "10 de 13 ya surtidos y los 3 pendientes sin
    -- stock", y el mensaje genérico no decía nada de eso.
    IF v_total_pendiente = 0 THEN
      RAISE EXCEPTION 'Todos los artículos de esta requisición ya aparecen como surtidos (cantidad surtida = cantidad solicitada, % de %), pero la requisición sigue sin marcarse como surtida. No hay nada pendiente por surtir.', v_ya_surtidos, v_total_items;
    END IF;
    RAISE EXCEPTION 'No hay stock de NINGÚN artículo pendiente. Ya surtidos: % de %. Sin stock para surtir: %.', v_ya_surtidos, v_total_items, v_sin_stock;
  END IF;

  v_estado_final :=
    CASE WHEN v_total_surtido = v_total_pendiente THEN 'ENTREGADA' ELSE 'PARCIAL' END;

  UPDATE public.ordenes
  SET estado = v_estado_final::estado_orden
  WHERE id = p_orden_id;

  RETURN v_estado_final;
END;
$$;

GRANT EXECUTE ON FUNCTION public.surtir_orden(UUID) TO authenticated;

-- Verificación (no cambia nada): debe dar 1 fila.
-- SELECT proname FROM pg_proc WHERE proname = 'surtir_orden';
