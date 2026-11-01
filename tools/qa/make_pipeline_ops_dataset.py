"""Pipeline-operator dataset: crude trunk line + LPG / clean-products branches.

Real sources (verified 2026-10-31):
  - NSTA UKCS pipeline records (datos-prueba/real/app-dataset.json):
    MAGNUS TO NINIAN (crude, 24 in, 91.23 km, 6.19 MPa) and
    AFFLECK PRODUCTION PIPE-IN-PIPE (multiphase, 8.63 in, 20.97 km, 34.5 MPa).
Derived (flagged): Latin-American operating scenario, station names, equipment
tags per ISO 14224, daily pressures, checklist items and corrosion series.

Outputs (datos-prueba/oleoductos/):
  dataset.json          pipeline systems, assets, monitoring points, PSVs, line assets/inspections
  carga-ronda-diaria.csv  42 daily-round corrosion readings (6 points x 7 days) with pressure notes
  checklist-diario.json   daily checklist template used by the manual and the video notes
"""

from __future__ import annotations

import csv
import json
import os
import random
from datetime import date, timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "datos-prueba", "oleoductos")
REAL = os.path.join(ROOT, "datos-prueba", "real", "app-dataset.json")


def build() -> dict:
    real = json.load(open(os.path.join(REAL), encoding="utf-8"))
    pl = {p["id"]: p for p in real["pipelines"]}
    trunk = pl["SYS-PL139"]   # MAGNUS TO NINIAN — crude trunk (real)
    lpg = pl["SYS-PL6385"]    # AFFLECK PIP — reassigned as LPG / clean products branch (derived)

    systems = [
        {"id": "SYS-OLEO-NORTE", "name": "Oleoducto Crudo Sector Norte",
         "operator": "Operadora Andina (demo)", "product": "crude",
         "dnIn": trunk["dnIn"], "wallThicknessMm": trunk["wallThicknessMm"],
         "material": trunk["material"], "coating": trunk["coating"],
         "opPressureMpa": trunk["opPressureMpa"], "lengthKm": trunk["lengthKm"],
         "stationFromKm": 0, "stationToKm": trunk["lengthKm"],
         "provenance": "REAL NSTA attributes (MAGNUS TO NINIAN); operating scenario derived"},
        {"id": "SYS-LPG-LIMPIOS", "name": "Ramales LPG y Productos Limpios",
         "operator": "Operadora Andina (demo)", "product": "LPG/clean products",
         "dnIn": lpg["dnIn"], "wallThicknessMm": lpg["wallThicknessMm"],
         "material": lpg["material"], "coating": lpg["coating"],
         "opPressureMpa": lpg["opPressureMpa"], "lengthKm": lpg["lengthKm"],
         "stationFromKm": 0, "stationToKm": lpg["lengthKm"],
         "provenance": "REAL NSTA attributes (AFFLECK PIP); LPG/clean-products service DERIVED"},
    ]

    # Equipment: oil-pipeline stations (ISO 14224 categories used by the app)
    assets = [
        # Estación de bombeo Km 0 — crudo
        {"id": "APM-ON-P101A", "code": "P-101A", "name": "Bomba centrífuga multietapa crudo (A) — succión 2,1 bar / descarga 61,8 bar",
         "sector": "midstream", "category": "centrifugalPump", "criticality": "A", "status": "running",
         "rbi": {"pof": 3, "cof": 4, "inspectionBaseMonths": 12}, "stationKm": 0.2, "site": "Estación Bombeo Km 0"},
        {"id": "APM-ON-P101B", "code": "P-101B", "name": "Bomba centrífuga multietapa crudo (B) — respaldo",
         "sector": "midstream", "category": "centrifugalPump", "criticality": "B", "status": "standby",
         "rbi": {"pof": 2, "cof": 4, "inspectionBaseMonths": 12}, "stationKm": 0.3, "site": "Estación Bombeo Km 0"},
        {"id": "APM-ON-P102", "code": "P-102", "name": "Bomba booster de línea",
         "sector": "midstream", "category": "centrifugalPump", "criticality": "B", "status": "running",
         "rbi": {"pof": 2, "cof": 3, "inspectionBaseMonths": 18}, "stationKm": 0.5, "site": "Estación Bombeo Km 0"},
        {"id": "APM-ON-PSV-101", "code": "PSV-101", "name": "Válvula de alivio descarga P-101",
         "sector": "midstream", "category": "valve", "criticality": "A", "status": "running",
         "rbi": {"pof": 2, "cof": 4, "inspectionBaseMonths": 12}, "stationKm": 0.6, "site": "Estación Bombeo Km 0"},
        # Estación intermedia Km 40
        {"id": "APM-ON-P201", "code": "P-201", "name": "Bomba centrífuga multietapa intermedia (impulsores añadidos)",
         "sector": "midstream", "category": "centrifugalPump", "criticality": "A", "status": "running",
         "rbi": {"pof": 3, "cof": 3, "inspectionBaseMonths": 12}, "stationKm": 40.1, "site": "Estación Intermedia Km 40"},
        {"id": "APM-ON-F201", "code": "F-201", "name": "Filtro/strainer de succión P-201",
         "sector": "midstream", "category": "pipeline", "criticality": "C", "status": "running",
         "rbi": {"pof": 1, "cof": 2, "inspectionBaseMonths": 24}, "stationKm": 40.0, "site": "Estación Intermedia Km 40"},
        # Ramales LPG y productos limpios
        {"id": "APM-LP-P301", "code": "P-301", "name": "Bomba LPG (service LPG, multietapa)",
         "sector": "midstream", "category": "centrifugalPump", "criticality": "A", "status": "running",
         "rbi": {"pof": 4, "cof": 4, "inspectionBaseMonths": 6}, "stationKm": 2.0, "site": "Terminal LPG"},
        {"id": "APM-LP-V301", "code": "V-301", "name": "Esfera de almacenamiento LPG",
         "sector": "midstream", "category": "storageTank", "criticality": "A", "status": "running",
         "rbi": {"pof": 3, "cof": 4, "inspectionBaseMonths": 12}, "stationKm": 2.5, "site": "Terminal LPG"},
        {"id": "APM-PL-D401", "code": "D-401", "name": "Bomba de productos limpios (diésel)",
         "sector": "midstream", "category": "centrifugalPump", "criticality": "B", "status": "running",
         "rbi": {"pof": 2, "cof": 3, "inspectionBaseMonths": 18}, "stationKm": 8.0, "site": "Terminal Productos Limpios"},
        {"id": "APM-ON-GEN-1", "code": "GEN-1", "name": "Generador de respaldo estación Km 0",
         "sector": "midstream", "category": "generator", "criticality": "B", "status": "standby",
         "rbi": {"pof": 2, "cof": 3, "inspectionBaseMonths": 12}, "stationKm": 0.7, "site": "Estación Bombeo Km 0"},
    ]

    mps = [
        {"id": "MP-OLEO-SUC", "code": "MP-OLEO-SUC", "name": "Punto corrosión línea succión estación 1",
         "sector": "midstream", "line": "SYS-OLEO-NORTE", "material": "api5l-x52",
         "sensorType": "couponGravimetric", "stationKm": 0.4, "site": "Estación Bombeo Km 0",
         "process": {"totalPressureKpa": 210, "tempC": 48}},
        {"id": "MP-OLEO-DESC", "code": "MP-OLEO-DESC", "name": "Punto corrosión línea descarga estación 1",
         "sector": "midstream", "line": "SYS-OLEO-NORTE", "material": "api5l-x52",
         "sensorType": "couponGravimetric", "stationKm": 0.9, "site": "Estación Bombeo Km 0",
         "process": {"totalPressureKpa": 6180, "tempC": 62}},
        {"id": "MP-OLEO-KM40", "code": "MP-OLEO-KM40", "name": "Punto corrosión presión de línea km 40",
         "sector": "midstream", "line": "SYS-OLEO-NORTE", "material": "api5l-x52",
         "sensorType": "couponGravimetric", "stationKm": 40.0, "site": "Estación Intermedia Km 40",
         "process": {"totalPressureKpa": 4210, "tempC": 45}},
        {"id": "MP-LPG-LINEA", "code": "MP-LPG-LINEA", "name": "Punto corrosión línea LPG",
         "sector": "midstream", "line": "SYS-LPG-LIMPIOS", "material": "api5l-x52",
         "sensorType": "couponGravimetric", "stationKm": 2.2, "site": "Terminal LPG",
         "process": {"totalPressureKpa": 1720, "tempC": 40}},
        {"id": "MP-PL-DIESEL", "code": "MP-DIESEL", "name": "Punto corrosión línea diésel",
         "sector": "midstream", "line": "SYS-LPG-LIMPIOS", "material": "api5l-x52",
         "sensorType": "couponGravimetric", "stationKm": 8.0, "site": "Terminal Productos Limpios",
         "process": {"totalPressureKpa": 1500, "tempC": 38}},
        {"id": "MP-PL6385", "code": "MP-PL6385", "name": "AFFLECK PIP coupon (real NSTA)",
         "sector": "midstream", "line": "SYS-LPG-LIMPIOS", "material": "api5l-x52",
         "sensorType": "couponGravimetric", "stationKm": 15.0, "site": "Tramo multiphase real",
         "process": {"totalPressureKpa": 3450, "tempC": 42}},
    ]

    psvs = [
        {"id": "PSV-ON-201", "tag": "PSV-201", "location": "Descarga P-201, Estación Km 40",
         "setPressurePsig": 870, "backPressurePsig": 22, "operatingTempF": 140,
         "certifiedCapacity": 31000, "lastTestDate": "2026-04-18",
         "nextTestDate": "2027-04-18", "site": "Estación Intermedia Km 40"},
        {"id": "PSV-LP-301", "tag": "PSV-LPG-301", "location": "Descarga P-301 LPG",
         "setPressurePsig": 1500, "backPressurePsig": 40, "operatingTempF": 100,
         "certifiedCapacity": 12000, "lastTestDate": "2025-11-20",
         "nextTestDate": "2026-11-20", "site": "Terminal LPG"},
    ]

    line_assets = [
        {"id": "LA-ON-RISER", "systemId": "SYS-OLEO-NORTE", "type": "riser", "stationKm": 0.0,
         "code": "RISER-ON-01", "name": "Riser de origen"},
        {"id": "LA-ON-VALVE", "systemId": "SYS-OLEO-NORTE", "type": "valve", "stationKm": 12.0,
         "code": "VLV-ON-12", "name": "Válvula de seccionamiento km 12"},
        {"id": "LA-ON-PIG", "systemId": "SYS-OLEO-NORTE", "type": "pig", "stationKm": trunk["lengthKm"],
         "code": "PIG-ON-91", "name": "Trampa de pig terminal"},
        {"id": "LA-LP-MANI", "systemId": "SYS-LPG-LIMPIOS", "type": "valve", "stationKm": 2.4,
         "code": "MLD-LPG-01", "name": "Múltiple LPG"},
    ]

    inspections = [
        {"id": "IN-001", "systemId": "SYS-OLEO-NORTE", "assetId": "LA-ON-VALVE", "kind": "ILI",
         "dateISO": "2026-09-12", "stationKm": 12.0, "severity": "moderate", "status": "monitor",
         "findings": "Pérdida de pared 9 % en cuerpo de válvula"},
        {"id": "IN-002", "systemId": "SYS-OLEO-NORTE", "assetId": "LA-ON-PIG", "kind": "ILI",
         "dateISO": "2026-10-05", "stationKm": 85.4, "severity": "high", "status": "open",
         "findings": "Anomalía metal-loss 22 % a 85,4 km (report ILI-2026-10)"},
        {"id": "IN-003", "systemId": "SYS-LPG-LIMPIOS", "assetId": "LA-LP-MANI", "kind": "visual",
         "dateISO": "2026-10-28", "stationKm": 2.4, "severity": "low", "status": "closed",
         "findings": "Sin fugas; pintura en buen estado"},
    ]

    checklist = {
        "title": "Lista de chequeo diaria — operador de oleoducto",
        "turno": "06:00",
        "items": [
            {"id": "CL-01", "tarea": "Presión de succión estación 1", "referencia": "≥ 1,8 bar", "unidad": "bar"},
            {"id": "CL-02", "tarea": "Presión de descarga estación 1", "referencia": "58 – 64 bar", "unidad": "bar"},
            {"id": "CL-03", "tarea": "Presión de línea km 40", "referencia": "40 – 44 bar", "unidad": "bar"},
            {"id": "CL-04", "tarea": "Presión línea LPG (terminal)", "referencia": "15 – 17 bar", "unidad": "bar"},
            {"id": "CL-05", "tarea": "Vibración bombas multietapa P-101/P-201", "referencia": "≤ 4,5 mm/s RMS", "unidad": "mm/s"},
            {"id": "CL-06", "tarea": "Temperatura de sello mecánico", "referencia": "≤ 80 °C", "unidad": "°C"},
            {"id": "CL-07", "tarea": "Inspección visual de fugas en múltiples y bridas", "referencia": "Sin fugas"},
            {"id": "CL-08", "tarea": "Nivel y estado de esfera LPG", "referencia": "Nivel 40–70 %"},
            {"id": "CL-09", "tarea": "Corrosión: cupones / probes de línea", "referencia": "< 5 mpy aceptable"},
            {"id": "CL-10", "tarea": "Estado de generador de respaldo", "referencia": "Listo en automático"},
        ],
        "provenance": "DERIVED checklist aligned to the pipeline-operator scenario (ISO 14224 categories)",
    }

    return {
        "generated_at": "2026-11-01",
        "personas": ["operador de oleoducto", "ingeniero de integridad"],
        "systems": systems,
        "apmAssets": assets,
        "monitoringPoints": mps,
        "psvs": psvs,
        "lineAssets": line_assets,
        "lineInspections": inspections,
        "checklist": checklist,
        "provenance": {
            "real": "NSTA pipeline attributes (crude trunk + PIP line)",
            "derived": "scenario, station names, equipment tags, pressures, checklist, corrosion series",
        },
    }


def write_csv(ds: dict) -> int:
    rnd = random.Random(31101)
    path = os.path.join(OUT, "carga-ronda-diaria.csv")
    n = 0
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["punto", "fecha", "tasa", "wi", "wf", "área", "días",
                    "residual", "temperatura", "bsw", "categoría", "nota"])
        base = date(2026, 10, 26)
        bands = {"MP-OLEO-SUC": 2.4, "MP-OLEO-DESC": 4.2, "MP-OLEO-KM40": 3.1,
                 "MP-LPG-LINEA": 1.6, "MP-DIESEL": 1.9, "MP-PL6385": 6.8}
        for mp in ds["monitoringPoints"]:
            b = bands.get(mp["code"], 3.0)
            for k in range(7):
                d = base - timedelta(days=k)
                rate = round(max(0.3, b + (6 - k) * 0.08 + rnd.uniform(-0.35, 0.35)), 2)
                w.writerow([mp["code"], d.isoformat(), rate, "", "", "", 1, 24,
                            mp["process"]["tempC"], 1, "ronda-diaria",
                            f"Ronda {d.isoformat()} · P succ 12,4 bar · P desc 41,8 bar" if k == 0 else "Ronda diaria"])
                n += 1
    return n


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    ds = build()
    with open(os.path.join(OUT, "dataset.json"), "w", encoding="utf-8") as fh:
        json.dump(ds, fh, indent=2, ensure_ascii=False)
    with open(os.path.join(OUT, "checklist-diario.json"), "w", encoding="utf-8") as fh:
        json.dump(ds["checklist"], fh, indent=2, ensure_ascii=False)
    n = write_csv(ds)
    print(f"systems={len(ds['systems'])} assets={len(ds['apmAssets'])} mps={len(ds['monitoringPoints'])} "
          f"psvs={len(ds['psvs'])} inspections={len(ds['lineInspections'])} csv_rows={n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
