# Field Data Sources — IntegrityWatch Field

**Status:** verified and fetched 2026-10-30
**Purpose:** feed realistic, traceable field data into the synthetic validation runs
(ingest, equipment registry, RBI, reporting) without inventing assets.
**Fetched by:** `tools/qa/fetch_field_data.py` (reproducible, no API keys, no secrets).

---

## Resumen (ES)

Se obtuvieron **55 ductos reales** de la UK Continental Shelf (nombre, fluido,
diámetro, longitud, espesor de pared, presión máxima de operación, estado y fecha de
puesta en marcha) desde el servicio abierto de la **North Sea Transition Authority
(NSTA)**, más **45 equipos reales** (válvulas, manifolds, tee pieces, pig traps,
riser bases, ánodos). Los problemas de campo se contextualizan con cifras oficiales
de **HSE 2024**: 92 liberaciones de hidrocarburos, 180 sucesos peligrosos y 616
incidencias de incumplimiento en 102 instalaciones inspeccionadas.

Los activos son reales. **Las series de corrosión son derivadas** de los parámetros
reales de cada línea (presión, fluido) y están marcadas como tales: no se presentan
como mediciones de campo.

---

## 1. Sources

| # | Source | Endpoint | Licence | What is real |
|---|--------|----------|---------|--------------|
| 1 | NSTA Open Data — UKCS offshore infrastructure, **pipeline linear (WGS84)** | `https://services-eu1.arcgis.com/OZMfUznmLTnWccBc/arcgis/rest/services/UKCS_offshore_infrastructure_pipeline_linear_(WGS84)/FeatureServer/1/query` | NSTA User Agreement (open data) | Pipeline name, NSTA number, fluid, diameter, length, wall thickness, max operating pressure, status, commissioning date, reporting group |
| 2 | NSTA Open Data — UKCS offshore infrastructure, **pipeline points (WGS84)** | `https://services-eu1.arcgis.com/OZMfUznmLTnWccBc/arcgis/rest/services/UKCS offshore infrastructure pipeline points WGS84/FeatureServer/1/query` | NSTA User Agreement | Equipment tags and types: VALVE, MANIFOLD, TEE PIECE, PIG LAUNCH/TRAP, RISER BASE, ANODE ASSEMBLY |
| 3 | HSE — **Offshore Statistics and Regulatory Activity Report 2024** | `https://www.hse.gov.uk/offshore/assets/docs/hsr2024.pdf` | Open Government Licence v3.0 | Annual incident counts (HCRs, dangerous occurrences, notices, injuries) |

Both NSTA services are live, public, and were queried successfully on 2026-10-30
(service item `13f1725c86754ddf98c766fa52de1ad9`, layer
`PETROLEUM_INFRASTRUCTURE_PIPELINE_LINEAR_WGS84_20260701`).

Rejected alternatives, for the record:

- `data.transportation.gov` (PHMSA incidents) → HTTP 403 to this network on every
  attempt (Socrata endpoint, CSV export and `webfetch`).
- `phmsa.dot.gov` → HTTP 403.
- HSE HCR spreadsheets 1992–2016 (National Archives replay) → HTTP 405.
- Sodir FactPages table views → served by ASP.NET postbacks; no stable JSON/CSV
  endpoint found. Norwegian asset data was therefore not used.

---

## 2. Exact queries

```text
# Pipeline universe
total                                    ->  9 025 features
STATUS='ACTIVE' AND INF_TYPE='PIPELINE'  ->  2 110 features

# Engineering-complete subset (used)
STATUS='ACTIVE'
AND INF_TYPE='PIPELINE'
AND DIAMETERMM>=100
AND THICKNESS>0
AND MX_OP_PRES>0
AND LENGTH_M>=1000                        ->     55 features
```

Fluid mix of that subset: GAS 26, MIXED HYDROCARBONS 15, WATER 8, OIL 5,
CONDENSATE 1. Only **55 of 2 110** active lines publish wall thickness *and*
pressure *and* diameter, which is itself a finding: most public records are
positionally complete but engineering-incomplete.

Equipment points queried per type:

```text
STATUS='ACTIVE' AND INF_TYPE='<TYPE>'
VALVE 812 · MANIFOLD 294 · RISER BASE 61 · PIG LAUNCH/TRAP 17 ·
ANODE ASSEMBLY 17 · TEE PIECE 13
```

---

## 3. Datasets produced

All files in `datos-prueba/real/`, UTF-8, with a `fetched_at` timestamp.

### `nsta-pipelines.json` — 55 real records (raw)

```json
{
  "NSTAPIPNO": "PL774",
  "PIPE_NAME": "CATS PIPELINE",
  "FLUID": "GAS",
  "STATUS": "ACTIVE",
  "DIAMETERMM": 914.4,
  "LENGTH_M": 404973.74,
  "THICKNESS": 28.4,
  "MX_OP_PRES": 179.3,
  "REP_GROUP": "<operator>",
  "START_DATE": "..."
}
```

### `nsta-equipment.json` — 45 real equipment records (raw)

```text
VALVE           20   e.g. "PL1236 TEAL WI VALVE STRUCTUE"
MANIFOLD         5   e.g. "Machar Water Flood Manifold"
TEE PIECE        5
PIG LAUNCH/TRAP  5
RISER BASE       5
ANODE ASSEMBLY   5
```

### `app-dataset.json` — mapped to the IntegrityWatch schema

Four representative lines, one per hydrocarbon product:

| App id | Real line | Product | DN (in) | Wall (mm) | MAOP | Length |
|---|---|---|---|---|---|---|
| `SYS-PL774` | CATS PIPELINE | gas | 36.0 | 28.4 | 17.93 MPa | 404.97 km |
| `SYS-PL139` | MAGNUS TO NINIAN | crude | 24.0 | 16.0 | 6.19 MPa | 91.23 km |
| `SYS-PL1257A` | ERSKINE TO LOMOND GAS CONDENSATE LINE | condensate | 16.0 | 15.9 | 11.80 MPa | 30.25 km |
| `SYS-PL6385` | AFFLECK PRODUCTION PIPE-IN-PIPE | multiphase | 8.63 | 20.6 | 34.50 MPa | 20.97 km |

Plus 4 monitoring points (`MP-PL774`, `MP-PL139`, `MP-PL1257A`, `MP-PL6385`)
anchored at the upstream end of each line, and 45 APM assets.

### `hse-hcr-2024.json` — real aggregate incident statistics

| Metric | 2024 |
|---|---|
| Inspections / installations | 125 / 102 |
| Investigations commenced | 20 |
| Non-compliance issues raised | 616 |
| Improvement / prohibition notices | 21 / 2 |
| Dangerous occurrences | 180 |
| **Hydrocarbon releases** | **92** |
| HCR as share of RIDDOR DOs | 32 % |
| Non-process HCRs | 41 |
| Non-fatal injuries | 107 |
| Injury rate (per 100k FTE) | 462 |

### `carga-corrosion.csv` — derived series (32 rows)

App ingest format (`punto,fecha,tasa,...`). **Simulated measurements**, generated
deterministically (`random.Random(20261030)`) from each line's real fluid and
pressure:

```text
base_mpy = product_baseline + min(1.4, pressure_barg * 0.05)
        gas 1.8 | condensate 2.2 | crude 3.2 | multiphase 5.4
rate    = base_mpy * (1 + 0.06 * weeks_ago) + N(±0.4)
```

Resulting bands: gas 3.0–4.6, condensate 4.0–5.0, crude 4.8–6.8, multiphase
6.7–9.4 mpy — inside the realistic range for carbon steel and deliberately
straddling the app's 5 mpy / 10 mpy thresholds so rules and dashboard states
exercise both sides.

Every row carries the note:
`"Serie DERIVADA de parámetros reales NSTA (presión/fluido); no es medición de campo"`.

---

## 4. Field mapping (NSTA → app schema)

| App field | NSTA field | Transform |
|---|---|---|
| `name` | `PIPE_NAME` | trimmed |
| `id` | `NSTAPIPNO` | `SYS-<no>` |
| `product` | `FLUID` | OIL→crude, GAS→gas, CONDENSATE→condensate, MIXED HYDROCARBONS→multiphase, WATER→water |
| `dnIn` | `DIAMETERMM` | ÷ 25.4, 2 decimals |
| `wallThicknessMm` | `THICKNESS` | mm, as published |
| `opPressureMpa` | `MX_OP_PRES` | barg ÷ 10 |
| `lengthKm` | `LENGTH_M` | ÷ 1000 |
| `stationFromKm` / `stationToKm` | — | 0 / `lengthKm` |
| `material` | — | **assumed** `api5l-x52` (not published per line) |
| `coating` | `INSUL_TYPE` | source value; `FBE` assumed when blank |
| `operator` | `REP_GROUP` | **anonymised** `UKCS Operator NN` (stable, sorted) |
| process chemistry (`h2sPpm`, `co2Ppm`, `tempC`, …) | — | **derived** defaults for corrosion-model input |

---

## 5. Editorial rules applied

1. **No third-party logos or brands** in screenshots, video or manuals. Only data.
2. Operator/reporting-group names stay in the raw `nsta-*.json` for auditability but
   are **anonymised** in `app-dataset.json`, so nothing user-visible carries another
   company's identity.
3. Every record states whether it is `real`, `assumed` or `derived`. No derived value
   is presented as a field measurement.
4. The HSE figures are quoted as published aggregates, never attributed to a named
   installation.

---

## 6. Reproduction

```powershell
cd D:\ArquitectoSupremo\integritywatch-field
python tools\qa\fetch_field_data.py
```

Output is deterministic except `fetched_at`. Re-running overwrites
`datos-prueba/real/*` from the live services; the corrosion series is seeded, so it
reproduces byte-for-byte.
