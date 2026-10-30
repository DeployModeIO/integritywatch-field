"""Fetch REAL oil & gas field data for IntegrityWatch Field test runs.

Sources (public, no API key, verified 2026-10-30):
  1. NSTA Open Data - UKCS offshore infrastructure, pipeline linear (WGS84)
     ArcGIS FeatureServer, layer 1.
     Fields used: NSTAPIPNO, PIPE_NAME, INF_TYPE, FLUID, STATUS, DIAMETERMM,
     LENGTH_M, THICKNESS, MX_OP_PRES, INSUL_TYPE, START_DATE, REP_GROUP.
  2. NSTA Open Data - UKCS offshore infrastructure, pipeline points (WGS84)
     Equipment-like assets: VALVE, MANIFOLD, TEE PIECE, PIG LAUNCH/TRAP,
     RISER BASE, ANODE ASSEMBLY.
  3. HSE Offshore Statistics and Regulatory Activity Report 2024 (PDF)
     Aggregate incident counts (hydrocarbon releases, dangerous occurrences).

What is REAL: asset identity, dimensions, fluid, pressure rating, status,
commissioning dates, equipment types, aggregate incident counts.
What is DERIVED (clearly flagged): inspection/corrosion time series generated
deterministically from the real pipe parameters, assumed material/coating when
the source leaves them blank, and RBI inputs derived from criticality rules.

Usage:
    python tools/qa/fetch_field_data.py [--out datos-prueba/real]

Outputs (UTF-8 JSON/CSV + provenance metadata):
    nsta-pipelines.json      raw real records (filtered, complete attributes)
    nsta-equipment.json      raw real equipment-point records
    hse-hcr-2024.json        real aggregate incident statistics
    app-dataset.json         records mapped to the IntegrityWatch schema
    carga-corrosion.csv      derived corrosion coupon series (app ingest format)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone

UA = {"User-Agent": "Mozilla/5.0 (compatible; IntegrityWatchField/1.0)",
      "Accept": "application/json"}

ARC = "https://services-eu1.arcgis.com/OZMfUznmLTnWccBc/arcgis/rest/services/"
LINEAR = ARC + urllib.parse.quote("UKCS_offshore_infrastructure_pipeline_linear_(WGS84)") + "/FeatureServer/1/query"
POINTS = ARC + urllib.parse.quote("UKCS offshore infrastructure pipeline points WGS84") + "/FeatureServer/1/query"

HSE_PDF = "https://www.hse.gov.uk/offshore/assets/docs/hsr2024.pdf"

COMPLETE_WHERE = (
    "STATUS='ACTIVE' AND INF_TYPE='PIPELINE' AND DIAMETERMM>=100 "
    "AND THICKNESS>0 AND MX_OP_PRES>0 AND LENGTH_M>=1000"
)

LINEAR_FIELDS = ",".join([
    "NSTAPIPNO", "PIPE_NAME", "INF_TYPE", "REP_GROUP", "FLUID", "DESCRIPTIO",
    "STATUS", "DIAMETERMM", "LENGTH_M", "INSUL_TYPE", "MX_OP_PRES",
    "THICKNESS", "START_DATE", "END_DATE", "COMMENTS",
])

EQUIP_TYPES = ["VALVE", "MANIFOLD", "TEE PIECE", "PIG LAUNCH/TRAP", "RISER BASE", "ANODE ASSEMBLY (PIPELINE)"]

# Real figures extracted from HSE "Offshore Statistics and Regulatory Activity
# Report 2024", Executive summary (p.3) and HCR section (pp.14-16).
HSE_2024 = {
    "year": 2024,
    "source": HSE_PDF,
    "source_title": "Offshore Statistics and Regulatory Activity Report 2024",
    "licence": "Open Government Licence v3.0",
    "figures": {
        "inspections": 125,
        "installations_inspected": 102,
        "investigations_commenced": 20,
        "safety_cases_assessed": 78,
        "non_compliance_issues": 616,
        "improvement_notices": 21,
        "prohibition_notices": 2,
        "dangerous_occurrences": 180,
        "hydrocarbon_releases": 92,
        "hcr_share_of_do_pct": 32,
        "hcr_non_process": 41,
        "non_fatal_injuries": 107,
        "specified_injuries": 12,
        "over_7_day_injuries": 95,
        "injury_rate_per_100k_fte": 462,
        "fatal_injuries": 0,
    },
    "notes": [
        "HCR = hydrocarbon release, classified Minor / Significant / Major.",
        "35 of the 92 HCRs were reported solely under EU Offshore Directive arrangements.",
        "Full per-incident HCR tables 1992-2016 live in HSE spreadsheets (blocked by the archive replay at fetch time).",
    ],
}


def get_json(url: str, timeout: int = 90) -> dict:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def query_features(query_url: str, where: str, out_fields: str, limit: int = 2000) -> list[dict]:
    params = {
        "where": where,
        "outFields": out_fields,
        "returnGeometry": "false",
        "f": "json",
        "resultRecordCount": str(limit),
    }
    data = get_json(query_url + "?" + urllib.parse.urlencode(params))
    if "error" in data:
        raise RuntimeError(f"ArcGIS error: {data['error']}")
    return [f["attributes"] for f in data.get("features", [])]


def iso_date(ms):
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def product_of(fluid: str) -> str:
    f = (fluid or "").upper()
    return {
        "OIL": "crude",
        "GAS": "gas",
        "CONDENSATE": "condensate",
        "MIXED HYDROCARBONS": "multiphase",
        "WATER": "water",
        "SEAWATER": "water",
        "SERVICES": "services",
    }.get(f, "other")


def inches_of(mm) -> float:
    return round(float(mm) / 25.4, 2)


def operator_label(idx: int) -> str:
    """Stable anonymised operator label: no third-party brand in app data."""
    return f"UKCS Operator {idx:02d}"


def build_app_dataset(pipes: list[dict], equip: list[dict]) -> dict:
    # Deterministic anonymisation map (sorted so it is stable across runs).
    groups = sorted({p.get("REP_GROUP") or "" for p in pipes if p.get("REP_GROUP")})
    gmap = {g: operator_label(i + 1) for i, g in enumerate(groups)}

    # Pick one representative line per hydrocarbon product for monitoring points.
    picked, seen = [], set()
    for p in sorted(pipes, key=lambda x: -(x.get("LENGTH_M") or 0)):
        prod = product_of(p.get("FLUID"))
        if prod in ("crude", "gas", "condensate", "multiphase") and prod not in seen:
            picked.append(p)
            seen.add(prod)

    systems, mps = [], []
    for i, p in enumerate(picked):
        code = str(p.get("NSTAPIPNO") or f"PL{i}").strip().replace(" ", "")
        sys_id = f"SYS-{code}"
        length_km = round(float(p.get("LENGTH_M") or 0) / 1000, 3)
        systems.append({
            "id": sys_id,
            "name": (p.get("PIPE_NAME") or code).strip(),
            "operator": gmap.get(p.get("REP_GROUP") or "", "UKCS Operator"),
            "product": product_of(p.get("FLUID")),
            "dnIn": inches_of(p.get("DIAMETERMM") or 0),
            "wallThicknessMm": float(p.get("THICKNESS") or 0),
            "material": "api5l-x52",
            "coating": (p.get("INSUL_TYPE") or "FBE"),
            "opPressureMpa": round(float(p.get("MX_OP_PRES") or 0) / 10.0, 2),
            "lengthKm": length_km,
            "stationFromKm": 0,
            "stationToKm": length_km,
            "provenance": {
                "nsta_pipeline_no": p.get("NSTAPIPNO"),
                "fluid_source": p.get("FLUID"),
                "commissioned": iso_date(p.get("START_DATE")),
                "material": "ASSUMED typical carbon steel (not published per line)",
                "coating": "SOURCE insulation field; FBE assumed when blank",
            },
        })
        # Monitoring point on the upstream end of each selected line.
        mps.append({
            "id": f"MP-{code}",
            "code": f"MP-{code}",
            "name": (p.get("PIPE_NAME") or code).strip()[:60],
            "sector": "midstream",
            "material": "api5l-x52",
            "sensorType": "couponGravimetric",
            "line": sys_id,
            "stationKm": 0,
            "product": product_of(p.get("FLUID")),
            "location": f"NSTA {p.get('NSTAPIPNO')} upstream end",
            "process": {
                # Process chemistry is NOT published per line: derived defaults,
                # flagged as derived, for corrosion-model test input only.
                "h2sPpm": 0 if product_of(p.get("FLUID")) == "gas" else 350,
                "co2Ppm": 8000,
                "totalPressureKpa": round(float(p.get("MX_OP_PRES") or 0) * 100, 1),
                "tempC": 55,
                "bswPct": 2,
                "velocityMs": 1.1,
                "inhibitorTargetPpm": 25,
                "inhibitorResidualPpm": 22,
                "provenance": "DERIVED from line pressure/fluid; chemistry not public",
            },
        })

    # Equipment registry (ISO 14224-ish) from real NSTA point assets.
    assets = []
    for i, e in enumerate(equip):
        tag = str(e.get("NSTAPIPNO") or "").strip().replace(" ", "") or f"EQ{i}"
        assets.append({
            "id": f"APM-{tag}-{i+1:03d}",
            "code": f"{e.get('INF_TYPE','ASSET')[:12].strip()}-{tag}-{i+1:03d}",
            "name": (e.get("NAME") or e.get("DESCRIPTIO") or "Asset").strip()[:80],
            "sector": "midstream",
            "category": "valve" if "VALVE" in (e.get("INF_TYPE") or "") else "equipment",
            "criticality": "B" if "VALVE" in (e.get("INF_TYPE") or "") else "C",
            "status": "running",
            "rbi": {"pof": 3, "cof": 3, "inspectionBaseMonths": 24},
            "provenance": {
                "nsta_inf_type": e.get("INF_TYPE"),
                "status_source": e.get("STATUS"),
                "start_date": iso_date(e.get("START_DATE")),
                "rbi": "DERIVED criticality heuristic, not an operator RBI result",
            },
        })

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "pipelines": systems,
        "monitoringPoints": mps,
        "apmAssets": assets,
    }


def build_corrosion_csv(mps: list[dict], out_path: str, seed: int = 20261030) -> int:
    """Derived coupon series in the app's CSV ingest format.

    Rates are deterministic functions of the real line pressure and fluid, then
    jittered with a fixed seed. These are SIMULATED measurements.
    """
    rnd = random.Random(seed)
    # Product-typical baseline (mpy) plus a small, capped pressure contribution
    # so derived rates stay in a realistic 1-9 mpy band for carbon steel.
    base_by_product = {"gas": 1.8, "crude": 3.2, "condensate": 2.2, "multiphase": 5.4}
    rows = 0
    with open(out_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["punto", "fecha", "tasa", "wi", "wf", "área", "días",
                    "residual", "temperatura", "bsw", "categoría", "nota"])
        base_date = datetime(2026, 10, 16)
        for mp in mps:
            pressure_barg = float(mp["process"]["totalPressureKpa"]) / 100.0
            base_rate = base_by_product.get(mp.get("product", ""), 3.0)
            base_rate = base_rate + min(1.4, pressure_barg * 0.05)
            for k in range(8):
                day = base_date - timedelta(days=k * 7)
                drift = (7 - k) * 0.06 * base_rate
                rate = round(max(0.2, base_rate + drift + rnd.uniform(-0.4, 0.4)), 2)
                w.writerow([
                    mp["code"], day.strftime("%Y-%m-%d"), rate, "", "", "",
                    rnd.choice([25, 26, 24]), rnd.choice([22, 23, 24]),
                    rnd.choice([52, 55, 58]), rnd.choice([1, 2, 3]),
                    "lectura",
                    "Serie DERIVADA de parámetros reales NSTA (presión/fluido); no es medición de campo",
                ])
                rows += 1
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join("datos-prueba", "real"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    print("[1/4] NSTA pipelines with complete engineering attributes...")
    pipes = query_features(LINEAR, COMPLETE_WHERE, LINEAR_FIELDS)
    print(f"      {len(pipes)} real pipelines")

    print("[2/4] NSTA equipment points...")
    equip = []
    for t in EQUIP_TYPES:
        where = f"STATUS='ACTIVE' AND INF_TYPE='{t}'"
        recs = query_features(POINTS, where, "NSTAPIPNO,NAME,INF_TYPE,STATUS,START_DATE,DESCRIPTIO,COMMENTS")
        take = recs[:20] if t == "VALVE" else recs[:5]
        equip.extend(take)
        print(f"      {t}: {len(take)} of {len(recs)}")
    print(f"      {len(equip)} real equipment records")

    meta = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "source": "NSTA Open Data (UKCS offshore infrastructure)",
        "endpoints": {"linear": LINEAR.split("?")[0], "points": POINTS.split("?")[0]},
        "where": COMPLETE_WHERE,
        "licence": "NSTA Open Data - NSTA User Agreement",
    }
    for name, payload in [("nsta-pipelines.json", pipes), ("nsta-equipment.json", equip)]:
        with open(os.path.join(args.out, name), "w", encoding="utf-8") as fh:
            json.dump({**meta, "count": len(payload), "records": payload}, fh, indent=2, ensure_ascii=False)
        print(f"      wrote {name}")

    print("[3/4] HSE 2024 aggregate incident statistics (real)...")
    with open(os.path.join(args.out, "hse-hcr-2024.json"), "w", encoding="utf-8") as fh:
        json.dump({**HSE_2024, "fetched_at": meta["fetched_at"]}, fh, indent=2, ensure_ascii=False)
    print("      wrote hse-hcr-2024.json")

    print("[4/4] Mapping to app schema + derived corrosion series...")
    ds = build_app_dataset(pipes, equip)
    ds["provenance"] = {
        "real": "NSTA asset records + HSE 2024 aggregates",
        "derived": "corrosion series, material/coating assumptions, RBI inputs, process chemistry",
        "operators": "anonymised in app data; raw names only in nsta-*.json",
    }
    with open(os.path.join(args.out, "app-dataset.json"), "w", encoding="utf-8") as fh:
        json.dump(ds, fh, indent=2, ensure_ascii=False)
    rows = build_corrosion_csv(ds["monitoringPoints"], os.path.join(args.out, "carga-corrosion.csv"))
    print(f"      app-dataset.json: {len(ds['pipelines'])} pipelines, "
          f"{len(ds['monitoringPoints'])} monitoring points, {len(ds['apmAssets'])} assets")
    print(f"      carga-corrosion.csv: {rows} derived readings")
    print("DONE", args.out)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
