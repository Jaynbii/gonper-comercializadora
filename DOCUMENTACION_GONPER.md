# 🏢 Sistema ERP / OMS / WMS - Gonper Comercializadora

**Última actualización:** Noviembre 2026
**Estado:** Producción (Desplegado en Vercel)
**Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Supabase (Auth, Postgres, Storage).
**Librerías Clave:** `unpdf`, `pdfjs-dist`, `tesseract.js`, `fuse.js`.
**Filosofía de Seguridad:** Zero Trust (Cero Confianza) con RLS estricto y URLs firmadas.

---

## 📖 1. Resumen del Proyecto y Arquitectura

El sistema automatiza la recepción de requerimientos (fotos/PDFs enviados por WhatsApp), la lectura de estos mediante OCR (Reconocimiento Óptico de Caracteres) e IA (Fuzzy Matching), el cotejo con el inventario, y el surtido de órdenes.

### Módulos Implementados:
1.  **Dashboard:** Tarjetas de métricas, acceso rápido a subir requisición y proyección de demanda (faltantes vs stock).
2.  **Inventario:** CRUD de productos, asignación de categorías, control de stock y precios.
3.  **Órdenes:** Subida de PDFs/Fotos, procesamiento OCR, cotejo inteligente, estados (BORRADOR, PENDIENTE, PARCIAL, ENTREGADA, CANCELADA), visor de PDF seguro y surtido automático (descuento de stock).
4.  **Clientes:** Directorio de mercados y dependencias de gobierno.
5.  **Proveedores:** Directorio con catálogo de precios por producto (Relación N:M).
6.  **Compras (Backend listo):** Tablas preparadas para generar órdenes de compra a proveedores.

### Seguridad Implementada:
*   **RLS (Row Level Security):** Ningún usuario puede ver o modificar datos sin estar autenticado.
*   **Roles:** `admin` (puede todo) y `operador` (limitado).
*   **Zero Trust en PDFs:** El bucket `pdf-facturas` es privado. No se guardan URLs públicas. Se generan URLs firmadas que expiran en 60 segundos para ver el PDF, y en 5 minutos para el OCR.

---

## 🗄️ 2. Base de Datos (Supabase SQL)

Ejecuta este script completo en el **SQL Editor de Supabase** desde cero para restaurar toda la estructura, tipos, triggers, seguridad y datos iniciales.

```sql
-- 1. LIMPIEZA INICIAL
DROP TABLE IF EXISTS public.movimientos_inventario CASCADE;
DROP TABLE IF EXISTS public.orden_items CASCADE;
DROP TABLE IF EXISTS public.ordenes CASCADE;
DROP TABLE IF EXISTS public.orden_compra_items CASCADE;
DROP TABLE IF EXISTS public.ordenes_compra CASCADE;
DROP TABLE IF EXISTS public.producto_proveedores CASCADE;
DROP TABLE IF EXISTS public.proveedores CASCADE;
DROP TABLE IF EXISTS public.productos CASCADE;
DROP TABLE IF EXISTS public.categorias CASCADE;
DROP TABLE IF EXISTS public.clientes CASCADE;
DROP TABLE IF EXISTS public.perfiles CASCADE;
DROP TYPE IF EXISTS estado_orden CASCADE;
DROP TYPE IF EXISTS estado_item CASCADE;
DROP TYPE IF EXISTS rol_usuario CASCADE;

-- 2. TIPOS ENUM
CREATE TYPE estado_orden AS ENUM ('BORRADOR', 'PENDIENTE', 'PARCIAL', 'ENTREGADA', 'CANCELADA');
CREATE TYPE estado_item AS ENUM ('SURTIMIENTO_COMPLETO', 'PARCIAL', 'SIN_STOCK');
CREATE TYPE rol_usuario AS ENUM ('admin', 'operador');

-- 3. TABLAS
CREATE TABLE public.perfiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    nombre_completo TEXT,
    rol rol_usuario DEFAULT 'operador' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.categorias (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.clientes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    contacto_nombre TEXT,
    telefono TEXT,
    direccion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.proveedores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    telefono TEXT,
    correo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.productos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
    stock_actual NUMERIC(10,2) NOT NULL DEFAULT 0,
    stock_minimo NUMERIC(10,2) NOT NULL DEFAULT 0,
    precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
    imagen_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.producto_proveedores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    producto_id UUID REFERENCES public.productos(id) ON DELETE CASCADE,
    proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE CASCADE,
    precio_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(producto_id, proveedor_id)
);

CREATE TABLE public.ordenes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    folio TEXT UNIQUE NOT NULL,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE RESTRICT,
    estado estado_orden DEFAULT 'BORRADOR',
    pdf_path TEXT,
    notas TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.orden_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    orden_id UUID REFERENCES public.ordenes(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES public.productos(id) ON DELETE RESTRICT,
    cantidad_solicitada NUMERIC(10,2) NOT NULL,
    cantidad_surtida NUMERIC(10,2) DEFAULT 0,
    estado_item estado_item DEFAULT 'SIN_STOCK',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.ordenes_compra (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    folio TEXT UNIQUE NOT NULL,
    proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
    estado TEXT DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'ENVIADA', 'RECIBIDA', 'CANCELADA')),
    total_estimado NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.orden_compra_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    orden_compra_id UUID REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES public.productos(id) ON DELETE CASCADE,
    cantidad_solicitada NUMERIC(10,2) NOT NULL,
    cantidad_recibida NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.movimientos_inventario (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    producto_id UUID REFERENCES public.productos(id) ON DELETE CASCADE,
    tipo_movimiento TEXT NOT NULL CHECK (tipo_movimiento IN ('ENTRADA_COMPRA', 'SALIDA_ORDEN', 'AJUSTE_MANUAL')),
    cantidad NUMERIC(10,2) NOT NULL,
    motivo TEXT,
    orden_id UUID REFERENCES public.ordenes(id) ON DELETE SET NULL,
    usuario_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TRIGGERS Y FUNCIONES
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.perfiles (id, email, nombre_completo, rol)
  VALUES (
    NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nombre_completo', 'Usuario Nuevo'),
    COALESCE((NEW.raw_user_meta_data->>'rol')::rol_usuario, 'operador'::rol_usuario)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Función Anti-Recursión RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.perfiles WHERE id = (SELECT auth.uid()) AND rol = 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_modified_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TRIGGER update_productos_modtime BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_ordenes_modtime BEFORE UPDATE ON public.ordenes FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 5. POLÍTICAS DE SEGURIDAD (RLS)
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orden_compra_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;

-- Perfiles
CREATE POLICY "Usuarios ven su propio perfil" ON public.perfiles FOR SELECT USING (id = (SELECT auth.uid()));
CREATE POLICY "Admins ven todos los perfiles" ON public.perfiles FOR SELECT USING (public.is_admin());
CREATE POLICY "Solo admins actualizan perfiles" ON public.perfiles FOR UPDATE USING (public.is_admin());

-- Categorías, Clientes y Proveedores (Lectura general, edición Admin)
CREATE POLICY "Lectura categorias" ON public.categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin modifica categorias" ON public.categorias FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Lectura clientes" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin modifica clientes" ON public.clientes FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Lectura proveedores" ON public.proveedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin modifica proveedores" ON public.proveedores FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Lectura producto_proveedores" ON public.producto_proveedores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin modifica producto_proveedores" ON public.producto_proveedores FOR ALL TO authenticated USING (public.is_admin());

-- Productos (Permitimos INSERT a autenticados para el registro desde OCR, Admin edita/borra)
CREATE POLICY "Lectura productos" ON public.productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insertar productos" ON public.productos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin actualiza productos" ON public.productos FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Admin borra productos" ON public.productos FOR DELETE TO authenticated USING (public.is_admin());

-- Órdenes (Todos leen, insertan y actualizan; solo Admin borra)
CREATE POLICY "Lectura ordenes" ON public.ordenes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insertar ordenes" ON public.ordenes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Actualizar ordenes" ON public.ordenes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Solo admin borra ordenes" ON public.ordenes FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Lectura orden_items" ON public.orden_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insertar orden_items" ON public.orden_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Actualizar orden_items" ON public.orden_items FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Lectura ordenes_compra" ON public.ordenes_compra FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insertar ordenes_compra" ON public.ordenes_compra FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin modifica ordenes_compra" ON public.ordenes_compra FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Lectura orden_compra_items" ON public.orden_compra_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insertar orden_compra_items" ON public.orden_compra_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin modifica orden_compra_items" ON public.orden_compra_items FOR ALL TO authenticated USING (public.is_admin());

CREATE POLICY "Lectura movimientos" ON public.movimientos_inventario FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insertar movimientos" ON public.movimientos_inventario FOR INSERT TO authenticated WITH CHECK (true);

-- 6. STORAGE (Bucket Privado 'pdf-facturas')
INSERT INTO storage.buckets (id, name, public) VALUES ('pdf-facturas', 'pdf-facturas', false) ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Permitir subida" ON storage.objects;
DROP POLICY IF EXISTS "Permitir lectura" ON storage.objects;

CREATE POLICY "Permitir subida" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'pdf-facturas' 
  AND ((metadata->>'mimetype' LIKE 'application/pdf%') OR (metadata->>'mimetype' LIKE 'image/%'))
);

CREATE POLICY "Permitir lectura" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'pdf-facturas');

-- 7. DATOS INICIALES
INSERT INTO public.categorias (nombre) VALUES ('Herramientas'), ('Químicos'), ('Insumos'), ('Higiene'), ('Seguridad') ON CONFLICT DO NOTHING;
INSERT INTO public.clientes (nombre) VALUES ('Mercado Juan Carrasco'), ('Mercado Miguel Hidalgo'), ('Mercado Ricardo Flores Magón'), ('Mercado Cuauhtémoc'), ('Mercado José María Pino Suárez') ON CONFLICT DO NOTHING;