-- Marca "Sin surtir" en los artículos de una requisición (Alex,
-- 2026-11-25): el artículo queda SOLO EN EL REGISTRO — no se surte,
-- no se compra y no mueve inventario para nada.
--
-- QUÉ CAMBIA
--   - `orden_items.sin_surtir` (boolean, default false).
--   - `surtir_orden` v2 (CREATE OR REPLACE sobre la función de la
--     migración 20261106040000): salta los artículos marcados, no
--     les descuenta stock, no les registra movimiento y no los cuenta
--     como pendientes — así una requisición con todo lo demás surtido
--     queda ENTREGADA aunque tenga artículos Sin surtir. Si lo único
--     pendiente está marcado Sin surtir, la función lanza una
--     excepción clara en vez de surtir nada.
--
-- CÓMO CORRERLA (Alex, en Supabase; Muse no tiene acceso a la base
-- de producción y no la corre por ti):
--   1. Supabase Dashboard -> SQL Editor -> New query.
--   2. Pega y corre TODO este archivo. Es idempotente (ADD COLUMN IF
--      NOT EXISTS + CREATE OR REPLACE): si se corre dos veces, la
--      segunda no cambia nada.
--   3. Verificación: SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'orden_items' AND column_name = 'sin_surtir';
--      debe dar 1 fila.
--
-- La app tolera que la columna aún no exista: el detalle, Compras y
-- el modal de edición siguen funcionando con todo surtible, y al
-- guardar un "Sin surtir" el error avisa que falta esta migración.

ALTER TABLE public.orden_items
  ADD COLUMN IF NOT EXISTS sin_surtir BOOLEAN NOT NULL DEFAULT false;

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
  v_sin_surtir INT := 0;
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
      oi.sin_surtir,
      p.stock_actual,
      p.nombre AS nombre_producto
    FROM public.orden_items oi
    LEFT JOIN public.productos p ON p.id = oi.producto_id
    WHERE oi.orden_id = p_orden_id
    ORDER BY oi.created_at, oi.id
    FOR UPDATE OF oi
  LOOP
    v_hay_items := true;

    -- Sin surtir (Alex, 2026-11-25): solo registro. No se descuenta
    -- stock, no se registra movimiento y no cuenta como pendiente ni
    -- como artículo surtible.
    IF r.sin_surtir THEN
      v_sin_surtir := v_sin_surtir + 1;
      CONTINUE;
    END IF;

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
    IF v_total_pendiente = 0 AND v_sin_surtir > 0 THEN
      RAISE EXCEPTION 'Todos los artículos pendientes están marcados como "Sin surtir": no hay nada que surtir.';
    END IF;
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
