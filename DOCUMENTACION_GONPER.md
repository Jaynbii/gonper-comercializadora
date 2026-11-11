# Requisa Software — Documentación del sistema

**Última actualización:** noviembre de 2026
**Estado:** sistema terminado y en producción (Vercel despliega desde la rama `main`).
**Nombre visible:** Requisa Software. El repositorio, el proyecto de Vercel y la URL conservan el nombre anterior (`gonper-comercializadora`) por decisión de alcance: solo cambió el nombre visible en la web.
**Repositorio:** `Jaynbii/gonper-comercializadora`, rama `main`.
**URL de producción:** `https://gonper-comercializadora.vercel.app`
**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Supabase (Auth, Postgres, Storage).
**Librerías clave:** `pdfjs-dist` / `unpdf` (texto de PDF), `tesseract.js` (OCR de respaldo), `fuse.js` (cotejo difuso), API de Gemini (lectura de fotos).
**Configuración:** Server Actions con límite de cuerpo de `10mb`; bucket privado `pdf-facturas`.

## 1. Qué es

Requisa Software es el sistema interno de Gonper Comercializadora (Mazatlán) para operar el ciclo completo de requisiciones de dependencias y mercados municipales:

1. Recibir la requisición del cliente como factura PDF (CONTPAQi/CFDI) o como foto/escaneo de la forma de papel.
2. Leerla (texto de PDF, IA de visión o OCR) y cotejar cada artículo contra el inventario.
3. Surtir lo que hay en stock y comprar el faltante al proveedor más barato con precio registrado.
4. Recibir la mercancía y actualizar el stock.

La interface es 100% mobile first (diseñada primero para 360–390 px, sin scroll horizontal) y está pensada para un usuario que la usa por primera vez sin explicación.

## 2. Módulos

- **Dashboard:** tarjetas de métricas, acceso rápido a subir requisición y proyección de demanda (faltantes contra stock).
- **Inventario:** catálogo de productos con categorías, filtros por categoría y por stock (Todos / Bajo stock / Sin stock / Disponible) combinados con la búsqueda. Sin precio: el precio lo manda el proveedor (ver Proveedores); la columna `productos.precio_unitario` sigue en la base de datos pero ya no se muestra ni se escribe desde aquí.
- **Requisiciones:** subida de PDF/foto, lectura, cotejo con el catálogo, estados (BORRADOR, PENDIENTE, PARCIAL, ENTREGADA, CANCELADA), visor de PDF seguro y surtido.
- **Compras:** faltantes por requisición con proveedor sugerido y costo estimado, generación de órdenes de compra y recepción de mercancía. Pestañas: Requisiciones, Sugerencias (General | Por requisición) y Órdenes de compra.
- **Proveedores:** directorio con catálogo de precios por producto (relación N:M) y sección "Productos sin proveedor o sin precio" con asignación rápida en línea.
- **Clientes:** directorio de mercados y dependencias de gobierno.
- **Login:** acceso con correo y contraseña (Supabase Auth).

## 3. Flujos operativos

### 3.1 Captura y lectura de una requisición

1. En **Requisiciones** se crea una requisición desde un PDF o una imagen. El archivo se sube con la Server Action `subirYProcesarPDF` al bucket privado `pdf-facturas` y la requisición queda registrada en `ordenes` con su `pdf_path`.
2. Al pulsar **Leer archivo**:
   - **PDF con texto** (facturas CONTPAQi/CFDI): se extrae el texto con pdfjs y lo interpreta `parseRequisicion` (`utils/requisicion.ts`), que también entiende cartas de entrega y bloques por columnas.
   - **Foto o escaneo:** se intenta primero la lectura con IA (`extraerConGemini`, modelo `gemini-3.5-flash-lite`): la imagen se baja del bucket con URL firmada, se envía a la API de Gemini con respuesta JSON forzada y el resultado se valida y normaliza (`utils/geminiExtraccion.ts`). Si falta la llave, hay error o timeout, se cae al OCR con Tesseract sin cambiar nada para el usuario. Los PDF escaneados (sin texto) también van por Tesseract.
   - El modal muestra la etiqueta **"Leído con IA"** o **"Leído con OCR"** según el método que leyó.
3. **Cotejo:** cada artículo leído se compara con el catálogo (`utils/vincularProductos.ts`):
   - `vincularItems` decide el vínculo automático con umbrales estrictos (score Fuse máximo 0.35 para auto-vincular; 0.40 para sugerir o para acuerdo de nombre). Las variantes en plural solo ayudan al ranking de sugerencias, nunca al vínculo automático.
   - Al corregir la descripción, un combobox muestra hasta 5 candidatos en vivo, ordenados por similitud, con las coincidencias resaltadas. Tocar un candidato (o Enter) aplica código, nombre, unidad y vínculo.
   - **Regla de oro:** la sugerencia propone, el usuario dispone. Nada se aplica solo desde las sugerencias, y una fila auto-vinculada muestra el CÓDIGO vacío hasta que el usuario toca el candidato (el vínculo interno ya existe y Confirmar lo usa).
   - Las unidades se normalizan a la lista permitida (`utils/unidades.ts`); la IA tiene prohibido inventar unidades.
4. Al confirmar, los artículos quedan en la requisición listos para surtir o comprar el faltante.

### 3.2 Surtido

- El surtido es **transaccional** vía la RPC `surtir_orden` (migración `20261106020000_surtir_orden_rpc.sql`): en una sola transacción bloquea requisición, artículos y productos (`FOR UPDATE`), surte por artículo `min(stock, pendiente)` donde pendiente = solicitada − ya surtida, descuenta stock, suma `cantidad_surtida`, registra el movimiento (`SALIDA`) y marca la requisición ENTREGADA o PARCIAL. Si algo falla, no se escribe nada.
- Si la RPC no existe en la base, hay respaldo secuencial (`utils/surtir.ts`) que verifica cada escritura y **devuelve** el error en vez de lanzarlo, para que el mensaje real llegue al teléfono (evita el error minificado #441 de Next en producción).
- El surtido parcial se preserva: si piden 10 y hay 6, se surten 6 y la requisición queda PARCIAL. El botón de surtir aparece en requisiciones PENDIENTE y PARCIAL.

### 3.3 Compras

- **Faltantes por requisición** (`utils/faltantesPorOrden.ts`): por cada requisición activa calcula qué se puede surtir con el stock actual, qué falta, el proveedor sugerido (el más barato con precio mayor a cero en `producto_proveedores`) y el costo estimado del faltante. El stock se descuenta una sola vez entre artículos del mismo producto para no comprar de más. Un producto sin precio se muestra como "sin precio, pedir por WhatsApp" y no se inventa un costo.
- **Comprar faltante de esta requisición:** abre un diálogo con proveedor(es), artículos, cantidades, precios y total; genera una orden de compra por proveedor solo con los artículos que tienen precio, vinculada a la requisición (`ordenes_compra.requisition_id`). Antes de generar avisa si ya hay órdenes Pendientes para esa requisición y el servidor bloquea duplicados con los mismos artículos y cantidades (`esMismaCompra`).
- **"Ya recibí la mercancía, subir stock"** (activado por defecto): tras generar, recibe de inmediato vía `recibirMercancia` (RPC `recibir_mercancia`, movimiento `ENTRADA`, la orden queda RECIBIDA) para poder surtir. Si la recepción falla, la compra queda generada sin marcar y se muestra el error.
- **Órdenes de compra:** cards agrupadas por requisición ("Para REQ-0003 · cliente") con un grupo "Sin requisición" al final; Recibir es la acción principal. Eliminar una orden está anidado en el menú "..." de la card, solo para admin y solo en PENDIENTE (una RECIBIDA no se borra: el stock ya subió).
- Desde el detalle de una requisición, **"Ir a Compras por el faltante de esta requisición"** abre directo el diálogo de compra de esa requisición (`/compras?orden=<id>&comprar=1`); si no hay faltantes, solo aterriza seleccionada en "Por requisición", sin modal.
- El aviso de artículos sin precio en el diálogo trae el botón **"Asignar precios en Proveedores"**, que lleva a la sección de huecos de Proveedores.

### 3.4 Proveedores e inventario

- Los precios viven con el proveedor: `producto_proveedores(precio_unitario)`. Inventario no muestra ni escribe precio.
- **"Productos sin proveedor o sin precio"** (inicio de Proveedores, `utils/huecosProveedor.ts`): lista los productos sin vínculo o sin ningún vínculo con precio mayor a cero, con chip "Sin proveedor" / "Sin precio" y asignación rápida en línea (proveedor + precio + Guardar). Al guardar, la fila sale sola.
- Filtros de Inventario (lógica pura en `utils/inventario.ts`, con tests): Sin stock = stock <= 0; Bajo stock = 0 < stock <= stock mínimo; Disponible = stock > stock mínimo. Se combinan con la búsqueda por nombre/SKU.

## 4. Base de datos (Supabase)

Tablas principales:

| Tabla | Contenido |
|---|---|
| `perfiles` | Usuarios con rol (`admin` / `operador`), ligado a `auth.users`. |
| `categorias` | Categorías de producto. |
| `clientes` | Dependencias y mercados (destino de las requisiciones). |
| `proveedores` | Proveedores de compra. |
| `productos` | Catálogo: `sku` único, nombre, `unidad_medida`, categoría, `stock_actual`, `stock_minimo`. La columna `precio_unitario` es legado (ya no se usa desde la UI). El código SAT del producto vive en `codigo_sat` (columna presente en producción; el SQL inicial del repositorio no la crea, la fuente de verdad del esquema es Supabase). |
| `producto_proveedores` | Relación N:M producto–proveedor con `precio_unitario` (única fuente del precio). |
| `ordenes` | Requisiciones: folio `REQ-0001` consecutivo global, `cliente_id`, estado, `pdf_path`, notas. |
| `orden_items` | Renglones de la requisición: cantidad solicitada/surtida, `unidad` (copia al momento de la orden), estado del renglón. |
| `ordenes_compra` | Compras a proveedores: folio `COM-...`, proveedor, `requisition_id` (nullable), estado (PENDIENTE, ENVIADA, RECIBIDA, CANCELADA), total estimado. |
| `orden_compra_items` | Renglones de la compra: cantidad solicitada/recibida. |
| `movimientos_inventario` | Historial de stock: `tipo_movimiento` corto (ENTRADA, SALIDA, AJUSTE, ENTRADA_COMPRA, SALIDA_ORDEN, AJUSTE_MANUAL; el CHECK acepta los seis vía migración), cantidad, motivo, orden y usuario. |

Enums: `estado_orden` (BORRADOR, PENDIENTE, PARCIAL, ENTREGADA, CANCELADA), `estado_item` (SURTIMIENTO_COMPLETO, PARCIAL, SIN_STOCK), `rol_usuario` (admin, operador).

RPCs usadas por la app: `surtir_orden` (surtido transaccional), `recibir_mercancia` (recepción transaccional), `is_admin` (chequeo de rol en políticas y servidor).

Migraciones en `supabase/migrations/` (se corren en el SQL Editor de Supabase, son idempotentes; revisarlas antes de correrlas y respaldar):

- `20261103000000_add_unidades.sql` — columnas de unidad.
- `20261106000000_renombrar_folios_requisiciones_viejas.sql` — folios `ORD-...` viejos a `REQ-0001...` en orden de creación.
- `20261106010000_add_requisition_id_to_ordenes_compra.sql` — vínculo compra → requisición.
- `20261106020000_surtir_orden_rpc.sql` — RPC de surtido transaccional.
- `20261106030000_ampliar_tipos_movimiento_inventario.sql` — CHECK de tipos de movimiento a seis valores.
- `20261106040000_fix_surtir_orden_for_update.sql` — ajuste de bloqueo en la RPC.

El SQL de instalación inicial (crear todo desde cero, con `DROP TABLE CASCADE`) existe solo como referencia histórica: **nunca ejecutarlo sobre producción ni sobre una instalación existente**. Para cambios de esquema se crean migraciones incrementales revisadas.

## 5. Seguridad

- **RLS en todas las tablas:** ningún usuario ve ni modifica datos sin autenticación. Lecturas generales para usuarios autenticados; escrituras sensibles (productos, perfiles, órdenes de compra) restringidas a admin vía `public.is_admin()`. Las políticas efectivas son las instaladas en Supabase: revisarlas ahí antes de cambiar permisos.
- **Roles:** `admin` (puede todo, incluida eliminación de órdenes de compra Pendientes) y `operador` (limitado). El rol nunca se confía desde el cliente: se valida en servidor y en RLS.
- **Bucket privado `pdf-facturas`:** no hay URLs públicas de archivos. El visor genera URL firmada de 60 segundos; el lector (OCR/IA) usa una de 5 minutos.
- **Llave de Gemini solo en servidor** (`GEMINI_API_KEY` en Vercel, nunca en el cliente ni en el repositorio). Sin esa variable, las fotos se leen con Tesseract y todo lo demás sigue igual. La llave de Requisa es separada de la del generador de títulos de YouTube.
- La sesión se refresca en cada petición (middleware raíz) para que el login no caduque a mitad de uso.

## 6. Configuración y operación

Variables de entorno (ver `.env.example`):

| Variable | Obligatoria | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Clave pública (anon) de Supabase; la seguridad real la hace RLS. |
| `GEMINI_API_KEY` | No | Lectura de fotos con IA. Sin ella se usa OCR Tesseract. |

Desarrollo local:

```bash
npm install
npm run dev        # desarrollo
npm test           # tests de utils (node test runner)
npx tsc --noEmit   # tipos
npm run lint       # eslint
npm run build      # build de producción
```

Despliegue: trabajar directo sobre `main` (sin PRs, por decisión de Alex). Cada push a `main` despliega en Vercel en `gonper-comercializadora.vercel.app`. En la PC de Alex basta `git pull` sobre `main` (clon en `C:\Users\Alexis\gonper-sistema`).

Reglas de operación:

- No editar la base de producción directamente desde el código: las migraciones se entregan como SQL revisado para correrlas en el SQL Editor de Supabase.
- Los datos vistos durante el desarrollo son de prueba; no se borran registros automáticamente.
- Antes de ejecutar SQL en producción: respaldo, revisión del alcance de cada sentencia y preferir migraciones incrementales.

## 7. Reglas de negocio (permanentes)

- **Terminología:** lo que piden los clientes se llama **Requisición**; lo que se pide a los proveedores se llama **Orden de compra**. Aplica a toda la UI. Las rutas (`/ordenes`), las tablas y los nombres internos de funciones **no** se renombraron, para no romper enlaces ni la app.
- **Folios:** requisiciones con folio `REQ-0001`, `REQ-0002`... consecutivo global en orden de creación (`utils/folioRequisicion.ts`, función pura con tests). Nunca se repite un número.
- **Precio:** vive con el proveedor (`producto_proveedores`) y en Compras; nunca en Inventario.
- **Surtido:** parcial preservado; el stock nunca queda negativo (la RPC bloquea filas y surte `min(stock, pendiente)`).
- **Cotejo:** la sugerencia propone y el usuario dispone; nada se aplica solo desde las sugerencias.
- **Sin precio no se compra:** sin precio registrado se avisa "pedir por WhatsApp" y no se inventa un costo.
- **Naranja y rojo** se reservan solo para urgente/faltante y errores.

## 8. Identidad visual

- **Paleta definitiva Lime + Concrete** (elegida por Alex el 2026-11-11 tras revisión 1x1; tokens en `app/globals.css`): fondo `#F2F2F2`, tarjetas blancas, acento lime `#7BB601` (hover `#6AA200`), neutros `#BDBDBD` y `#666666`, texto `#1F1F1F`, texto sobre lime oscuro (`--color-gonper-on-primary`). El texto de éxito usa un verde oscurecido (`#497300`) sobre su fondo claro para legibilidad.
- **Logo:** flecha en ciclo (requisición → compra → entrega → otra vez), componente `components/LogoRequisa.tsx`, usado en login, sidebar y favicon (`app/icon.svg`: cuadro lime con la marca oscura). El wordmark visible es "Requisa Software".
- Microinteracciones notables pero sobrias. Claridad por encima de sutileza para un usuario primerizo.

## 9. Mapa del código

```
app/
  layout.tsx              Título y fuentes (Instrument Sans/Serif/Mono)
  icon.svg                Favicon (logo ciclo)
  login/                  Acceso (page + actions)
  (dashboard)/
    page.tsx              Dashboard
    layout.tsx            Marco (Sidebar + Header)
    template.tsx          Transiciones entre secciones
    inventario/           Inventario (page, InventoryClient, actions)
    ordenes/              Requisiciones: lista, detalle [id], nueva (UploadClient),
                          ProcesarPdfButton (lectura + cotejo), extraerConGemini,
                          procesarTexto / procesarPdf, actions
    compras/              Compras (page, ComprasClient, actions)
    proveedores/          Proveedores (page, ProveedoresClient, actions)
    clientes/             Clientes (page, ClientesClient, actions)
components/
  LogoRequisa.tsx         Marca ciclo (SVG, currentColor)
  Header.tsx / Sidebar.tsx
  ui/                     Modal, ConfirmDialog, EmptyState, Fab, PageHeader
utils/                    Lógica pura con tests (*.test.mts junto a cada módulo):
  requisicion.ts          Parser de texto de requisición (PDF/OCR/carta)
  vincularProductos.ts    Cotejo contra catálogo + combobox (buscarCandidatos)
  geminiExtraccion.ts     Prompt, cuerpo de petición y parseo de la respuesta Gemini
  faltantesPorOrden.ts    Faltantes, proveedor sugerido, agrupaciones, anti-duplicado
  huecosProveedor.ts      Productos sin proveedor o sin precio
  inventario.ts           Filtros y clasificación de stock
  folioRequisicion.ts     Siguiente folio REQ-XXXX
  surtir.ts               Plan de surtido y errores (respaldo de la RPC)
  unidades.ts             Unidades permitidas y normalización
  supabase/               Clientes browser/server y refresco de sesión
supabase/migrations/      Migraciones SQL (ver sección 4)
middleware.ts             Raíz: refresca la sesión en cada petición
```

Los tests viven junto a cada módulo de `utils` (`*.test.mts`) y se corren con `npm test`. La lógica de negocio vive en `utils` (pura y testeable); las Server Actions orquestan Supabase y la UI.

## 10. Pendientes conocidos

- Verificar en un teléfono real a 390 px los flujos con datos reales (Compras con requisiciones, diálogo de compra, cotejo).
- Re-prueba con la cuñada de Alex (primera usuaria sin conocer la app; la encontró confusa y la corrección ya está en producción).
- Discrepancia de catálogo por confirmar en Inventario: el papel dice 37312 y el catálogo 37317 para "Bolsas negras jumbo de 25 KGS" (solo visual, no bloquea).
- Formas de papel del Municipio como prueba real de la lectura de fotos con IA (los pilotos con facturas impresas y carta de entrega salieron bien).
- Validar el naranja `#c2410c` y el rojo de peligro reservados para urgente/faltante y errores.
