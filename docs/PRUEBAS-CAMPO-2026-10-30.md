# Pruebas de campo — IntegrityWatch Field

**Fecha:** 30 de octubre de 2026
**Ejecutor:** `tools/qa/run_field_tests.py` (Playwright + Chromium, automatizado y reproducible)
**Entorno:** servidor local `http://localhost:8419/` (`tools/serve.ps1`), IndexedDB limpia en cada ejecución
**Viewports:** 1440×900 (escritorio) y 1280×800 (tablet Android en horizontal)
**Idioma de la interfaz:** inglés (locale por defecto de la app)
**Resultado global:** **20 capturas · 4 puntos · 32/32 filas importadas · 0 incidencias**
**Suite de tests:** **515/515 en verde** (`npm test`)

Los datos de activo usados en todas las pruebas son reales y trazables:
ver [`FIELD-DATA-SOURCES.md`](FIELD-DATA-SOURCES.md) (NSTA Open Data, UKCS, descargado el 2026-10-30).

---

## 1. Resumen de lo probado

| # | Función | Dato real usado | Resultado |
|---|---|---|---|
| 1 | Arranque y dashboard | — | OK |
| 2 | Módulo de corrosión | — | OK |
| 3-4 | Alta de punto de monitoreo | CATS PL774 (914,4 mm · 28,4 mm · 179,3 barg) | 4 puntos creados |
| 5-7 | Ingesta CSV (mapeo, validación, importación) | `carga-corrosion.csv` (32 lecturas) | 32 importadas · 0 omitidas · 0 errores |
| 8-9 | Alta de sistema de ducto + mapa | CATS PL774 (404,97 km, gas) | Creado |
| 10-11 | Alta de activo APM | Válvula PL1236 (NSTA) | Creado y abierto |
| 12 | Sizing PSV (API 520) | Calculadora del activo sembrado | OK |
| 13 | Reglas R1–R17 | Dataset combinado | 24 recomendaciones |
| 14-15b | Informes: dossier, trimestral, datasheet PSV | MP-PL774 real | 3 documentos |
| 16-17 | Admin y export de expediente | Estado completo | `.iwf` de 107.485 bytes |
| 18-19 | Layout tablet 1280×800 | — | OK |

---

## 2. Paso a paso con capturas

### Paso 1 — Arranque en frío

Instalación PWA, service worker y render inicial sin errores de consola.

![Dashboard tras el arranque](field-tests-2026-10-30/01-dashboard-boot-en.png)

### Paso 2 — Módulo de corrosión antes de los datos

Estado de partida: 8 puntos del dataset de demostración.

![Lista de corrosión antes](field-tests-2026-10-30/02-corrosion-list-before.png)

### Paso 3 — Alta de punto con datos reales (CATS PL774)

Formulario rellenado con atributos publicados por NSTA: 914,4 mm de diámetro,
28,4 mm de espesor, 179,3 barg de presión máxima, 8.000 ppm CO₂, 55 °C.

![Formulario de nuevo punto](field-tests-2026-10-30/03-new-point-cats-form.png)

### Paso 4 — Ficha del punto creado

Se crean cuatro puntos, uno por producto: `MP-PL774` (gas), `MP-PL139` (crudo),
`MP-PL1257A` (condensado) y `MP-PL6385` (multifásico).

![Ficha de MP-PL774](field-tests-2026-10-30/04-point-cats-detail.png)

> En este paso se detectó el defecto descrito en la sección 4: el id del punto no
> coincidía con su código y rompía la unión con las lecturas importadas.

### Paso 5 — Ingesta CSV: mapeo automático de columnas

El archivo usa cabeceras en español (`punto`, `tasa`, `área`, `días`…) y la app
las resuelve sola contra el esquema canónico.

![Mapeo de columnas](field-tests-2026-10-30/05-ingest-mapping.png)

### Paso 6 — Validación

**32 filas totales · 32 válidas · 0 omitidas · 0 con errores.**

![Resultado de la validación](field-tests-2026-10-30/06-ingest-validation.png)

### Paso 7 — Importación confirmada

Se escriben 32 lecturas en IndexedDB. Recuento posterior desde el propio store:
`readings` pasa de 120 a **152** y `monitoringPoints` de 8 a **12**.

![Importación completada](field-tests-2026-10-30/07-ingest-imported.png)

### Paso 8 — Alta del sistema de ducto real

Sistema `CATS PIPELINE`: 36 pulgadas, 28,4 mm de pared, API 5L X52, 17,93 MPa,
404,97 km, producto gas. Operador anonimizado como `UKCS Operator 11`.

![Formulario de sistema de ducto](field-tests-2026-10-30/08-pipeline-system-form.png)

### Paso 9 — Detalle y mapa de estaciones

![Detalle del ducto CATS](field-tests-2026-10-30/09-pipeline-cats-map.png)

### Paso 10 — Alta de activo APM desde un registro real de NSTA

Válvula `VALVE-PL1236-001`, sector midstream, criticidad B, POF 3 / COF 3,
intervalo base de inspección 24 meses.

![Formulario de activo APM](field-tests-2026-10-30/10-apm-asset-form.png)

### Paso 11 — Ficha del activo con banda RBI

![Detalle del activo](field-tests-2026-10-30/11-apm-asset-detail.png)

### Paso 12 — Sizing PSV (API 520/526)

Vista de cálculo con orificio, capacidad certificada y margen.

![Detalle de PSV](field-tests-2026-10-30/12-psv-sizing-detail.png)

### Paso 13 — Barrido de reglas R1–R17

Tras el barrido, el store contiene **24 recomendaciones** y el panel muestra
2 alarmas críticas y 19 recomendaciones abiertas.

![Recomendaciones tras el barrido](field-tests-2026-10-30/13-recommendations-after-rules.png)

### Paso 14 — Dossier del punto real

Documento generado en el dispositivo con los atributos de la línea y la serie de lecturas.

![Dossier de MP-PL774](field-tests-2026-10-30/14-report-dossier-cats.png)

### Paso 15 — Informe trimestral

![Informe trimestral](field-tests-2026-10-30/15-report-quarterly.png)

### Paso 15b — Datasheet de PSV

![Datasheet de PSV](field-tests-2026-10-30/15b-report-psv-datasheet.png)

### Paso 16 — Admin: almacenamiento, idiomas y export

![Panel de administración](field-tests-2026-10-30/16-admin-data.png)

### Paso 17 — Export del expediente

Descarga real verificada en disco: `case-file-export.iwf.json`, **107.485 bytes**
(se conserva junto a las capturas).

![Export completado](field-tests-2026-10-30/17-admin-exported.png)

### Paso 18 — Tablet Android en horizontal (1280×800)

El heatmap ya muestra las tasas de los cuatro puntos reales: 9,4 / 6,8 / 4,9 / 4,6 mpy.

![Dashboard en tablet](field-tests-2026-10-30/18-tablet-dashboard-1280.png)

### Paso 19 — Ingesta en tablet

![Ingesta en tablet](field-tests-2026-10-30/19-tablet-ingest-1280.png)

---

## 3. Métricas de la ejecución

| Métrica | Valor |
|---|---|
| Puntos de monitoreo creados | 4 |
| Lecturas importadas | 32 de 32 (0 omitidas, 0 errores) |
| Lecturas totales en el store | 152 (120 sembradas + 32 importadas) |
| Sistemas de ducto | 1 sembrado + 1 creado (CATS) |
| Activos APM | 18 sembrados + 1 creado |
| Recomendaciones tras R1–R17 | 24 |
| Informes generados | Dossier + trimestral + datasheet |
| Export de expediente | 107.485 bytes |
| Capturas | 20 |
| Incidencias de la ejecución | 0 |
| Suite de tests | 515/515 |

Evidencia legible por máquina: `docs/field-tests-2026-10-30/evidence.json`.

---

## 4. Defecto encontrado y corregido

**Síntoma.** Los puntos creados desde la interfaz mostraban «—» en el KPI de tasa
media y en el heatmap, pese a tener lecturas importadas correctamente.

**Causa raíz.**
- `src/views/corrosion.js` → `assembleMp` asignaba `id = 'MP-' + Date.now().toString(36)`
  a los puntos nuevos.
- `src/ingest/csv.js` → `validateRows` asigna `reading.mpId = code`.
- `src/views/dashboard.js` une lecturas por `mpId` contra `mp.id`, así que la unión
  fallaba para todo punto creado en la app. El seed lo ocultaba porque usa `id === code`.

**Corrección.** `rec.id = rec.code` para puntos nuevos (convención de `docs/SCHEMA.md`
y del seed). Se exporta `assembleMp` para poder probarlo sin DOM. Validación de
código duplicado intacta; los puntos existentes conservan su id al editarse.

**Verificación.** Tests nuevos en `tests/monitoring-point-id.test.js` (3 casos,
RED → GREEN). Suite: 512 → **515**, 0 fallos. Tras el fix, el heatmap muestra
9,4 / 6,8 / 4,9 / 4,6 mpy y el KPI medio pasa de 3,24 a 3,98 mpy.

---

## 5. Observaciones menores (no bloqueantes)

1. **El formulario de punto no expone `stationKm` ni `location`**, aunque el esquema
   los admite: la ficha muestra «—» en esos campos. Es una carencia de UI, no de datos.
2. **El aviso «Update available»** del service worker aparece en cada arranque y
   ensuciaba las capturas; el runner lo retira antes de fotografiar. En producto
   convendría que ese aviso no se muestre durante una sesión de captura o demo.
3. **Conteos de la app y del store pueden diferir** en la primera lectura tras el
   barrido (24 en store frente a 19 abiertas en el banner, porque las resueltas no cuentan).

---

## 6. Reproducción

```powershell
cd D:\ArquitectoSupremo\integritywatch-field
python tools\serve.ps1 -Port 8419          # en otra terminal
python tools\qa\fetch_field_data.py        # datos reales (opcional si ya existen)
python tools\qa\run_field_tests.py         # pruebas + capturas + evidence.json
```

El runner usa un perfil de navegador nuevo en cada ejecución, por lo que parte
siempre de IndexedDB limpia y los recuentos son comparables entre corridas.
