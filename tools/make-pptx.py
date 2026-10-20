#!/usr/bin/env python3
# make-pptx.py — Genera IntegrityWatch-Field-Presentacion-Tecnica.pptx (16:9, español)
# Dependencias: solo python-pptx y PIL (ya instaladas en el entorno).
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from PIL import Image

# ---------------- Paleta "Midnight Executive" (marca) ----------------
PRIMARY = "0B5CAD"
DARK = "11161C"
ICE = "E9EDF1"
AMBER = "B45309"
TEXT = "1A2430"
MUTED = "5A6B7C"
ICE_TEXT = "E8EDF2"
SURFACE = "F4F6F8"
SURFACE2 = "E9EDF1"
BORDER = "C9D3DC"
DARK_SURFACE = "1A2430"
DARK_BORDER = "33404D"
SEV_CRIT = "B42318"
SEV_WARN = "B45309"
AMBER_LIGHT = "FDF3E7"

FONT_TITLE = "Cambria"
FONT_BODY = "Calibri"

EMU_IN = 914400
SLIDE_W = 13.333
SLIDE_H = 7.5
ML = 0.55
CW = SLIDE_W - 2 * ML
TOTAL = 19

prs = Presentation()
prs.slide_width = Inches(SLIDE_W)
prs.slide_height = Inches(SLIDE_H)
BLANK = prs.slide_layouts[6]

EVIDENCE = r"D:\ArquitectoSupremo\integritywatch-field\docs\evidence"
OUT_DIR = r"D:\ArquitectoSupremo\integritywatch-field\docs\presentacion"
OUT_FILE = os.path.join(OUT_DIR, "IntegrityWatch-Field-Presentacion-Tecnica.pptx")


def new_slide():
    return prs.slides.add_slide(BLANK)


def rect(s, x, y, w, h, fill=None, line=None, line_w=0.75, shape=MSO_SHAPE.RECTANGLE):
    sp = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        sp.fill.background()
    else:
        sp.fill.solid()
        sp.fill.fore_color.rgb = RGBColor.from_string(fill)
    if line is None:
        sp.line.fill.background()
    else:
        sp.line.color.rgb = RGBColor.from_string(line)
        sp.line.width = Pt(line_w)
    sp.shadow.inherit = False
    return sp


def tb(s, x, y, w, h, items, size=13, color=TEXT, bold=False, align=PP_ALIGN.LEFT,
       anchor=MSO_ANCHOR.TOP, font=FONT_BODY, line_spacing=1.0, space_after=4, wrap=True):
    box = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = wrap
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    first = True
    for it in items:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = it.get("align", align)
        p.line_spacing = it.get("line_spacing", line_spacing)
        p.space_after = Pt(it.get("space_after", space_after))
        for run in it["runs"]:
            r = p.add_run()
            r.text = run.get("t", "")
            f = r.font
            f.size = Pt(run.get("size", size))
            f.bold = run.get("bold", bold)
            f.name = run.get("font", font)
            f.color.rgb = RGBColor.from_string(run.get("c", color))
    return box


def chip(s, x, y, d, n, fill=PRIMARY, tcolor=ICE_TEXT, size=16, shape=MSO_SHAPE.OVAL):
    sp = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(d), Inches(d))
    sp.fill.solid()
    sp.fill.fore_color.rgb = RGBColor.from_string(fill)
    sp.line.fill.background()
    sp.shadow.inherit = False
    tf = sp.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = str(n)
    r.font.size = Pt(size)
    r.font.bold = True
    r.font.name = FONT_TITLE
    r.font.color.rgb = RGBColor.from_string(tcolor)
    return sp


def pic_fit(s, path, x, y, box_w, box_h):
    im = Image.open(path)
    iw, ih = im.size
    r = min(box_w / iw, box_h / ih)
    w, h = iw * r, ih * r
    px = x + (box_w - w) / 2
    py = y + (box_h - h) / 2
    s.shapes.add_picture(path, Inches(px), Inches(py), Inches(w), Inches(h))
    return w, h


def arrow_right(s, x, y, w=0.3, h=0.42, fill=AMBER):
    sp = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x), Inches(y - h / 2), Inches(w), Inches(h))
    sp.fill.solid()
    sp.fill.fore_color.rgb = RGBColor.from_string(fill)
    sp.line.fill.background()
    sp.shadow.inherit = False
    return sp


def header(s, kicker, title, num, dark=False):
    tcolor = ICE_TEXT if dark else TEXT
    kcolor = "F2B26A" if dark else AMBER
    tb(s, ML, 0.28, CW, 0.3, [{"runs": [{"t": kicker.upper(), "size": 11, "bold": True, "c": kcolor, "font": FONT_TITLE}]}])
    tb(s, ML, 0.56, CW, 0.85, [{"runs": [{"t": title, "size": 32, "bold": True, "c": tcolor, "font": FONT_TITLE}]}])
    tb(s, ML, 7.14, CW, 0.3, [{"runs": [
        {"t": "IntegrityWatch Field v1.0.0  ·  Presentación Técnica  ·  ", "size": 9, "c": MUTED},
        {"t": f"{num}/{TOTAL}", "size": 9, "bold": True, "c": MUTED},
    ]}])


def notes(s, text):
    s.notes_slide.notes_text_frame.text = text


# =====================================================================
# SLIDE 1 — PORTADA (oscuro)
# =====================================================================
s = new_slide()
rect(s, 0, 0, SLIDE_W, SLIDE_H, fill=DARK)
rect(s, 0, 0, SLIDE_W, 0.14, fill=PRIMARY)
rect(s, 0.7, 0.75, 1.85, 2.12, fill=PRIMARY, shape=MSO_SHAPE.HEXAGON)
tb(s, 0.7, 1.62, 1.85, 0.5, [{"runs": [{"t": "IW", "size": 40, "bold": True, "c": ICE_TEXT, "font": FONT_TITLE}], "align": PP_ALIGN.CENTER}])
tb(s, 2.95, 0.95, 9.85, 1.0, [{"runs": [{"t": "IntegrityWatch Field", "size": 41, "bold": True, "c": ICE_TEXT, "font": FONT_TITLE}]}])
tb(s, 2.95, 1.98, 9.85, 0.75, [{"runs": [{"t": "App de integridad de activos en campo: ductos, corrosión, válvulas de alivio, APM y RBI. Operación offline-first, 100 % cliente, sin servidor.", "size": 14.5, "c": "B9C4D0", "font": FONT_BODY}]}])
rect(s, 0.7, 3.30, 11.93, 2.05, fill=DARK_SURFACE, line=DARK_BORDER, line_w=1.0)
meta = [
    ("Versión", "1.0.0 — estable para demostración y validación funcional"),
    ("Alcance", "Ductos de crudo/gas/productos, corrosión (cupones, ER/LPR/H₂), PSV, APM/RBI"),
    ("Entorno", "Navegador · PWA instalable · EXE portable (Electron) · modo file://"),
    ("Normas", "33 normas en catálogo: ASTM, API, ASME, NACE/AMPP, ISO, NFPA, BS, EEMUA, NR"),
    ("Idiomas", "7 locales: es, en, pt, fr, ru, zh, ar (RTL)"),
]
for i, (k, v) in enumerate(meta):
    cx = 0.95 + (i % 2) * 5.95
    cy = 3.52 + (i // 2) * 0.62
    tb(s, cx, cy, 5.6, 0.55, [{"runs": [{"t": k + ": ", "size": 12, "bold": True, "c": PRIMARY, "font": FONT_BODY}, {"t": v, "size": 12, "c": ICE_TEXT, "font": FONT_BODY}]}])
tb(s, 0.7, 5.75, 11.93, 1.15, [{"runs": [{"t": "IntegrityWatch Field es una herramienta de apoyo a la decisión de ingeniería. Los resultados de cálculo son orientativos: deben verificarse contra las ediciones vigentes de las normas y revisarse por personal de ingeniería cualificado antes de usarse en diseño o en una decisión de operación.", "size": 11.5, "c": "8FA3B8", "font": FONT_BODY}], "line_spacing": 1.15}])
notes(s, "Portada de la presentación técnica de IntegrityWatch Field. Se presenta el producto, versión 1.0.0, alcance, entornos de ejecución y el descargo de ingeniería que se desarrolla al cierre.")

# =====================================================================
# SLIDE 2 — AGENDA (tarjetas 3x3 con stat grande)
# =====================================================================
s = new_slide()
header(s, "IntegrityWatch Field · Presentación Técnica", "Agenda — qué encontrarás en esta presentación", 2)
stats = [
    ("11", "Módulos de la aplicación (panel, corrosión, PSV, tuberías, APM, ingesta, reglas, informes, glosario, administración, i18n)"),
    ("14", "Reglas de integridad automáticas (R1–R14) con deduplicación por huella"),
    ("33", "Normas en el catálogo de la app (ASTM, API, ASME, NACE/AMPP, ISO, NFPA, BS, EEMUA, NR)"),
    ("7", "Idiomas, incluido árabe con dirección RTL; interfaz claro/oscuro"),
    ("281", "Tests automatizados, suite 281/281 verde, cobertura ≥ 80 % en motores y reglas"),
    ("10 000", "Filas en pruebas de volumen; importación de UI en 568 ms, dashboard en 104 ms"),
    ("41", "Filas del kit de datos de campo (CSV validado: 35 ok / 4 errores / 2 duplicadas / 3 puntos nuevos)"),
    ("6", "Sistemas de ducto en precarga de la semilla demostrativa"),
    ("0", "Hallazgos críticos de accesibilidad (axe: 0 críticos/graves/moderados/menores)"),
]
cw, ch, gx, gy = 3.95, 1.32, 0.23, 0.22
for i, (num, label) in enumerate(stats):
    cx = ML + (i % 3) * (cw + gx)
    cy = 1.52 + (i // 3) * (ch + gy)
    rect(s, cx, cy, cw, ch, fill=ICE, line=BORDER, line_w=0.75)
    chip(s, cx + 0.22, cy + (ch - 0.5) / 2, 0.5, i + 1, fill=PRIMARY, size=15)
    tb(s, cx + 0.92, cy + 0.10, cw - 1.15, 0.42, [{"runs": [{"t": num, "size": 23, "bold": True, "c": PRIMARY, "font": FONT_TITLE}]}])
    tb(s, cx + 0.92, cy + 0.58, cw - 1.15, ch - 0.7, [{"runs": [{"t": label, "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.02}])
notes(s, "Agenda de 9 bloques con el alcance de la presentación: módulos, reglas, normas, idiomas, calidad de software, volumen de datos, kit de campo y accesibilidad.")

# =====================================================================
# SLIDE 3 — EL PROBLEMA: CAMPO Y OFFLINE (tarjetas 1x3)
# =====================================================================
s = new_slide()
header(s, "1 · El problema", "Integridad en campo: sitios remotos y operación sin red", 3)
cards = [
    ("1", "Sitios remotos, sin red estable", [
        "La mayoría de las campañas se ejecutan fuera de cobertura celular o wi-fi.",
        "Una app que depende de un servidor se vuelve inútil justo en el campo.",
    ]),
    ("2", "Integridad bajo presión", [
        "Corrosión bajo aislamiento (CUI), válvulas de alivio vencidas, inspecciones RBI olvidadas.",
        "Una lectura omitida o una unidad mal convertida es un riesgo de integridad real.",
    ]),
    ("3", "Operación offline-first", [
        "Service worker iw-vN que precacha la app; funciona sin conexión tras la primera carga.",
        "PWA instalable y EXE portable vía Electron; sincronización opcional al recuperar la red.",
    ]),
]
cw, ch, gx = 3.95, 4.62, 0.23
for i, (n, title, bullets) in enumerate(cards):
    cx = ML + i * (cw + gx)
    rect(s, cx, 1.52, cw, ch, fill=SURFACE, line=BORDER, line_w=0.75)
    rect(s, cx, 1.52, cw, 0.09, fill=PRIMARY)
    chip(s, cx + 0.25, 1.85, 0.42, n, fill=PRIMARY, size=14)
    tb(s, cx + 0.82, 1.78, cw - 1.1, 0.6, [{"runs": [{"t": title, "size": 15, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
    tb(s, cx + 0.82, 2.42, cw - 1.1, ch - 1.0, [
        {"runs": [{"t": "• " + b, "size": 12, "c": TEXT, "font": FONT_BODY}], "space_after": 7, "line_spacing": 1.12} for b in bullets
    ])
notes(s, "Tres problemas del campo: falta de conectividad, riesgo de integridad por lecturas o unidades erróneas, y necesidad de funcionamiento sin red con service worker iw-vN, PWA y EXE portable.")

# =====================================================================
# SLIDE 4 — EL PROBLEMA: NORMATIVA, RIESGOS Y COSTOS (2 columnas + callout)
# =====================================================================
s = new_slide()
header(s, "1 · El problema", "Normativa dispersa, riesgos de integridad y costos del incidente", 4)
rect(s, ML, 1.52, 5.85, 4.35, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, ML + 0.3, 1.75, 5.3, 0.5, [{"runs": [{"t": "Riesgos de integridad sin control", "size": 15, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
for i, b in enumerate([
    "Falla de contención y fuga de producto o H₂S.",
    "Sobrepresión sin válvula de alivio dimensionada correctamente.",
    "Corrosión bajo aislamiento (CUI) no detectada a tiempo.",
    "Inspecciones RBI vencidas y activos críticos sin seguimiento.",
]):
    tb(s, ML + 0.3, 2.35 + i * 0.62, 5.3, 0.55, [{"runs": [{"t": "• " + b, "size": 11.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.05}])
rect(s, 6.75, 1.52, 5.85, 4.35, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, 7.05, 1.75, 5.3, 0.5, [{"runs": [{"t": "Costos del incidente", "size": 15, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
costs = [("Parada no planificada", "pérdida de producción por hora"), ("Multa regulatoria", "incumplimiento de normas aplicables"),
         ("Pérdida de producto", "fuga o contención fuera de especificaciones"), ("Reputación", "impacto en el permiso social para operar")]
for i, (k, v) in enumerate(costs):
    cx = 7.05 + (i % 2) * 2.65
    cy = 2.35 + (i // 2) * 1.05
    rect(s, cx, cy, 2.55, 0.92, fill=SURFACE2, line=BORDER, line_w=0.75)
    tb(s, cx + 0.16, cy + 0.08, 2.25, 0.3, [{"runs": [{"t": k, "size": 11, "bold": True, "c": PRIMARY, "font": FONT_TITLE}]}])
    tb(s, cx + 0.16, cy + 0.42, 2.25, 0.45, [{"runs": [{"t": v, "size": 9.5, "c": MUTED, "font": FONT_BODY}], "line_spacing": 1.0}])
rect(s, ML, 6.08, 11.93, 0.92, fill=AMBER_LIGHT, line=AMBER, line_w=1.0)
tb(s, ML + 0.3, 6.22, 11.35, 0.65, [{"runs": [{"t": "IntegrityWatch Field cierra la brecha: ", "size": 12, "bold": True, "c": AMBER, "font": FONT_BODY},
    {"t": "datos de campo, reglas de integridad e informes de ingeniería en el dispositivo, funcionan sin red y sin servidor.", "size": 12, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.1}])
notes(s, "Riesgos (fuga, sobrepresión, CUI, RBI vencido) frente a costos del incidente. Llamado de acción: la app opera en el dispositivo sin red ni servidor.")

# =====================================================================
# SLIDE 5 — QUÉ HACE LA APP: 11 MÓDULOS (diagrama de cajas con shapes)
# =====================================================================
s = new_slide()
header(s, "2 · Qué hace la app", "11 módulos — diagrama de cajas sobre el núcleo de la aplicación", 5)
left_modules = [
    ("1", "Panel (Dashboard)", "KPIs, mapa de calor, feed de alertas"),
    ("2", "Corrosión", "Cupones, ER/LPR/H₂, modelo DWM, inhibidor"),
    ("3", "Válvulas de alivio (PSV)", "API 520 gas/líquido, API 526"),
    ("4", "Tuberías y activos de línea", "Sistemas, inspecciones, mapa"),
    ("5", "APM y fiabilidad", "POF × COF, MTBF/MTTR, OEE"),
    ("6", "Ingesta de datos", "CSV / WITSML, validación, mapeo"),
]
right_modules = [
    ("7", "Reglas y recomendaciones", "R1–R14, ciclo abierto / reconocido / resuelto"),
    ("8", "Informes de ingeniería", "Trimestral, expediente, hoja de datos (A4)"),
    ("9", "Glosario de términos y normas", "33 normas, 7 idiomas"),
    ("10", "Administración y seguridad", "Bloqueo PIN, roles, exportación JSON"),
    ("11", "Internacionalización", "7 idiomas, árabe RTL, claro/oscuro"),
]
bx, bw, bh, gap = 0.7, 4.55, 0.62, 0.17
for i, (n, t, d) in enumerate(left_modules):
    cy = 1.52 + i * (bh + gap)
    rect(s, bx, cy, bw, bh, fill=SURFACE2, line=BORDER, line_w=0.75)
    chip(s, bx + 0.16, cy + (bh - 0.36) / 2, 0.36, n, fill=PRIMARY, size=12)
    tb(s, bx + 0.66, cy + 0.06, bw - 0.8, bh - 0.12, [{"runs": [{"t": t, "size": 11.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
    tb(s, bx + 0.66, cy + 0.38, bw - 0.8, bh - 0.12, [{"runs": [{"t": d, "size": 9, "c": MUTED, "font": FONT_BODY}]}])
    arrow_right(s, bx + bw + 0.02, cy + bh / 2, w=0.26, h=0.34)
rx, rbw = 8.35, 4.23
for j, (n, t, d) in enumerate(right_modules):
    cy = 1.52 + j * (bh + gap)
    rect(s, rx, cy, rbw, bh, fill=SURFACE2, line=BORDER, line_w=0.75)
    chip(s, rx + 0.16, cy + (bh - 0.36) / 2, 0.36, n, fill=PRIMARY, size=12)
    tb(s, rx + 0.66, cy + 0.06, rbw - 0.8, bh - 0.12, [{"runs": [{"t": t, "size": 11.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
    tb(s, rx + 0.66, cy + 0.38, rbw - 0.8, bh - 0.12, [{"runs": [{"t": d, "size": 9, "c": MUTED, "font": FONT_BODY}]}])
    arrow_right(s, rx - 0.32, cy + bh / 2, w=0.26, h=0.34)
hx, hy, hw, hh = 5.45, 1.52, 2.45, 4.30
rect(s, hx, hy, hw, hh, fill=PRIMARY)
tb(s, hx + 0.2, hy + 0.18, hw - 0.4, 0.5, [{"runs": [{"t": "NÚCLEO", "size": 15, "bold": True, "c": ICE_TEXT, "font": FONT_TITLE}]}])
tb(s, hx + 0.2, hy + 0.72, hw - 0.4, 0.4, [{"runs": [{"t": "JS vanilla", "size": 11.5, "bold": True, "c": ICE_TEXT, "font": FONT_BODY}]}])
tb(s, hx + 0.2, hy + 1.04, hw - 0.4, 0.4, [{"runs": [{"t": "IndexedDB", "size": 11.5, "bold": True, "c": ICE_TEXT, "font": FONT_BODY}]}])
tb(s, hx + 0.2, hy + 1.36, hw - 0.4, 0.4, [{"runs": [{"t": "SW iw-vN", "size": 11.5, "bold": True, "c": ICE_TEXT, "font": FONT_BODY}]}])
tb(s, hx + 0.2, hy + 1.85, hw - 0.4, 2.2, [{"runs": [{"t": "Todos los módulos leen y escriben sobre el mismo núcleo: cálculo de ingeniería, reglas R1–R14, almacén IndexedDB y sincronización opcional de la cola de mutación.", "size": 10.5, "c": ICE_TEXT, "font": FONT_BODY}], "line_spacing": 1.15}])
notes(s, "Diagrama de cajas: 11 módulos repartidos a izquierda y derecha del núcleo (JS vanilla, IndexedDB, service worker iw-vN). Las flechas de shapes indican que cada módulo depende del núcleo.")

# =====================================================================
# SLIDE 6 — ARQUITECTURA (2 columnas + tira inferior)
# =====================================================================
s = new_slide()
header(s, "3 · Arquitectura", "JS vanilla, dual-mode, IndexedDB, service worker iw-vN, PWA, Electron, CSP, accesibilidad", 6)
rect(s, ML, 1.52, 6.05, 4.35, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, ML + 0.3, 1.72, 5.5, 0.4, [{"runs": [{"t": "Capas de la aplicación", "size": 14.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
layers = [
    "UI shell y vistas: router hash, sidebar vertical única columna",
    "Motores: corrosión (ASTM G4 / DWM / MR0175 / SP0169), PSV (API 520/526), APM, unidades",
    "Motor de reglas R1–R14 + reconciliación de recomendaciones (huella fingerprint)",
    "Ingesta CSV / WITSML y exportación/importación JSON",
    "Almacenamiento IndexedDB con adaptador dbMemory (mismo contrato en Node y navegador)",
    "Sincronización opcional: cola de mutación con reintentos y backoff (1 s / 5 s / 30 s)",
]
for i, b in enumerate(layers):
    tb(s, ML + 0.3, 2.22 + i * 0.62, 5.5, 0.56, [{"runs": [{"t": "• " + b, "size": 11, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.05}])
rect(s, 7.0, 1.52, 5.6, 4.35, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, 7.3, 1.72, 5.1, 0.4, [{"runs": [{"t": "Despliegue y modos de ejecución", "size": 14.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
modes = [
    ("file://", "Doble clic en index.html; lógica completa en el navegador, sin service worker ni PWA."),
    ("http(s)", "Servidor local en localhost:8419 (START-HERE.bat / serve.ps1 / serve.py); PWA instalable y SW iw-vN activo."),
    ("Electron", "EXE portable con electron-builder; servidor HTTP interno en 127.0.0.1, puerto efímero; sin red tras la instalación."),
]
for i, (k, v) in enumerate(modes):
    cy = 2.22 + i * 1.22
    rect(s, 7.3, cy, 5.0, 1.0, fill=SURFACE2, line=BORDER, line_w=0.75)
    tb(s, 7.46, cy + 0.10, 1.35, 0.3, [{"runs": [{"t": k, "size": 11.5, "bold": True, "c": PRIMARY, "font": FONT_TITLE}]}])
    tb(s, 8.85, cy + 0.10, 3.35, 0.82, [{"runs": [{"t": v, "size": 9.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.05}])
rect(s, ML, 6.08, 11.93, 0.92, fill=ICE, line=BORDER, line_w=0.75)
tb(s, ML + 0.3, 6.20, 3.7, 0.7, [{"runs": [{"t": "CSP estricta", "size": 10.5, "bold": True, "c": PRIMARY, "font": FONT_BODY}], "space_after": 2},
    {"runs": [{"t": "script-src 'self', sin inline, sin eval", "size": 9.5, "c": TEXT, "font": FONT_BODY}]}])
tb(s, 4.6, 6.20, 4.0, 0.7, [{"runs": [{"t": "Accesibilidad", "size": 10.5, "bold": True, "c": PRIMARY, "font": FONT_BODY}], "space_after": 2},
    {"runs": [{"t": "Foco visible, ARIA, objetivos ≥ 44 px, árabe RTL", "size": 9.5, "c": TEXT, "font": FONT_BODY}]}])
tb(s, 8.9, 6.20, 3.6, 0.7, [{"runs": [{"t": "Dual-mode", "size": 10.5, "bold": True, "c": PRIMARY, "font": FONT_BODY}], "space_after": 2},
    {"runs": [{"t": "Mismo código en navegador, PWA y Electron", "size": 9.5, "c": TEXT, "font": FONT_BODY}]}])
notes(s, "Arquitectura cliente única: capas de la app, tres modos de ejecución (file://, http(s) localhost:8419, EXE portable Electron), CSP estricta y requisitos de accesibilidad.")

# =====================================================================
# SLIDE 7 — FLUJO DE DATOS E INGESTA (shapes + flechas horizontales)
# =====================================================================
s = new_slide()
header(s, "4 · Datos y flujo de ingesta", "CSV → validación → motores → reglas → informes", 7)
flow = [
    ("1 · CSV / WITSML", "Archivo de campo (kit de 41 filas); delimitadores coma, punto y coma y tab; comillas dobles."),
    ("2 · Validación", "Delimitador, alias de 12 columnas, rangos, fechas futuras, duplicados y wf ≤ wi."),
    ("3 · Motores", "Corrosión (G4, DWM, MR0175, SP0169), PSV (API 520/526), APM (ISO 14224)."),
    ("4 · Reglas R1–R14", "Evaluación pura sobre el estado; huella fingerprint; reconciliar abierto / reconocido / resuelto."),
    ("5 · Informes", "Trimestral, expediente y hoja de datos en A4 con window.print()."),
]
bx, bw, bh, gap = 0.7, 2.28, 1.95, 0.22
fy = 1.62
for i, (t, d) in enumerate(flow):
    cx = ML + i * (bw + gap)
    rect(s, cx, fy, bw, bh, fill=SURFACE2, line=BORDER, line_w=0.75)
    rect(s, cx, fy, bw, 0.09, fill=PRIMARY)
    tb(s, cx + 0.14, fy + 0.20, bw - 0.28, 0.35, [{"runs": [{"t": t, "size": 11.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
    tb(s, cx + 0.14, fy + 0.62, bw - 0.28, bh - 0.75, [{"runs": [{"t": d, "size": 9, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.08}])
    if i < 4:
        arrow_right(s, cx + bw + 0.02, fy + bh / 2, w=0.2, h=0.3)
rect(s, ML, 4.02, 11.93, 1.25, fill=ICE, line=BORDER, line_w=0.75)
tb(s, ML + 0.3, 4.16, 11.35, 1.0, [{"runs": [{"t": "Offline-first: ", "size": 11.5, "bold": True, "c": PRIMARY, "font": FONT_BODY},
    {"t": "todo queda en IndexedDB del dispositivo. La cola de mutación se envía al recuperar la conexión (endpoint opcional). Sin servidor, sin base de datos remota.", "size": 11.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.12}])
notes(s, "Flujo de ingesta dibujado con cajas y flechas de shapes: CSV/WITSML, validación, motores de cálculo, reglas R1–R14 e informes A4. Todo funciona sin servidor.")

# =====================================================================
# SLIDE 8 — MOTOR DE CORROSIÓN (fórmulas + ejemplo anclado)
# =====================================================================
s = new_slide()
header(s, "5 · Motores de cálculo", "Motor de corrosión — ASTM G4, SP0775, DWM, MR0175, SP0169", 8)
rect(s, ML, 1.52, 6.2, 5.35, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, ML + 0.3, 1.72, 5.7, 0.4, [{"runs": [{"t": "Fórmulas implementadas", "size": 14.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
formulas = [
    ("ASTM G4", "CR = 534 · ΔW / (ρ · A · t)  →  mpy (mm/año = mpy × 0,0254)"),
    ("NACE SP0775", "Bandas: <1 / 1–<5 / 5–<10 / ≥10 mpy (bajo → severo)"),
    ("Inhibidor", "EI = (CRb − CRi) / CRb · 100  →  pobre / aceptable / buena / excelente"),
    ("De Waard & Milliams", "log₁₀(mm/año) = 5,8 − 1710/T + 0,67 · log₁₀(pCO₂)"),
    ("MR0175 screening", "pH₂S = P · x  →  <0,3 / 0,3–100 / >100 kPa"),
    ("NACE SP0169 CP", "−850 mV vs CSE o ≥100 mV de polarización catódica"),
]
for i, (k, v) in enumerate(formulas):
    tb(s, ML + 0.3, 2.22 + i * 0.78, 5.7, 0.72, [{"runs": [{"t": k + ":  ", "size": 10.5, "bold": True, "c": PRIMARY, "font": FONT_TITLE}, {"t": v, "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.03}])
rect(s, 7.15, 1.52, 5.45, 5.35, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, 7.45, 1.72, 4.9, 0.4, [{"runs": [{"t": "Ejemplo anclado (docs/TESTS.md)", "size": 13.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
rect(s, 7.45, 2.22, 4.85, 1.05, fill=ICE, line=BORDER, line_w=0.75)
tb(s, 7.62, 2.36, 4.55, 0.4, [{"runs": [{"t": "10,366 mpy", "size": 20, "bold": True, "c": PRIMARY, "font": FONT_TITLE}]}])
tb(s, 7.62, 2.82, 4.55, 0.42, [{"runs": [{"t": "ΔW 220 mg · ρ 7,87 g/cm³ · A 2 in² · t 720 h → 0,263 mm/año → SP0775: severo", "size": 9.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.05}])
rect(s, 7.45, 3.45, 4.85, 1.05, fill=ICE, line=BORDER, line_w=0.75)
tb(s, 7.62, 3.59, 4.55, 0.4, [{"runs": [{"t": "75 % de EI", "size": 20, "bold": True, "c": AMBER, "font": FONT_TITLE}]}])
tb(s, 7.62, 4.05, 4.55, 0.42, [{"runs": [{"t": "Inhibidor: blank 8,0 → inhibido 2,0 mpy → aceptable (70–85 %)", "size": 9.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.05}])
rect(s, 7.45, 4.68, 4.85, 1.05, fill=ICE, line=BORDER, line_w=0.75)
tb(s, 7.62, 4.82, 4.55, 0.4, [{"runs": [{"t": "183,0 mpy", "size": 20, "bold": True, "c": PRIMARY, "font": FONT_TITLE}]}])
tb(s, 7.62, 5.28, 4.55, 0.42, [{"runs": [{"t": "DWM: 60 °C, pCO₂ 1 bar → 4,647 mm/año (modelo de screening)", "size": 9.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.05}])
notes(s, "Motor de corrosión: seis fórmulas con sus normas y tres ejemplos numéricos anclados en docs/TESTS.md (10,366 mpy, EI 75 %, DWM 183,0 mpy).")

# =====================================================================
# SLIDE 9 — MOTOR DE VÁLVULAS (API 520 / 526)
# =====================================================================
s = new_slide()
header(s, "6 · Motores de cálculo", "Motor de válvulas de alivio — API 520 (gas/líquido) y API 526", 9)
rect(s, ML, 1.52, 5.15, 5.35, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, ML + 0.25, 1.72, 4.7, 0.4, [{"runs": [{"t": "API 520 Parte I — gas/vapor", "size": 13.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
for i, v in enumerate([
    "Crítico:  A = W · √(T·Z/M) / (C · Kd · P1 · Kb · Kc)",
    "C = 520 · √( k · (2/(k+1))^((k+1)/(k−1)) )",
    "Subcrítico (P2/P1 > ratio crítico): factor F2 con r = P2/P1",
]):
    tb(s, ML + 0.25, 2.22 + i * 0.72, 4.7, 0.65, [{"runs": [{"t": v, "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.05}])
rect(s, 5.9, 1.52, 6.75, 2.55, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, 6.2, 1.72, 6.2, 0.4, [{"runs": [{"t": "API 520 — líquido y factor Kv analítico", "size": 13.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
for i, v in enumerate([
    "A = Q · √(G/ΔP) / (38 · Kd · Kw · Kc · Kv)",
    "Kv = min(1, 1 / (0,9935 + 2,878/√Re + 342,75/Re^1,5))",
    "Re calculado en el orificio seleccionado; validez Re ≥ 100 (aviso E_RE_RANGE)",
]):
    tb(s, 6.2, 2.22 + i * 0.7, 6.2, 0.65, [{"runs": [{"t": v, "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.05}])
rect(s, 5.9, 4.28, 6.75, 2.59, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, 6.2, 4.48, 6.2, 0.4, [{"runs": [{"t": "API 526 — orificios D–T y ejemplo", "size": 13.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
tb(s, 6.2, 4.95, 6.2, 1.8, [{"runs": [{"t": "Áreas 0,110 (D) a 26,00 in² (T). Se selecciona el menor orificio cuya área ≥ requerida; por encima de T → E_OVER T. Ejemplo: agua 300 gpm → orificio J (1,287 in²), Kv = 1, margen 20,5 %.", "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.15}])
notes(s, "Dimensionamiento de válvulas de alivio: gas crítico y subcrítico con C y F2, líquido con Kv analítico (API 520 §5.8.2) y selección de orificio API 526 D–T con ejemplo de margen 20,5 %.")

# =====================================================================
# SLIDE 10 — APM Y RBI (POF×COF, MTBF/MTTR, intervalos)
# =====================================================================
s = new_slide()
header(s, "7 · APM y RBI", "Gestión de activos: riesgo RBI y fiabilidad ISO 14224", 10)
rect(s, ML, 1.52, 5.85, 3.9, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, ML + 0.3, 1.72, 5.3, 0.4, [{"runs": [{"t": "Riesgo = POF × COF (escala 1–5)", "size": 14, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
bands = [("Bajo", "≤ 4", "intervalo base", SEV_WARN if False else "1e7a34"), ("Medio", "5–9", "0,75 × base", AMBER), ("Alto", "10–15", "0,5 × base", SEV_CRIT), ("Muy alto", "≥ 16", "0,25 × base", SEV_CRIT)]
for i, (k, v, d, c) in enumerate(bands):
    cy = 2.22 + i * 0.8
    rect(s, ML + 0.3, cy, 1.5, 0.62, fill=c, line=c)
    tb(s, ML + 0.42, cy + 0.06, 1.3, 0.5, [{"runs": [{"t": k, "size": 10, "bold": True, "c": ICE_TEXT, "font": FONT_TITLE}], "align": PP_ALIGN.CENTER}])
    tb(s, ML + 1.95, cy + 0.06, 3.0, 0.5, [{"runs": [{"t": "score " + v + "   →   " + d, "size": 10, "c": TEXT, "font": FONT_BODY}]}])
rect(s, 7.0, 1.52, 5.65, 3.9, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, 7.3, 1.72, 5.1, 0.4, [{"runs": [{"t": "Fiabilidad y disponibilidad (ISO 14224)", "size": 13.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
for i, v in enumerate([
    "Disponibilidad % = (ventana − tiempo no disponible) / ventana · 100",
    "MTBF = (ventana − tiempo no disponible) / nº fallos",
    "MTTR = tiempo no disponible / nº fallos",
    "OEE = disponibilidad × rendimiento × calidad",
]):
    tb(s, 7.3, 2.22 + i * 0.72, 5.1, 0.65, [{"runs": [{"t": v, "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.05}])
stats10 = [("95,0 %", "disponibilidad"), ("700 h", "MTBF"), ("20 h", "MTTR"), ("83,79 %", "OEE")]
for i, (num, lab) in enumerate(stats10):
    cx = ML + i * 3.08
    rect(s, cx, 5.62, 2.9, 1.3, fill=ICE, line=BORDER, line_w=0.75)
    tb(s, cx + 0.2, 5.72, 2.5, 0.5, [{"runs": [{"t": num, "size": 22, "bold": True, "c": PRIMARY, "font": FONT_TITLE}]}])
    tb(s, cx + 0.2, 6.28, 2.5, 0.6, [{"runs": [{"t": lab, "size": 10, "c": TEXT, "font": FONT_BODY}]}])
notes(s, "RBI: riesgo = POF × COF con bandas ≤4 / 5–9 / 10–15 / ≥16 e intervalos base × 1 / 0,75 / 0,5 / 0,25. Fiabilidad ISO 14224 con ejemplo anclado: 95,0 % disponibilidad, MTBF 700 h, MTTR 20 h, OEE 83,79 %.")

# =====================================================================
# SLIDE 11 — REGLAS R1–R14 (tabla)
# =====================================================================
s = new_slide()
header(s, "8 · Reglas de integridad", "Reglas R1–R14: condición y severidad", 11)
rows_data = [
    ("R1", "Tasa crítica de corrosión", "crMpy ≥ 10 mpy en las últimas 24 h", "critical"),
    ("R2", "Aceleración de tendencia", "avg7d ≥ 2 × avg30d (≥ 5 lecturas)", "warning"),
    ("R3", "Eficiencia de inhibidor baja", "Par de cupones con EI < 70 %", "warning"),
    ("R4", "Residual de inhibidor", "Fuera de banda 80–150 % del objetivo", "warning/info"),
    ("R5", "Anomalía de sensor", "|z| > 3 o ≥ 10 lecturas idénticas (ER/LPR/H₂)", "warning"),
    ("R6", "Cupón vencido", "endDate + 90 d superado (> 180 d: crítico)", "warning/critical"),
    ("R7", "Desviación modelo DWM", "Ratio medida/modelo > 2 (crítico) o < 0,3 (info)", "critical/info"),
    ("R8", "Servicio ácido (H₂S)", "pH₂S alto → crítico; moderado → advertencia", "critical/warning"),
    ("R9", "Inspección RBI vencida", "Próxima inspección superada (> 90 d: crítico)", "warning/critical"),
    ("R10", "Degradación MTBF", "MTBF últimos 90 d < 50 % del periodo previo", "warning"),
    ("R11", "Disponibilidad baja", "Disponibilidad < 90 % (u override)", "warning"),
    ("R12", "Repetición de fallos", "≥ 3 eventos de fallo en 90 d", "warning"),
    ("R13", "Prueba de PSV vencida", "nextTestDate superada (> 30 d: crítico)", "warning/critical"),
    ("R14", "Margen de capacidad negativo", "Margen PSV < 0 (capacidad instalada insuficiente)", "critical"),
]
col_w = [0.75, 2.85, 6.58, 1.75]
tbl_x, tbl_y = ML, 1.52
gt = s.shapes.add_table(15, 4, Inches(tbl_x), Inches(tbl_y), Inches(sum(col_w)), Inches(4.9)).table
gt.first_row = False
gt.horz_banding = False
for i, w in enumerate(col_w):
    gt.columns[i].width = Inches(w)
gt.rows[0].height = Inches(0.42)
for r in range(1, 15):
    gt.rows[r].height = Inches(0.32)
heads = ["ID", "Nombre", "Condición (evaluación pura)", "Severidad"]
for c, htxt in enumerate(heads):
    cell = gt.cell(0, c)
    cell.fill.solid(); cell.fill.fore_color.rgb = RGBColor.from_string(DARK)
    tf = cell.text_frame; tf.word_wrap = True
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.LEFT
    r = p.add_run(); r.text = htxt
    r.font.size = Pt(11); r.font.bold = True; r.font.name = FONT_TITLE; r.font.color.rgb = RGBColor.from_string(ICE_TEXT)
    cell.margin_left = Inches(0.08); cell.margin_right = Inches(0.06); cell.margin_top = Inches(0.02); cell.margin_bottom = Inches(0.02)
sev_fill = {"critical": SEV_CRIT, "warning": SEV_WARN, "warning/info": AMBER, "critical/info": SEV_CRIT, "critical/warning": SEV_CRIT, "warning/critical": SEV_WARN}
for r, (rid, name, cond, sev) in enumerate(rows_data, start=1):
    vals = [rid, name, cond, sev]
    for c, v in enumerate(vals):
        cell = gt.cell(r, c)
        cell.fill.solid()
        cell.fill.fore_color.rgb = RGBColor.from_string(ICE if r % 2 else SURFACE)
        tf = cell.text_frame; tf.word_wrap = True
        p = tf.paragraphs[0]; p.alignment = PP_ALIGN.LEFT
        run = p.add_run(); run.text = v
        run.font.size = Pt(10); run.font.name = FONT_BODY; run.font.color.rgb = RGBColor.from_string(TEXT)
        if c == 0:
            run.font.bold = True; run.font.color.rgb = RGBColor.from_string(PRIMARY); run.font.name = FONT_TITLE
        if c == 3:
            run.font.size = Pt(9); run.font.bold = True
            run.font.color.rgb = RGBColor.from_string(ICE_TEXT)
            cell.fill.solid(); cell.fill.fore_color.rgb = RGBColor.from_string(sev_fill.get(sev, BORDER))
        cell.margin_left = Inches(0.08); cell.margin_right = Inches(0.06); cell.margin_top = Inches(0.01); cell.margin_bottom = Inches(0.01)
tb(s, ML, 6.62, 11.93, 0.5, [{"runs": [{"t": "Deduplicación por fingerprint (R#:tienda:entidad); ciclo abierto → reconocido → resuelto; reapertura automática si la condición reaparece.", "size": 10, "c": MUTED, "font": FONT_BODY}]}])
notes(s, "Tabla de las 14 reglas R1–R14 con nombre, condición exacta y severidad. Las severidades críticas aparecen en rojo, advertencias en ámbar; la huella de fingerprint evita duplicados.")

# =====================================================================
# SLIDE 12 — ESTÁNDARES POR REGIÓN (3 tarjetas)
# =====================================================================
s = new_slide()
header(s, "9 · Estándares", "Normas aplicadas por región: EE. UU., Reino Unido, Brasil", 12)
regions = [
    ("EE. UU. / internacional", [
        "API 520, API 526, API 580 / 581", "ASME B31.4, ASME B31.8",
        "ASTM G4 / G1 / G15", "NACE SP0775, MR0175 / ISO 15156, SP0169",
        "NFPA 20 / 25 / 11", "ISO 55000, ISO 14224",
        "ISA-101, API RP 1165",
    ]),
    ("Reino Unido", [
        "BS 5306", "BS EN 12845", "EEMUA 191", "ISO 13709",
        "API STD 610 / 682 / 674 / 616",
    ]),
    ("Brasil", [
        "NR-23, NR-26", "ABNT NBR 13714", "ABNT NBR 17240",
        "ISO 8528", "IEEE 446",
    ]),
]
cw, ch, gx = 3.95, 4.3, 0.23
for i, (region, normas) in enumerate(regions):
    cx = ML + i * (cw + gx)
    rect(s, cx, 1.52, cw, ch, fill=SURFACE, line=BORDER, line_w=0.75)
    rect(s, cx, 1.52, cw, 0.09, fill=PRIMARY)
    tb(s, cx + 0.25, 1.78, cw - 0.5, 0.4, [{"runs": [{"t": region, "size": 13.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
    tb(s, cx + 0.25, 2.28, cw - 0.5, ch - 0.9, [
        {"runs": [{"t": "• " + n, "size": 10, "c": TEXT, "font": FONT_BODY}], "space_after": 5, "line_spacing": 1.05} for n in normas
    ])
tb(s, ML, 6.02, 11.93, 0.9, [{"runs": [{"t": "Catálogo de la app: 33 normas. ", "size": 10.5, "bold": True, "c": PRIMARY, "font": FONT_BODY},
    {"t": "Las ediciones deben verificarse contra la vigente antes de usarse en diseño u operación; los datos del fabricante del equipo prevalecen sobre los valores por defecto de la aplicación.", "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.15}])
notes(s, "Normas por región: EE. UU./internacional (API 520/526/580/581, ASME B31, ASTM, NACE/AMPP, NFPA, ISO, ISA-101), Reino Unido (BS, EEMUA 191) y Brasil (NR-23/26, NBR). Todas requieren verificación de edición vigente.")

# =====================================================================
# SLIDE 13 — DISEÑO VISUAL (imágenes p0-locale-es + v2-01-dashboard)
# =====================================================================
s = new_slide()
header(s, "10 · Diseño visual", "ISA-101, EEMUA 191, NR-26 — emblema, tokens, claro/oscuro, 7 idiomas", 13)
rect(s, ML, 1.52, 6.0, 4.9, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, ML + 0.3, 1.72, 5.5, 0.4, [{"runs": [{"t": "Referentes de diseño aplicados", "size": 14, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
for i, v in enumerate([
    "ISA-101: HMI de alto rendimiento, sin decoración, color solo para lo anormal",
    "EEMUA 191: jerarquía y priorización de alarmas (rojo → ámbar)",
    "NR-26: colores de seguridad; rojo = protección contra incendios",
    "Forma redundante por severidad: círculo / cuadrado / triángulo / X",
]):
    tb(s, ML + 0.3, 2.22 + i * 0.78, 5.5, 0.72, [{"runs": [{"t": "• " + v, "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.05}])
rect(s, 7.0, 1.52, 2.35, 4.9, fill=ICE, line=BORDER, line_w=0.75)
tb(s, 7.25, 1.72, 1.9, 0.35, [{"runs": [{"t": "Tokens", "size": 12, "bold": True, "c": PRIMARY, "font": FONT_TITLE}]}])
toks = [("Primario #0B5CAD", PRIMARY), ("Oscuro #11161C", DARK), ("Hielo #E9EDF1", ICE), ("Ámbar #B45309", AMBER), ("Texto #1A2430", TEXT)]
for i, (lab, c) in enumerate(toks):
    cy = 2.15 + i * 0.78
    rect(s, 7.25, cy, 0.32, 0.32, fill=c)
    tb(s, 7.66, cy - 0.03, 1.6, 0.3, [{"runs": [{"t": lab, "size": 9, "c": TEXT, "font": FONT_BODY}]}])
rect(s, 9.7, 1.52, 2.98, 4.9, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, 9.95, 1.72, 2.5, 0.4, [{"runs": [{"t": "7 idiomas", "size": 13, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
tb(s, 9.95, 2.22, 2.5, 1.6, [{"runs": [{"t": "es · en · pt · fr · ru · zh · ar (RTL)", "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.3}])
tb(s, 9.95, 3.95, 2.5, 1.2, [{"runs": [{"t": "Claro / oscuro con tokens CSS y localStorage", "size": 10, "c": TEXT, "font": FONT_BODY}], "space_after": 6, "line_spacing": 1.1},
    {"runs": [{"t": "Emblema “Escudo de Integridad”: hexágono, manómetro de 270 ° y ducto con bridas", "size": 10, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.1}])
img_boxes = [(ML, 5.42, 5.9, 1.62), (ML + 6.13, 5.42, 5.9, 1.62)]
captions = ["p0-locale-es.png — interfaz en español", "v2-01-dashboard.png — panel, modo claro"]
for (ix, iy, iw, ih), cap, f in zip(img_boxes, captions, ["p0-locale-es.png", "v2-01-dashboard.png"]):
    rect(s, ix, iy, iw, ih, fill="FFFFFF", line=BORDER, line_w=0.75)
    pic_fit(s, os.path.join(EVIDENCE, f), ix, iy, iw, ih)
    tb(s, ix, iy + ih + 0.06, iw, 0.3, [{"runs": [{"t": cap, "size": 9, "c": MUTED, "font": FONT_BODY}]}])
notes(s, "Diseño visual: ISA-101, EEMUA 191, NR-26; tokens de paleta Midnight Executive; 7 idiomas con árabe RTL; claro/oscuro; emblema Escudo de Integridad. Capturas reales incrustadas.")

# =====================================================================
# SLIDE 14 — CAPTURAS DE PRODUCTO (4 imágenes 2x2 a sangre con pie)
# =====================================================================
s = new_slide()
header(s, "11 · Capturas de producto", "Interfaz de usuario — capturas reales de docs/evidence/", 14)
caps = [
    ("og-trend-chart.png", "Gráfica de tendencia de tasas de corrosión"),
    ("og-gauge-dashboard.png", "Panel de indicadores (gauges) de activos"),
    ("og-apm-equipment.png", "Equipos APM y matriz de riesgo RBI"),
    ("v2-04-map-light.png", "Mapa de ductos y activos de línea, modo claro"),
]
positions = [(ML, 1.52), (ML + 6.22, 1.52), (ML, 4.62), (ML + 6.22, 4.62)]
bw, bh = 5.95, 2.80
positions = [(ML, 1.52), (ML + 6.22, 1.52), (ML, 4.42), (ML + 6.22, 4.42)]
for (x, y), (fname, cap) in zip(positions, caps):
    rect(s, x, y, bw, bh, fill="FFFFFF", line=BORDER, line_w=0.75)
    pic_fit(s, os.path.join(EVIDENCE, fname), x, y, bw, bh - 0.42)
    tb(s, x + 0.15, y + bh - 0.34, bw - 0.3, 0.3, [{"runs": [{"t": cap, "size": 9.5, "c": TEXT, "font": FONT_BODY}]}])
notes(s, "Cuatro capturas del producto a escala proporcional dentro de marcos: tendencia de corrosión, panel de gauges, equipos APM/RBI y mapa de ductos en modo claro.")

# =====================================================================
# SLIDE 15 — CALIDAD Y PRUEBAS (stats 2x3 + nota)
# =====================================================================
s = new_slide()
header(s, "12 · Calidad y pruebas", "281 tests, e2e 12 + 10, axe 0, volumen 10 k, cobertura ≥ 80 %", 15)
stats15 = [
    ("281 / 281", "Tests automatizados, toda la suite verde (node --test)"),
    ("≥ 80 %", "Cobertura de líneas en src/calc y src/rules (gate de calidad)"),
    ("e2e 12 + 10", "Pasos críticos guiados y automatizados, todos PASS (P0)"),
    ("axe: 0", "Accesibilidad: 0 críticos / graves / moderados / menores"),
    ("10 000", "Filas en pruebas de volumen: parser 58 ms, import UI 568 ms, dashboard 104 ms"),
    ("file:// + PWA", "Modo archivo y PWA offline verificados (e2e-core 10/10)"),
]
cw, ch, gx, gy = 3.95, 1.28, 0.23, 0.2
for i, (num, label) in enumerate(stats15):
    cx = ML + (i % 2) * (cw + gx)
    cy = 1.52 + (i // 2) * (ch + gy)
    rect(s, cx, cy, cw, ch, fill=ICE, line=BORDER, line_w=0.75)
    chip(s, cx + 0.22, cy + (ch - 0.45) / 2, 0.45, i + 1, fill=PRIMARY, size=14)
    tb(s, cx + 0.82, cy + 0.09, cw - 1.1, 0.4, [{"runs": [{"t": num, "size": 19, "bold": True, "c": PRIMARY, "font": FONT_TITLE}]}])
    tb(s, cx + 0.82, cy + 0.56, cw - 1.1, ch - 0.66, [{"runs": [{"t": label, "size": 10, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.05}])
rect(s, ML, 6.02, 11.93, 0.95, fill=SURFACE2, line=BORDER, line_w=0.75)
tb(s, ML + 0.3, 6.14, 11.35, 0.75, [{"runs": [{"t": "Estado: ", "size": 10.5, "bold": True, "c": PRIMARY, "font": FONT_BODY},
    {"t": "0 bugs de aplicación abiertos tras la campaña P0. UAT pendiente: 6 guiones de campo (docs/GUIA-DE-USO.md). Regresión: 281 tests en cada entrega.", "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.15}])
notes(s, "Calidad: suite 281/281 verde, cobertura ≥ 80 % en motores y reglas, e2e 12 + 10 pasos PASS, axe 0, volumen 10 000 filas sin bloqueo, PWA y file:// verificados.")

# =====================================================================
# SLIDE 16 — KIT DE DATOS DE CAMPO (41 filas CSV + 6 ductos)
# =====================================================================
s = new_slide()
header(s, "13 · Kit de datos de campo", "41 filas CSV validadas + precarga de 6 sistemas de ducto", 16)
rect(s, ML, 1.52, 5.95, 4.35, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, ML + 0.3, 1.72, 5.4, 0.4, [{"runs": [{"t": "CSV de campo — 41 filas", "size": 14, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
for i, v in enumerate([
    "Resultado: 35 válidas · 4 errores · 2 duplicadas · 3 puntos nuevos",
    "Delimitadores: coma, punto y coma y tab; comillas dobles",
    "12 campos canónicos con alias (mpCode, date, crMpy, wiMg, wfMg, areaIn2, days, inhibitorResidualPpm, tempC, bswPct, category, note)",
    "Rangos: crMpy [0, 1000], tempC [−60, 200], bsw [0, 100], days > 0, área > 0, wf ≤ wi, fecha ≤ hoy + 1 d",
]):
    tb(s, ML + 0.3, 2.22 + i * 0.82, 5.4, 0.78, [{"runs": [{"t": "• " + v, "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.08}])
rect(s, 7.0, 1.52, 5.65, 4.35, fill=SURFACE, line=BORDER, line_w=0.75)
tb(s, 7.3, 1.72, 5.1, 0.4, [{"runs": [{"t": "Precarga de semilla (determinista, mulberry32(42))", "size": 13.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
for i, v in enumerate([
    "6 sistemas de ducto cargados de fábrica",
    "8 puntos de monitoreo (MP-CORR-001 … MP-CORR-008)",
    "Incluye disparadores de reglas: pico 12,4 mpy (R1), aceleración de tendencia (R2), sensor atascado (R5), cupón vencido (R6)",
    "Fuente: datos-prueba/INFORME-CARGA-DATOS.md (anclado en fuentes públicas)",
]):
    tb(s, 7.3, 2.22 + i * 0.82, 5.1, 0.78, [{"runs": [{"t": "• " + v, "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.08}])
notes(s, "Kit de datos de campo: 41 filas CSV con resultado de validación y rangos; semilla determinista con 6 ductos y 8 puntos de monitoreo que ejercitan reglas R1, R2, R5 y R6.")

# =====================================================================
# SLIDE 17 — PAQUETE PORTABLE Y DESPLIEGUE (2x2 tarjetas)
# =====================================================================
s = new_slide()
header(s, "14 · Despliegue", "Paquete portable: carpeta de escritorio, ZIP, SHA256, EXE, PWA", 17)
deploys = [
    ("Carpeta de escritorio", "index.html + assets/ + src/. Doble clic (file://) o servidor local (localhost:8419 con START-HERE.bat, serve.ps1 o serve.py)."),
    ("ZIP + SHA256", "Paquete de distribución verificable; huella criptográfica SHA256 para integridad en la entrega a campo."),
    ("EXE portable (Electron)", "electron-builder, target portable; servidor HTTP interno en 127.0.0.1 puerto efímero; service worker funcional; 71 MB sin firma."),
    ("PWA instalable", "manifest.webmanifest, SW iw-vN y apple-touch-icon; instalación en Edge, Chrome, Android e iOS; actualización por CACHE_NAME iw-vN + toast."),
]
cw, ch, gx, gy = 5.95, 2.3, 0.23, 0.22
for i, (t, d) in enumerate(deploys):
    cx = ML + (i % 2) * (cw + gx)
    cy = 1.52 + (i // 2) * (ch + gy)
    rect(s, cx, cy, cw, ch, fill=SURFACE, line=BORDER, line_w=0.75)
    rect(s, cx, cy, cw, 0.09, fill=AMBER)
    chip(s, cx + 0.22, cy + 0.22, 0.4, i + 1, fill=PRIMARY, size=13)
    tb(s, cx + 0.78, cy + 0.18, cw - 1.0, 0.35, [{"runs": [{"t": t, "size": 12.5, "bold": True, "c": TEXT, "font": FONT_TITLE}]}])
    tb(s, cx + 0.78, cy + 0.6, cw - 1.0, ch - 0.75, [{"runs": [{"t": d, "size": 10, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.12}])
tb(s, ML, 6.02, 11.93, 0.9, [{"runs": [{"t": "Sin servidor requerido. ", "size": 10.5, "bold": True, "c": PRIMARY, "font": FONT_BODY},
    {"t": "Actualizaciones: incrementar CACHE_NAME en sw.js (node tools/bump-cache.cjs); los clientes reciben el aviso “Actualización disponible → Recargar” al recargar.", "size": 10.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.15}])
notes(s, "Opciones de despliegue: carpeta suelta de escritorio, ZIP con SHA256, EXE portable de Electron y PWA instalable; mecanismo de actualización por versión de caché del service worker.")

# =====================================================================
# SLIDE 18 — ROADMAP (timeline)
# =====================================================================
s = new_slide()
header(s, "15 · Roadmap", "Hoja de ruta — de la demostración al rollout en equipo", 18)
roadmap = [
    ("Fase 1 — 2026 Q4", "Demo funcional: suite 281/281 verde y campaña P0 completada (offline, PWA, file://, volumen, axe)."),
    ("Fase 2", "E2E automatizado, accesibilidad axe y 7 idiomas verificados en navegadores reales."),
    ("Fase 3", "EXE portable + backup/restauración E2E + flujo de actualización del service worker."),
    ("Fase 4", "Rollout a equipo: UAT con 6 guiones de campo y formación de operadores."),
    ("Fase 5 — continua", "Regresión de los 281 tests en cada entrega; cobertura ≥ 80 % en motores y reglas."),
]
line_y = 3.62
rect(s, 1.15, line_y, 11.35, 0.03, fill=BORDER)
for i, (t, d) in enumerate(roadmap):
    cx = 1.3 + i * 2.42
    chip(s, cx, line_y - 0.28, 0.5, i + 1, fill=PRIMARY, size=14)
    tb(s, cx - 0.6, line_y - 1.15, 2.2, 0.75, [{"runs": [{"t": t, "size": 11, "bold": True, "c": TEXT, "font": FONT_TITLE}], "align": PP_ALIGN.CENTER, "line_spacing": 1.05}])
    rect(s, cx - 0.85, line_y + 0.12, 2.55, 1.95, fill=ICE, line=BORDER, line_w=0.75)
    tb(s, cx - 0.75, line_y + 0.28, 2.35, 1.7, [{"runs": [{"t": d, "size": 9.5, "c": TEXT, "font": FONT_BODY}], "line_spacing": 1.12}])
notes(s, "Roadmap en cinco fases: demostración Q4 2026, E2E automatizado y accesibilidad, EXE portable y backup, rollout con UAT de 6 guiones, y regresión continua de los 281 tests.")

# =====================================================================
# SLIDE 19 — CIERRE (oscuro, descargo de ingeniería)
# =====================================================================
s = new_slide()
rect(s, 0, 0, SLIDE_W, SLIDE_H, fill=DARK)
rect(s, 0, 0, SLIDE_W, 0.14, fill=PRIMARY)
tb(s, ML, 0.75, CW, 0.9, [{"runs": [{"t": "Cierre — descargo de ingeniería", "size": 34, "bold": True, "c": ICE_TEXT, "font": FONT_TITLE}]}])
tb(s, ML, 1.75, CW, 0.4, [{"runs": [{"t": "IntegrityWatch Field v1.0.0  ·  Presentación Técnica", "size": 13, "c": "B9C4D0", "font": FONT_BODY}]}])
rect(s, ML, 2.55, 11.93, 3.45, fill=DARK_SURFACE, line=DARK_BORDER, line_w=1.0)
tb(s, ML + 0.35, 2.8, 5.6, 0.4, [{"runs": [{"t": "Descargo de ingeniería", "size": 14, "bold": True, "c": PRIMARY, "font": FONT_TITLE}]}])
for i, v in enumerate([
    "Herramienta de apoyo a la decisión: no sustituye el criterio de un ingeniero cualificado.",
    "Verificar resultados contra las ediciones vigentes de las normas citadas.",
    "Los datos del fabricante del equipo prevalecen sobre los valores por defecto de la app.",
    "Algunas constantes (Kb/Kw de API 520) son digitizaciones aproximadas de las figuras de la norma.",
    "Ningún valor generado por la app constituye certificación ni recomendación de diseño vinculante.",
]):
    tb(s, ML + 0.35, 3.3 + i * 0.52, 11.3, 0.5, [{"runs": [{"t": "• " + v, "size": 11.5, "c": ICE_TEXT, "font": FONT_BODY}], "line_spacing": 1.05}])
tb(s, ML, 6.35, CW, 0.7, [{"runs": [{"t": "Gracias por su atención.", "size": 15, "bold": True, "c": ICE_TEXT, "font": FONT_TITLE}], "space_after": 3},
    {"runs": [{"t": "Preguntas y comentarios al equipo de IntegrityWatch Field.", "size": 11.5, "c": "B9C4D0", "font": FONT_BODY}]}])
notes(s, "Cierre con el descargo de ingeniería completo: la app es de apoyo, no sustituye al ingeniero; verificar ediciones vigentes de normas; datos del fabricante prevalecen; constantes Kb/Kw aproximadas; sin valor vinculante.")

# ---------------- Guardar ----------------
os.makedirs(OUT_DIR, exist_ok=True)
prs.core_properties.title = "IntegrityWatch Field — Presentación Técnica"
prs.core_properties.author = "IntegrityWatch Field"
prs.save(OUT_FILE)
print("GUARDADO:", OUT_FILE)
