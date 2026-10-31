# Plan de implementación — Fase 1 de reportabilidad

**Fecha:** 31-10-2026 · **Base:** `docs/REPORTING-BLUEPRINT.md`
**Alcance aprobado:** Fase 1 completa + exportadores DOCX/XLSX reales.

## Invariantes (no negociables)

1. `IW.reports.<id>.build(opts) → Promise<Element>` se mantiene: ningún consumidor cambia.
2. **Cero cálculos en el renderer**: todo viene de `src/calc/*` o del modelo.
3. **Cero dependencias runtime** (offline-first, sin CDN).
4. Gráficos en **SVG** (imprimibles, testeables), nunca canvas.
5. Todo archivo nuevo entra en `sw.js` `PRECACHE` y se sube `CACHE_NAME`.
6. La salida visible de los 3 informes actuales no cambia en Fase 1.

## Chunks

| # | Entrega | Archivos | Verificación |
|---|---|---|---|
| **A** | Tests de caracterización + motor (modelo/renderer/registry) + migración de los 3 informes | `tests/helpers/dom-shim.js`, `tests/reports-characterization.test.js`, `src/reports/model.js`, `renderer.js`, `registry.js`, adaptadores | `npm test` ≥ 515 + nuevos; salida equivalente |
| **B** | Plantillas T-01, T-02, T-07, T-11 + primitivas SVG (trend, cusum, bullet, matrix) | `src/reports/templates/*.js`, `src/reports/charts.js` | Render correcto con dataset semilla y NSTA |
| **C** | Exportadores: ZIP propio, DOCX, XLSX, paquete firmado | `src/export/zip.js`, `docx.js`, `xlsx.js`, `package.js` | Archivos abren en Word/Excel; hash verificable |
| **D** | i18n EN/ES + fallback, precache, bump, capturas A4 | `src/i18n/locales/*`, `sw.js`, `assets/styles/reports.css`, capturas | 7 idiomas sin claves crudas; app funciona sin red |

## Criterio de cierre de Fase 1

- 3 informes actuales: estructura idéntica (test de caracterización).
- 4 informes nuevos: renderizan con semilla y con `datos-prueba/real/`.
- PDF A4 sin desbordes en los 7.
- DOCX abierto en Word y XLSX en Excel sin errores.
- Paquete `.zip` con `manifest.json` + `SHA-256` verificable.
- `npm test` verde y `sw.js` con versión nueva.
