"""Synthetic data-entry validation under the new security model.

Enables the lock as admin, runs one data-entry flow per module, and captures
each step (including the lock screen and session badge).

    python tools/qa/run_security_entry_tests.py      (server on :8419)
"""

from __future__ import annotations

import json
import os
import sys
import time

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:8419/"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "docs", "security-entry-2026-10-31")

evidence = {"run_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "steps": [], "issues": []}


def log(step, status, detail, shots=None):
    evidence["steps"].append({"step": step, "status": status, "detail": detail, "screenshots": shots or []})
    print(f"[{status}] {step}: {detail}")


def tr(page, key):
    return page.evaluate("k => IW.i18n.t(k)", key)


def shot(page, name, note):
    page.wait_for_timeout(320)
    page.evaluate("() => { const r=document.getElementById('toast-region'); if(r) r.textContent=''; }")
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


def save(page, label=""):
    click(page, "common.save")
    page.wait_for_timeout(900)
    ok = not page.locator("[role='dialog'], dialog[open]").count()
    if not ok:
        dbg = page.evaluate("""() => {
            const d = document.querySelector("[role='dialog'], dialog[open]");
            const errs = Array.from((d || document).querySelectorAll('.field-error, .error, [class*="error"]'))
                .map(e => e.textContent.trim()).filter(Boolean);
            return { text: d ? d.innerText.slice(0, 260) : null, errs: errs.slice(0, 6) };
        }""")
        log("save", "error", label + ": " + json.dumps(dbg, ensure_ascii=False)[:320])
        shot(page, f"90-fail-{label.replace(' ', '-')}.png", f"Save failure diagnostics for {label}")
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)
    return ok


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    results = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 950}, locale="en-US")
        page = ctx.new_page()
        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_selector("#run-rules", timeout=45000)
        page.wait_for_function("document.querySelector('#main') && document.querySelector('#main').children.length > 0", timeout=45000)
        page.wait_for_timeout(1900)

        # ------------------------------------------------- enable lock (admin)
        go(page, "#/admin", 1300)
        pin_inputs = page.locator("input[type='password']")
        pin_inputs.nth(0).fill("654321")
        pin_inputs.nth(1).fill("654321")
        role_sel = page.evaluate("""() => { const s=[...document.querySelectorAll('#main select')]
            .find(s => [...s.options].some(o => o.value==='admin' && [...s.options].some(o=>o.value==='operator')));
            if (s) { s.value='admin'; s.dispatchEvent(new Event('change',{bubbles:true})); } return s ? s.value : null; }""")
        results["role_selected"] = role_sel
        click(page, "admin.enableLock")
        page.wait_for_timeout(900)
        enabled = page.evaluate("""async () => (await IW.security.lock.isEnabled({ get: k => IW.core.db.get('meta', k).then(r => r ? r.value : undefined), set: (k,v) => IW.core.db.put('meta', {key:k, value:v}) })) ? true : false""")
        # helper meta accessor fallback
        if not enabled:
            enabled = page.evaluate("""async () => {
                const v = await IW.core.db.get('meta', 'lock.enabled');
                return v === true || (v && v.value === true);
            }""")
        results["lock_enabled"] = bool(enabled)
        log("enable_lock", "ok" if enabled else "warn", f"enabled={enabled}")
        shot(page, "01-lock-enabled.png", "Lock enabled as admin (role selector)")

        # session should be valid now (admin) — run the data-entry flow
        # ---------------------------------------------------- corrosion point
        go(page, "#/corrosion")
        click(page, "corrosion.newPoint")
        page.wait_for_selector("#cf-code", timeout=8000)
        page.wait_for_function("() => { const s = document.querySelector('#cf-material'); return s && s.options.length > 1; }", timeout=8000)
        page.wait_for_timeout(350)
        fill(page, {
            "code": "MP-SEC-01", "name": "Security validation point", "sector": "midstream",
            "systemId": "SYS-SEC", "line": "SYS-SEC", "material": "api5l-x52",
            "sensorType": "couponGravimetric", "tNom": 10, "tMin": 8,
            "h2sPpm": 120, "co2Ppm": 3000, "totalPressureKpa": 3400, "tempC": 45,
            "bswPct": 1, "velocityMs": 1.0, "inhibitorTargetPpm": 20, "inhibitorResidualPpm": 18
        }, prefix="cf-")
        shot(page, "02-point-form.png", "Point form as admin (guard allows assetWrite)")
        results["point"] = save(page, "point")

        # ----------------------------------------------------------- reading
        mp_id = page.evaluate("""async () => { const r = await IW.core.db.getAll('monitoringPoints');
            const h = r.find(x => x.code === 'MP-SEC-01'); return h ? h.id : null; }""")
        if mp_id:
            go(page, "#/corrosion/mp/" + mp_id, 1300)
            click(page, "corrosion.newReading")
            page.wait_for_timeout(450)
            fill(page, {"date": "2026-10-31", "crMpy": 5.2, "note": "Logged under admin session"}, prefix="cf-")
            shot(page, "03-reading-form.png", "Reading form")
            results["reading"] = save(page, "reading")
            # verify stamp
            stamp = page.evaluate("""async (id) => {
                const r = await IW.core.db.getAll('readings');
                const hit = r.filter(x => x.mpId === id).sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
                return hit[0] ? {createdBy: hit[0].createdBy, createdAt: !!hit[0].createdAt} : null;
            }""", mp_id)
            results["reading_stamp"] = stamp
            log("stamp", "ok" if stamp and stamp.get("createdBy") else "warn", json.dumps(stamp))

        # ------------------------------------------------------- APM + event
        go(page, "#/apm")
        click(page, "apm.newAsset")
        page.wait_for_timeout(450)
        fill(page, {"code": "DE-SEC-101", "name": "Security test separator", "sector": "midstream",
                    "criticality": "A", "status": "running", "pof": 4, "cof": 3,
                    "inspectionBaseMonths": 12})
        page.evaluate("""() => { const s=document.querySelector('#fld-category');
            if(s){ s.value='separator'; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
        results["asset"] = save(page, "asset")

        aid = page.evaluate("""async () => { const r = await IW.core.db.getAll('apmAssets');
            const h = r.find(x => x.code === 'DE-SEC-101'); return h ? h.id : null; }""")
        if aid:
            go(page, "#/apm/" + aid, 1300)
            click(page, "apm.newEvent")
            page.wait_for_timeout(450)
            fill(page, {"type": "failure", "start": "2026-10-30", "downtimeH": 3,
                        "description": "Security-model validation event"})
            shot(page, "04-event-form.png", "Event form")
            results["event"] = save(page, "event")
            ev_stamp = page.evaluate("""async (aid) => {
                const r = await IW.core.db.getAll('apmEvents');
                const hit = r.filter(x => x.assetId === aid).sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
                return hit[0] ? hit[0].createdBy : null;
            }""", aid)
            results["event_stamp"] = ev_stamp

        # ------------------------------------------------------------ PSV
        go(page, "#/psv")
        click(page, "psv.newPsv")
        page.wait_for_selector("#cf-tag", timeout=8000)
        page.wait_for_function("() => { const s = document.querySelector('#cf-fluidId'); return s && s.options.length > 1; }", timeout=8000)
        page.wait_for_timeout(350)
        page.fill("#cf-tag", "PSV-SEC-01")
        page.select_option("#cf-valveType", "conventional")
        page.fill("#cf-location", "Security validation")
        page.fill("#cf-setPressurePsig", "210")
        page.fill("#cf-operatingTempF", "180")
        page.fill("#cf-backPressurePsig", "10")
        page.fill("#cf-lastTestDate", "2026-03-01")
        page.fill("#cf-nextTestDate", "2027-03-01")
        page.fill("#cf-certifiedCapacity", "15000")
        page.fill("#cf-notes", "Security-model validation")
        results["psv"] = save(page, "PSV")

        # ------------------------------------------------------- pipeline
        go(page, "#/pipelines")
        click(page, "pipelines.newSystem")
        page.wait_for_timeout(450)
        fill(page, {"name": "SEC Demo Line", "operator": "Demo", "product": "gas",
                    "dnIn": 12, "wallThicknessMm": 8.7, "material": "api5l-x52",
                    "coating": "FBE", "lengthKm": 25, "stationFromKm": 0,
                    "stationToKm": 25, "opPressureMpa": 6.4, "notes": "Security validation"})
        shot(page, "05-system-form.png", "Pipeline system form as admin")
        results["system"] = save(page, "system")

        sys_id = page.evaluate("""async () => { const r = await IW.core.db.getAll('pipelineSystems');
            const h = r.find(x => x.name === 'SEC Demo Line'); return h ? h.id : null; }""")
        if sys_id:
            go(page, "#/pipelines/" + sys_id, 1400)
            click(page, "pipelines.newLineAsset")
            page.wait_for_timeout(450)
            fill(page, {"code": "LA-SEC-01", "name": "Security valve km 5",
                        "stationKm": 5, "notes": "Security-model validation"})
            results["lineAsset"] = save(page, "line asset")

        # ------------------------------------------------------------- export
        go(page, "#/admin", 1200)
        try:
            with page.expect_download(timeout=15000) as dl:
                page.evaluate("""() => {
                    const btn = [...document.querySelectorAll('#main button')]
                        .find(b => b.textContent.includes(IW.i18n.t('caseFile.exportBtn')));
                    if (btn) btn.click();
                }""")
            dest = os.path.join(OUT, "export-admin.iwf.json")
            dl.value.save_as(dest)
            envelope = json.load(open(dest, encoding="utf-8"))
            results["export"] = {
                "app": envelope.get("app"),
                "checksumAlgo": envelope.get("checksumAlgo"),
                "signedBy": envelope.get("signedBy"),
                "hasSha: ": bool(envelope.get("checksumSha256")),
            }
            log("export", "ok", json.dumps(results["export"]))
            shot(page, "06-export-v2.png", "Case file exported as V2 with signedBy + SHA-256")
        except Exception as exc:  # noqa: BLE001
            issue(f"export failed: {exc}")

        # -------------------------------------------------- session expiry
        # simulate expiry: rewrite the session expiresISO to the past, then check role()
        expired = page.evaluate("""async () => {
            const M = { get: k => IW.core.db.get('meta', k).then(r => r ? r.value : undefined), set: (k,v) => IW.core.db.put('meta', {key:k, value:v}) };
            const s = await IW.security.lock.currentSession(M);
            if (!s) return 'no-session';
            const until = new Date(Date.now() - 1000).toISOString();
            const cur = await IW.core.db.get('meta', 'lock.session');
            cur.value.expiresISO = until;
            await IW.core.db.put('meta', cur);
            const role = await IW.security.lock.role(M);
            return role === null ? 'expired-null' : 'still-valid';
        }""")
        results["session_expiry_check"] = expired
        log("session_expiry", "ok" if expired in ("expired-null", "no-session") else "warn", expired)

        # ------------------------------------------------------- final shots
        go(page, "#/dashboard", 1300)
        shot(page, "07-dashboard-final.png", "Dashboard after the security-model run")

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
