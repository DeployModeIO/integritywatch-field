"""Synthetic data-entry tests across every module.

Creates a record through each form: monitoring point, reading, coupon, asset,
asset event, PSV, pipeline system, line asset, inspection, CSV ingest, then
generates all three reports. Captures one screenshot per step.

    python tools/qa/run_data_entry_tests.py      (server on :8419)
"""

from __future__ import annotations

import json
import os
import sys
import time

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:8419/"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "docs", "data-entry-2026-10-31")
CSV = os.path.join(ROOT, "datos-prueba", "ui-tour-demo.csv")

evidence = {"run_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "steps": [], "issues": []}


def log(step, status, detail, shots=None):
    evidence["steps"].append({"step": step, "status": status, "detail": detail, "screenshots": shots or []})
    print(f"[{status}] {step}: {detail}")


def issue(text):
    evidence["issues"].append(text)
    print(f"  ! {text}")


def tr(page, key):
    return page.evaluate("k => IW.i18n.t(k)", key)


def clear(page):
    page.evaluate("() => { const r=document.getElementById('toast-region'); if (r) r.textContent=''; }")


def shot(page, name, note):
    page.wait_for_timeout(320)
    try:
        clear(page)
    except Exception:
        pass
    page.screenshot(path=os.path.join(OUT, name), full_page=False)
    log("capture", "ok", note, [name])


def click(page, key):
    page.get_by_role("button", name=tr(page, key), exact=True).first.click()


def go(page, route, wait=1100):
    page.evaluate("r => { location.hash = r; }", route)
    page.wait_for_timeout(wait)


def fill(page, values, prefix="fld-"):
    page.evaluate("""([v, p]) => {
        for (const [k, val] of Object.entries(v)) {
            const el = document.querySelector('#' + p + k);
            if (!el) continue;
            if (el.tagName.toLowerCase() === 'select') {
                const o = Array.from(el.options).find(o => o.value === val);
                if (o) el.value = o.value;
            } else { el.value = val; }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }""", [values, prefix])


def dialog_open(page):
    return page.locator("[role='dialog'], dialog[open]").count() > 0


def save(page, label):
    click(page, "common.save")
    page.wait_for_timeout(900)
    if dialog_open(page):
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)
        issue(f"{label}: form did not save")
        return False
    return True


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    results = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 950}, locale="en-US", accept_downloads=True)
        page = ctx.new_page()
        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_selector("#run-rules", timeout=45000)
        page.wait_for_function("document.querySelector('#main') && document.querySelector('#main').children.length > 0", timeout=45000)
        page.wait_for_timeout(1900)
        shot(page, "01-dashboard-before.png", "Baseline before the data-entry run")

        # ------------------------------------------------ corrosion: point
        go(page, "#/corrosion")
        click(page, "corrosion.newPoint")
        page.wait_for_timeout(450)
        fill(page, {
            "code": "MP-DE-01", "name": "Data-entry demo point", "sector": "downstream",
            "systemId": "SYS-DE", "line": "SYS-DE", "material": "a106-b",
            "sensorType": "couponGravimetric", "tNom": 12.7, "tMin": 10.2,
            "h2sPpm": 380, "co2Ppm": 5500, "totalPressureKpa": 260, "tempC": 88,
            "bswPct": 2, "velocityMs": 1.3, "inhibitorTargetPpm": 28, "inhibitorResidualPpm": 24
        }, prefix="cf-")
        shot(page, "02-corrosion-new-point.png", "Corrosion · new monitoring point form")
        results["point"] = save(page, "monitoring point")

        # ------------------------------------------------ corrosion: reading
        mp_id = page.evaluate("""async () => { const r = await IW.core.db.getAll('monitoringPoints');
            const h = r.find(x => x.code === 'MP-DE-01'); return h ? h.id : null; }""")
        if mp_id:
            go(page, "#/corrosion/mp/" + mp_id, 1300)
            click(page, "corrosion.newReading")
            page.wait_for_timeout(450)
            fill(page, {"date": "2026-10-31", "crMpy": 7.4, "note": "Field round, manual gauge"}, prefix="cf-")
            shot(page, "03-corrosion-new-reading.png", "Corrosion · manual reading entry")
            results["reading"] = save(page, "reading")

            # -------------------------------------------- corrosion: coupon
            click(page, "corrosion.newCoupon")
            page.wait_for_timeout(450)
            fill(page, {
                "role": "blank", "pairId": "DE-PAIR-1", "material": "a106-b",
                "densityGcm3": 7.85, "wiMg": 25000, "wfMg": 24820,
                "areaIn2": 2.0, "days": 26,
                "startDate": "2026-10-05", "endDate": "2026-10-31"
            }, prefix="cf-")
            shot(page, "04-corrosion-new-coupon.png", "Corrosion · coupon with weight loss and ASTM calculation")
            results["coupon"] = save(page, "coupon")

        # ------------------------------------------------------ APM: asset
        go(page, "#/apm")
        click(page, "apm.newAsset")
        page.wait_for_timeout(450)
        fill(page, {
            "code": "DE-P-101", "name": "Demo crude charge pump", "sector": "downstream",
            "criticality": "B", "status": "running", "pof": 3, "cof": 3,
            "inspectionBaseMonths": 24, "notes": "Data-entry test asset"
        })
        page.evaluate("""() => { const s = document.querySelector('#fld-category');
            if (s) { s.value = 'centrifugalPump'; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
        shot(page, "05-apm-new-asset.png", "Assets · new asset with category, RBI band and interval")
        results["asset"] = save(page, "asset")

        asset_id = page.evaluate("""async () => { const r = await IW.core.db.getAll('apmAssets');
            const h = r.find(x => x.code === 'DE-P-101'); return h ? h.id : null; }""")
        if asset_id:
            go(page, "#/apm/" + asset_id, 1300)
            click(page, "apm.newEvent")
            page.wait_for_timeout(450)
            fill(page, {"type": "failure", "start": "2026-10-20", "end": "2026-10-21",
                        "downtimeH": 6, "description": "Mechanical seal failure, pump stopped",
                        "workOrderRef": "WO-2026-1042"})
            shot(page, "06-apm-new-event.png", "Assets · failure event with downtime and work order")
            results["event"] = save(page, "asset event")

        # --------------------------------------------------------- PSV
        go(page, "#/psv")
        click(page, "psv.newPsv")
        page.wait_for_timeout(450)
        fill(page, {
            "tag": "PSV-DE-01", "location": "Demo drum, downstream",
            "setPressurePsig": 200, "operatingTempF": 240,
            "backPressurePsig": 15, "lastTestDate": "2025-09-01",
            "nextTestDate": "2026-09-01", "certifiedCapacity": 22000,
            "notes": "Data-entry test relief valve"
        }, prefix="cf-")
        shot(page, "07-psv-new.png", "Relief valves · new PSV with sizing and test dates")
        results["psv"] = save(page, "PSV")

        # ---------------------------------------------------- pipeline
        go(page, "#/pipelines")
        click(page, "pipelines.newSystem")
        page.wait_for_timeout(450)
        fill(page, {
            "name": "DE Demo Line", "operator": "Demo Operator", "product": "crude",
            "dnIn": 18, "wallThicknessMm": 10.5, "material": "api5l-x52", "coating": "FBE",
            "lengthKm": 42, "stationFromKm": 0, "stationToKm": 42,
            "opPressureMpa": 7.2, "notes": "Data-entry test system"
        })
        shot(page, "08-pipelines-new-system.png", "Pipelines · new system with real engineering attributes")
        results["system"] = save(page, "pipeline system")

        sys_id = page.evaluate("""async () => { const r = await IW.core.db.getAll('pipelineSystems');
            const h = r.find(x => x.name && x.name.indexOf('DE Demo') === 0); return h ? h.id : null; }""")
        if sys_id:
            go(page, "#/pipelines/" + sys_id, 1400)
            click(page, "pipelines.newLineAsset")
            page.wait_for_timeout(450)
            fill(page, {"code": "LA-DE-01", "name": "Demo section valve km 12",
                        "stationKm": 12, "certExpiryISO": "2027-08-31",
                        "notes": "Data-entry test line asset"})
            shot(page, "09-pipelines-new-asset.png", "Pipelines · line asset at a station")
            results["lineAsset"] = save(page, "line asset")

            page.wait_for_timeout(600)
            click(page, "pipelines.newInspection")
            page.wait_for_timeout(450)
            page.evaluate("""() => {
                const a = document.querySelector('#fld-lineAssetId');
                if (a && a.options.length > 1) { a.value = a.options[1].value; a.dispatchEvent(new Event('change',{bubbles:true})); }
                const sev = document.querySelector('#fld-severity');
                if (sev) { sev.value = 'moderate'; sev.dispatchEvent(new Event('change',{bubbles:true})); }
            }""")
            fill(page, {"date": "2026-10-29", "fromKm": 11.8, "toKm": 12.2,
                        "findings": "Coating holiday with light wall loss", "reportRef": "UT-2026-77"})
            shot(page, "10-pipelines-new-inspection.png", "Pipelines · inspection finding with severity")
            results["inspection"] = save(page, "inspection")

        # ------------------------------------------------------- ingest
        go(page, "#/ingest")
        page.wait_for_selector("#csv-file", timeout=15000)
        page.wait_for_timeout(700)
        page.set_input_files("#csv-file", CSV)
        page.wait_for_timeout(1300)
        shot(page, "11-ingest-csv-mapping.png", "Ingest · CSV columns mapped")
        click(page, "ingest.runValidation")
        page.wait_for_timeout(1500)
        shot(page, "12-ingest-csv-validation.png", "Ingest · validation summary")
        click(page, "ingest.importBtn")
        page.wait_for_timeout(1600)
        shot(page, "13-ingest-csv-imported.png", "Ingest · committed rows and history")

        counts = page.evaluate("""async () => {
            const out = {};
            for (const n of ['monitoringPoints','readings','coupons','apmAssets','apmEvents','psvs','pipelineSystems','lineAssets','lineInspections']) {
                try { out[n] = (await IW.core.db.getAll(n)).length; } catch (e) { out[n] = null; }
            }
            return out;
        }""")
        results["counts"] = counts
        log("store_counts", "ok", json.dumps(counts))

        # other ingest modes
        page.evaluate("""() => { const t=[...document.querySelectorAll('[role=tab]')].find(x=>/WITSML/i.test(x.textContent)); if(t) t.click(); }""")
        page.wait_for_timeout(700)
        shot(page, "14-ingest-witsml.png", "Ingest · WITSML import tab")
        page.evaluate("""() => { const t=[...document.querySelectorAll('[role=tab]')].find(x=>/JSON/i.test(x.textContent)); if(t) t.click(); }""")
        page.wait_for_timeout(700)
        shot(page, "15-ingest-json.png", "Ingest · JSON import tab")

        # --------------------------------------------------------- rules
        page.click("#run-rules")
        page.wait_for_timeout(2600)
        go(page, "#/recommendations", 1300)
        recs = page.evaluate("""async () => { try { return (await IW.core.db.getAll('recommendations')).length; } catch (e) { return null; } }""")
        results["recommendations"] = recs
        shot(page, "16-recommendations.png", f"Rules sweep produced {recs} recommendations")

        # ------------------------------------------------------- reports
        page.evaluate("location.hash='#/reports'")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#main select", timeout=20000)
        page.wait_for_timeout(1100)
        page.evaluate("""() => { const s=document.querySelector('#main select'); s.value='dossier'; s.dispatchEvent(new Event('change',{bubbles:true})); }""")
        page.wait_for_timeout(700)
        page.evaluate("""() => { const s=document.querySelectorAll('#main select')[1]; const o=Array.from(s.options).find(o=>o.text.includes('MP-DE-01')); if(o){ s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
        page.wait_for_timeout(400)
        page.get_by_role("button", name=tr(page, "reports.generate")).first.click()
        page.wait_for_timeout(2100)
        shot(page, "17-report-dossier.png", "Reports · dossier for the created point")
        page.evaluate("""() => { const s=document.querySelector('#main select'); s.value='quarterly'; s.dispatchEvent(new Event('change',{bubbles:true})); }""")
        page.wait_for_timeout(650)
        page.get_by_role("button", name=tr(page, "reports.generate")).first.click()
        page.wait_for_timeout(2300)
        shot(page, "18-report-quarterly.png", "Reports · quarterly report")
        page.evaluate("""() => { const s=document.querySelector('#main select'); s.value='datasheet'; s.dispatchEvent(new Event('change',{bubbles:true})); }""")
        page.wait_for_timeout(650)
        page.get_by_role("button", name=tr(page, "reports.generate")).first.click()
        page.wait_for_timeout(2000)
        shot(page, "19-report-datasheet.png", "Reports · PSV datasheet")

        # --------------------------------------------------------- admin
        go(page, "#/admin")
        shot(page, "20-admin.png", "Admin · settings, storage and export")
        page.evaluate("""() => { const s=document.querySelector('.theme-toggle, #theme-toggle'); if (s) s.click(); }""")
        page.wait_for_timeout(700)
        shot(page, "21-admin-theme.png", "Admin · dark theme toggle")

        # -------------------------------------------------------- tablet
        page.set_viewport_size({"width": 1280, "height": 800})
        go(page, "#/dashboard", 1300)
        shot(page, "22-tablet-dashboard.png", "Tablet 1280x800 after the data-entry run")

        ctx.close()
        browser.close()

    evidence["results"] = results
    evidence["summary"] = {
        "captures": len([s for s in evidence["steps"] if s["step"] == "capture"]),
        "forms_saved": sum(1 for k, v in results.items() if isinstance(v, bool) and v),
        "issues": len(evidence["issues"]),
    }
    with open(os.path.join(OUT, "evidence.json"), "w", encoding="utf-8") as fh:
        json.dump(evidence, fh, indent=2, ensure_ascii=False)
    print("SUMMARY", json.dumps(evidence["summary"]))
    print("RESULTS", json.dumps({k: v for k, v in results.items() if not isinstance(v, dict)}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except PWTimeout as exc:
        print(f"TIMEOUT: {exc}", file=sys.stderr)
        sys.exit(2)
