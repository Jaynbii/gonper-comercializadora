# Requisitos técnicos — Requisa Software

Qué debe cumplir el sistema (funcional y no funcional). El detalle de
arquitectura, base de datos y operación vive en
`DOCUMENTACION_GONPER.md`; este documento es la lista verificable.

## Requisitos funcionales

- RF-01 Captura de requisición por PDF (texto con pdfjs; escaneado
  con OCR) y por foto (Gemini con respaldo Tesseract; sin llave de
  IA vuelve a Tesseract sin cambiar código).
- RF-02 Cotejo contra el catálogo propio: la sugerencia propone, el
  usuario dispone (nada se aplica desde sugerencias sin un toque).
- RF-03 Surtido transaccional (RPC `surtir_orden` con respaldo
  secuencial) y surtido parcial permitido.
- RF-04 Compras por faltante: proveedor sugerido con precio,
  agrupado por proveedor, sin duplicados; los artículos sin precio
  quedan fuera con aviso.
- RF-05 Proveedores: sección de huecos (sin proveedor o sin precio)
  con asignación en línea; el precio vive con el proveedor, no en
  Inventario.
- RF-06 Inventario: filtros Todos, Bajo, Sin y Disponible, más
  búsqueda; sin stock significa stock menor o igual a cero.
- RF-07 Folios globales `REQ-0001` con folio, cliente y fecha
  visibles juntos; terminología permanente: cliente = Requisición,
  proveedor = Orden de compra.
- RF-08 Avisos de confirmación tras surtir, editar o eliminar una
  requisición, y pantallas de carga con esqueleto al navegar.

## Requisitos no funcionales

- RNF-01 Móvil primero: diseño a 390px, acciones a todo ancho,
  objetivos táctiles de al menos 44px de alto.
- RNF-02 Paleta Lime + Concrete definitiva; naranja y rojo solo
  para urgente o faltante y para errores; texto sobre lime oscuro
  vía el token on-primary.
- RNF-03 Claridad sobre sutileza para usuario primerizo;
  animaciones notables pero sobrias; se respeta
  `prefers-reduced-motion`.
- RNF-04 Código: funciones pequeñas con una responsabilidad,
  comentarios en español que describen qué hace cada cosa, sin
  emojis en código ni en documentación.
- RNF-05 Seguridad: RLS en Supabase, bucket `pdf-facturas` privado
  con URLs firmadas (60s para el visor, 5min para el OCR),
  `GEMINI_API_KEY` solo en el servidor, headers de seguridad en
  `next.config`, límite de uso en la lectura con IA.
- RNF-06 Calidad: tests, tipos, lint y build en verde antes de
  subir; merge directo a main; cambios de base de datos como SQL
  revisado para el editor de Supabase (nunca editar producción
  directo ni borrar registros en automático).

## Fuera de alcance

- Facturación CFDI y contabilidad (eso es CONTPAQi).
- Integración con sistemas del municipio: el municipio emite la
  requisición y el proveedor la captura en su sistema interno.
- Multitenancia y seguimiento de entregas de proveedores.
