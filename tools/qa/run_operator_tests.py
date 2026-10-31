"""Operator-focused field validation (plant, pipeline, refinery).

Drives the real UI with the dataset from tools/qa/fetch_operator_data.py and
captures numbered screenshots plus an evidence log.

    python tools/qa/run_operator_tests.py     (server on :8419)
"""

from __future__ import annotations

import json
import os
import sys
import time

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:8419/"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "datos-prueba", "ops")
OUT = os.path.join(ROOT, "docs", "field-tests-operators-2026-10-31")

evidence = {"run_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "steps": [], "issues": []}


def log(step, status, detail, shots=None):
    evidence["steps"].append({"step": step, "status": status, "detail": detail,
                              "screenshots": shots or []})
    print(f"[{status}] {step}: {detail}")


def issue(text):
    evidence["issues"].append(text)
    print(f"  ! {text}")


def tr(page, key):
    return page.evaluate("k => IW.i18n.t(k)", key)


def clear_notices(page):
    page.evaluate("""() => {
        const r = document.getElementById('toast-region');
        if (r) { r.textContent = ''; }
    }""")


def shot(page, name, note, full=True):
    page.wait_for_timeout(350)
    try:
        clear_notices(page)
    except Exception:
        pass
    page.screenshot(path=os.path.join(OUT, name), full_page=full)
    log("capture", "ok", note, [name])
    return name


def click_btn(page, key, within=None):
    label = tr(page, key)
    scope = within if within is not None else page
    btn = scope.get_by_role("button", name=label, exact=True).first
    btn.wait_for(state="visible", timeout=10000)
    btn.click()


def wait_app(page):
    page.wait_for_selector("#run-rules", timeout=45000)
    page.wait_for_function(
        "document.querySelector('#main') && document.querySelector('#main').children.length > 0",
        timeout=45000)
    page.wait_for_timeout(1800)


def go(page, route):
    page.evaluate("r => { location.hash = r; }", route)
    page.wait_for_timeout(900)


def fill_form(page, values, prefix="fld-"):
    page.evaluate("""([vals, prefix]) => {
        for (const [name, value] of Object.entries(vals)) {
            const el = document.querySelector('#' + prefix + name);
            if (!el) continue;
            const tag = el.tagName.toLowerCase();
            if (tag === 'select') {
                const opt = Array.from(el.options).find(o => o.value === value)
                         || Array.from(el.options).find(o => o.text.trim() === String(value));
                if (opt) { el.value = opt.value; }
            } else { el.value = value; }
            el.dispatchEvent(new Event('input', {bubbles: true}));
            el.dispatchEvent(new Event('change', {bubbles: true}));
        }
    }""", [values, prefix])


def dialog_open(page):
    return page.locator("[role='dialog'], dialog[open]").count() > 0


def save(page):
    click_btn(page, "common.save")
    page.wait_for_timeout(900)
    if dialog_open(page):
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        return False
    return True


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    ds = json.load(open(os.path.join(DATA, "operator-dataset.json"), encoding="utf-8"))
    mps = ds["monitoringPoints"]
    assets = ds["apmAssets"]
    psvs = ds["psvs"]
    cats = ds["realPipelines"][0]

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900},
                                  locale="en-US", accept_downloads=True)
        page = ctx.new_page()

        page.goto(BASE, wait_until="domcontentloaded")
        wait_app(page)
        shot(page, "01-dashboard-boot.png", "Cold boot, empty field state")

        # ---------------------------------------------------- pipeline system
        go(page, "#/pipelines")
        page.wait_for_timeout(700)
        click_btn(page, "pipelines.newSystem")
        page.wait_for_timeout(500)
        fill_form(page, {
            "name": cats["name"], "operator": cats["operator"], "product": cats["product"],
            "dnIn": cats["dnIn"], "wallThicknessMm": cats["wallThicknessMm"],
            "material": cats["material"], "coating": cats["coating"],
            "lengthKm": cats["lengthKm"], "stationFromKm": 0, "stationToKm": cats["lengthKm"],
            "opPressureMpa": cats["opPressureMpa"],
            "notes": f"NSTA {cats['provenance']['nsta_pipeline_no']} · real open data",
        })
        shot(page, "02-pipeline-system-form.png",
             "Pipeline operator: CATS system with real NSTA attributes")
        ok = save(page)
        sys_id = page.evaluate("""async () => {
            const recs = await IW.core.db.getAll('pipelineSystems');
            const hit = recs.find(r => (r.name||'').includes('CATS'));
            return hit ? hit.id : null;
        }""")
        log("create_system", "ok" if ok and sys_id else "error", f"id={sys_id}")

        # ------------------------------------------------------- monitoring pts
        go(page, "#/corrosion")
        for i, mp in enumerate(mps):
            click_btn(page, "corrosion.newPoint")
            page.wait_for_timeout(400)
            proc = mp["process"]
            pipe = next((p for p in ds["realPipelines"] if p["id"] == mp["line"]), None)
            tnom = pipe["wallThicknessMm"] if pipe else 12.7
            fill_form(page, {
                "code": mp["code"], "name": mp["name"], "sector": mp["sector"],
                "systemId": sys_id if mp["line"] == "SYS-PL774" and sys_id else mp["line"],
                "line": mp["line"], "material": mp["material"],
                "sensorType": mp["sensorType"], "tNom": tnom, "tMin": round(tnom * 0.8, 1),
                "h2sPpm": proc["h2sPpm"], "co2Ppm": proc["co2Ppm"],
                "totalPressureKpa": proc["totalPressureKpa"], "tempC": proc["tempC"],
                "bswPct": proc["bswPct"], "velocityMs": proc["velocityMs"],
                "inhibitorTargetPpm": proc["inhibitorTargetPpm"],
                "inhibitorResidualPpm": proc["inhibitorResidualPpm"],
            }, prefix="cf-")
            if i == 0:
                shot(page, "03-mp-refinery-form.png",
                     "Refinery operator: CDU overhead point, 95 °C, 240 kPa, 420 ppm H2S")
            if not save(page):
                issue(f"monitoring point {mp['code']} did not save")
        go(page, "#/corrosion")
        page.wait_for_timeout(800)
        mp_id = page.evaluate("""async () => {
            const recs = await IW.core.db.getAll('monitoringPoints');
            const hit = recs.find(r => r.code === 'MP-GB-FCC-SLUR');
            return hit ? hit.id : null;
        }""")
        if mp_id:
            go(page, "#/corrosion/mp/" + mp_id)
        else:
            issue("MP-GB-FCC-SLUR not found in store")
        page.wait_for_timeout(900)
        shot(page, "04-mp-slurry-detail.png",
             "FCC slurry point: 11-16 mpy band, severe classification")

        # -------------------------------------------------------------- ingest
        go(page, "#/ingest")
        page.wait_for_timeout(800)
        page.set_input_files("#csv-file", os.path.join(DATA, "carga-ops.csv"))
        page.wait_for_timeout(1200)
        shot(page, "05-ingest-mapping.png", "48-row operator CSV, auto-mapped columns")
        click_btn(page, "ingest.runValidation")
        page.wait_for_timeout(1500)
        shot(page, "06-ingest-validation.png", "Validation: 48 rows across 6 points")
        click_btn(page, "ingest.importBtn")
        page.wait_for_timeout(1800)
        counts = page.evaluate("""async () => {
            const out = {};
            for (const n of ['monitoringPoints','readings','pipelineSystems']) {
                try { out[n] = (await IW.core.db.getAll(n)).length; } catch (e) { out[n] = null; }
            }
            return out;
        }""")
        evidence["counts_after_import"] = counts
        shot(page, "07-ingest-imported.png", f"Committed; store counts {counts}")
        log("ingest", "ok", str(counts))

        # ----------------------------------------------------------------- APM
        go(page, "#/apm")
        page.wait_for_timeout(700)
        picks = [a for a in assets if a["code"] in
                 ("REF-GB-CDU-01", "REF-GB-K-401", "MID-CATS-PS-01")]
        for i, a in enumerate(picks):
            click_btn(page, "apm.newAsset")
            page.wait_for_timeout(350)
            fill_form(page, {
                "code": a["code"], "name": a["name"], "sector": a["sector"],
                "criticality": a["criticality"], "status": "running",
                "pof": a["rbi"]["pof"], "cof": a["rbi"]["cof"],
                "inspectionBaseMonths": a["rbi"]["inspectionBaseMonths"],
                "notes": f"ISO 14224 tag · {a['site'] or 'pipeline'}",
            })
            if i == 0:
                page.wait_for_timeout(300)
                page.evaluate("""() => {
                    const s = document.querySelector('#fld-category');
                    if (s) { s.value = 'distillationUnit'; s.dispatchEvent(new Event('change',{bubbles:true})); }
                }""")
                shot(page, "08-apm-asset-form.png",
                     "Refinery operator: CDU registered with RBI band A and 12-month interval")
            if not save(page):
                issue(f"asset {a['code']} did not save")
        go(page, "#/apm")
        page.wait_for_timeout(800)
        aid = page.evaluate("""async (code) => {
            const recs = await IW.core.db.getAll('apmAssets');
            const hit = recs.find(r => r.code === code);
            return hit ? hit.id : null;
        }""", "REF-GB-CDU-01")
        if aid:
            go(page, "#/apm/" + aid)
            shot(page, "09-apm-asset-detail.png", "Asset detail with RBI band and next inspection")
        shot(page, "10-apm-mixed-sectors.png", "Registry mixing downstream and midstream assets")

        # ------------------------------------------------- line asset + inspect
        go(page, "#/pipelines/" + (sys_id or ""))
        page.wait_for_timeout(900)
        click_btn(page, "pipelines.newLineAsset")
        page.wait_for_timeout(400)
        fill_form(page, {
            "code": "LA-CATS-VALVE-02", "name": "Sectionalising valve km 12.4",
            "stationKm": 12.4, "certExpiryISO": "2027-06-30",
            "notes": "Pipeline operator field asset",
        })
        shot(page, "11-line-asset-form.png", "Pipeline operator: line asset at km 12.4")
        save(page)

        page.wait_for_timeout(700)
        click_btn(page, "pipelines.newInspection")
        page.wait_for_timeout(500)
        page.evaluate("""() => {
            const a = document.querySelector('#fld-lineAssetId');
            if (a && a.options.length > 1) { a.value = a.options[1].value; a.dispatchEvent(new Event('change',{bubbles:true})); }
            const sev = document.querySelector('#fld-severity');
            if (sev) { sev.value = 'severe'; sev.dispatchEvent(new Event('change',{bubbles:true})); }
        }""")
        fill_form(page, {
            "date": "2026-03-18", "fromKm": 12.2, "toKm": 12.6,
            "findings": "External corrosion 38% WT loss at valve pit",
            "reportRef": "ILI-2026-03",
        })
        shot(page, "12-inspection-form.png",
             "Pipeline operator: ILI finding, severe, at km 12.4")
        save(page)
        go(page, "#/pipelines/" + (sys_id or ""))
        page.wait_for_timeout(1000)
        shot(page, "13-pipeline-detail-map.png", "System detail with map, assets and inspections")

        # ----------------------------------------------------------------- PSV
        go(page, "#/psv")
        page.wait_for_timeout(800)
        for i, p in enumerate([psvs[0], psvs[3]]):
            click_btn(page, "psv.newPsv")
            page.wait_for_timeout(400)
            fill_form(page, {
                "tag": p["tag"], "location": p["location"],
                "setPressurePsig": p["setPressurePsig"],
                "operatingTempF": p["operatingTempF"],
                "backPressurePsig": p["backPressurePsig"],
                "lastTestDate": p["lastTestDate"], "nextTestDate": p["nextTestDate"],
                "certifiedCapacity": p["certifiedCapacity"],
                "notes": f"{p['site'] or 'pipeline'} · API 520/526 sizing basis",
            }, prefix="cf-")
            if i == 0:
                shot(page, "14-psv-form.png",
                     "Refinery operator: PSV overdue by 35 days, 250 psig set pressure")
            if not save(page):
                issue(f"PSV {p['tag']} did not save")
        go(page, "#/psv")
        page.wait_for_timeout(800)
        shot(page, "15-psv-registry-overdue.png", "PSV registry with overdue valves")
        go(page, "#/psv/PSV-GB-501")
        page.wait_for_timeout(900)
        shot(page, "16-psv-detail.png", "PSV detail: sizing, test dates, status")

        # --------------------------------------------------------------- rules
        page.click("#run-rules")
        page.wait_for_timeout(2600)
        go(page, "#/recommendations")
        page.wait_for_timeout(1000)
        recs = page.evaluate("""async () => {
            try { return (await IW.core.db.getAll('recommendations')).length; } catch (e) { return null; }
        }""")
        evidence["recommendations"] = recs
        shot(page, "17-recommendations.png", f"R1-R17 sweep raised {recs} recommendations")

        # ------------------------------------------------------------- reports
        page.keyboard.press("Escape")
        page.keyboard.press("Escape")
        nav = page.locator('a[href="#/reports"]').first
        if nav.count():
            nav.click()
        else:
            page.evaluate("location.hash = '#/reports'")
        page.wait_for_timeout(1500)
        evidence["reports_state"] = page.evaluate(
            "() => ({ hash: location.hash, h1: (document.querySelector('#main h1')||{}).textContent, "
            "dialogs: document.querySelectorAll('[role=dialog]').length })")
        print("REPORTS STATE:", evidence["reports_state"])
        # Known race: a pending async render from the asset detail can overwrite
        # #main after the hash changes. A reload drops the stale task.
        page.reload(wait_until="domcontentloaded")
        wait_app(page)
        evidence["reports_state_after_reload"] = page.evaluate(
            "() => ({ hash: location.hash, h1: (document.querySelector('#main h1')||{}).textContent })")
        print("AFTER RELOAD:", evidence["reports_state_after_reload"])
        page.wait_for_selector("#main select", timeout=20000)

        def pick(kind):
            page.evaluate("""(v) => {
                const s = document.querySelector('#main select');
                s.value = v; s.dispatchEvent(new Event('change', {bubbles:true}));
            }""", kind)
            page.wait_for_timeout(800)

        def generate(name, note, option_text=None):
            if option_text:
                page.evaluate("""(txt) => {
                    const sels = document.querySelectorAll('#main select');
                    const s = sels[1];
                    if (!s) return;
                    const o = Array.from(s.options).find(o => o.text.includes(txt));
                    if (o) { s.value = o.value; s.dispatchEvent(new Event('change', {bubbles:true})); }
                }""", option_text)
                page.wait_for_timeout(500)
            btn = page.get_by_role("button", name=tr(page, "reports.generate")).first
            if btn.count() == 0:
                state = page.evaluate("""() => ({ selects: document.querySelectorAll('#main select').length,
                    buttons: Array.from(document.querySelectorAll('#main button')).map(b=>b.textContent.trim()).slice(0,8),
                    html: document.querySelector('#main').innerHTML.slice(0,240) })""")
                evidence.setdefault("debug", {})[name] = state
                shot(page, "99-reports-debug.png", "Reports panel state when Generate is missing")
                issue(f"Generate button missing for {name}: {state.get('buttons')}")
                return False
            btn.click()
            page.wait_for_timeout(2300)
            shot(page, name, note)
            return True

        pick("dossier")
        generate("18-dossier-refinery.png", "Refinery point dossier generated offline", "MP-GB-CDU-OVH")
        pick("quarterly")
        generate("19-quarterly.png", "Quarterly report across the operator dataset")
        pick("datasheet")
        generate("20-psv-datasheet.png", "PSV datasheet generated from the registry")

        # -------------------------------------------------------------- tablet
        page.set_viewport_size({"width": 1280, "height": 800})
        go(page, "#/dashboard")
        page.wait_for_timeout(1200)
        shot(page, "21-tablet-dashboard.png", "Android tablet 1280x800 with mixed-sector data")
        go(page, "#/corrosion")
        page.wait_for_timeout(900)
        shot(page, "22-tablet-corrosion.png", "Tablet: scanning 6 points by sector and rate")

        # --------------------------------------------------------------- admin
        go(page, "#/admin")
        page.wait_for_timeout(900)
        shot(page, "23-admin.png", "Admin: storage, languages, export")
        try:
            with page.expect_download(timeout=15000) as dl:
                click_btn(page, "caseFile.exportBtn")
            dest = os.path.join(OUT, "case-file-operators.iwf.json")
            dl.value.save_as(dest)
            log("export", "ok", f"{os.path.getsize(dest)} bytes")
            shot(page, "24-admin-exported.png", "Case file exported after the operator run")
        except Exception as exc:  # noqa: BLE001
            issue(f"export failed: {exc}")

        ctx.close()
        browser.close()

    evidence["summary"] = {
        "captures": len([s for s in evidence["steps"] if s["step"] == "capture"]),
        "issues": len(evidence["issues"]),
    }
    with open(os.path.join(OUT, "evidence.json"), "w", encoding="utf-8") as fh:
        json.dump(evidence, fh, indent=2, ensure_ascii=False)
    print("\nSUMMARY", json.dumps(evidence["summary"]))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except PWTimeout as exc:
        print(f"TIMEOUT: {exc}", file=sys.stderr)
        sys.exit(2)
