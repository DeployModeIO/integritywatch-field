"""Build the operator-focused field dataset (plant, pipeline, refinery).

Real sources (verified 2026-10-31):
  - EIA Refinery Capacity Report 2026 (Form EIA-820), XLSX by individual refinery.
    Real: site name, state, PADD, atmospheric crude distillation capacity, unit list.
  - NSTA UKCS pipeline records already fetched by tools/qa/fetch_field_data.py.
    Real: pipeline identity, fluid, diameter, wall thickness, MAWP, length.

Derived (clearly flagged): equipment tags per ISO 14224 taxonomy anchored to the
real units, process chemistry, inspection findings and corrosion series.

Outputs (datos-prueba/ops/):
  eia-refineries.json     top refineries by CDU capacity (real)
  operator-dataset.json   sites, assets, monitoring points, PSVs, line assets/inspections
  carga-ops.csv           48 derived coupon readings in the app ingest format

Usage: python tools/qa/fetch_operator_data.py
"""

from __future__ import annotations

import csv
import json
import os
import random
import urllib.request
from datetime import date, datetime, timedelta, timezone

from openpyxl import load_workbook

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "datos-prueba", "ops")
REAL = os.path.join(ROOT, "datos-prueba", "real")
EIA_URL = "https://www.eia.gov/petroleum/refinerycapacity/refcap26.xlsx"
EIA_LOCAL = os.path.join(OUT, "_eia", "refcap26.xlsx")


def ensure_eia() -> str:
    os.makedirs(os.path.dirname(EIA_LOCAL), exist_ok=True)
    if not os.path.exists(EIA_LOCAL):
        req = urllib.request.Request(EIA_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=180) as r, open(EIA_LOCAL, "wb") as f:
            f.write(r.read())
    return EIA_LOCAL


def read_refineries() -> tuple[list[dict], dict]:
    wb = load_workbook(ensure_eia(), read_only=True, data_only=True)
    ws = wb["refcap26"]
    rows = list(ws.iter_rows(values_only=True))
    hdr = rows[0]
    i = {h: k for k, h in enumerate(hdr)}
    cap, info, units = {}, {}, {}
    for r in rows[1:]:
        if not r or not r[i["SITE"]]:
            continue
        site = str(r[i["SITE"]]).strip()
        sup = str(r[i["SUPPLY"]] or "")
        prod = str(r[i["PRODUCT"]] or "")
        q = r[i["QUANTITY"]]
        info[site] = {
            "state": r[i["STATE_NAME"]],
            "padd": r[i["PADD"]],
            "region": r[i["RDIST_LABEL"]],
        }
        units.setdefault(site, set())
        if "Atmospheric Crude Distillation Capacity (barrels per calendar day)" in sup and isinstance(q, (int, float)):
            cap[site] = float(q)
        if prod and "Capacity, Current Year" in sup:
            units[site].add(prod)
    top = sorted(cap.items(), key=lambda x: -x[1])[:10]
    records = [{
        "site": s,
        "state": info[s]["state"],
        "padd": info[s]["padd"],
        "region": info[s]["region"],
        "cdu_bcd": c,
        "units": sorted(units[s]),
    } for s, c in top]
    return records, {"sites_with_cdu": len(cap), "source": EIA_URL}


def base_process(sector: str, product: str) -> dict:
    return {
        "h2sPpm": 0 if product == "gas" else 420,
        "co2Ppm": 6000 if sector == "downstream" else 9000,
        "tempC": 95 if sector == "downstream" else 60,
        "bswPct": 2,
        "velocityMs": 1.4,
        "inhibitorTargetPpm": 30,
        "inhibitorResidualPpm": 26,
    }


def build() -> dict:
    refineries, eia_meta = read_refineries()
    by_site = {r["site"]: r for r in refineries}
    gb = by_site["GALVESTON BAY"]
    bm = by_site["BEAUMONT"]

    pipes = json.load(open(os.path.join(REAL, "app-dataset.json"), encoding="utf-8"))
    pl = {p["id"]: p for p in pipes["pipelines"]}
    cats, magnus, affleck = pl["SYS-PL774"], pl["SYS-PL139"], pl["SYS-PL6385"]

    sites = [
        {"id": "SITE-GB", "name": "Galveston Bay", "state": gb["state"], "padd": gb["padd"],
         "cduBcd": gb["cdu_bcd"], "persona": "refineryOperator", "units": gb["units"][:10],
         "provenance": "EIA-820 2026 (real site and capacity)"},
        {"id": "SITE-BM", "name": "Beaumont", "state": bm["state"], "padd": bm["padd"],
         "cduBcd": bm["cdu_bcd"], "persona": "plantOperator", "units": bm["units"][:10],
         "provenance": "EIA-820 2026 (real site and capacity)"},
    ]

    assets = [
        # Galveston Bay — refinery operator
        ("REF-GB-CDU-01", "Crude distillation unit", "downstream", "distillationUnit", "A", 4, 4, 12, "SITE-GB"),
        ("REF-GB-FCC-01", "Fluid catalytic cracker", "downstream", "refinery", "A", 4, 4, 12, "SITE-GB"),
        ("REF-GB-HDS-01", "Diesel hydrotreater", "downstream", "hydrodesulfurization", "B", 3, 3, 24, "SITE-GB"),
        ("REF-GB-E-301", "Feed/effluent exchanger", "downstream", "heatExchanger", "B", 3, 2, 36, "SITE-GB"),
        ("REF-GB-P-101A", "Crude charge pump", "downstream", "pump", "B", 3, 3, 24, "SITE-GB"),
        ("REF-GB-K-401", "Wet gas compressor", "downstream", "compressor", "A", 4, 3, 18, "SITE-GB"),
        # Beaumont — plant operator
        ("PLT-BM-CDU-01", "Crude distillation unit", "downstream", "distillationUnit", "A", 4, 3, 12, "SITE-BM"),
        ("PLT-BM-COL-201", "Depropanizer column", "downstream", "column", "B", 3, 3, 24, "SITE-BM"),
        ("PLT-BM-F-101", "Crude charge furnace", "downstream", "furnace", "A", 4, 4, 12, "SITE-BM"),
        ("PLT-BM-P-210", "Reflux pump", "downstream", "pump", "C", 2, 2, 48, "SITE-BM"),
        ("PLT-BM-E-220", "Overhead condenser", "downstream", "heatExchanger", "B", 3, 2, 36, "SITE-BM"),
        # Pipeline operator
        ("MID-CATS-PS-01", "CATS riser pump station", "midstream", "pumpStation", "A", 4, 4, 12, None),
        ("MID-CATS-CS-02", "CATS compressor station", "midstream", "compressorStation", "B", 3, 3, 24, None),
        ("MID-MAG-PS-03", "Magnus to Ninian pump station", "midstream", "pumpStation", "B", 3, 3, 24, None),
    ]
    asset_records = [{
        "id": f"APM-{code}", "code": code, "name": name, "sector": sector, "category": cat,
        "criticality": crit, "status": "running", "site": site,
        "rbi": {"pof": pof, "cof": cof, "inspectionBaseMonths": months},
        "provenance": "DERIVED tag per ISO 14224 taxonomy, anchored to the real unit list",
    } for code, name, sector, cat, crit, pof, cof, months, site in assets]

    mps = [
        {"id": "MP-GB-CDU-OVH", "code": "MP-GB-CDU-OVH", "name": "CDU overhead line",
         "sector": "downstream", "line": "SYS-REF-GB", "material": "a106-b",
         "sensorType": "couponGravimetric", "stationKm": 0.2, "site": "SITE-GB",
         "product": "crude", "process": base_process("downstream", "crude")},
        {"id": "MP-GB-FCC-SLUR", "code": "MP-GB-FCC-SLUR", "name": "FCC main column slurry line",
         "sector": "downstream", "line": "SYS-REF-GB", "material": "a106-b",
         "sensorType": "couponGravimetric", "stationKm": 0.6, "site": "SITE-GB",
         "product": "heavy", "process": base_process("downstream", "crude")},
        {"id": "MP-BM-CDU-OVH", "code": "MP-BM-CDU-OVH", "name": "CDU overhead line (Beaumont)",
         "sector": "downstream", "line": "SYS-PLT-BM", "material": "a106-b",
         "sensorType": "couponGravimetric", "stationKm": 0.1, "site": "SITE-BM",
         "product": "crude", "process": base_process("downstream", "crude")},
        {"id": "MP-PL774", "code": "MP-PL774", "name": "CATS PIPELINE upstream coupon",
         "sector": "midstream", "line": "SYS-PL774", "material": "api5l-x52",
         "sensorType": "couponGravimetric", "stationKm": 0,
         "product": "gas", "process": base_process("midstream", "gas")},
        {"id": "MP-PL139", "code": "MP-PL139", "name": "MAGNUS TO NINIAN coupon",
         "sector": "midstream", "line": "SYS-PL139", "material": "api5l-x52",
         "sensorType": "couponGravimetric", "stationKm": 0,
         "product": "crude", "process": base_process("midstream", "crude")},
        {"id": "MP-PL6385", "code": "MP-PL6385", "name": "AFFLECK PIP coupon",
         "sector": "midstream", "line": "SYS-PL6385", "material": "api5l-x52",
         "sensorType": "couponGravimetric", "stationKm": 0,
         "product": "multiphase", "process": base_process("midstream", "multiphase")},
    ]
    for mp in mps:
        mp["process"]["totalPressureKpa"] = (cats if mp["line"] == "SYS-PL774" else
                                             magnus if mp["line"] == "SYS-PL139" else
                                             affleck if mp["line"] == "SYS-PL6385" else
                                             {"opPressureMpa": 2.4})["opPressureMpa"] * 100

    today = date(2026, 10, 31)
    psvs = [
        {"id": "PSV-GB-501", "tag": "PSV-GB-501", "location": "CDU tower, Galveston Bay",
         "valveType": "conventional", "setPressurePsig": 250, "backPressurePsig": 15,
         "operatingTempF": 480, "certifiedCapacity": 42000, "phase": "gas",
         "lastTestDate": (today - timedelta(days=400)).isoformat(),
         "nextTestDate": (today - timedelta(days=35)).isoformat(), "site": "SITE-GB"},
        {"id": "PSV-GB-502", "tag": "PSV-GB-502", "location": "FCC receiver, Galveston Bay",
         "valveType": "balanced", "setPressurePsig": 180, "backPressurePsig": 25,
         "operatingTempF": 350, "certifiedCapacity": 26000, "phase": "gas",
         "lastTestDate": (today - timedelta(days=330)).isoformat(),
         "nextTestDate": (today + timedelta(days=20)).isoformat(), "site": "SITE-GB"},
        {"id": "PSV-BM-601", "tag": "PSV-BM-601", "location": "Depropanizer, Beaumont",
         "valveType": "pilot", "setPressurePsig": 220, "backPressurePsig": 10,
         "operatingTempF": 210, "certifiedCapacity": 18500, "phase": "gas",
         "lastTestDate": (today - timedelta(days=120)).isoformat(),
         "nextTestDate": (today + timedelta(days=240)).isoformat(), "site": "SITE-BM"},
        {"id": "PSV-CATS-701", "tag": "PSV-CATS-701", "location": "CATS slug catcher",
         "valveType": "conventional", "setPressurePsig": 300, "backPressurePsig": 20,
         "operatingTempF": 120, "certifiedCapacity": 52000, "phase": "gas",
         "lastTestDate": (today - timedelta(days=520)).isoformat(),
         "nextTestDate": (today - timedelta(days=155)).isoformat(), "site": None},
    ]

    line_assets = [
        {"id": "LA-CATS-RISER-01", "systemId": "SYS-PL774", "assetType": "riser", "stationKm": 0.1,
         "label": "CATS riser 01", "material": "api5l-x52"},
        {"id": "LA-CATS-VALVE-02", "systemId": "SYS-PL774", "assetType": "valve", "stationKm": 12.4,
         "label": "Sectionalising valve km 12.4"},
        {"id": "LA-AFL-ANOM-01", "systemId": "SYS-PL6385", "assetType": "pipe", "stationKm": 3.1,
         "label": "Pipe-in-pipe anomaly km 3.1"},
    ]
    inspections = [
        {"id": "INSP-001", "systemId": "SYS-PL774", "assetId": "LA-CATS-VALVE-02",
         "kind": "ILI", "dateISO": "2026-03-18", "stationKm": 12.4,
         "severity": "severe", "status": "open", "finding": "External corrosion 38% WT loss"},
        {"id": "INSP-002", "systemId": "SYS-PL774", "assetId": "LA-CATS-RISER-01",
         "kind": "UT", "dateISO": "2026-07-02", "stationKm": 0.1,
         "severity": "moderate", "status": "monitor", "finding": "Wall loss 11% at riser base"},
        {"id": "INSP-003", "systemId": "SYS-PL774", "assetId": "LA-CATS-RISER-01",
         "kind": "visual", "dateISO": "2026-09-14", "stationKm": 0.1,
         "severity": "low", "status": "closed", "finding": "Coating damage repaired"},
        {"id": "INSP-004", "systemId": "SYS-PL6385", "assetId": "LA-AFL-ANOM-01",
         "kind": "UT", "dateISO": "2026-05-09", "stationKm": 3.1,
         "severity": "high", "status": "open", "finding": "Anomaly 22% WT inside pipe-in-pipe"},
    ]

    dataset = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "personas": ["plantOperator", "pipelineOperator", "refineryOperator"],
        "sites": sites,
        "apmAssets": asset_records,
        "monitoringPoints": mps,
        "psvs": psvs,
        "lineAssets": line_assets,
        "lineInspections": inspections,
        "realPipelines": [cats, magnus, affleck],
        "provenance": {
            "real": "EIA-820 2026 refinery sites/capacities/units; NSTA pipeline attributes",
            "derived": "equipment tags, process chemistry, PSV dates, inspection findings, corrosion series",
        },
        "eia": eia_meta,
    }
    return dataset


def write_csv(ds: dict) -> int:
    rnd = random.Random(31102026)
    bands = {"gas": 2.4, "crude": 4.6, "multiphase": 7.2, "heavy": 11.5}
    path = os.path.join(OUT, "carga-ops.csv")
    rows = 0
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["punto", "fecha", "tasa", "wi", "wf", "área", "días",
                    "residual", "temperatura", "bsw", "categoría", "nota"])
        base = date(2026, 10, 23)
        for mp in ds["monitoringPoints"]:
            b = bands.get(mp["product"], 4.0)
            for k in range(8):
                d = base - timedelta(days=7 * k)
                drift = (7 - k) * 0.05 * b
                rate = round(max(0.3, b + drift + rnd.uniform(-0.5, 0.5)), 2)
                w.writerow([mp["code"], d.isoformat(), rate, "", "", "", 26, 24,
                            95 if mp["sector"] == "downstream" else 60, 2, "lectura",
                            "Serie DERIVADA (EIA/NSTA params); no es medición de campo"])
                rows += 1
    return rows


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    ds = build()
    with open(os.path.join(OUT, "operator-dataset.json"), "w", encoding="utf-8") as fh:
        json.dump(ds, fh, indent=2, ensure_ascii=False)
    tr = read_refineries()[0]
    with open(os.path.join(OUT, "eia-refineries.json"), "w", encoding="utf-8") as fh:
        json.dump({"fetched_at": datetime.now(timezone.utc).isoformat(),
                   "source": EIA_URL, "count": len(tr), "records": tr},
                  fh, indent=2, ensure_ascii=False)
    n = write_csv(ds)
    print(f"sites={len(ds['sites'])} assets={len(ds['apmAssets'])} "
          f"mps={len(ds['monitoringPoints'])} psvs={len(ds['psvs'])} "
          f"inspections={len(ds['lineInspections'])} csv_rows={n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
