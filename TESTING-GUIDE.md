# Guía de pruebas — Requisa Software

## Automáticas (antes de cada subida)

- `npm test`: suites con node:test en `utils/*.test.mts`:
  - `requisicion`: parser de facturas CONTPAQi, carta de entrega y
    bloques por columnas.
  - `vincularProductos`: cotejo, combobox de candidatos y la regla
    "la sugerencia propone, el usuario dispone" (un plural solo no
    autovincula).
  - `geminiExtraccion`: prompt, parseo del JSON y normalización de
    unidades.
  - `faltantesPorOrden`: proveedor sugerido, agrupación de compra y
    anti-duplicado.
  - `surtir`: RPC transaccional, respaldo secuencial y mensajes de
    error.
  - `inventario`: clasificación de stock y filtrado.
  - `folioRequisicion`: formato y consecutivo.
  - `huecosProveedor`: detección de sin proveedor y sin precio.
  - `limiteUso`: ventana por clave (permite, bloquea y libera).
- `npx tsc --noEmit`: tipos.
- `npm run lint`: ESLint.
- `npm run build`: build de producción.

Regla: las cuatro en verde antes de subir a main.

## Manuales (teléfono real, 390px)

- Recorrido frío sin explicación (prueba de la cuñada): subir una
  requisición, cotejar, surtir y comprar el faltante.
- Pilotos de lectura: foto chueca de factura CONTPAQi (esperado
  9 de 9) y carta de entrega (5 de 5, cantidades de media aceptadas,
  medianas y jumbo sin cruzar); verificar la etiqueta "Leído con IA"
  o "Leído con OCR".
- Avisos: tras surtir, editar o eliminar una requisición debe
  aparecer el aviso toast; al navegar debe verse el esqueleto de
  carga.
- Pendientes de verificación humana: vista a 390px en teléfono
  real; discrepancia 37312 contra 37317 en Inventario (Bolsas
  negras jumbo de 25 KGS); formatos de papel del municipio, que son
  la prueba real de la IA.
