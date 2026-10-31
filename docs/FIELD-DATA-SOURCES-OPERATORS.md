# Field data sources — operator campaign (plant · pipeline · refinery)

**Date:** 2026-10-31
**Purpose:** feed the operator-focused validation run with real, traceable data.
**Producer:** `tools/qa/fetch_operator_data.py` (reproducible, no secrets).

---

## 1. Real sources

| Source | Endpoint | Licence | What is real |
|---|---|---|---|
| **EIA Refinery Capacity Report 2026** (Form EIA-820, data as of 1 Jan 2026) | `https://www.eia.gov/petroleum/refinerycapacity/refcap26.xlsx` | Public domain (US Government) | Refinery site name, state, PADD, atmospheric crude distillation capacity, list of downstream units per site |
| **NSTA UKCS infrastructure** (already fetched 2026-10-30) | `datos-prueba/real/app-dataset.json` | NSTA User Agreement | Pipeline identity, fluid, diameter, wall thickness, MAWP, length |
| **HSE Offshore Statistics 2024** | `datos-prueba/real/hse-hcr-2024.json` | OGL v3 | Hydrocarbon release and dangerous occurrence counts |

EIA coverage: **105 US refineries** with a published CDU capacity. Top 10 by capacity:

| Site | State | CDU (b/cd) |
|---|---|---|
| Galveston Bay | Texas | 631,000 |
| Garyville | Louisiana | 617,000 |
| Beaumont | Texas | 612,000 |
| Baytown | Texas | 564,500 |
| Baton Rouge | Louisiana | 523,500 |
| Whiting | Indiana | 435,000 |
| Port Arthur | Texas | 385,000 |
| Carson | California | 365,000 |
| Pascagoula | Mississippi | 356,440 |
| Wood River | Illinois | 345,000 |

The run uses **Galveston Bay** (refinery operator) and **Beaumont** (plant operator).
Company names are **not** used anywhere in the app data, screenshots or video: sites are
referred to by location only, per the no-third-party-brand rule.

---

## 2. Operator context (why these workflows)

| Persona | Documented pain point | Source |
|---|---|---|
| Plant / console operator | Alarm flood: more than **10 alarms in 10 minutes** on one console is the flood threshold; long-term target around **1 alarm per operator per 10 minutes** | EEMUA 191 (4th ed., Nov 2024); ISA-18.2 |
| Plant operator | Shift handover and alarm load drive incident risk (Texaco Milford Haven: operators faced an alarm barrage for ~5 hours) | HSE / EEMUA 191 case history |
| Pipeline operator | Leak detection is algorithmic (CPM) and must be tested; controller fatigue and shift turnover are regulated | API RP 1130 (CPM), API RP 1175 (leak detection program), API RP 1168 (control room), 49 CFR 195.446 |
| Refinery operator | Fixed equipment and relief devices are managed by inspection intervals and RBI, not by calendar alone | API 510/570/576/580/581 |

These pain points are the script of the validation run: rounds data capture offline,
asset registration, relief-valve status, and a report that survives without connectivity.

---

## 3. Dataset produced (`datos-prueba/ops/`)

| File | Content | Real vs derived |
|---|---|---|
| `eia-refineries.json` | Top 10 refineries with capacity and unit list | **Real** (EIA-820) |
| `operator-dataset.json` | 2 sites, 14 assets, 6 monitoring points, 4 PSVs, 3 line assets, 4 inspections | Sites/capacities real; tags, process chemistry, PSV dates and findings **derived** |
| `carga-ops.csv` | 48 coupon readings (6 points × 8 weeks) | **Derived** from real fluid/pressure bands; flagged in every row |

### Assets (14)

| Site / persona | Codes |
|---|---|
| Galveston Bay (refinery) | `REF-GB-CDU-01`, `REF-GB-FCC-01`, `REF-GB-HDS-01`, `REF-GB-E-301`, `REF-GB-P-101A`, `REF-GB-K-401` |
| Beaumont (plant) | `PLT-BM-CDU-01`, `PLT-BM-COL-201`, `PLT-BM-F-101`, `PLT-BM-P-210`, `PLT-BM-E-220` |
| Pipeline | `MID-CATS-PS-01`, `MID-CATS-CS-02`, `MID-MAG-PS-03` |

Categories come from the app's ISO 14224 taxonomy (`distillationUnit`, `heatExchanger`,
`pump`, `compressor`, `column`, `furnace`, `pumpStation`, `compressorStation`).

### Monitoring points (6)

| Code | Sector | Fluid | Derived band (mpy) |
|---|---|---|---|
| `MP-GB-CDU-OVH` | downstream | crude | 4.8 – 6.5 |
| `MP-GB-FCC-SLUR` | downstream | heavy | **11.3 – 16.0** (severe) |
| `MP-BM-CDU-OVH` | downstream | crude | 4.2 – 6.2 |
| `MP-PL774` | midstream | gas | 2.3 – 3.7 |
| `MP-PL139` | midstream | crude | 4.1 – 6.5 |
| `MP-PL6385` | midstream | multiphase | 7.0 – 9.4 |

Bands are generated with a fixed seed and deliberately straddle the app's 5 / 10 mpy
thresholds so rules and dashboard states exercise both sides.

### PSVs (4)

Two are overdue on purpose: `PSV-GB-501` (35 days past due) and `PSV-CATS-701`
(155 days), so R13 fires. `PSV-GB-502` is due within 20 days.

### Pipeline findings (4)

`INSP-001` (ILI, severe, 38 % wall loss at km 12.4, open), `INSP-004` (UT, high,
22 % wall loss inside pipe-in-pipe), plus one moderate and one closed.

---

## 4. Editorial rules applied

1. No third-party logos or company names in screenshots, video or manuals; sites by location.
2. Every record declares whether it is **real**, **assumed** or **derived**.
3. Derived corrosion series carry the note
   `"Serie DERIVADA (EIA/NSTA params); no es medición de campo"` in every row.
4. Standards are cited, never reproduced.

## 5. Reproduce

```powershell
python tools\qa\fetch_operator_data.py
python tools\serve.ps1 -Port 8419      # separate terminal
python tools\qa\run_operator_tests.py
```
