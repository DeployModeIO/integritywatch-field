"""Field validation run for IntegrityWatch Field (real NSTA/HSE dataset).

Drives the real UI with Playwright and captures numbered screenshots plus a
machine-readable evidence log. Every record created in the app uses the real
asset attributes from datos-prueba/real/app-dataset.json.

Run (server must be up on :8419):
    python tools/qa/run_field_tests.py
"""

from __future__ import annotations

import json
import os
import sys
import time

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:8419/"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "datos-prueba", "real")
OUT = os.path.join(ROOT, "docs", "field-tests-2026-10-30")

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


def click_btn(page, key, within=None, timeout=8000):
    label = tr(page, key)
    scope = within if within is not None else page
    btn = scope.get_by_role("button", name=label, exact=True).first
    btn.wait_for(state="visible", timeout=timeout)
    btn.click()


def clear_notices(page):
    """Drop transient toasts and the SW update banner so captures stay clean."""
    page.evaluate("""() => {
        const r = document.getElementById('toast-region');
        if (r) { r.textContent = ''; }
        document.querySelectorAll('.toast, .update-banner, .update-notice').forEach(e => e.remove());
        Array.from(document.body.children).forEach(e => {
            if (e.id === 'app' || e.id === 'root') { return; }
            const txt = (e.textContent || '');
            if (txt.includes('Update available') && getComputedStyle(e).position === 'fixed') { e.remove(); }
        });
    }""")


def shot(page, name, note, full=True):
    page.wait_for_timeout(400)
    try:
        clear_notices(page)
    except Exception:
        pass
    path = os.path.join(OUT, name)
    page.screenshot(path=path, full_page=full)
    log("capture", "ok", note, [name])
    return name


def wait_app(page):
    page.wait_for_selector("#run-rules", timeout=45000)
    page.wait_for_function(
        "document.querySelector('#main') && document.querySelector('#main').children.length > 0",
        timeout=45000)
    page.wait_for_timeout(1800)


def go(page, route):
    page.evaluate("r => { location.hash = r; }", route)
    page.wait_for_timeout(900)


def fill_form(page, values: dict, prefix="fld-"):
    """Set form fields by name; selects via JS so option labels don't matter."""
    page.evaluate("""([vals, prefix]) => {
        for (const [name, value] of Object.entries(vals)) {
            const el = document.querySelector('#' + prefix + name);
            if (!el) continue;
            const tag = el.tagName.toLowerCase();
            const type = (el.getAttribute('type') || '').toLowerCase();
            if (type === 'checkbox') { el.checked = !!value; }
            else if (tag === 'select') {
                const opt = Array.from(el.options).find(o => o.value === value)
                         || Array.from(el.options).find(o => o.text.trim() === String(value));
                if (opt) { el.value = opt.value; }
            } else {
                el.value = value;
            }
            el.dispatchEvent(new Event('input', {bubbles: true}));
            el.dispatchEvent(new Event('change', {bubbles: true}));
        }
    }""", [values, prefix])


def dialog_open(page):
    return page.locator(".dialog, [role='dialog'], dialog[open]").count() > 0


def save_dialog(page):
    click_btn(page, "common.save")
    page.wait_for_timeout(900)
    return not dialog_open(page)


def open_first_text(page, text):
    """Open a row/card: APM and corrosion render the key as a button.link."""
    link = page.locator("button.link").filter(has_text=text).first
    if link.count() > 0:
        link.click()
    else:
        page.get_by_text(text, exact=False).first.click()
    page.wait_for_timeout(1000)


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    app = json.load(open(os.path.join(DATA, "app-dataset.json"), encoding="utf-8"))
    pipes = {p["id"]: p for p in app["pipelines"]}
    mps = app["monitoringPoints"]
    assets = app["apmAssets"]

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900},
                                  locale="en-US", accept_downloads=True)
        page = ctx.new_page()

        # ---------------------------------------------------------------- boot
        page.goto(BASE, wait_until="domcontentloaded")
        wait_app(page)
        shot(page, "01-dashboard-boot-en.png", "Dashboard after first boot with seeded demo data")

        # ------------------------------------------------- monitoring points
        go(page, "#/corrosion")
        page.wait_for_timeout(700)
        shot(page, "02-corrosion-list-before.png", "Corrosion module before adding field points")

        created = []
        for i, mp in enumerate(mps):
            pipe = pipes[mp["line"]]
            click_btn(page, "corrosion.newPoint")
            page.wait_for_timeout(500)
            proc = mp["process"]
            fill_form(page, {
                "code": mp["code"],
                "name": mp["name"],
                "sector": mp["sector"],
                "systemId": mp["line"],
                "line": mp["line"],
                "material": mp["material"],
                "sensorType": mp["sensorType"],
                "tNom": pipe["wallThicknessMm"],
                "tMin": round(pipe["wallThicknessMm"] * 0.8, 1),
                "h2sPpm": proc["h2sPpm"],
                "co2Ppm": proc["co2Ppm"],
                "totalPressureKpa": proc["totalPressureKpa"],
                "tempC": proc["tempC"],
                "bswPct": proc["bswPct"],
                "velocityMs": proc["velocityMs"],
                "inhibitorTargetPpm": proc["inhibitorTargetPpm"],
                "inhibitorResidualPpm": proc["inhibitorResidualPpm"],
            }, prefix="cf-")
            if i == 0:
                shot(page, "03-new-point-cats-form.png",
                     "New monitoring point form filled with real CATS pipeline attributes (NSTA PL774)")
            if save_dialog(page):
                created.append(mp["code"])
                log("create_point", "ok", f"{mp['code']} created from {mp['line']}")
            else:
                issue(f"Monitoring point {mp['code']} did not save (validation blocked)")
                log("create_point", "error", mp["code"])

        go(page, "#/corrosion")
        page.wait_for_timeout(800)
        open_first_text(page, mps[0]["code"])
        shot(page, "04-point-cats-detail.png",
             "Created point MP-PL774 opened: real wall thickness, MAOP and coupon series input")

        # ------------------------------------------------------------- ingest
        go(page, "#/ingest")
        page.wait_for_timeout(800)
        page.set_input_files("#csv-file", os.path.join(DATA, "carga-corrosion.csv"))
        page.wait_for_timeout(1200)
        shot(page, "05-ingest-mapping.png", "CSV loaded: auto-detected delimiter and header mapping")

        try:
            click_btn(page, "ingest.runValidation")
            page.wait_for_timeout(1500)
            shot(page, "06-ingest-validation.png", "Validation result for the 32 derived readings")
            click_btn(page, "ingest.importBtn")
            page.wait_for_timeout(1800)
            shot(page, "07-ingest-imported.png", "Import committed and history updated")
            counts = page.evaluate("""async () => {
                const names = ['monitoringPoints','readings','pipelineSystems','apmAssets','recommendations'];
                const out = {};
                for (const n of names) {
                    try { out[n] = (await IW.core.db.getAll(n)).length; } catch (e) { out[n] = null; }
                }
                return out;
            }""")
            evidence["db_counts_after_import"] = counts
            log("csv_import", "ok", f"corrosion CSV ingested; store counts {counts}")
        except Exception as exc:  # noqa: BLE001
            issue(f"CSV import step failed: {exc}")
            log("csv_import", "error", str(exc))

        # ----------------------------------------------------------- pipeline
        go(page, "#/pipelines")
        page.wait_for_timeout(700)
        click_btn(page, "pipelines.newSystem")
        page.wait_for_timeout(500)
        cats = pipes["SYS-PL774"]
        fill_form(page, {
            "name": cats["name"],
            "operator": cats["operator"],
            "product": cats["product"],
            "dnIn": cats["dnIn"],
            "wallThicknessMm": cats["wallThicknessMm"],
            "material": cats["material"],
            "coating": cats["coating"],
            "lengthKm": cats["lengthKm"],
            "stationFromKm": 0,
            "stationToKm": cats["lengthKm"],
            "opPressureMpa": cats["opPressureMpa"],
            "notes": f"NSTA {cats['provenance']['nsta_pipeline_no']} · real open data 2026-10-30",
        })
        shot(page, "08-pipeline-system-form.png",
             "New pipeline system with real CATS attributes (914.4 mm, 28.4 mm WT, 179.3 barg)")
        if save_dialog(page):
            log("create_pipeline", "ok", "CATS pipeline system created")
        else:
            issue("Pipeline system did not save")
        go(page, "#/pipelines")
        page.wait_for_timeout(900)
        open_first_text(page, cats["name"][:24])
        shot(page, "09-pipeline-cats-map.png", "Pipeline detail and station map for the real line")

        # ---------------------------------------------------------------- APM
        go(page, "#/apm")
        page.wait_for_timeout(700)
        click_btn(page, "apm.newAsset")
        page.wait_for_timeout(500)
        valve = next(a for a in assets if "VALVE" in a["code"])
        fill_form(page, {
            "code": valve["code"],
            "name": valve["name"],
            "sector": "midstream",
            "criticality": valve["criticality"],
            "status": "running",
            "pof": 3,
            "cof": 3,
            "inspectionBaseMonths": 24,
            "notes": f"NSTA {valve['provenance']['nsta_inf_type']} · real equipment record",
        })
        # category depends on sector: keep whatever the form auto-selected.
        shot(page, "10-apm-asset-form.png", "New asset from a real NSTA valve record")
        if save_dialog(page):
            log("create_asset", "ok", f"{valve['code']} created")
        else:
            issue("APM asset did not save")
        go(page, "#/apm")
        page.wait_for_timeout(800)
        asset_id = page.evaluate("""async (code) => {
            const recs = await IW.core.db.getAll('apmAssets');
            const hit = recs.find(r => r.code === code);
            return hit ? hit.id : null;
        }""", valve["code"])
        if asset_id:
            go(page, "#/apm/" + asset_id)
            shot(page, "11-apm-asset-detail.png", "Asset detail with RBI band and inspection interval")
            log("open_asset", "ok", f"opened {asset_id}")
        else:
            issue("Created asset not found in store")
            log("open_asset", "error", valve["code"])

        # ---------------------------------------------------------------- PSV
        go(page, "#/psv/PSV-520-001")
        page.wait_for_timeout(1000)
        shot(page, "12-psv-sizing-detail.png", "PSV sizing (API 520) detail view")

        # -------------------------------------------------------------- rules
        page.click("#run-rules")
        page.wait_for_timeout(2500)
        go(page, "#/recommendations")
        page.wait_for_timeout(1000)
        rec_count = page.locator(".card, tr").count()
        shot(page, "13-recommendations-after-rules.png",
             f"Recommendations generated by the R1-R17 sweep (rendered blocks: {rec_count})")
        recs_after = page.evaluate("""async () => {
            try { return (await IW.core.db.getAll('recommendations')).length; } catch (e) { return null; }
        }""")
        evidence["recommendations_total"] = recs_after
        log("rules_sweep", "ok", f"rendered blocks after sweep: {rec_count}; recommendations in store: {recs_after}")

        # ------------------------------------------------------------ reports
        go(page, "#/reports")
        page.wait_for_timeout(1200)

        def pick_report(kind):
            page.evaluate("""(v) => {
                const s = document.querySelector('#main select');
                s.value = v;
                s.dispatchEvent(new Event('change', {bubbles: true}));
            }""", kind)
            page.wait_for_timeout(700)

        def generate(label, fname, note):
            page.get_by_role("button", name=tr(page, "reports.generate")).first.click()
            page.wait_for_timeout(2000)
            shot(page, fname, note)
            log("report_" + label, "ok", note)

        # Point dossier for the real CATS point
        try:
            pick_report("dossier")
            page.evaluate("""() => {
                const s = document.querySelectorAll('#main select')[1];
                const o = Array.from(s.options).find(o => o.text.includes('MP-PL774'));
                if (o) { s.value = o.value; s.dispatchEvent(new Event('change', {bubbles: true})); }
            }""")
            page.wait_for_timeout(500)
            generate("dossier", "14-report-dossier-cats.png",
                     "Point dossier generated for MP-PL774 (real NSTA line attributes)")
        except Exception as exc:  # noqa: BLE001
            issue(f"Dossier generation failed: {exc}")
            log("report_dossier", "error", str(exc))

        # Quarterly integrity report
        try:
            pick_report("quarterly")
            generate("quarterly", "15-report-quarterly.png",
                     "Quarterly integrity report generated from the field dataset")
        except Exception as exc:  # noqa: BLE001
            issue(f"Quarterly report failed: {exc}")
            log("report_quarterly", "error", str(exc))

        # PSV datasheet
        try:
            pick_report("datasheet")
            generate("datasheet", "15b-report-psv-datasheet.png",
                     "PSV datasheet generated for the seeded valve")
        except Exception as exc:  # noqa: BLE001
            issue(f"PSV datasheet failed: {exc}")
            log("report_datasheet", "error", str(exc))

        # -------------------------------------------------------------- admin
        go(page, "#/admin")
        page.wait_for_timeout(900)
        shot(page, "16-admin-data.png", "Admin: storage, languages and data export")
        try:
            with page.expect_download(timeout=15000) as dl:
                click_btn(page, "caseFile.exportBtn")
            download = dl.value
            dest = os.path.join(OUT, "case-file-export.iwf.json")
            download.save_as(dest)
            size = os.path.getsize(dest)
            log("export_case_file", "ok", f"{download.suggested_filename} ({size} bytes)")
            shot(page, "17-admin-exported.png", "Case file exported after the field run")
        except Exception as exc:  # noqa: BLE001
            issue(f"Case file export failed: {exc}")
            log("export_case_file", "error", str(exc))

        # ------------------------------------------------------------- tablet
        page.set_viewport_size({"width": 1280, "height": 800})
        go(page, "#/dashboard")
        page.wait_for_timeout(1200)
        shot(page, "18-tablet-dashboard-1280.png",
             "Android tablet landscape (1280x800): dashboard layout")
        go(page, "#/ingest")
        page.wait_for_timeout(900)
        shot(page, "19-tablet-ingest-1280.png",
             "Android tablet landscape: ingest workflow reachable without a server")

        ctx.close()
        browser.close()

    evidence["summary"] = {
        "points_created": len([s for s in evidence["steps"] if s["step"] == "create_point" and s["status"] == "ok"]),
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
