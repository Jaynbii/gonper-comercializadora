-- Factura firmada y sellada como comprobante de entrega (Alex 2026-11-13).
--
-- La requisición SIGUE en estado ENTREGADA ("surtida"): la foto y su
-- fecha son campos aparte, para reportes después. Sin cambios al enum
-- de estado ni a la RPC de surtido.
alter table public.ordenes
  add column if not exists factura_firmada_path text,
  add column if not exists factura_firmada_en timestamptz;

comment on column public.ordenes.factura_firmada_path is 'Ruta en el bucket pdf-facturas (prefijo firmadas/) de la foto de la requisición firmada y sellada.';
comment on column public.ordenes.factura_firmada_en is 'Cuándo se subió la foto de la factura firmada.';
