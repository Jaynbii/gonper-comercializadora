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
--     movimiento SALIDA_ORDEN solo si se surtió algo, y marca la
--     requisición ENTREGADA si se cubrió todo lo pendiente o PARCIAL
--     si no. Si no se puede surtir nada, lanza excepción y no escribe
--     nada.
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

  FOR r IN
    SELECT
      oi.id AS item_id,
      oi.producto_id,
      oi.cantidad_solicitada,
      COALESCE(oi.cantidad_surtida, 0) AS cantidad_surtida,
      p.stock_actual
    FROM public.orden_items oi
    LEFT JOIN public.productos p ON p.id = oi.producto_id
    WHERE oi.orden_id = p_orden_id
    ORDER BY oi.created_at, oi.id
    FOR UPDATE OF oi, p
  LOOP
    v_hay_items := true;

    -- Sin producto (eliminado) no se puede surtir este artículo.
    IF r.stock_actual IS NULL THEN
      CONTINUE;
    END IF;

    v_pendiente := r.cantidad_solicitada - r.cantidad_surtida;
    IF v_pendiente <= 0 THEN
      -- Ya estaba totalmente surtido: no se vuelve a descontar nada.
      CONTINUE;
    END IF;

    v_total_pendiente := v_total_pendiente + v_pendiente;
    v_a_surtir := LEAST(r.stock_actual, v_pendiente);
    v_total_surtido := v_total_surtido + v_a_surtir;

    IF v_a_surtir <= 0 THEN
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
      (r.producto_id, 'SALIDA_ORDEN', v_a_surtir, 'Surtido de requisición', p_orden_id, auth.uid());
  END LOOP;

  IF NOT v_hay_items THEN
    RAISE EXCEPTION 'La requisición no tiene artículos';
  END IF;

  IF v_total_surtido = 0 THEN
    RAISE EXCEPTION 'No hay stock de NINGÚN artículo. No se puede surtir la requisición.';
  END IF;

  v_estado_final :=
    CASE WHEN v_total_surtido = v_total_pendiente THEN 'ENTREGADA' ELSE 'PARCIAL' END;

  UPDATE public.ordenes
  SET estado = v_estado_final
  WHERE id = p_orden_id;

  RETURN v_estado_final;
END;
$$;

GRANT EXECUTE ON FUNCTION public.surtir_orden(UUID) TO authenticated;

-- Verificación (no cambia nada): debe dar 1 fila.
-- SELECT proname FROM pg_proc WHERE proname = 'surtir_orden';
