"""Operator-focused LinkedIn cut (plant Ã‚Â· pipeline Ã‚Â· refinery), English VO.

  python promo/scripts/make_operator_video.py      (server on :8419)

Outputs promo/out/integritywatch-field-oleoducto-es.mp4 + .srt + manifest.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import wave

import edge_tts
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROMO = os.path.join(ROOT, "promo")
ASSETS = os.path.join(PROMO, "assets")
OUT = os.path.join(PROMO, "out")
WORK = os.path.join(OUT, ".oleovideo")
QA = os.path.join(ROOT, "tools", "qa")
DS = os.path.join(ROOT, "datos-prueba", "oleoductos", "dataset.json")
CSV_OLEO = os.path.join(ROOT, "datos-prueba", "oleoductos", "carga-ronda-diaria.csv")
BASE = "http://localhost:8419/"
VOICE = "es-MX-DaliaNeural"
FALLBACK = ["es-MX-JorgeNeural", "es-CO-SalomeNeural"]
RATE = "-2%"

NAVY, BLUE, STEEL, WHITE = "#11161c", "#0b5cad", "#8d99a6", "#ffffff"

SCENES = [
    ("s1", "card", "title_1.png"),
    ("s2", "still", "docs/manual-tablet-es-2026-11-01/01-sesion-admin.png"),
    ("s3", "still", "docs/manual-tablet-es-2026-11-01/03-crear-operador.png"),
    ("s4", "still", "docs/manual-tablet-es-2026-11-01/05-reset-password.png"),
    ("s5", "still", "docs/manual-tablet-es-2026-11-01/06-dashboard-operador.png"),
    ("s6", "still", "docs/manual-tablet-es-2026-11-01/10-bomba-multietapa-form.png"),
    ("s7", "still", "docs/manual-tablet-es-2026-11-01/11-bomba-lpg-form.png"),
    ("s8", "still", "docs/manual-tablet-es-2026-11-01/13-psv-form.png"),
    ("s9", "still", "docs/manual-tablet-es-2026-11-01/17-oleoducto-mapa.png"),
    ("s10", "still", "docs/manual-tablet-es-2026-11-01/19-ingesta-validacion.png"),
    ("s11", "still", "docs/manual-tablet-es-2026-11-01/21-recomendaciones.png"),
    ("s12", "still", "docs/manual-tablet-es-2026-11-01/23-informe-dossier.png"),
    ("s13", "card", "title_2.png"),
]

# Notas de equipo y tarea por escena (se dibujan sobre el video).
NOTES = {
    "s2":  "Login admin - puerta de acceso",
    "s3":  "Alta de perfiles - luis.castro operador / mara.lopez ingeniera",
    "s4":  "Reset de contrasena por el administrador",
    "s5":  "Panel del operador - KPIs y heatmap con pictogramas IFS-24",
    "s6":  "P-101A bomba centrifuga multietapa - succ 2.1 bar / desc 61.8 bar",
    "s7":  "P-301 bomba LPG - servicio LPG - intervalo 6 meses",
    "s8":  "PSV-201 - tarado 870 psig - prueba 2026-04-18",
    "s9":  "Oleoducto 91,2 km - severidad por segmento - activos por estacion",
    "s10": "Ronda diaria - 42 lecturas CSV - validacion en el dispositivo",
    "s11": "Barrido R1-R17 - corrosion, inhibidor y PSV",
    "s12": "Dossier MP-OLEO-DESC generado en el dispositivo",
}

LINES = {
    "s1": "Este es el recorrido completo de IntegrityWatch Field en modo tablet: "
          "desde el acceso del administrador hasta el informe firmado en el dispositivo.",
    "s2": "Todo empieza en la puerta de acceso. El administrador entra con su usuario y "
          "su clave; la sesion dura quince minutos de inactividad.",
    "s3": "El administrador crea los perfiles: aqui damos de alta a un operador de "
          "oleoducto y a una ingeniera de integridad, cada uno con su rol.",
    "s4": "Si alguien olvida su clave, el administrador la restablece desde el mismo panel, "
          "sin borrar datos y sin tocar el equipo.",
    "s5": "El panel del operador resume el dia: alarmas, puntos de corrosion y "
          "recomendaciones. Cada punto lleva el pictograma de su equipo.",
    "s6": "Damos de alta la bomba centrifuga multietapa de crudo: succion a dos coma uno bar "
          "y descarga a sesenta y uno coma ocho. La categoria define el intervalo de inspeccion.",
    "s7": "En el terminal registramos la bomba de LPG: servicio severo, criticidad A e "
          "intervalo de seis meses.",
    "s8": "Las valvulas de alivio viven en su propio registro: tarado, capacidad certificada "
          "y fechas de prueba. Las vencidas se marcan solas.",
    "s9": "El oleoducto se dibuja como una barra de kilometros: cada segmento toma el color "
          "de la peor severidad inspeccionada, y los equipos cuelgan de su estacion.",
    "s10": "La ronda diaria entra como CSV: cuarenta y dos lecturas mapeadas y validadas en "
           "el dispositivo, sin conexion.",
    "s11": "Un barrido de reglas convierte las lecturas en recomendaciones jerarquizadas: "
           "corrosion, inhibidor, PSV y confiabilidad.",
    "s12": "Y el dossier del punto se genera en la misma tablet, listo para imprimir y firmar.",
    "s13": "IntegrityWatch Field. Datos de campo, decisiones de campo. Sin senal.",
}

PAD = {"s1": 1.4, "s2": 1.3, "s3": 1.4, "s4": 1.2, "s5": 1.3, "s6": 1.5, "s7": 1.3,
       "s8": 1.4, "s9": 1.5, "s10": 1.4, "s11": 1.3, "s12": 1.4, "s13": 2.0}

SRT_STYLE = ("FontName=Segoe UI,FontSize=13,PrimaryColour=&H00FFFFFF,"
             "OutlineColour=&H00000000,BorderStyle=1,Outline=1.3,Shadow=0.7,"
             "MarginV=24,Alignment=2")


def run(cmd, cwd=None):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError("cmd failed: %s\n%s" % (" ".join(cmd), p.stderr[-2000:]))
    return p


def venc_args():
    """Prefer the RTX NVENC encoder; fall back to libx264 when unavailable."""
    probe = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True)
    if "h264_nvenc" in (probe.stdout or ""):
        return ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "21",
                "-b:v", "0", "-maxrate", "12M", "-bufsize", "24M"]
    return ["-c:v", "libx264", "-preset", "medium", "-crf", "20"]


def add_note(src, out, text):
    """Equipment/task note in the top-left corner (no subtitles)."""
    if not text:
        shutil.copyfile(src, out)
        return
    txt = (text.encode("ascii", "ignore").decode("ascii").strip()
           .replace("'", "").replace(":", " -").replace(",", " ")
           .replace(";", " ").replace("%", " pct").replace("\\", " "))
    vf = ("drawtext=fontfile='C\\:/Windows/Fonts/segoeuib.ttf':text='" + txt + "':"
          "x=84:y=h-118:fontsize=26:fontcolor=white:"
          "box=1:boxcolor=0x0b5cad@0.85:boxborderw=14")
    run(["ffmpeg", "-y", "-i", src, "-vf", vf] + venc_args() +
        ["-pix_fmt", "yuv420p", "-an", out])


def dur(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                      "-of", "default=nw=1:nk=1", path]).stdout.strip())


def font(size, bold=True):
    return ImageFont.truetype(os.path.join("C:\\Windows\\Fonts",
                                           "segoeuib.ttf" if bold else "segoeui.ttf"), size)


async def synth(text, mp3):
    last = None
    for voice in [VOICE] + FALLBACK:
        try:
            await edge_tts.Communicate(text, voice, rate=RATE).save(mp3)
            return voice
        except Exception as exc:  # noqa: BLE001
            last = exc
    raise RuntimeError(f"TTS failed: {last}")


def build_vo():
    vos = {}
    for sid, text in LINES.items():
        mp3 = os.path.join(WORK, f"vo_{sid}.mp3")
        wav = os.path.join(WORK, f"vo_{sid}.wav")
        voice = asyncio.run(synth(text, mp3))
        run(["ffmpeg", "-y", "-i", mp3, "-ar", "48000", "-ac", "1",
             "-c:a", "pcm_s16le", wav])
        vos[sid] = {"wav": wav, "dur": dur(wav), "text": text, "voice": voice}
        print(f"  VO {sid}: {vos[sid]['dur']:5.2f}s")
    return vos


def make_cards():
    W, H = 1920, 1080
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 22, H], fill=BLUE)
    d.text((150, 320), "INTEGRITYWATCH FIELD", font=font(34), fill=STEEL)
    d.text((150, 390), "Every function.", font=font(88), fill=WHITE)
    d.text((150, 495), "One tablet.", font=font(88), fill=WHITE)
    d.line([150, 640, 410, 640], fill=BLUE, width=6)
    d.text((150, 690), "Ingest Â· assets Â· relief valves Â· pipelines Â· rules Â· reports",
           font=font(30, False), fill=STEEL)
    img.save(os.path.join(WORK, "title_1.png"))

    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 22, H], fill=BLUE)
    d.text((150, 290), "IntegrityWatch Field", font=font(92), fill=WHITE)
    d.line([150, 430, 410, 430], fill=BLUE, width=6)
    d.text((150, 480), "Offline integrity, inspection and compliance",
           font=font(44, False), fill=STEEL)
    d.text((150, 560), "for wells, pipelines and process plants",
           font=font(44, False), fill=STEEL)
    d.text((150, 700), "github.com/DeployModeIO/integritywatch-field",
           font=font(36, False), fill=WHITE)
    d.text((150, 765), "Tablet Â· no server Â· no cloud", font=font(34, False), fill=BLUE)
    img.save(os.path.join(WORK, "title_2.png"))
    print("  cards written")


def js_click_global(page, rx):
    ok = page.evaluate("""(rx) => { const r=new RegExp(rx,'i');
        const b=[...document.querySelectorAll('#main button, header button')]
            .find(b=>r.test(b.textContent||'')); if(b){ b.click(); return true; } return false; }""", rx)
    page.wait_for_timeout(500)
    return ok


def record_ops(targets: dict) -> dict:
    sys.path.insert(0, QA)
    from run_tablet_oleoducto_tour import tr, click, go, fill  # noqa: E402

    rec_dir = os.path.join(WORK, "rec")
    os.makedirs(rec_dir, exist_ok=True)
    ds = json.load(open(DS, encoding="utf-8"))
    mps, assets = ds["monitoringPoints"], ds["apmAssets"]
    marks, t0 = {}, time.monotonic()

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1280, "height": 800},
                                  record_video_dir=rec_dir,
                                  record_video_size={"width": 1280, "height": 800},
                                  locale="es")
        page = ctx.new_page()

        def hold(start, target):
            while (time.monotonic() - t0) - start < target:
                page.wait_for_timeout(120)

        def clean():
            page.evaluate("() => { const r=document.getElementById('toast-region'); if(r) r.textContent=''; }")

        def fclick(key):
            page.get_by_role("button", name=tr(page, key), exact=True).first.click(force=True)
            page.wait_for_timeout(450)

        def js_click(rx):
            ok = page.evaluate("""(rx) => { const r=new RegExp(rx,'i');
                const b=[...document.querySelectorAll('#main button, header button')]
                    .find(b=>r.test(b.textContent||'')); if(b){ b.click(); return true; } return false; }""", rx)
            page.wait_for_timeout(500)
            return ok

        def ensure_session(user="admin", pwd="654321"):
            if page.locator("#login-gate-user").count():
                signin(user, pwd)
                page.wait_for_timeout(1200)
                if page.locator("#login-gate-user").count():
                    raise RuntimeError("login gate did not clear")

        def signin(user, pwd):
            page.fill("#login-gate-user", user)
            page.fill("#login-gate-pass", pwd)
            page.evaluate("""() => { const b=[...document.querySelectorAll('#main button, header button')]
                .find(b=>/Iniciar sesion|Iniciar sesión|Sign in/i.test(b.textContent)); if(b) b.click(); }""")
            page.wait_for_timeout(1700)

        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_selector("#run-rules", timeout=45000)
        page.wait_for_function("document.querySelector('#main') && document.querySelector('#main').children.length > 0",
                               timeout=45000)
        page.wait_for_timeout(1900)
        # idioma de la app a español (el locale del navegador no basta)
        page.evaluate("() => { try { IW.i18n.setLocale('es'); } catch (e) {} }")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#run-rules", timeout=45000)
        page.wait_for_timeout(1500)

        # setup off-camera: puntos del oleoducto + sistema + activos de linea
        go(page, "#/corrosion", 1200)
        for mp in mps:
            sysid = "SYS-OLEO-NORTE" if mp["line"] == "SYS-OLEO-NORTE" else "SYS-LPG-LIMPIOS"
            fclick("corrosion.newPoint")
            page.wait_for_selector("#cf-code", timeout=8000)
            fill(page, {"code": mp["code"], "name": mp["name"], "sector": "midstream",
                        "systemId": sysid, "line": sysid, "material": "api5l-x52",
                        "sensorType": "couponGravimetric", "tNom": 10.5, "tMin": 8.4,
                        "h2sPpm": 60, "co2Ppm": 2500,
                        "totalPressureKpa": mp["process"]["totalPressureKpa"],
                        "tempC": mp["process"]["tempC"], "bswPct": 1, "velocityMs": 1.2,
                        "inhibitorTargetPpm": 25, "inhibitorResidualPpm": 22}, prefix="cf-")
            js_click_global(page, "guardar|save")
            page.wait_for_timeout(420)

        go(page, "#/pipelines", 1200)
        s0 = ds["systems"][0]
        fclick("pipelines.newSystem")
        page.wait_for_selector("#fld-name", timeout=8000)
        fill(page, {"name": s0["name"], "operator": s0["operator"], "product": "crude",
                    "dnIn": s0["dnIn"], "wallThicknessMm": s0["wallThicknessMm"],
                    "material": "api5l-x52", "coating": "FBE",
                    "lengthKm": s0["lengthKm"], "stationFromKm": 0, "stationToKm": s0["lengthKm"],
                    "opPressureMpa": s0["opPressureMpa"], "notes": "Atributos reales NSTA"})
        js_click_global(page, "guardar|save")
        page.wait_for_timeout(700)
        sid_pre = page.evaluate("""async () => { const r = await IW.core.db.getAll('pipelineSystems');
            const h = r.find(x => x.name && x.name.indexOf('Oleoducto') === 0); return h ? h.id : null; }""")
        if sid_pre:
            go(page, "#/pipelines/" + sid_pre, 1200)
            fclick("pipelines.newLineAsset")
            page.wait_for_selector("#fld-code", timeout=8000)
            fill(page, {"code": "VLV-ON-12", "name": "Valvula de seccionamiento km 12",
                        "stationKm": 12, "certExpiryISO": "2027-08-31"})
            js_click_global(page, "guardar|save")
            page.wait_for_timeout(600)

        # bootstrap: activar el bloqueo como admin (perfil limpio no tiene puerta)
        go(page, "#/admin", 1400)
        pins = page.locator("input[type='password']")
        if pins.count() >= 2:
            pins.nth(0).fill("654321")
            pins.nth(1).fill("654321")
            page.evaluate("""() => { const s=[...document.querySelectorAll('#main select')]
                .find(s=>[...s.options].some(o=>o.value==='admin'));
                if(s){ s.value='admin'; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
            page.evaluate("""() => { const b=[...document.querySelectorAll('#main button')]
                .find(b=>/Activar bloqueo|Enable lock/i.test(b.textContent)); if(b) b.click(); }""")
            page.wait_for_timeout(1300)

        # s2 — login gate admin
        page.evaluate("() => { const b=[...document.querySelectorAll('header button')].find(b=>/Bloquear|Lock/i.test(b.textContent)); if(b) b.click(); }")
        page.wait_for_timeout(1100)
        marks["gate_start"] = time.monotonic() - t0
        signin("admin", "654321")
        hold(marks["gate_start"], targets["s2"])
        marks["perf_start"] = time.monotonic() - t0

        # s3 — perfiles
        go(page, "#/admin", 1300)
        marks["s3_start"] = marks["perf_start"]
        for i, (u, pwd, role) in enumerate([("luis.castro", "Ope#2026", "operator"),
                                            ("mara.lopez", "Ing#2026", "engineer")]):
            page.fill("#admin-user-username", u)
            page.fill("#admin-user-pass", pwd)
            page.evaluate("""(r) => { const s=[...document.querySelectorAll('#main select')]
                .find(s=>[...s.options].some(o=>o.value===r));
                if(s){ s.value=r; s.dispatchEvent(new Event('change',{bubbles:true})); } }""", role)
            page.wait_for_timeout(450)
            if i == 0:
                page.screenshot(path=os.path.join(WORK, "still_perfil.png"))
            page.evaluate("""() => { const b=[...document.querySelectorAll('#main button')]
                .find(b=>/Crear usuario/i.test(b.textContent)); if(b) b.click(); }""")
            page.wait_for_timeout(750)
        hold(marks["s3_start"], targets["s3"])
        marks["reset_start"] = time.monotonic() - t0

        # s4 — reset passphrase de luis.castro
        go(page, "#/admin", 1200)
        page.evaluate("""() => { const row=[...document.querySelectorAll('table tr')]
            .find(tr=>tr.textContent.includes('luis.castro'));
            if(row){ const b=row.querySelector('button'); if(b) b.click(); } }""")
        page.wait_for_timeout(900)
        if page.locator("[role='dialog'], dialog[open]").count():
            page.fill("input[type='password']", "Ope#2027")
            page.wait_for_timeout(300)
            page.evaluate("""() => { const b=[...document.querySelectorAll('[role=dialog] button')]
                .find(b=>/Guardar|Save/i.test(b.textContent)); if(b) b.click(); }""")
            page.wait_for_timeout(700)
        for _ in range(3):
            if page.locator("[role='dialog'], dialog[open]").count() == 0:
                break
            page.keyboard.press("Escape"); page.wait_for_timeout(300)
        hold(marks["reset_start"], targets["s4"])
        marks["dash_start"] = time.monotonic() - t0

        # s5 — dashboard operador
        ensure_session()
        go(page, "#/dashboard", 1300)
        clean()
        page.mouse.wheel(0, 240); page.wait_for_timeout(850); page.mouse.wheel(0, -240)
        page.wait_for_timeout(450)
        hold(marks["dash_start"], targets["s5"])
        marks["bomba_start"] = time.monotonic() - t0

        # s6 — bomba multietapa (alta en vivo)
        ensure_session()
        go(page, "#/apm", 1400)
        js_click("activo|asset")
        page.wait_for_selector("#fld-code", timeout=20000)
        page.wait_for_selector("#fld-code", timeout=8000)
        a0 = assets[0]
        fill(page, {"code": a0["code"], "name": a0["name"], "sector": "midstream",
                 "criticality": a0["criticality"], "status": "running",
                 "pof": a0["rbi"]["pof"], "cof": a0["rbi"]["cof"],
                 "inspectionBaseMonths": a0["rbi"]["inspectionBaseMonths"],
                 "notes": "6 etapas · sello mecanico · servicio crudo"})
        page.evaluate("""() => { const s=document.querySelector('#fld-category');
            if(s){ s.value='centrifugalPump'; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
        page.wait_for_timeout(450)
        js_click("guardar|save")
        page.wait_for_timeout(850)
        hold(marks["bomba_start"], targets["s6"])
        marks["lpg_start"] = time.monotonic() - t0

        # s7 — bomba LPG
        ensure_session()
        go(page, "#/apm", 1200)
        js_click("activo|asset")
        page.wait_for_selector("#fld-code", timeout=20000)
        page.wait_for_selector("#fld-code", timeout=8000)
        lpg = next(a for a in assets if a["id"] == "APM-LP-P301")
        fill(page, {"code": lpg["code"], "name": lpg["name"], "sector": "midstream",
                 "criticality": lpg["criticality"], "status": "running",
                 "pof": lpg["rbi"]["pof"], "cof": lpg["rbi"]["cof"],
                 "inspectionBaseMonths": lpg["rbi"]["inspectionBaseMonths"],
                 "notes": "Servicio LPG"})
        page.wait_for_timeout(350)
        js_click("guardar|save")
        page.wait_for_timeout(750)
        hold(marks["lpg_start"], targets["s7"])
        marks["psv_start"] = time.monotonic() - t0

        # s8 — PSV
        go(page, "#/psv", 1200)
        js_click("psv|alivio")
        page.wait_for_selector("#cf-tag", timeout=20000)
        pv = ds["psvs"][0]
        fill(page, {"tag": pv["tag"], "location": pv["location"],
                 "setPressurePsig": pv["setPressurePsig"],
                 "operatingTempF": pv["operatingTempF"],
                 "backPressurePsig": pv["backPressurePsig"],
                 "lastTestDate": pv["lastTestDate"], "nextTestDate": pv["nextTestDate"],
                 "certifiedCapacity": pv["certifiedCapacity"]}, prefix="cf-")
        page.wait_for_timeout(280)
        js_click("guardar|save")
        page.wait_for_timeout(750)
        hold(marks["psv_start"], targets["s8"])
        marks["mapa_start"] = time.monotonic() - t0

        # s9 — mapa de kilometros
        sid = page.evaluate("""async () => { const r = await IW.core.db.getAll('pipelineSystems');
            const h = r.find(x => x.name && x.name.indexOf('Oleoducto') === 0); return h ? h.id : null; }""")
        if sid:
            go(page, "#/pipelines/" + sid, 1500)
            page.evaluate("() => { const m=document.querySelector('.map-card'); if(m) m.scrollIntoView({block:'center'}); }")
            page.wait_for_timeout(900)
        hold(marks["mapa_start"], targets["s9"])
        marks["ing_start"] = time.monotonic() - t0

        # s10 — ingesta
        go(page, "#/ingest", 1200)
        page.wait_for_selector("#csv-file", timeout=15000)
        clean()
        page.set_input_files("#csv-file", os.path.join(ROOT, "datos-prueba", "oleoductos", "carga-ronda-diaria.csv"))
        page.wait_for_timeout(1300)
        page.evaluate("""() => { const label=IW.i18n.t('ingest.runValidation');
            const b=[...document.querySelectorAll('#main button')].find(b=>b.textContent.trim()===label);
            if(b) b.click(); }""")
        page.wait_for_timeout(1500)
        clean()
        page.mouse.wheel(0, 200)
        page.wait_for_timeout(450)
        hold(marks["ing_start"], targets["s10"])
        marks["reg_start"] = time.monotonic() - t0

        # s11 — reglas
        page.click("#run-rules")
        page.wait_for_timeout(2300)
        go(page, "#/recommendations", 1300)
        page.wait_for_timeout(650)
        hold(marks["reg_start"], targets["s11"])
        marks["dos_start"] = time.monotonic() - t0

        # s12 — dossier
        page.evaluate("location.hash='#/reports'")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#main select", timeout=20000)
        page.wait_for_timeout(950)
        page.evaluate("""() => { const s=document.querySelector('#main select'); s.value='dossier'; s.dispatchEvent(new Event('change',{bubbles:true})); }""")
        page.wait_for_timeout(650)
        page.evaluate("""() => { const s=document.querySelectorAll('#main select')[1];
            const o=Array.from(s.options).find(o=>o.text.includes('MP-OLEO-DESC'));
            if(o){ s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); } }""")
        page.wait_for_timeout(380)
        page.get_by_role("button", name=tr(page, "reports.generate")).first.click()
        page.wait_for_timeout(1750)
        page.mouse.wheel(0, 160)
        page.wait_for_timeout(550)
        hold(marks["dos_start"], targets["s12"])
        marks["end"] = time.monotonic() - t0

        ctx.close()
        browser.close()

    videos = [os.path.join(rec_dir, f) for f in os.listdir(rec_dir) if f.endswith(".webm")]
    video = max(videos, key=os.path.getmtime)
    marks["video"] = video
    marks["video_dur"] = dur(video)
    print(f"  recording {os.path.basename(video)} {marks['video_dur']:.1f}s")
    return marks


def clip_image(img, out, d, zoom_in=True):
    fps = 30
    frames = max(2, int(d * fps))
    z = "min(zoom+0.00045,1.12)" if zoom_in else "if(lte(zoom,1.0),1.12,max(1.001,zoom-0.00045))"
    vf = (f"scale=2400:-1,zoompan=z='{z}':d={frames}:s=1920x1080:fps={fps},"
          f"trim=duration={d},setsar=1,fade=t=in:st=0:d=0.4")
    run(["ffmpeg", "-y", "-loop", "1", "-i", img, "-t", f"{d:.3f}", "-vf", vf,
         ] + venc_args() + ["-pix_fmt", "yuv420p", "-an", out])


def clip_still(img, out, d):
    vf = ("scale=1920:1080:force_original_aspect_ratio=decrease,"
          "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x11161c,fps=30,"
          "setsar=1,fade=t=in:st=0:d=0.4")
    run(["ffmpeg", "-y", "-loop", "1", "-i", img, "-t", f"{d:.3f}", "-vf", vf,
         ] + venc_args() + ["-pix_fmt", "yuv420p", "-an", out])


def clip_video(src, out, start, d):
    vf = ("scale=1920:1080:force_original_aspect_ratio=decrease,"
          "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x11161c,fps=30,"
          "setsar=1,fade=t=in:st=0:d=0.35")
    run(["ffmpeg", "-y", "-ss", f"{max(0.0,start):.3f}", "-i", src, "-t", f"{d:.3f}",
         "-vf", vf] + venc_args() + ["-pix_fmt", "yuv420p", "-an", out])


def compose_vo(vos, starts, total):
    out = os.path.join(WORK, "vo.wav")
    buf = bytearray(int(48000 * total) * 2)
    for sid, info in vos.items():
        with wave.open(info["wav"], "rb") as r:
            frames = r.readframes(r.getnframes())
        off = int(starts[sid] * 48000) * 2
        end = off + len(frames)
        if end > len(buf):
            buf.extend(b"\x00" * (end - len(buf)))
        buf[off:end] = frames
    with wave.open(out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000)
        w.writeframes(bytes(buf))
    return out


def write_srt(vos, starts):
    path = os.path.join(OUT, "integritywatch-field-oleoducto-es.srt")
    def ts(t):
        h = int(t // 3600); m = int((t % 3600) // 60); s = int(t % 60)
        ms = int(round((t - int(t)) * 1000))
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    with open(path, "w", encoding="utf-8") as fh:
        for i, sid in enumerate(LINES, 1):
            fh.write(f"{i}\n{ts(starts[sid])} --> {ts(starts[sid] + vos[sid]['dur'])}\n"
                     f"{LINES[sid]}\n\n")
    return path


def write_ass(vos, starts) -> str:
    path = os.path.join(OUT, "integritywatch-field-oleoducto-es.ass")
    def ts(t):
        h = int(t // 3600); m = int((t % 3600) // 60); sec = t % 60
        return f"{h:d}:{m:02d}:{sec:05.2f}"
    header = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n"
              "WrapStyle: 0\nScaledBorderAndShadow: yes\n\n"
              "[V4+ Styles]\n"
              "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
              "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, "
              "ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, "
              "MarginL, MarginR, MarginV, Encoding\n"
              "Style: Default,Segoe UI,34,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,"
              "-1,0,0,0,100,100,0,0,1,2.0,0.6,2,90,90,86,1\n\n"
              "[Events]\n"
              "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, "
              "Effect, Text\n")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(header)
        for sid in LINES:
            import textwrap
            text = "\\N".join(textwrap.wrap(LINES[sid].replace("\n", " "), 64))
            fh.write(f"Dialogue: 0,{ts(starts[sid])},{ts(starts[sid] + vos[sid]['dur'])},"
                     f"Default,,0,0,0,,{text}\n")
    return path


def main() -> int:
    for d in (WORK, OUT):
        os.makedirs(d, exist_ok=True)
    print("[1/6] voice over")
    vos = build_vo()
    print("[2/6] cards")
    make_cards()
    print("[3/6] scenes from captures")
    durations, starts, t = {}, {}, 0.0
    for sid, _, _ in SCENES:
        durations[sid] = round(vos[sid]["dur"] + PAD[sid], 3)
        starts[sid] = round(t, 3)
        t += durations[sid]
    total = round(t, 3)

    clips = []
    for sid, kind, asset in SCENES:
        raw = os.path.join(WORK, f"{sid}.mp4")
        if kind == "card":
            clip_image(os.path.join(WORK, asset), raw, durations[sid], sid == "s1")
        else:
            src = os.path.join(ROOT, asset.replace("/", os.sep))
            if not os.path.exists(src):
                raise RuntimeError(f"missing capture: {asset}")
            clip_still(src, raw, durations[sid])
        if NOTES.get(sid):
            noted = os.path.join(WORK, f"{sid}_note.mp4")
            add_note(raw, noted, NOTES[sid])
            raw = noted
        clips.append(raw)
        print(f"  {sid} {durations[sid]:.2f}s")

    print("[5/6] concat + audio")
    lst = os.path.join(WORK, "scenes.txt")
    with open(lst, "w", encoding="utf-8") as fh:
        for c in clips:
            fh.write(f"file '{c.replace(os.sep,'/')}'\n")
    silent = os.path.join(WORK, "video.mp4")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent])
    vo = compose_vo(vos, starts, total)
    music = os.path.join(ASSETS, "music", "music.wav")
    final = os.path.join(OUT, "integritywatch-field-oleoducto-es.mp4")
    run(["ffmpeg", "-y", "-i", silent, "-i", vo, "-i", music, "-filter_complex",
         f"[2:a]atrim=0:{total},volume=0.13,afade=t=in:st=0:d=1.5,"
         f"afade=t=out:st={max(0,total-3):.2f}:d=3[m];"
         f"[1:a][m]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.95[a]",
         "-map", "0:v", "-map", "[a]", "-t", f"{total:.3f}"] + venc_args() +
        ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final])

    print("[6/6] subtitles files (no burn)")
    srt = write_srt(vos, starts)
    ass = write_ass(vos, starts)

    manifest = {"video": final, "duration": dur(final),
                "size_bytes": os.path.getsize(final), "subtitles": srt,
                "voice": VOICE,
                "scenes": [{"id": s, "start": starts[s], "duration": durations[s],
                            "text": LINES[s]} for s, _, _ in SCENES]}
    with open(os.path.join(OUT, "oleoducto-video-manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
    print(f"\nDONE {final}  {manifest['duration']:.2f}s  {manifest['size_bytes']/1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)


