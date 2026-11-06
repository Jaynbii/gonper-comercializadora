# 🏢 Sistema ERP / OMS / WMS - Gonper Comercializadora

**Última actualización:** Noviembre 2026
**Estado:** Aplicación desplegada en Vercel; confirmar el estado del último deployment antes de asumir que `main` está en producción.
**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Supabase (Auth, Postgres, Storage).
**Librerías clave:** `unpdf`, `pdfjs-dist`, `tesseract.js`, `fuse.js`.
**Repositorio:** `Jaynbii/gonper-comercializadora`, rama `main`.
**Configuración:** Server Actions con límite de cuerpo de `10mb`; bucket privado `pdf-facturas`.

---

## 📖 1. Resumen del Proyecto y Arquitectura

El sistema automatiza la recepción de requisiciones (fotos/PDFs enviados por WhatsApp), la lectura de estos mediante OCR (Reconocimiento Óptico de Caracteres) e IA (Fuzzy Matching), el cotejo con el inventario, y el surtido de requisiciones.

### Módulos Implementados:
1.  **Dashboard:** Tarjetas de métricas, acceso rápido a subir requisición y proyección de demanda (faltantes vs stock).
2.  **Inventario:** CRUD de productos, asignación de categorías y control de stock. Sin precio: el precio lo manda el proveedor (ver Proveedores) y en Inventario solo se duplicaba, así que ya no se muestra en la tabla ni en las cards ni en el formulario de crear/editar, y `crearProducto`/`actualizarProducto` ya no lo escriben. La columna `productos.precio_unitario` sigue en la base de datos (no se borra). Inventario tiene filtros por categoría y por stock, que se combinan con la búsqueda.
3.  **Requisiciones:** Subida de PDFs/Fotos, procesamiento OCR, cotejo inteligente, estados (BORRADOR, PENDIENTE, PARCIAL, ENTREGADA, CANCELADA), visor de PDF seguro y surtido automático (descuento de stock).
4.  **Clientes:** Directorio de mercados y dependencias de gobierno.
5.  **Proveedores:** Directorio con catálogo de precios por producto (Relación N:M).
6.  **Compras:** Panel de faltantes consolidados de requisiciones activas, selección de proveedor y precio registrado, captura de cantidades, generación de órdenes de compra y recepción de mercancía con actualización de inventario. Desde el detalle de una requisición con faltantes existe un botón para abrir el módulo de Compras.

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
    requisition_id UUID REFERENCES public.ordenes(id) ON DELETE SET NULL,
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

### Recepción y captura de una requisición
1. En **Requisiciones**, se crea una requisición desde un PDF o imagen.
2. El archivo se envía mediante la Server Action `subirYProcesarPDF` y se almacena en el bucket privado `pdf-facturas`.
3. Se registra la requisición en `ordenes`, guardando la ruta del archivo en `pdf_path`.
4. El PDF se procesa desde la lista de requisiciones para extraer y cotejar artículos con el catálogo.
5. En el detalle se comparan cantidades solicitadas, stock disponible y faltantes.

### Surtido y compras
- El detalle de la requisición muestra si el inventario permite surtir todos o parte de los artículos.
- Cuando hay faltantes, el botón **Ir a Compras por el faltante de esta requisición** lleva a `/compras?orden=<id>`, que abre Compras en la vista "Por requisición" con esa requisición ya seleccionada. También aparece en requisiciones PARCIALES: el faltante se calcula como lo que queda por surtir después de lo ya surtido y del stock.
- Compras tiene dos vistas en la pestaña Sugerencias, con interruptor **General | Por requisición**:
  - **General:** faltante consolidado de todas las requisiciones activas (`PENDIENTE` y `PARCIAL`), como antes.
  - **Por requisición:** una card por requisición activa con cliente, folio destacado, fecha, % que ya se puede surtir con el stock actual, lista de faltantes de esa requisición, proveedor sugerido (el más barato con precio registrado en `producto_proveedores`) y costo estimado total del faltante. Si un producto no tiene precio registrado, se muestra como "sin precio, pedir por WhatsApp" y no se inventa un costo.
- Se pueden seleccionar hasta 2 cards. Al hacerlo, el faltante consolidado de la vista General se recalcula solo para esas requisiciones, descontando el stock una sola vez por producto, para no comprar de más para las demás requisiciones. La selección se puede limpiar con "Limpiar selección".
- Desde cada card, el botón **Ir a surtir esta requisición** lleva al detalle de esa requisición para liberarla/surtirla.
- El surtido parcial se preserva: si piden 10 y hay 6, se surten 6 y la requisición queda PARCIAL. La lógica de `surtirOrden()` cambió en la corrección del error #441 (ver abajo): ahora es transaccional vía RPC `surtir_orden`, con vía de respaldo secuencial.
- Al generar una orden de compra se registra en `ordenes_compra` y `orden_compra_items`.
- La recepción de mercancía registra entradas y actualiza el inventario mediante las acciones del módulo de Compras.

**Alcance actual (Fase 1):** el botón del detalle ya no va al faltante general, va filtrado a esa requisición. El módulo mantiene el faltante consolidado general y agrega el desglose por requisición; al seleccionar 1 o 2 requisiciones el consolidado se limita a ellas antes de generar la compra.

### Fase 1b: comprar por requisición, folio nuevo y terminología
- **Comprar faltante de esta requisición:** cada card de la vista "Por requisición" tiene este botón. Abre un diálogo de confirmación con proveedor(es) sugerido(s), artículos, cantidades, precios y total estimado. Agrupa por proveedor y genera una orden de compra por proveedor con la Server Action existente `generarOrdenCompra`, solo con los artículos que sí tienen precio. Los artículos "sin precio, pedir por WhatsApp" NO se compran y se listan en el diálogo. Si ningún artículo tiene precio, no se genera nada y se muestra el aviso. Tras generar, se muestran los folios COM generados.
- **Folio de requisición:** las requisiciones nuevas llevan folio `REQ-0001`, `REQ-0002`, `REQ-0003`... con CONSECUTIVO GLOBAL en orden de creación (un número nunca se repite; el formato con fecha `REQ-YYMMDD-001` se descartó porque el 001 se repetía cada día). La generación vive en `utils/folioRequisicion.ts` (función pura, con tests) y se usa en `subirYProcesarPDF`: el siguiente número es el máximo sufijo numérico existente entre folios `REQ-...` + 1 (1 si no hay ninguno); si el folio choca con uno existente (único en BD), se reintenta con el siguiente consecutivo. Las requisiciones viejas conservan su folio `ORD-...` hasta que se corra la migración de abajo. El folio se muestra destacado junto al cliente y la fecha en la lista de requisiciones, en el detalle, en el Dashboard y en las cards de Compras.
- **Terminología (para siempre):** lo que piden los clientes se llama **Requisición / Requisiciones** en toda la UI; lo que se pide a los proveedores se llama **Orden de compra / Órdenes de compra** (internas). En Compras, la pestaña "Órdenes" ahora dice "Órdenes de compra" y sus cards aclaran que son compras a proveedores. Las rutas (`/ordenes`), las tablas (`ordenes`, `ordenes_compra`) y los nombres internos de funciones NO se renombraron, para no romper enlaces ni la app.

### Fase 1c: requisiciones pendientes en cards

- En Compras, la sección **Requisiciones pendientes de surtir** ya no es una lista de filas horizontales: es una cuadrícula de cards (1 columna en móvil, 2 en tablet, 3 en escritorio), con el mismo estilo que las cards de "Por requisición". Cada card muestra cliente, folio destacado, fecha, estado (Pendiente/Parcial), % que ya se puede surtir con el stock actual, nº de artículos con faltante y costo estimado del faltante (datos reutilizados de `faltantesPorOrden`, sin consultas nuevas). Cada card tiene **Abrir requisición** (al detalle) y **Ver faltante** (abre la vista "Por requisición" filtrada a esa requisición, `/compras?orden=<id>`). El contador y el estado vacío cuando no hay requisiciones se mantienen.

### Fase 1c ampliada: cada orden de compra vinculada a su requisición

- **Vínculo:** `ordenes_compra.requisition_id` (UUID, nullable, `REFERENCES ordenes(id) ON DELETE SET NULL`). Lo añade la migración `supabase/migrations/20261106010000_add_requisition_id_to_ordenes_compra.sql`, que se corre en el SQL Editor de Supabase solo después de fusionar el PR (idempotente, con índice). Las compras viejas y las generadas desde la vista General quedan con NULL y se muestran como "Sin requisición". `generarOrdenCompra` acepta un `requisitionId` opcional y lo guarda; el flujo "Comprar faltante de esta requisición" lo pasa. Si la app se despliega antes de correr la migración, Compras sigue cargando y las compras se generan sin vínculo.
- **Pestaña "Órdenes de compra":** las compras se muestran en cards claras, agrupadas por requisición ("Para REQ-0003 · Aseo Urbano", con enlace "Ver requisición") y un grupo "Sin requisición" al final. Cada card muestra proveedor, folio COM destacado, fecha, estado, nº de productos, total estimado, "Para REQ-... · cliente" cuando aplica, y el botón **Recibir** bien visible (primario) cuando está Pendiente.
- **Anti-duplicado:** antes de generar compras por requisición, el diálogo avisa si esa requisición ya tiene órdenes de compra Pendientes. Y el servidor bloquea la generación si ya existe una orden Pendiente para esa requisición, ese proveedor y los mismos artículos con las mismas cantidades (`esMismaCompra` en `utils/faltantesPorOrden.ts`, con tests): no se genera otra en silencio. Para comprar lo mismo a propósito hay que usar la vista General (sin requisición). Las 7 órdenes de compra Pendientes duplicadas que ya existen en producción (MazLimpio $29,690 x3 y Grupo Mach $180 x4) NO se borran ni se modifican con este cambio: se revisan aparte.

### Revisión mobile first + correcciones (Fase 1c, después de 1c ampliada)

La app es 100% mobile first: todo lo de este PR se diseña primero para 360-390px de ancho, sin scroll horizontal, con cards de 1 columna y botones a lo ancho en móvil. En la revisión se corrigió:
- **Acciones de la card "Por requisición":** el checkbox "Elegir para comprar" y el botón "Ir a surtir esta requisición" iban en una sola fila y a 360px el botón se salía de la card (medido: llegaba a 473px en una pantalla de 390px). Ahora van apilados a lo ancho en móvil y en fila solo en escritorio. El botón "Comprar faltante de esta requisición" también es a lo ancho en móvil.
- **Barra inferior de móvil:** la etiqueta "Requisiciones" no cabía en su celda de ~60px a 360px; en móvil se muestra "Requis." (con el nombre completo en el menú de escritorio y en el aria-label).
- **Toggles y botones táctiles:** los interruptores Sugerencias | Órdenes de compra y General | Por requisición ahora tienen mínimo 44px de alto táctil. Los botones "Limpiar selección", "Surtir requisición" (detalle), "Nueva requisición" (Dashboard) y "Ver requisición" (grupo de compras) son a lo ancho en móvil.
- **Dashboard:** las etiquetas de las 3 estadísticas ("Requisiciones activas", etc.) pueden partirse en varias líneas sin salirse de su celda a 360px.
- **Diálogos:** el diálogo de compra, el de Recibir y el de confirmación de surtir usan el Modal existente (ancho `100vw - 2rem`, alto máximo 86dvh, scroll interno, botones del pie a lo ancho en móvil). Las tablas de escritorio siguen ocultas en móvil y se sustituyen por cards.
- Verificado con Chromium headless a 390px en local (`/login`, sin scroll horizontal y sin elementos fuera de ancho) y con el CSS real compilado para la card corregida. Las pantallas con datos reales (Compras con requisiciones) no se pudieron verificar en un navegador real en local porque necesitan sesión y Supabase: queda pendiente probarlo en el preview de Vercel desde un teléfono.

### Corrección: "Ver faltante" no hacía nada estando ya en Compras

El botón **Ver faltante** de las cards de "Requisiciones pendientes de surtir" es ahora un botón (no un Link): cambia a la vista "Por requisición", selecciona esa requisición, actualiza la URL a `/compras?orden=<id>` y baja hasta las cards. Antes era un Link a la misma ruta con otro parámetro y el estado del cliente no se actualizaba, así que parecía no hacer nada.

### Comprar+recibir: la compra también sube el stock

En el diálogo **Comprar faltante de esta requisición** hay un checkbox **"Ya recibí la mercancía, subir stock"**, activado por defecto porque en la operación el proveedor entrega al momento. Si está activado, tras generar cada orden de compra se llama a `recibirMercancia` con las cantidades solicitadas (la RPC existente, transaccional): el stock sube de inmediato y la orden queda como Recibida, para poder surtir la requisición. Si recibir falla, la compra queda generada pero NO se marca como recibida y se muestra el error, para recibirla después desde la pestaña "Órdenes de compra". Si el checkbox está desactivado, la compra queda Pendiente como antes. `generarOrdenCompra` ahora devuelve el id de la orden y sus artículos (id + producto + cantidad) para poder recibirlos, y `recibirMercancia` marca la orden como RECIBIDA cuando la recepción fue completa. La lógica de construir los ítems de recepción vive en `construirItemsRecepcion` (`utils/faltantesPorOrden.ts`, con tests). `surtirOrden()` no se tocó.

### Error #441 al surtir REQ-0003: causa raíz y corrección

Al pulsar "Surtir parcial" en REQ-0003 (preview, móvil), el diálogo mostraba en rojo "Minified React error #441". Eso es Next.js redactando en producción el mensaje real de un error del servidor: el `#441` es solo la máscara, el error real solo existe en el registro del servidor (con un `digest`). Vercel no se pudo consultar para leer ese registro, así que la causa se reprodujo en local con un mock fiel de PostgREST (semántica real de los builders de Supabase: resuelven `{ data, error }`, no lanzan).

Causa raíz — el `surtirOrden()` anterior tenía tres defectos, todos reproducidos:
1. **Fallo a mitad dejaba el surtido a medias:** los writes iban con `Promise.all` y sin transacción. Si el insert en `movimientos_inventario` fallaba (p. ej. porque la columna `orden_id` no existe en la BD real — el repo ya tiene precedentes de deriva código-vs-esquema, como `productos.codigo_sat`), el surtido lanzaba DESPUÉS de haber descontado ya el stock de todos los artículos y marcado los items como surtidos, pero dejaba la requisición en PENDIENTE. El reintento ya no podía surtir nada porque el stock quedó en 0. Ese throw es el que en producción se ve como #441.
2. **Errores de stock tragados en silencio:** los updates de `productos` y `orden_items` se pasaban a `Promise.all` sin revisar su `error`. Si el update de stock fallaba (p. ej. RLS `is_admin`), la requisición quedaba marcada PARCIAL/ENTREGADA, se registraban movimientos, pero el stock nunca bajaba.
3. **Re-surtir una PARCIAL volvía a descontar todo:** el cálculo ignoraba `cantidad_surtida` (siempre `min(stock, solicitada)` y sobrescribía `cantidad_surtida`), así que al volver a surtir se descontaba la cantidad completa de nuevo, no solo lo pendiente.

Corrección:
- **Vía principal, transaccional:** nueva RPC `surtir_orden` (migración `supabase/migrations/20261106020000_surtir_orden_rpc.sql`, para correr en el SQL Editor de Supabase solo después de fusionar el PR). Hace todo en UNA transacción: bloquea requisición/items/productos (`FOR UPDATE`), surte por artículo `min(stock, pendiente)` donde pendiente = solicitada - ya surtida, descuenta stock, suma `cantidad_surtida`, registra el movimiento solo si se surtió algo, y marca ENTREGADA/PARCIAL. Si algo falla, no se escribe nada. La migración también añade por si acaso las columnas `motivo`, `orden_id` y `usuario_id` a `movimientos_inventario` (si faltaran). Es idempotente (`CREATE OR REPLACE` + `ADD COLUMN IF NOT EXISTS`).
- **Vía de respaldo (si la RPC aún no existe):** `surtirOrden()` usa el plan puro de `utils/surtir.ts` y escribe en secuencia verificando CADA error; un fallo aborta antes de marcar la requisición como surtida. Límite honesto del respaldo: sin transacción no puede evitar que un write anterior al fallo ya haya quedado aplicado; por eso la RPC es la vía principal y la migración debe correrse cuanto antes.
- **El #441 ya no se muestra tal cual:** `BotonSurtir` usa `mensajeErrorSurtir()` (`utils/surtir.ts`): si el error que llega es el minificado #441, muestra un mensaje humano y conserva el `digest` si lo hay para buscar el error real en el registro del servidor. El mensaje real, cuando sí llega, se muestra como antes.
- El surtido parcial se preserva: piden 10, hay 6, se surten 6 y queda PARCIAL. Tests nuevos en `utils/surtir.test.mts` (caso REQ-0003, decimales, stock 0, re-surtir una PARCIAL, mapeo del #441).

### Segunda vuelta del #441, digest 2179146847: el error ahora se DEVUELVE, no se lanza

El surtido SEGUÍA fallando en el preview, ahora con el mensaje humano nuevo y digest `2179146847`. Causa confirmada por Alex en Supabase: **REQ-0003 estaba en PENDIENTE, pero 10 de 13 artículos ya estaban marcados SURTIMIENTO_COMPLETO** (cantidad_surtida = solicitada, stock 0) y los 3 restantes SIN_STOCK (Fabuloso 20L, Jabón C/3 Kgs, Papel P/WC jumbo 400) también con stock 0. El respaldo veía `totalSurtido = 0` para lo pendiente y lanzaba "No hay stock de NINGÚN artículo", y ese throw se redactaba en producción como #441 — el mensaje humano anterior solo tapaba la máscara, no recuperaba la causa.

Corrección:
- **`surtirOrden()` ya no lanza: DEVUELVE `{ success: false, error: 'mensaje real' }`.** Los valores devueltos por una Server Action NO se redactan en producción, solo los throws. La lógica vive en `surtirConCliente()` (`utils/surtir.ts`, probada con un mock fiel de PostgREST): RPC si existe, respaldo si no, y cada fallo se devuelve con su mensaje. `BotonSurtir` lee `resultado.error` y lo muestra tal cual. Lo mismo para `recibirMercancia()` (devuelve `{ success, data | error }`, y `ComprasClient` lee el resultado en sus dos llamadas).
- **El mensaje de "sin stock" ahora dice el estado real:** "No hay stock de NINGÚN artículo pendiente. Ya surtidos: 10 de 13. Sin stock para surtir: Fabuloso 20L (pendiente 1), Jabón C/3 Kgs (pendiente 10), Papel P/WC jumbo 400 (pendiente 1)...". Si todo ya está surtido, lo dice claro: "Todos los artículos ya aparecen como surtidos... pero la requisición sigue sin marcarse como surtida". La RPC `surtir_orden` da el mismo diagnóstico.
- **La detección de RPC inexistente se amplió:** el error canónico de PostgREST es `PGRST202` ("Could not find the function ... in the schema cache", verificado con la librería real `@supabase/postgrest-js` 2.118.0: `supabase.rpc()` resuelve `{ data: null, error }`, no lanza). También se aceptan las variantes "does not exist" y "schema cache" sin código.
- **Una PARCIAL ya se puede volver a surtir desde su detalle:** antes el botón solo aparecía para PENDIENTE, así que REQ-0003, que Alex puso en PARCIAL en Supabase, ya no se podía completar cuando llegara stock para los 3 artículos. Ahora el botón aparece también en PARCIAL (como "Surtir parcialmente" si no hay stock total), y solo se oculta si no hay stock para nada.
- **Qué hacer con REQ-0003:** en su estado actual solo se podrá surtir de nuevo cuando los 3 artículos pendientes tengan stock (recibiendo mercancía). Alex ya la puso en PARCIAL, así que cuando llegue ese stock, el botón de surtir aparecerá en su detalle y solo surtirá lo pendiente.
- Tests nuevos en `utils/surtir.test.mts`: `surtirConCliente` con el estado confirmado de REQ-0003 (devuelve el error real, no lanza, no escribe nada), con stock (devuelve PARCIAL), con RPC existente (no usa el respaldo), con error real de la RPC (lo devuelve sin reintentar), con todo ya surtido, y detección de RPC inexistente con el error PGRST202 exacto.

### Inventario: sin precio y filtros por categoría y stock

- **Sin precio en Inventario:** el precio lo manda el proveedor y en Inventario solo se duplicaba. Se quitó la columna Precio de la tabla de escritorio, el precio de la card móvil y el campo Precio del modal de crear/editar. `crearProducto`/`actualizarProducto` ya no leen ni escriben `precio_unitario`. La columna `productos.precio_unitario` sigue en la base de datos (no hay migración de borrado). Los precios de Proveedores (`producto_proveedores`) y de Compras NO se tocan: esos sí son la fuente del precio.
- **Filtros:** Inventario solo tenía buscador por nombre/SKU. Ahora tiene dos filas de botones que se combinan con la búsqueda y filtran tanto la tabla como las cards móviles: por categoría ("Todas" + un botón por categoría) y por stock (Todos / Bajo stock / Sin stock / Disponible). Definiciones, mismas que la etiqueta de stock que ya existía (`estadoStock`): Sin stock = stock <= 0; Bajo stock = 0 < stock <= stock mínimo (en el mínimo ya es bajo); Disponible = stock > stock mínimo. El encabezado muestra "N de M productos" cuando hay algún filtro o búsqueda activa. Si no hay productos con el filtro, se muestra "No hay productos con este filtro". Lógica pura en `utils/inventario.ts` (`filtrarInventario`, `clasificarStock`), con tests en `utils/inventario.test.mts`. Botones táctiles de 44px, en móvil con scroll horizontal si no caben, sin desbordar a 360-390px.

### Eliminar órdenes de compra (admin, desde el menú "...")

Alex pedía borrar las órdenes de compra duplicadas de prueba desde la app, sin ir a Supabase. Ahora se puede, pero **anidado en un menú "..." en la card, no como botón visible**: la acción principal visible de la card sigue siendo Recibir.

- **Dónde:** en cada card de orden de compra (pestaña "Órdenes de compra"), arriba a la derecha, un botón "..." (44px táctil, icono MoreHorizontal) que abre un desplegable con "Eliminar orden de compra". El menú se abre a la derecha para no salirse de la pantalla en móvil y cierra al pulsar fuera, al pulsar Escape o al elegir la opción. Reutiliza el patrón del menú del Header (`components/Header.tsx`).
- **Solo admin y solo Pendiente:** el menú solo se muestra si el usuario es admin (`public.is_admin()` vía `esUsuarioAdmin()` en `utils/supabase/server.ts`, con respaldo leyendo `perfiles.rol` del propio usuario; si no se puede comprobar, no es admin) y la orden está en PENDIENTE (`puedeEliminarOrdenCompra()` en `utils/faltantesPorOrden.ts`, con test). Una orden RECIBIDA no se puede borrar: el stock ya subió al recibirla y borrarla no lo bajaría, quedaría el inventario inflado sin rastro de la compra.
- **Confirmación:** al elegir Eliminar se abre el ConfirmDialog existente: "¿Eliminar la orden de compra COM-... de <proveedor>? Sus artículos se eliminan con ella. Esta acción no se puede deshacer."
- **Servidor:** `eliminarOrdenCompra()` en `app/(dashboard)/compras/actions.ts` DEVUELVE `{ success, error }` y nunca lanza (como surtir/recibir, para que el mensaje real llegue al teléfono en vez del #441). Vuelve a comprobar admin y estado, borra en `ordenes_compra` (los artículos se borran en cascada por `ON DELETE CASCADE` en `orden_compra_items`) y revalida `/compras`. La RLS "Admin modifica ordenes_compra" FOR ALL USING (public.is_admin()) ya cubre el DELETE; no hizo falta migración nueva.
- Al eliminar, la card desaparece con `router.refresh()` y se muestra "Orden de compra COM-... eliminada."

### Migración de folios viejos (solo después de fusionar el PR)

Archivo: `supabase/migrations/20261106000000_renombrar_folios_requisiciones_viejas.sql`. Muse no tiene acceso a la base de producción: Alex debe revisarla y correrla él mismo en el SQL Editor de Supabase, solo después de fusionar el PR.

- Actualiza solo los folios viejos `ORD-<6 dígitos>` de `ordenes` a `REQ-0001`, `REQ-0002`... con consecutivo global en orden de `created_at`. Con los datos actuales: `ORD-786179` -> `REQ-0001` y `ORD-699996` -> `REQ-0002`. No toca folios `REQ-...` ni órdenes de compra `COM-...`, ni ningún otro campo.
- Es idempotente: una segunda corrida no encuentra folios `ORD-...` y no cambia nada. Una fila solo se actualiza si su folio nuevo no existe ya en otra requisición; si está ocupado, esa fila se queda con su folio viejo para revisarla.
- Antes de correrla, en el SQL Editor: (1) opcional, respaldo con `CREATE TABLE public.ordenes_folios_backup_20261105 AS SELECT id, folio FROM public.ordenes;` (2) correr la consulta de verificación (preview) que viene en el archivo, que muestra folio viejo -> folio nuevo, cliente y fecha, y revisar el mapa. (3) correr el UPDATE del archivo. (4) volver a correr la verificación: ya no debe quedar ningún folio `ORD-<6 dígitos>`.

```sql
-- Preview (no cambia nada):
SELECT id, folio AS folio_viejo, 'REQ-' || lpad((row_number() OVER (ORDER BY created_at, id))::text, 4, '0') AS folio_nuevo, created_at FROM ordenes WHERE folio ~ '^ORD-[0-9]{6}$' ORDER BY created_at;
-- Update (la migración):
UPDATE ordenes o SET folio = s.folio_nuevo FROM (SELECT id, 'REQ-' || lpad((row_number() OVER (ORDER BY created_at, id))::text, 4, '0') AS folio_nuevo FROM ordenes WHERE folio ~ '^ORD-[0-9]{6}$') s WHERE o.id = s.id AND NOT EXISTS (SELECT 1 FROM ordenes x WHERE x.folio = s.folio_nuevo);
```

## 4. Consideraciones de seguridad y mantenimiento

- No confiar en el rol enviado por el cliente ni en metadatos editables por el usuario para conceder permisos de administrador. La asignación de roles debe realizarse desde un proceso administrativo confiable.
- Las políticas RLS efectivas son las que están instaladas en Supabase, no necesariamente las que aparecen en este archivo. Revisar las políticas reales antes de cambiar permisos.
- Mantener privado el bucket `pdf-facturas`; no sustituirlo por acceso público para resolver errores de carga.
- Antes de ejecutar SQL en producción, generar respaldo, revisar el alcance de cada sentencia y preferir migraciones incrementales.
- La documentación describe el código del repositorio; no sustituye la verificación del estado real de Supabase ni del último despliegue de Vercel.
