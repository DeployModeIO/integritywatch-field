# Pruebas de campo — operadores de planta, oleoducto y refinería

**Fecha:** 31-10-2026
**Ejecutor:** `tools/qa/run_operator_tests.py` (Playwright + Chromium, reproducible)
**Datos:** [`FIELD-DATA-SOURCES-OPERATORS.md`](FIELD-DATA-SOURCES-OPERATORS.md) — EIA-820 2026 + NSTA + HSE
**Entorno:** servidor local `:8419`, IndexedDB limpia, interfaz en inglés, 1440×900 y 1280×800
**Resultado:** **24 capturas · 6 puntos · 48/48 filas importadas · 0 incidencias**

---

## 1. Los tres recorridos

| Persona | Recorrido | Evidencia |
|---|---|---|
| **Operador de refinería** (Galveston Bay) | Alta de punto en línea de cabeza de CDU, activo con banda RBI, PSV vencida, dossier | 03, 04, 08-10, 14-16, 18 |
| **Operador de planta** (Beaumont) | Punto de cabeza de CDU, activo de bomba, lectura en tablet | 03, 10, 21-22 |
| **Operador de oleoducto** | Sistema CATS real, activo de línea km 12.4, hallazgo ILI severo, mapa | 02, 11-13 |

---

## 2. Paso a paso con capturas

### 1. Arranque en frío

![Arranque](field-tests-operators-2026-10-31/01-dashboard-boot.png)

### 2. Operador de oleoducto: alta del sistema CATS

Con atributos reales de NSTA: 36 in, 28,4 mm de pared, 17,93 MPa, 404,97 km, gas.

![Alta de sistema](field-tests-operators-2026-10-31/02-pipeline-system-form.png)

### 3. Operador de refinería: punto en cabeza de CDU

Sector downstream, ASTM A106 Gr B, 420 ppm H₂S, 6.000 ppm CO₂, 240 kPa, 95 °C.

![Formulario de punto](field-tests-operators-2026-10-31/03-mp-refinery-form.png)

### 4. Punto de slurry de FCC

El más agresivo del dataset: banda derivada de 11,3–16,0 mpy, clasificación severa.

![Detalle del slurry](field-tests-operators-2026-10-31/04-mp-slurry-detail.png)

### 5-7. Ingesta offline del CSV de 48 lecturas

Mapeo automático de cabeceras, validación fila a fila y confirmación. Tras importar:
`monitoringPoints` 8→**14**, `readings` 120→**168**.

![Mapeo](field-tests-operators-2026-10-31/05-ingest-mapping.png)

![Validación](field-tests-operators-2026-10-31/06-ingest-validation.png)

![Importado](field-tests-operators-2026-10-31/07-ingest-imported.png)

### 8-10. Registro de equipos (ISO 14224)

Unidad de destilación con banda RBI A e intervalo de 12 meses, compresor de gas húmedo
y estación de bombeo de oleoducto conviviendo en el mismo registro.

![Alta de activo](field-tests-operators-2026-10-31/08-apm-asset-form.png)

![Detalle del activo](field-tests-operators-2026-10-31/09-apm-asset-detail.png)

![Registro mixto](field-tests-operators-2026-10-31/10-apm-mixed-sectors.png)

### 11-13. Activo de línea e inspección ILI

Válvula de seccionamiento en km 12.4 y hallazgo severo de 38 % de pérdida de pared.

![Activo de línea](field-tests-operators-2026-10-31/11-line-asset-form.png)

![Formulario de inspección](field-tests-operators-2026-10-31/12-inspection-form.png)

![Mapa del sistema](field-tests-operators-2026-10-31/13-pipeline-detail-map.png)

### 14-16. PSV: alta, registro y detalle

`PSV-GB-501` se registra con la prueba **vencida hace 35 días**; el registro muestra dos
válvulas fuera de fecha (R13).

![Alta de PSV](field-tests-operators-2026-10-31/14-psv-form.png)

![Registro con vencidas](field-tests-operators-2026-10-31/15-psv-registry-overdue.png)

![Detalle de PSV](field-tests-operators-2026-10-31/16-psv-detail.png)

### 17. Barrido de reglas

**25 recomendaciones**; el panel superior marca **5 alarmas críticas y 20 abiertas**.

![Recomendaciones](field-tests-operators-2026-10-31/17-recommendations.png)

### 18-20. Informes generados en el dispositivo

Dossier del punto de refinería, informe trimestral y ficha de PSV.

![Dossier](field-tests-operators-2026-10-31/18-dossier-refinery.png)

![Trimestral](field-tests-operators-2026-10-31/19-quarterly.png)

![Datasheet](field-tests-operators-2026-10-31/20-psv-datasheet.png)

### 21-22. Tablet Android en horizontal (1280×800)

![Dashboard tablet](field-tests-operators-2026-10-31/21-tablet-dashboard.png)

![Corrosión tablet](field-tests-operators-2026-10-31/22-tablet-corrosion.png)

### 23-24. Admin y export del expediente

Export real verificado en disco: **121.134 bytes**.

![Admin](field-tests-operators-2026-10-31/23-admin.png)

![Export](field-tests-operators-2026-10-31/24-admin-exported.png)

---

## 3. Métricas

| Métrica | Valor |
|---|---|
| Puntos creados | 6 (3 downstream + 3 midstream) |
| Lecturas importadas | 48 de 48 (0 omitidas, 0 errores) |
| Lecturas totales | 168 |
| Sistemas de ducto | 1 sembrado + 1 real (CATS) |
| Activos APM | 3 creados (2 downstream + 1 midstream) |
| PSVs creadas | 2 (ambas vencidas) |
| Activos de línea / inspecciones | 1 / 1 |
| Recomendaciones | 25 |
| Export | 121.134 bytes |
| Capturas | 24 |
| Incidencias del runner | 0 |

---

## 4. Defectos y hallazgos

### 4.1 Carrera de renderizado al navegar desde el detalle de un activo (real)

Con `location.hash = '#/reports'` y sin recarga, la URL quedaba correcta pero el DOM seguía
mostrando el activo APM:

```
{ hash: '#/reports', h1: 'REF-GB-CDU-01 — Crude distillation unit', dialogs: 0 }
```

Tras recargar: `{ hash: '#/reports', h1: 'Reports' }`. Es decir, una promesa de datos del
detalle resolvía **después** del cambio de ruta y volvía a pintar sobre `#main`.
Afecta a cualquier usuario que salga de un detalle hacia otra sección; en el runner se
esquiva con una recarga, pero **el producto debería cancelar el render pendiente**.
Registrado en `evidence.json` (`reports_state` y `reports_state_after_reload`).

### 4.2 Validación de material (lección de datos)

El primer intento usó `carbon-steel`, que **no** es un id válido; el formulario bloqueó el
guardado y el diálogo quedó abierto. La app usa `a106-b` (piping de refinería) y
`api5l-x52` (línea). Con el valor correcto, los 6 puntos se crearon a la primera.
Conclusión: el catálogo de materiales conviene exponerlo con autocompletado y mensaje
explícito cuando el valor no existe.

---

## 5. Reproducción

```powershell
python tools\qa\fetch_operator_data.py
python tools\serve.ps1 -Port 8419
python tools\qa\run_operator_tests.py
```

Evidencia legible por máquina: `docs/field-tests-operators-2026-10-31/evidence.json`.
