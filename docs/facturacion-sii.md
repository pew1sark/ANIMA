# Facturación electrónica con el SII (STUDIO → Taller → Facturas)

Emite factura (33), factura exenta (34), boleta (39) y nota de crédito (61),
firmadas con el certificado del Alma y enviadas directo al SII.

## Piezas

| Pieza | Dónde |
|---|---|
| Pestaña | `assets/js/facturacion.js` (se enchufa en `NAV_TREE` de `anima.js`) |
| Tablas y Vault | `supabase/migrations/0145_sii_facturacion.sql` |
| Armado y firma del XML | `supabase/functions/sii-dte/dte.ts` |
| Conversación con el SII | `supabase/functions/sii-dte/sii.ts` |
| Puertas HTTP | `supabase/functions/sii-dte/index.ts` |
| Prueba de la firma | `supabase/tests/sii_dte.test.mjs` |

## Flujo

1. **Configuración**: datos del emisor, certificado `.pfx` y CAF (folios) por tipo.
   El certificado y los CAF quedan cifrados en Vault; el navegador solo lee tablas por RLS.
2. **Emitir**: la función valida, toma el folio de forma atómica (`sii_tomar_folio`),
   arma y firma el DTE, lo guarda y lo envía. Si el envío falla, el documento queda
   firmado ("No se envió") y se reintenta sin gastar otro folio.
3. **Emitidas**: «Actualizar estado» consulta al SII por el número de seguimiento.

Cada ambiente (certificación y producción) tiene folios y documentos propios. Se
parte siempre en certificación; pasar a producción pide confirmación explícita.

## Pruebas locales

```bash
node --experimental-strip-types supabase/tests/sii_dte.test.mjs   # necesita openssl, python3 y lxml
```

Comprueba totales, RUT, timbre (TED) y que cada firma XMLDSig verifica contra la
canonicalización de libxml, una implementación distinta a la propia.

## Pendiente antes de producción

- Nada de esto se ha probado contra el SII real: falta el set de pruebas de
  certificación (con un certificado y CAF de certificación de la empresa).
- Confirmar contra el SII los hosts y respuestas de las boletas (API REST) y de
  las consultas de estado.
- Validar el XML contra los XSD oficiales (`EnvioDTE_v10.xsd`, `EnvioBOLETA_v11.xsd`).
- Decidir si se agrega intercambio con receptores (acuse, aceptación) y libros IVA.
