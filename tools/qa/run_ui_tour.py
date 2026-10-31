"""UI tour captures for the IFS-24 design (English UI, seeded data + one CSV import).

    python tools/qa/run_ui_tour.py      (server on :8419)
"""

from __future__ import annotations

import json
import os
import sys
import time

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:8419/"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "docs", "ui-tour-2026-10-31")
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
    page.evaluate("() => { const r = document.getElementById('toast-region'); if (r) r.textContent = ''; }")


def shot(page, name, note):
    page.wait_for_timeout(300)
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


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 950}, locale="en-US", accept_downloads=True)
        page = ctx.new_page()
        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_selector("#run-rules", timeout=45000)
        page.wait_for_function("document.querySelector('#main') && document.querySelector('#main').children.length > 0", timeout=45000)
        page.wait_for_timeout(2000)

        shot(page, "01-dashboard.png", "Dashboard with IFS symbols in the corrosion heatmap")

        # ---------------------------------------------------------- corrosion
        go(page, "#/corrosion")
        shot(page, "02-corrosion-list.png", "Point list: equipment pictogram + state per row")
        go(page, "#/corrosion/mp/MP-CORR-001")
        shot(page, "03-corrosion-detail.png", "Point dossier view: trend, ASTM, screening")

        go(page, "#/corrosion")
        click(page, "corrosion.newPoint")
        page.wait_for_timeout(500)
        fill(page, {
            "code": "MP-DEMO-01", "name": "CDU overhead line (demo)", "sector": "downstream",
            "systemId": "SYS-DEMO", "line": "SYS-DEMO", "material": "a106-b",
            "sensorType": "couponGravimetric", "tNom": 12.7, "tMin": 10.2,
            "h2sPpm": 420, "co2Ppm": 6000, "totalPressureKpa": 240, "tempC": 95,
            "bswPct": 2, "velocityMs": 1.4, "inhibitorTargetPpm": 30, "inhibitorResidualPpm": 26
        }, prefix="cf-")
        shot(page, "04-new-point-form.png", "Data injection: new monitoring point, real field values")
        click(page, "common.save")
        page.wait_for_timeout(900)

        # ---------------------------------------------------------------- APM
        go(page, "#/apm")
        shot(page, "05-apm-list.png", "Asset registry: ISO 14224 category pictograms")
        aid = page.evaluate("""async () => { const r = await IW.core.db.getAll('apmAssets'); return r[0] ? r[0].id : null; }""")
        if aid:
            go(page, "#/apm/" + aid)
            shot(page, "06-apm-detail.png", "Asset detail: risk band, interval, events")

        # ---------------------------------------------------------------- PSV
        go(page, "#/psv")
        shot(page, "07-psv-registry.png", "Relief valve registry with PSV symbol and overdue state")
        go(page, "#/psv/PSV-520-001", 1300)
        shot(page, "08-psv-detail.png", "PSV sizing (API 520/526) and test dates")

        # ----------------------------------------------------------- pipeline
        sid = page.evaluate("""async () => { const r = await IW.core.db.getAll('pipelineSystems'); return r[0] ? r[0].id : null; }""")
        if sid:
            go(page, "#/pipelines/" + sid, 1500)
            page.evaluate("() => { const m = document.querySelector('.map-card'); if (m) m.scrollIntoView({block:'center'}); }")
            page.wait_for_timeout(700)
            shot(page, "09-pipeline-map.png", "Pipeline kilometres bar: severity segments and assets")

        # ------------------------------------------------------------- ingest
        go(page, "#/ingest")
        page.set_input_files("#csv-file", CSV)
        page.wait_for_timeout(1300)
        shot(page, "10-ingest-mapping.png", "Data ingestion: CSV loaded and columns auto-mapped")
        click(page, "ingest.runValidation")
        page.wait_for_timeout(1500)
        shot(page, "11-ingest-validation.png", "Validation: 16 valid rows, 1 rejected (unknown point)")
        click(page, "ingest.importBtn")
        page.wait_for_timeout(1700)
        counts = page.evaluate("""async () => ({ readings: (await IW.core.db.getAll('readings')).length,
            points: (await IW.core.db.getAll('monitoringPoints')).length })""")
        evidence["counts"] = counts
        shot(page, "12-ingest-imported.png", f"Import committed; store {counts}")

        # ---------------------------------------------------------- rules
        page.click("#run-rules")
        page.wait_for_timeout(2600)
        go(page, "#/recommendations", 1300)
        recs = page.evaluate("""async () => { try { return (await IW.core.db.getAll('recommendations')).length; } catch (e) { return null; } }""")
        evidence["recommendations"] = recs
        shot(page, "13-recommendations.png", f"R1-R17 sweep: {recs} recommendations")

        # --------------------------------------------------------- reports
        page.evaluate("location.hash='#/reports'")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#main select", timeout=20000)
        page.wait_for_timeout(1200)
        page.evaluate("""() => { const s=document.querySelector('#main select'); s.value='dossier'; s.dispatchEvent(new Event('change',{bubbles:true})); }""")
        page.wait_for_timeout(700)
        page.evaluate("""() => { const s=document.querySelectorAll('#main select')[1]; const o=Array.from(s.options).find(o=>o.text.includes('MP-CORR-001')); if(o){ s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
        page.wait_for_timeout(500)
        page.get_by_role("button", name=tr(page, "reports.generate")).first.click()
        page.wait_for_timeout(2200)
        shot(page, "14-report-dossier.png", "Point dossier generated on the device")
        page.evaluate("""() => { const s=document.querySelector('#main select'); s.value='quarterly'; s.dispatchEvent(new Event('change',{bubbles:true})); }""")
        page.wait_for_timeout(700)
        page.get_by_role("button", name=tr(page, "reports.generate")).first.click()
        page.wait_for_timeout(2400)
        shot(page, "15-report-quarterly.png", "Quarterly integrity report")
        page.evaluate("""() => { const s=document.querySelector('#main select'); s.value='datasheet'; s.dispatchEvent(new Event('change',{bubbles:true})); }""")
        page.wait_for_timeout(700)
        page.get_by_role("button", name=tr(page, "reports.generate")).first.click()
        page.wait_for_timeout(2200)
        shot(page, "16-report-datasheet.png", "PSV datasheet")

        # ----------------------------------------------------------- admin
        go(page, "#/admin")
        shot(page, "17-admin.png", "Admin: storage, languages, case-file export")

        # ---------------------------------------------------------- tablet
        page.set_viewport_size({"width": 1280, "height": 800})
        go(page, "#/dashboard", 1300)
        shot(page, "18-tablet-dashboard.png", "Android tablet 1280x800 with the new symbols")

        ctx.close()
        browser.close()

    evidence["summary"] = {"captures": len([s for s in evidence["steps"] if s["step"] == "capture"]),
                           "issues": len(evidence["issues"])}
    with open(os.path.join(OUT, "evidence.json"), "w", encoding="utf-8") as fh:
        json.dump(evidence, fh, indent=2, ensure_ascii=False)
    print("SUMMARY", json.dumps(evidence["summary"]))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except PWTimeout as exc:
        print(f"TIMEOUT: {exc}", file=sys.stderr)
        sys.exit(2)
