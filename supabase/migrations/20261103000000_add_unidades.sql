-- Unidad fija por SKU y copia (snapshot) de la unidad al momento de la orden.
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS unidad_medida TEXT;
ALTER TABLE public.orden_items ADD COLUMN IF NOT EXISTS unidad TEXT;

-- Necesario para reemplazar las filas de una orden al volver a procesar el OCR.
DROP POLICY IF EXISTS "Borrar orden_items" ON public.orden_items;
CREATE POLICY "Borrar orden_items" ON public.orden_items FOR DELETE TO authenticated USING (true);
