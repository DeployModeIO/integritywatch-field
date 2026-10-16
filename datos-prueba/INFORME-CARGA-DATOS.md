# INFORME DE CARGA DE DATOS — Kit de inyección real "Campo Norte 16"

**Proyecto:** IntegrityWatch Field · **Fecha:** 2026-10-16 · **Archivo CSV:** `datos-prueba/integritywatch-carga-prueba.csv` (41 filas)
**Validador:** `datos-prueba/validar-carga.cjs` (ejecuta el **parser real** de la app, no una simulación)
**Veredicto del validador:** ✅ 35 filas válidas · 4 errores esperados · 2 duplicadas omitidas · 3 puntos auto-creados · 30 lecturas + 5 cupones a guardar

---

## 1. Propósito

Probar de forma **manual y realista** la ingesta de datos de campo (módulo CSV) de IntegrityWatch
Field: todos los campos canónicos (punto, fecha, tasa, wi, wf, área, días, residual, temperatura,
BSW, categoría, nota), situaciones normales y anómalas, validaciones de rango/fecha/física,
deduplicación, auto-creación de puntos y cálculo de tasa por pérdida de peso con el motor ASTM G4.

## 2. Fuentes reales consultadas (web, 2026-10-16)

Los **valores numéricos** del dataset no son inventados: provienen de referencias públicas de la industria.

| Dato de referencia | Valor de la fuente | Uso en el dataset |
|---|---|---|
| Tasa aceptable acero al carbono | **< 5 mpy** aceptable; > 20 mpy severa (MidstreamCalculator, *Corrosion Rate Fundamentals*) | Lecturas normales 0.7–2.6 mpy |
| Tabla de severidad general | <1 insignificante · 1–5 bajo · 5–10 moderado · 10–20 alto · 20–50 severo · >50 crítico | Pico 12.4 mpy (alto), cupón 15.2 mpy (severo) |
| Corrosión dulce CO₂ sin inhibidor | 2–8 mm/año (**80–300 mpy**) a pCO₂ 0.5 bar y 60 °C | Ratio modelo/medido en MP-CORR-001 |
| Corrosión agria H₂S | 5–50 mpy + agrietamiento (SSC/HIC) | MP-CORR-001/006 (pozo y separador agrios) |
| Corrosión por oxígeno | 50–500 mpy (contexto de por qué BSW/O₂ importan) | Notas en línea de inyección |
| Cupón estándar NACE SP0775 | 3" × 0.5" × 0.125" (**≈ 24 cm² = 3.72 in²**), exposición 30–90 días, ≥3 cupones por punto | Área 3.72 in² y exposición 30/45 días del CSV |
| Peso real de ese cupón | 3 × 0.5 × 0.125 in³ × 7.85 g/cm³ ≈ **24.1 g** | wi = 24 100 mg en todos los cupones |
| Inhibidor tipo imidazolina | Dosis típica 25–100 ppm | Objetivo 25 ppm; residuales 12–45 ppm |
| Eficiencia de inhibidor (NACE TM0374) | >95 % excelente · 90–95 muy buena · 80–90 buena · 60–80 marginal · <60 mala | Par P3 = 92 % (excelente), Par P4 = 65 % (mala) |
| Ejemplo ASTM G1 verificado | 242 mg, 24.2 cm², 2160 h → **2.03 mpy** (constante 534 de la fórmula de la app confirmada por fuente externa) | Misma fórmula que ejecuta el motor |
| Tablas API 581 | Tasas 1–300 mpy según aleación/condiciones (resultado de búsqueda) | Contexto de rangos extremos |

Fuentes: `midstreamcalculator.com/engineering/pipeline-ops/corrosion-rate-fundamentals.html`;
resultados de búsqueda (AMPP SP0775, ASTM G1 — HovoyPetro, API 581 tables, MetallurgyZone LPR/ER).

> Los **nombres de equipos** usan nomenclatura industrial estándar (wellhead, línea de recolección,
> separador, planta de gas, línea ácida, inyección de agua). Lo que está anclado a fuentes reales son
> los valores numéricos y las especificaciones de cupones.

## 3. Escenario ficticio: campaña de octubre 2026, "Campo Norte 16"

| Equipo / instalación | Punto(s) | Situación planteada |
|---|---|---|
| Pozo productor agrio *Wellhead Norte 1* (X52, H₂S 2 000 ppm, 78 °C) | MP-CORR-001 | **Pico severo 12.4 mpy** en 24 h → R1 crítica; cupones Par P3 (EI 92 %) |
| Línea de recolección de crudo 4" (X52, 46 °C) | MP-CORR-002 | **Escalada 2.5→6.0 mpy** (avg7 ≈ 2.3× avg30) → R2; cupones Par P4 (EI 65 %) |
| Separador SEP-2 con sonda LPR (duplex 2205) | MP-CORR-003 / 009 | **Sensor clavado** (10+ lecturas idénticas) → R5; punto nuevo |
| Línea a planta de gas (316L, ER, invierno −12 °C) | MP-CORR-010 | Punto nuevo; tasa 5.5–5.9 mpy (moderada) |
| Separador agrio (66 °C, residual sobre banda) | MP-CORR-006 | **Residual 45 ppm = 180 %** del objetivo → R4 sobre; cupón largo 45 d |
| Gas dulce deshidratado (40 °C) | MP-CORR-007 | **Residual 12 ppm = 48 %** del objetivo → R4 bajo |
| Sistema de inyección de agua (BSW 95 %) | MP-CORR-008 | BSW extrema válida (95 %) |
| Oleoducto *Norte 16"* y estación de bombeo | MP-CORR-004 / 005 | Operación normal (1.8–2.0 mpy) |
| (Inexistente a propósito) | MP-FANTASMA-99 | Prueba de `E_MP_UNKNOWN` / auto-creación |

## 4. Composición del CSV (41 filas)

| Bloque | Filas | Contenido |
|---|---|---|
| Lecturas válidas | 29 | 10 puntos, fechas 2026-09-18 → 2026-10-16, con residual/temperatura/BSW/categoría/nota |
| Cupones válidos | 5 | Par P3 (blanco 8.0 / inhibido 0.64), Par P4 (blanco 10.0 / inhibido 3.5), cupón largo 45 d (15.2) |
| Errores deliberados | 4 | fecha futura `2027-01-05` → **E_DATE_FUTURE** · fecha `31/31/2026` → **E_DATE_FORMAT** · `wf 20150 > wi 20000` → **E_WF** · `tasa −3.0` → **E_RANGE** |
| Duplicadas | 2 | mismas (punto+fecha+tasa) que la fila válida de MP-CORR-003 del 15/10 → **omisión** |
| Puntos nuevos | 3 | MP-CORR-009, MP-CORR-010, MP-FANTASMA-99 → auto-creados como MP-IMP-001/002/003 |

Nota de física: con área 3.72 in² y ρ 7.85 g/cm³, ΔW por mpy (30 días) = 39.37 mg — los pesos
`wf` del CSV fueron generados con esa relación, y el motor real de la app devolvió exactamente
8.000 / 0.640 / 9.999 / 3.500 / 15.200 mpy (ver §6).

## 5. Instrucciones de carga manual (paso a paso)

1. Arranca la app (`START-HERE.bat` o `index.html`).
2. Menú **Ingesta de datos** → pestaña **CSV** → *Elegir archivo* → `datos-prueba/integritywatch-carga-prueba.csv`.
3. Verifica que muestra **delimitador ","** y **12/12 columnas mapeadas** (área/días/categoría con acentos se mapean solos).
4. Decide el modo:
   - ☑ **Crear puntos faltantes** (recomendado): crea MP-IMP-001 (MP-CORR-009), MP-IMP-002 (MP-CORR-010), MP-IMP-003 (MP-FANTASMA-99).
   - ☐ Sin la casilla: esas 3 filas fallan con **E_MP_UNKNOWN** (así pruebas también el error).
5. **Validar** → la tabla debe mostrar exactamente los 4 errores de la fila 35–38 y las 2 duplicadas (40–41), con resumen 35/4/2.
6. **Importar** → resumen final: **30 lecturas + 5 cupones + 3 puntos nuevos**, entrada en el historial de importaciones.
7. **Panel**: verifica KPIs y mapa de calor (MP-CORR-001 en rojo Severa con aspa ✕).
8. **Post-importación (prueba del editor de cupones y panel EI):** en *Corrosión → Cupones*, edita los 4 cupones de los pares y asigna **Rol** (blanco/inhibido), **Par** (P3 y P4), material (API 5L X52) y fecha fin. El CSV no trae rol/par a propósito: así ejercitas también el editor. El panel de eficiencia debe mostrar **P3 = 92 % (excelente)** y **P4 = 65 % (mala)**.
9. **Ejecutar reglas** (botón del encabezado) → deben dispararse: **R1** (12.4 mpy en 24 h), **R2** (escalada MP-002), **R3** (Par P4), **R4 ×2** (residual 180 % y 48 %), **R5** (LPR clavada) — además de las que ya existían de la demo.
10. **Informes**: genera el trimestral con periodo 01/07/2026–16/10/2026 y compara con las estadísticas de §6.

## 6. Resultados reales del validador (parser de la app, ejecutado 2026-10-16)

Salida íntegra de `node datos-prueba/validar-carga.cjs`:

```text
[1] Delimitador detectado: ","        BOM presente: No
[2] Cabeceras (12): punto | fecha | tasa | wi | wf | área | días | residual | temperatura | bsw | categoría | nota
    Filas de datos: 41
[3] Mapeo: punto→mpCode, fecha→date, tasa→crMpy, wi→wiMg, wf→wfMg, área→areaIn2,
    días→days, residual→inhibitorResidualPpm, temperatura→tempC, bsw→bswPct,
    categoría→category, nota→note        Sin mapear: (ninguno)
[5] MODO sin auto-crear puntos:  válidas: 29 | con error: 10 | duplicadas: 2
[6] MODO con auto-crear puntos:  válidas: 35 | con error: 4 | duplicadas: 2
    puntos nuevos: MP-CORR-009→MP-IMP-001, MP-CORR-010→MP-IMP-002, MP-FANTASMA-99→MP-IMP-003
[7] Errores: fila 35 E_DATE_FUTURE [date] · fila 36 E_DATE_FORMAT [date] ·
    fila 37 E_WF [wfMg] · fila 38 E_RANGE [crMpy]
    Duplicadas omitidas (filas): 40, 41
[8] Registros a guardar: lecturas=30, cupones=5
[9] Cupones (motor real ASTM G4): 8.000 · 0.640 · 9.999 · 3.500 · 15.200 mpy
[10] Medias por punto: MP-001 9.68 · MP-002 4.83 · MP-003 2.00 · MP-004 1.95 ·
     MP-005 1.85 · MP-006 2.35 · MP-007 1.25 · MP-008 0.95 · MP-IMP-001 0.75 ·
     MP-IMP-002 5.73 · MP-IMP-003 2.00 (mpy)
```

### Estadísticas clave del dataset

| Indicador | Valor | Severidad SP0775 |
|---|---|---|
| Media MP-CORR-001 (4 lecturas) | 9.68 mpy (máx 12.4) | **Alta/Severa** en el pico |
| Media MP-CORR-002 (6 lecturas) | 4.83 mpy, escalando 2.5→6.2 | Moderada con tendencia |
| EI Par P3 (blanco 8.000 / inhibido 0.640) | **92.0 %** | Excelente (≥90) |
| EI Par P4 (blanco 9.999 / inhibido 3.500) | **65.0 %** | Mala (<70) → R3 |
| Cupón largo MP-CORR-006 (45 días) | 15.2 mpy | Severa (10–20) |
| Residuales fuera de banda (objetivo 25 ppm) | 12 ppm (48 %) y 45 ppm (180 %) | → R4 bajo/sobre |
| Puntos por sector (tras editar) | upstream ×6 · midstream ×3 · downstream ×1 | — |

## 7. Alcance y límites

- El CSV ejercita el **módulo de corrosión** (únicos campos canónicos definidos en `docs/SCHEMA.md §6`).
  Los campos de PSV (set/orificio/Kd…), APM (eventos/MTBF/RBI) y ductos (estaciones/inspecciones)
  no se importan por CSV: para inyectarlos usa **Admin → Restablecer datos demo** o el
  **respaldo JSON** (Ingesta → JSON, modo merge).
- `residual/temperatura/bsw` se **validan** por rango y documentan condiciones, pero la lectura
  guardada conserva tasa+nota; para persistirlos de forma permanente, edítalos en la ficha del punto.
- Los 3 puntos auto-creados nacen con datos mínimos: edítalos en *Corrosión → Editar punto*
  (sector, material, sensor, proceso H₂S/CO₂/presión) para que participen en R7/R8.

## 8. Repetir la prueba

```powershell
cd D:\ArquitectoSupremo\integritywatch-field
node datos-prueba\validar-carga.cjs
```

Modifica el CSV y vuelve a ejecutar: el script siempre te dirá **exactamente** qué hará la app
antes de tocar la base de datos.
