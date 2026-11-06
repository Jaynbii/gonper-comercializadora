# 🏢 Sistema ERP / OMS / WMS - Gonper Comercializadora

**Última actualización:** Noviembre 2026
**Estado:** Aplicación desplegada en Vercel; confirmar el estado del último deployment antes de asumir que `main` está en producción.
**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Supabase (Auth, Postgres, Storage).
**Librerías clave:** `unpdf`, `pdfjs-dist`, `tesseract.js`, `fuse.js`.
**Repositorio:** `Jaynbii/gonper-comercializadora`, rama `main`.
**Configuración:** Server Actions con límite de cuerpo de `10mb`; bucket privado `pdf-facturas`.

---

## 📖 1. Resumen del Proyecto y Arquitectura

El sistema automatiza la recepción de requerimientos (fotos/PDFs enviados por WhatsApp), la lectura de estos mediante OCR (Reconocimiento Óptico de Caracteres) e IA (Fuzzy Matching), el cotejo con el inventario, y el surtido de órdenes.

### Módulos Implementados:
1.  **Dashboard:** Tarjetas de métricas, acceso rápido a subir requisición y proyección de demanda (faltantes vs stock).
2.  **Inventario:** CRUD de productos, asignación de categorías, control de stock y precios.
3.  **Órdenes:** Subida de PDFs/Fotos, procesamiento OCR, cotejo inteligente, estados (BORRADOR, PENDIENTE, PARCIAL, ENTREGADA, CANCELADA), visor de PDF seguro y surtido automático (descuento de stock).
4.  **Clientes:** Directorio de mercados y dependencias de gobierno.
5.  **Proveedores:** Directorio con catálogo de precios por producto (Relación N:M).
6.  **Compras:** Panel de faltantes consolidados de órdenes activas, selección de proveedor y precio registrado, captura de cantidades, generación de órdenes de compra y recepción de mercancía con actualización de inventario. Desde el detalle de una orden con faltantes existe un botón para abrir el módulo de Compras.

### Seguridad Implementada:
*   **RLS (Row Level Security):** Ningún usuario puede ver o modificar datos sin estar autenticado.
*   **Roles:** `admin` (puede todo) y `operador` (limitado).
*   **Zero Trust en PDFs:** El bucket `pdf-facturas` es privado. No se guardan URLs públicas. Se generan URLs firmadas que expiran en 60 segundos para ver el PDF, y en 5 minutos para el OCR.

---

## 🗄️ 2. Base de Datos (Supabase SQL)

**ADVERTENCIA: este bloque es únicamente para una instalación nueva y vacía. NO lo ejecutes sobre la base de datos de producción ni sobre una instalación existente:** contiene instrucciones `DROP TABLE ... CASCADE` y `DROP TYPE ... CASCADE` que eliminan tablas, relaciones y datos. Para actualizar una instalación existente, crea y ejecuta únicamente migraciones incrementales revisadas y respaldadas.

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
    unidad_medida TEXT,
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
    unidad TEXT,
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
CREATE POLICY "Borrar orden_items" ON public.orden_items FOR DELETE TO authenticated USING (true);

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
```

### 2.1 Migración para instalaciones existentes

Si la base ya estaba creada antes de agregar las unidades, ejecuta solo este bloque en el SQL Editor de Supabase. Las columnas son opcionales para no romper los productos ya capturados.

```sql
-- Unidad fija por SKU y copia (snapshot) de la unidad al momento de la orden.
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS unidad_medida TEXT;
ALTER TABLE public.orden_items ADD COLUMN IF NOT EXISTS unidad TEXT;

-- Necesario para reemplazar las filas de una orden al volver a procesar el OCR.
DROP POLICY IF EXISTS "Borrar orden_items" ON public.orden_items;
CREATE POLICY "Borrar orden_items" ON public.orden_items FOR DELETE TO authenticated USING (true);
```




---

## 3. Flujos operativos actuales

### Recepción y captura de una orden
1. En **Órdenes**, se crea un requerimiento desde un PDF o imagen.
2. El archivo se envía mediante la Server Action `subirYProcesarPDF` y se almacena en el bucket privado `pdf-facturas`.
3. Se registra la orden en `ordenes`, guardando la ruta del archivo en `pdf_path`.
4. El PDF se procesa desde la lista de órdenes para extraer y cotejar artículos con el catálogo.
5. En el detalle se comparan cantidades solicitadas, stock disponible y faltantes.

### Surtido y compras
- El detalle de la orden muestra si el inventario permite surtir todos o parte de los artículos.
- Cuando hay faltantes, el botón **Ir a Compras por el faltante de esta orden** lleva a `/compras?orden=<id>`, que abre Compras en la vista "Por orden" con esa orden ya seleccionada. También aparece en órdenes PARCIALES: el faltante se calcula como lo que queda por surtir después de lo ya surtido y del stock.
- Compras tiene dos vistas en la pestaña Sugerencias, con interruptor **General | Por orden**:
  - **General:** faltante consolidado de todas las órdenes activas (`PENDIENTE` y `PARCIAL`), como antes.
  - **Por orden:** una card por orden activa con cliente, folio, % que ya se puede surtir con el stock actual, lista de faltantes de esa orden, proveedor sugerido (el más barato con precio registrado en `producto_proveedores`) y costo estimado total del faltante. Si un producto no tiene precio registrado, se muestra como "sin precio, pedir por WhatsApp" y no se inventa un costo.
- Se pueden seleccionar hasta 2 cards. Al hacerlo, el faltante consolidado de la vista General se recalcula solo para esas órdenes, descontando el stock una sola vez por producto, para no comprar de más para las demás órdenes. La selección se puede limpiar con "Limpiar selección".
- Desde cada card, el botón **Ir a surtir esta orden** lleva al detalle de esa orden para liberarla/surtirla.
- El surtido parcial se preserva: si piden 10 y hay 6, se surten 6 y la orden queda PARCIAL. La lógica de `surtirOrden()` no cambió en esta fase.
- Al generar una orden de compra se registra en `ordenes_compra` y `orden_compra_items`.
- La recepción de mercancía registra entradas y actualiza el inventario mediante las acciones del módulo de Compras.

**Alcance actual (Fase 1):** el botón del detalle ya no va al faltante general, va filtrado a esa orden. El módulo mantiene el faltante consolidado general y agrega el desglose por orden; no crea automáticamente una compra exclusiva para una sola orden, pero al seleccionar 1 o 2 órdenes el consolidado se limita a ellas antes de generar la compra.

## 4. Consideraciones de seguridad y mantenimiento

- No confiar en el rol enviado por el cliente ni en metadatos editables por el usuario para conceder permisos de administrador. La asignación de roles debe realizarse desde un proceso administrativo confiable.
- Las políticas RLS efectivas son las que están instaladas en Supabase, no necesariamente las que aparecen en este archivo. Revisar las políticas reales antes de cambiar permisos.
- Mantener privado el bucket `pdf-facturas`; no sustituirlo por acceso público para resolver errores de carga.
- Antes de ejecutar SQL en producción, generar respaldo, revisar el alcance de cada sentencia y preferir migraciones incrementales.
- La documentación describe el código del repositorio; no sustituye la verificación del estado real de Supabase ni del último despliegue de Vercel.
