# Flujos de usuario — Requisa Software

Mapa de pantallas y recorridos principales. Pantallas: inicio de
sesión; panel con barra lateral y encabezado: Requisiciones
(ordenes), detalle de requisición (ordenes/[id]), nueva requisición
(ordenes/nueva), Compras (pestañas Requisiciones, Sugerencias y
Órdenes de compra), Inventario, Proveedores y Clientes.

## Flujo 1: de la requisición al surtido

1. Requisiciones, botón Leer archivo, elegir PDF o foto llegada por
   WhatsApp.
2. PDF de texto: pdfjs. PDF escaneado o foto: Gemini (etiqueta
   "Leído con IA") o Tesseract ("Leído con OCR") según disponibilidad.
3. Cotejo en el modal: cada renglón trae código, cantidad, unidad y
   descripción editables; el combobox sugiere candidatos (tocar o
   Enter para aplicar); lo no vinculado se registra como producto
   nuevo al confirmar.
4. Confirmar: la requisición queda Pendiente con folio `REQ-####`.
5. Detalle, Surtir requisición (o Surtir parcialmente), confirmación,
   aviso toast y actualización de la página.

## Flujo 2: comprar el faltante

1. Detalle, botón "Ir a Compras por el faltante de esta requisición":
   aterriza en Compras con el diálogo de compra de ESA requisición
   abierto (si no hay faltantes, solo queda seleccionada en Por
   requisición).
2. El diálogo agrupa por proveedor sugerido con precio; los
   artículos sin precio quedan fuera con aviso y botón "Asignar
   precios en Proveedores".
3. Confirmar: se generan órdenes de compra por proveedor, solo con
   artículos que tienen precio.
4. Órdenes de compra, Recibir: el stock entra y la requisición
   avanza.

## Flujo 3: cerrar huecos de catálogo

Proveedores, sección "Productos sin proveedor o sin precio" (chip
con conteo): elegir proveedor, capturar precio, Guardar; la fila
sale sola de la lista.

## Flujo 4: inventario del día

Inventario con filtros Todos, Bajo, Sin y Disponible, más búsqueda.
El precio no se captura aquí: vive con el proveedor.

## Navegación y estados

- Aterrizaje por defecto en Compras: pestaña Requisiciones. Con
  `?orden=` aterriza en Sugerencias, Por requisición; con
  `&comprar=1` además abre el diálogo de compra.
- Al navegar entre pantallas se muestra un esqueleto de carga; los
  modales atrapan el foco y cierran con Escape (diálogo nativo).
