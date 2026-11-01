"""Capturas del recorrido completo en modo tablet (1280x800, español).

Login admin → perfiles (operador/ingeniero) → reset de contraseña → flujo de
oleoducto: alta de activos (bombas multietapa, LPG, productos limpios),
revisiones diarias, chec list (CSV de ronda), mapa de kilómetros, reglas e informes.

    python tools/qa/run_tablet_oleoducto_tour.py      (server on :8419)
"""

from __future__ import annotations

import json
import os
import sys
import time

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE = "http://localhost:8419/"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "docs", "manual-tablet-es-2026-11-01")
DS = os.path.join(ROOT, "datos-prueba", "oleoductos", "dataset.json")
CSV = os.path.join(ROOT, "datos-prueba", "oleoductos", "carga-ronda-diaria.csv")

ev = {"run_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "steps": [], "issues": []}


def log(s, st, d, shots=None):
    ev["steps"].append({"step": s, "status": st, "detail": d, "screenshots": shots or []})
    print(f"[{st}] {s}: {d}")


def tr(p, key):
    return p.evaluate("k => IW.i18n.t(k)", key)


def shot(p, name, note):
    p.evaluate("() => { const r=document.getElementById('toast-region'); if(r) r.textContent=''; }")
    p.wait_for_timeout(280)
    p.screenshot(path=os.path.join(OUT, name), full_page=False)
    log("capture", "ok", note, [name])


def click(p, key):
    p.get_by_role("button", name=p.evaluate("k => IW.i18n.t(k)", key), exact=True).first.click()


def go(p, route, wait=1200):
    p.evaluate("r => { location.hash = r; }", route)
    p.wait_for_timeout(wait)


def fill(p, values, prefix="fld-"):
    p.evaluate("""([v, p]) => {
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


def save(p):
    click(p, "common.save")
    p.wait_for_timeout(950)
    ok = p.locator("[role='dialog'], dialog[open]").count() == 0
    if not ok:
        p.keyboard.press("Escape"); p.wait_for_timeout(250)
    return ok


def main() -> int:
    ds = json.load(open(DS, encoding="utf-8"))
    mps, assets = ds["monitoringPoints"], ds["apmAssets"]
    psvs, las, insp = ds["psvs"], ds["lineAssets"], ds["lineInspections"]
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 800}, locale="es")
        p = ctx.new_page()
        p.goto(BASE, wait_until="domcontentloaded")
        p.wait_for_selector("#run-rules", timeout=45000)
        p.wait_for_function("document.querySelector('#main') && document.querySelector('#main').children.length > 0", timeout=45000)
        p.wait_for_timeout(1900)
        # locale del navegador no cambia la app: forzar es y recargar
        p.evaluate("() => { try { IW.i18n.setLocale('es'); } catch (e) {} }")
        p.reload(wait_until="domcontentloaded")
        p.wait_for_selector("#run-rules", timeout=45000)
        p.wait_for_timeout(1600)

        # 01 admin login gate
        p.evaluate("() => { const b=[...document.querySelectorAll('header button')].find(b=>/Bloquear|Lock now/i.test(b.textContent)); if(b) b.click(); }")
        p.wait_for_timeout(1100)
        if p.locator("#login-gate-user").count():
            p.fill("#login-gate-user", "admin"); p.fill("#login-gate-pass", "654321")
            p.evaluate("() => { const b=[...document.querySelectorAll('#main button, header button')].find(b=>/Iniciar sesión|Sign in/i.test(b.textContent)); if(b) b.click(); }")
            p.wait_for_timeout(1600)
        shot(p, "01-sesion-admin.png", "Sesión iniciada como administrador (puerta de acceso superada)")

        # 02-04 profiles: engineer + operator, then reset passphrase
        go(p, "#/admin", 1300)
        shot(p, "02-panel-usuarios.png", "Panel Usuarios y acceso (administrador)")
        p.fill("#admin-user-username", "luis.castro"); p.fill("#admin-user-pass", "Ope#2026")
        p.select_option("#admin-user-role", "operator")
        shot(p, "03-crear-operador.png", "Alta de credencial de operador de oleoducto")
        p.evaluate("() => { const b=[...document.querySelectorAll('#main button')].find(b=>/Crear usuario/i.test(b.textContent)); if(b) b.click(); }")
        p.wait_for_timeout(900)
        p.fill("#admin-user-username", "mara.lopez"); p.fill("#admin-user-pass", "Ing#2026")
        p.select_option("#admin-user-role", "engineer")
        shot(p, "04-crear-ingeniero.png", "Alta de credencial de ingeniero de integridad")
        p.evaluate("() => { const b=[...document.querySelectorAll('#main button')].find(b=>/Crear usuario/i.test(b.textContent)); if(b) b.click(); }")
        p.wait_for_timeout(900)
        # reset passphrase of luis.castro (admin flow)
        p.fill("#admin-user-username", "")
        rows = p.locator("table").filter(has_text="luis.castro")
        try:
            rows.get_by_role("button").first.click(); p.wait_for_timeout(500)
        except Exception:
            pass
        dlg = p.locator("[role='dialog'], dialog[open]")
        if dlg.count():
            p.fill("#admin-user-pass", "Ope#2027"); p.wait_for_timeout(300)
            shot(p, "05-reset-password.png", "Restablecimiento de contraseña por el administrador")
            okbtn = dlg.get_by_role("button").filter(has_text="Guardar")
            if okbtn.count():
                okbtn.first.click()
            p.wait_for_timeout(700)
        # el diálogo debe quedar cerrado antes de seguir
        for _ in range(3):
            if p.locator("[role='dialog'], dialog[open]").count() == 0:
                break
            p.keyboard.press("Escape"); p.wait_for_timeout(350)
        log("dialog_closed", "ok" if p.locator("[role='dialog'], dialog[open]").count() == 0 else "warn",
            "reset dialog closed before dashboard capture")

        # create daily-round points (4 derived) + 2 real
        for mp in mps:
            sysid = "SYS-OLEO-NORTE" if mp["line"] == "SYS-OLEO-NORTE" else "SYS-LPG-LIMPIOS"
            go(p, "#/corrosion")
            click(p, "corrosion.newPoint")
            p.wait_for_selector("#cf-code", timeout=8000)
            p.wait_for_function("() => { const s=document.querySelector('#cf-material'); return s && s.options.length>1; }", timeout=8000)
            fill(p, {"code": mp["code"], "name": mp["name"], "sector": "midstream",
                     "systemId": sysid, "line": sysid, "material": "api5l-x52",
                     "sensorType": "couponGravimetric", "tNom": 10.5, "tMin": 8.4,
                     "h2sPpm": 60, "co2Ppm": 2500,
                     "totalPressureKpa": mp["process"]["totalPressureKpa"],
                     "tempC": mp["process"]["tempC"], "bswPct": 1, "velocityMs": 1.2,
                     "inhibitorTargetPpm": 25, "inhibitorResidualPpm": 22}, prefix="cf-")
            if mp["code"] == "MP-OLEO-DESC":
                shot(p, "08-nuevo-punto-form.png", "Alta de punto de corrosión en línea de oleoducto")
            save(p)
        # 06-08 operator daily round: dashboard + readings entry
        go(p, "#/dashboard", 1300)
        shot(p, "06-dashboard-operador.png", "Panel del operador: KPIs y heatmap con pictogramas")
        go(p, "#/corrosion", 1200)
        shot(p, "07-corrosion-lista.png", "Puntos de corrosión del oleoducto con pictogramas")

        go(p, "#/corrosion")
        mp_id = page = None
        mid = p.evaluate("""async () => { const r = await IW.core.db.getAll('monitoringPoints');
            const h = r.find(x => x.code === 'MP-OLEO-DESC'); return h ? h.id : null; }""")
        if mid:
            go(p, "#/corrosion/mp/" + mid, 1300)
            shot(p, "09-punto-descarga-detalle.png", "Detalle: punto de descarga de estación")

        # 10-12 asset entry: multistage pump + LPG pump
        go(p, "#/apm")
        click(p, "apm.newAsset")
        p.wait_for_selector("#fld-code", timeout=8000)
        fill(p, {"code": "P-101A", "name": "Bomba centrífuga multietapa crudo (A)",
                 "sector": "midstream", "criticality": "A", "status": "running",
                 "pof": 3, "cof": 4, "inspectionBaseMonths": 12,
                 "notes": "6 etapas · sello mecánico · servicio crudo"})
        p.evaluate("""() => { const s=document.querySelector('#fld-category');
            if(s){ s.value='centrifugalPump'; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
        shot(p, "10-bomba-multietapa-form.png", "Alta de bomba centrífuga multietapa (crudo)")
        save(p)
        go(p, "#/apm")
        click(p, "apm.newAsset")
        p.wait_for_selector("#fld-code", timeout=8000)
        fill(p, {"code": "P-301", "name": "Bomba LPG multietapa",
                 "sector": "midstream", "criticality": "A", "status": "running",
                 "pof": 4, "cof": 4, "inspectionBaseMonths": 6,
                 "notes": "Servicio LPG · presión descarga 15 bar"})
        shot(p, "11-bomba-lpg-form.png", "Alta de bomba LPG")
        save(p)
        go(p, "#/apm", 1300)
        shot(p, "12-apm-registry.png", "Registro de activos del oleoducto")

        # 13-14 PSV
        go(p, "#/psv")
        click(p, "psv.newPsv")
        p.wait_for_selector("#cf-tag", timeout=8000)
        p.fill("#cf-tag", "PSV-201"); p.select_option("#cf-valveType", "conventional")
        p.fill("#cf-location", "Descarga P-201, Estación Km 40")
        p.fill("#cf-setPressurePsig", "870"); p.fill("#cf-operatingTempF", "140")
        p.fill("#cf-backPressurePsig", "22"); p.fill("#cf-lastTestDate", "2026-04-18")
        p.fill("#cf-nextTestDate", "2027-04-18"); p.fill("#cf-certifiedCapacity", "31000")
        shot(p, "13-psv-form.png", "Alta de PSV de estación")
        save(p)
        go(p, "#/psv", 1200)
        shot(p, "14-psv-registry.png", "Registro de PSV con estados")

        # 15-17 pipeline: system + line asset + inspection + map
        go(p, "#/pipelines")
        click(p, "pipelines.newSystem")
        page_val = None
        p.wait_for_selector("#fld-name", timeout=8000)
        sys0 = ds["systems"][0]
        fill(p, {"name": sys0["name"], "operator": sys0["operator"], "product": "crude",
                 "dnIn": sys0["dnIn"], "wallThicknessMm": sys0["wallThicknessMm"],
                 "material": "api5l-x52", "coating": "FBE",
                 "lengthKm": sys0["lengthKm"], "stationFromKm": 0,
                 "stationToKm": sys0["lengthKm"], "opPressureMpa": sys0["opPressureMpa"],
                 "notes": "Atributos reales NSTA (MAGNUS TO NINIAN)"})
        shot(p, "15-oleoducto-form.png", "Alta del oleoducto (36/24 in según NSTA)")
        save(p)
        go(p, "#/pipelines", 1200)
        click(p, "pipelines.newSystem")
        p.wait_for_selector("#fld-name", timeout=8000)
        sys1 = ds["systems"][1]
        fill(p, {"name": sys1["name"], "operator": sys1["operator"], "product": "LPG/clean products",
                 "dnIn": sys1["dnIn"], "wallThicknessMm": sys1["wallThicknessMm"],
                 "material": "api5l-x52", "coating": "FBE",
                 "lengthKm": sys1["lengthKm"], "stationFromKm": 0,
                 "stationToKm": sys1["lengthKm"], "opPressureMpa": sys1["opPressureMpa"],
                 "notes": "Servicio LPG y productos limpios (escenario derivado)"})
        save(p)
        go(p, "#/pipelines", 1200)
        sid = p.evaluate("""async () => { const r = await IW.core.db.getAll('pipelineSystems');
            const h = r.find(x => x.name && x.name.indexOf('Oleoducto') === 0); return h ? h.id : null; }""")
        if sid:
            go(p, "#/pipelines/" + sid, 1500)
            click(p, "pipelines.newInspection")
            p.wait_for_selector("#fld-date", timeout=8000)
            p.evaluate("""() => {
                const a = document.querySelector('#fld-lineAssetId');
                if (a && a.options.length > 1) { a.value = a.options[1].value; a.dispatchEvent(new Event('change',{bubbles:true})); }
                const sev = document.querySelector('#fld-severity');
                if (sev) { sev.value = 'moderate'; sev.dispatchEvent(new Event('change',{bubbles:true})); }
            }""")
            fill(p, {"date": "2026-11-01", "fromKm": 11.8, "toKm": 12.2,
                     "findings": "Ronda diaria: revisión de válvula km 12 sin fugas",
                     "reportRef": "RONDA-2026-11-01"})
            shot(p, "16-ronda-inspeccion.png", "Ronda diaria registrada como inspección")
            save(p)
            go(p, "#/pipelines/" + sid, 1500)
            p.evaluate("() => { const m=document.querySelector('.map-card'); if(m) m.scrollIntoView({block:'center'}); }")
            p.wait_for_timeout(800)
            shot(p, "17-oleoducto-mapa.png", "Mapa de kilómetros con severidad y activos")

        # 18-20 ingest: daily round CSV
        go(p, "#/ingest")
        p.wait_for_selector("#csv-file", timeout=15000)
        p.wait_for_timeout(700)
        p.set_input_files("#csv-file", CSV)
        p.wait_for_timeout(1300)
        shot(p, "18-ingesta-ronda.png", "Ingesta de la ronda diaria (42 lecturas)")
        click(p, "ingest.runValidation")
        p.wait_for_timeout(1500)
        shot(p, "19-ingesta-validacion.png", "Validación de la ronda diaria")
        click(p, "ingest.importBtn")
        p.wait_for_timeout(1600)
        counts = p.evaluate("""async () => ({ readings: (await IW.core.db.getAll('readings')).length })""")
        ev["counts"] = counts
        shot(p, "20-ingesta-importada.png", f"Lecturas en el almacén: {counts.get('readings')}")

        # 21-22 rules + recommendations
        p.click("#run-rules")
        p.wait_for_timeout(2600)
        go(p, "#/recommendations", 1300)
        recs = p.evaluate("""async () => { try { return (await IW.core.db.getAll('recommendations')).length; } catch (e) { return null; } }""")
        ev["recommendations"] = recs
        shot(p, "21-recomendaciones.png", f"Reglas R1–R17: {recs} recomendaciones")

        # 23-25 reports
        p.evaluate("location.hash='#/reports'")
        p.reload(wait_until="domcontentloaded")
        p.wait_for_selector("#main select", timeout=20000); p.wait_for_timeout(1100)
        p.evaluate("""() => { const s=document.querySelector('#main select'); s.value='dossier'; s.dispatchEvent(new Event('change',{bubbles:true})); }""")
        p.wait_for_timeout(700)
        p.evaluate("""() => { const s=document.querySelectorAll('#main select')[1]; const o=Array.from(s.options).find(o=>o.text.includes('MP-OLEO-DESC')); if(o){ s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
        p.wait_for_timeout(500)
        p.get_by_role("button", name=tr(p, "reports.generate")).first.click()
        p.wait_for_timeout(2200)
        shot(p, "23-informe-dossier.png", "Dossier del punto de descarga generado en el dispositivo")
        p.evaluate("""() => { const s=document.querySelector('#main select'); s.value='quarterly'; s.dispatchEvent(new Event('change',{bubbles:true})); }""")
        p.wait_for_timeout(700)
        p.get_by_role("button", name=tr(p, "reports.generate")).first.click()
        p.wait_for_timeout(2400)
        shot(p, "24-informe-trimestral.png", "Informe trimestral")

        # 26-27 admin + switch user to operator
        go(p, "#/admin", 1200)
        shot(p, "26-admin-final.png", "Admin tras la campaña")
        click(p, "psv.newPsv") if False else None
        # switch user: lock now → login as operator
        p.evaluate("() => { const b=[...document.querySelectorAll('header button')].find(b=>/Bloquear ahora|Lock now/i.test(b.textContent)); if(b) b.click(); }")
        p.wait_for_timeout(1100)
        p.fill("#login-gate-user", "luis.castro"); p.fill("#login-gate-pass", "Ope#2027")
        p.evaluate("() => { const b=[...document.querySelectorAll('#main button, header button')].find(b=>/Iniciar sesión|Sign in/i.test(b.textContent)); if(b) b.click(); }")
        p.wait_for_timeout(1700)
        go(p, "#/dashboard", 1200)
        who = p.evaluate("""async () => { const M={get:k=>IW.core.db.get('meta',k).then(r=>r?r.value:undefined),set:(k,v)=>IW.core.db.put('meta',{key:k,value:v})}; return await IW.security.lock.role(M); }""")
        ev["operator_session_role"] = who
        shot(p, "27-sesion-operador.png", f"Sesión activa: {who}")

        ctx.close()
        b.close()

    ev["summary"] = {"captures": len([s for s in ev["steps"] if s["step"] == "capture"]),
                     "issues": len(ev["issues"])}
    with open(os.path.join(OUT, "evidence.json"), "w", encoding="utf-8") as fh:
        json.dump(ev, fh, indent=2, ensure_ascii=False)
    print("SUMMARY", json.dumps(ev["summary"]))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except PWTimeout as exc:
        print(f"TIMEOUT: {exc}", file=sys.stderr)
        sys.exit(2)
