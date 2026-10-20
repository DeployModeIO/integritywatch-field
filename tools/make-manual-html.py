#!/usr/bin/env python3
"""Generate IntegrityWatch Field User Manual as a single self-contained HTML file."""

import base64
import hashlib
import os
import re
from pathlib import Path

BASE = Path("D:/ArquitectoSupremo/integritywatch-field")
DOCS = BASE / "docs"
EVIDENCE = DOCS / "evidence"
OUTPUT = DOCS / "manual" / "IntegrityWatch-Field-Manual-Usuario.html"

SECTIONS = [
    "Portada/descargo",
    "Instalación",
    "Primeros pasos",
    "Panel",
    "Corrosión",
    "Válvulas",
    "Ductos",
    "APM",
    "Ingesta",
    "Recomendaciones",
    "Informes",
    "Glosario y siglas",
    "Problemas",
    "Buenas prácticas",
]

def read_md(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")

def md_to_html(md: str) -> str:
    """Very simple markdown → HTML converter for our needs."""
    # Headings
    md = re.sub(r"^(###+) (.+)$", lambda m: f"<{len(m.group(1))}>" + m.group(2).replace("&", "&").replace("<", "<").replace(">", ">") + f"</{len(m.group(1))}>", md, flags=re.MULTILINE)
    # Bold/italic
    md = md.replace("**", "<b>", 1).replace("**", "</b>", 1) if "**" in md else md
    md = md.replace("__", "<u>", 1).replace("__", "</u>", 1) if "__" in md else md
    md = md.replace("*", "<i>", 1).replace("*", "</i>", 1) if "*" in md else md
    # Lists
    md = re.sub(r"^(\d+)\. (.+)$", r"<li>\2</li>", md, flags=re.MULTILINE)
    md = re.sub(r"^-\s+(.+)$", r"<li>\1</li>", md, flags=re.MULTILINE)
    md = re.sub(r"^(\d+)\.", "<ol>", md, flags=re.MULTILINE)
    md = re.sub(r"^-\s+", "<li>", md, flags=re.MULTILINE)
    md = re.sub(r"^$", "</li>", md, flags=re.MULTILINE)
    # Tables
    md = re.sub(r"^\|(.+)\|(.+)\|(.+)\|", r"<table><thead><tr><th>\1</th><th>\2</th><th>\3</th></tr></thead><tbody>", md, flags=re.MULTILINE)
    md = re.sub(r"^\|\s*([^\|]+)\s*\|\s*([^\|]+)\s*\|\s*([^\|]+)\s*\|\|", r"<tr><td>\1</td><td>\2</td><td>\3</td></tr>", md, flags=re.MULTILINE)
    md = re.sub(r"^\|.*\|\|", r"</tr></tbody></table>", md, flags=re.MULTILINE)
    # Horizontal rule
    md = re.sub(r"^---+$", "<hr>", md, flags=re.MULTILINE)
    # Paragraphs
    ps = md.split("\n")
    out = []
    in_list = False
    for p in ps:
        p = p.strip()
        if not p:
            if in_list:
                out.append("</ol>" if out and out[-1] == "<li>" else "</li>")
                in_list = False
            continue
        if re.match(r"^\d+\.", p):
            if not in_list:
                out.append("<ol>")
                in_list = True
            out.append(f"<li>{p}</li>")
        elif p.startswith("|") and p.endswith("|"):
            if not in_list:
                out.append("<table><thead><tr><th>Campo</th><th>Qué es</th><th>Obligatorio</th><th>Valor típico</th></tr></thead><tbody>")
                in_list = True
            out.append(f"<tr><td>{p.replace('|', '</td><td>')}</td></tr>")
        else:
            if in_list:
                out.append("</ol>")
                in_list = False
            out.append(f"<p>{p}</p>")
    if in_list:
        out.append("</ol>")
    return "\n".join(out)

def img_to_base64(path: Path) -> str:
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    # Determine mime type from extension
    ext = path.suffix.lower()
    mime = "png" if ext == ".png" else "jpg" if ext in (".jpg", ".jpeg") else "gif" if ext == ".gif" else "svg" if ext == ".svg" else "webp" if ext == ".webp" else "png"
    return f"data:image/{mime};base64,{b64}"

def find_evidence_images(count: int = 14) -> list[tuple[str, str]]:
    """Find evidence images and return (filename, base64) tuples."""
    patterns = ["*.png", "*.jpg", "*.jpeg", "*.gif", "*.svg", "*.webp"]
    found: list[tuple[str, str]] = []
    for pat in patterns:
        for p in EVIDENCE.glob(pat):
            if len(found) >= count:
                break
            try:
                b64 = img_to_base64(p)
                found.append((p.name, b64))
            except Exception:
                continue
        if len(found) >= count:
            break
    return found[:count]

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()

def generate_html() -> str:
    # Read source docs
    guia = read_md(DOCS / "GUIA-DE-USO.md")
    plan = read_md(DOCS / "PLAN-DE-PRUEBAS.md")

    # Embed images
    images = find_evidence_images(14)
    img_tags = []
    for i, (fname, b64) in enumerate(images, 1):
        figcap = f"Figura {i}: {fname}"
        img_tags.append(f'<figure><img src="{b64}" width="400" alt="{fname}"><figcaption>{figcap}</figcaption></figure>')

    # Section content from the MD files - map sections to content
    section_contents = {
        "Portada/descargo": """<h2>Portada y Descargo de Ingeniería</h2>
<p>Bienvenido al Manual de Usuario de IntegrityWatch Field. Este documento cubre el uso completo de la aplicación para operadores, ingenieros de integridad y supervisores de campo.</p>
<p><strong>Descargo de responsabilidad:</strong> Los cálculos y datos presentados son de naturaleza orientativa y deben validarse siempre contra las ediciones vigentes de las normas aplicables y los datos del fabricante. La aplicación funciona 100% sin internet y todos los datos permanecen en el equipo del usuario.</p>""",
        "Instalación": """<h2>Instalación</h2>
<h3>A. Recomendada (con instalación PWA)</h3>
<p>Doble clic en <code>START-HERE.bat</code> → se abre el navegador → botón de instalar en la barra de direcciones (o menú ⋮ → «Instalar aplicación»). Queda como app instalada en Windows/Android/iOS.</p>
<h3>B. Sin servidor (modo archivo)</h3>
<p>Doble clic en <code>index.html</code>. Prueba rápida; verás una franja avisando que las actualizaciones/PWA están desactivadas.</p>
<h3>C. Servidor manual</h3>
<p>Ejecuta <code>tools\serve.ps1</code> o <code>tools\serve.py</code>. Si ya usas otro servidor estático en tu red.</p>
<h3>D. Escritorio Windows (.exe)</h3>
<p>Carpeta <code>electron/</code> → ver <code>electron/README.md</code>. Para equipos sin navegador o con políticas restrictivas.</p>""",
        "Primeros pasos": """<h2>Primeros Pasos</h2>
<ol>
<li>Al abrir por primera vez se cargan datos de demostración (8 puntos de corrosión, 5 válvulas, un oleoducto con 12 activos, 9 activos APM y ~120 lecturas).</li>
<li>Elige idioma en el encabezado (English · Español · Français · 简体中文 · Русский · العربية · Português). El árabe cambia a derecha-a-izquierda.</li>
<li>Elige tema: botón ☀/🌙/🖥 del encabezado (claro → oscuro → automático). Se recuerda solo.</li>
<li>Selector de sector (Todos / Upstream / Midstream / Downstream) filtra el Panel y APM.</li>
</ol>""",
        "Panel": """<h2>Panel (Pantalla Inicial)</h2>
<ul>
<li><strong>5 indicadores:</strong> tasa media de corrosión, puntos severos (SP0775 ≥10 mpy), válvulas vencidas, activos APM con alerta y cumplimiento pendiente.</li>
<li><strong>Mapa de calor:</strong> una celda por punto; el color y la forma indican severidad (● Baja, ■ Moderada, ▲ Alta, ✕ Severa).</li>
<li><strong>Fuente de alertas:</strong> recomendaciones abiertas, ordenadas por gravedad.</li>
<li><strong>Botón Ejecutar reglas:</strong> analiza todo y genera recomendaciones.</li>
</ul>""",
        "Corrosión": """<h2>Corrosión</h2>
<ol>
<li><strong>Crear un punto de monitoreo:</strong> Corrosión → «Nuevo punto» → completa código (p. ej. MP-CORR-021), material (13 aceros/aleaciones), tipo de sensor (cupón, ER, LPR, H₂, UT, visual), parámetros de proceso (H₂S, CO₂, presión, temperatura, BS&W, velocidad, objetivo/residual de inhibidor), protección catódica y aislamiento (CUI) si aplica.</li>
<li><strong>Registrar lecturas:</strong> entra al punto → «Nueva lectura» → fecha + tasa (mpy) + nota.</li>
<li><strong>Registrar cupones (pares inhibitor/blank):</strong> «Nuevo cupón» → eliges Rol (Blanco/Inhibido), Par (p. ej. P3), peso inicial/final, área y días. La tasa se calcula sola (ASTM G4). El panel Eficiencia del inhibidor compara ambos y da la banda (Excelente ≥90 %, Deficiente <70 %).</li>
<li><strong>Editar un cupón existente:</strong> botón Editar en su fila (puedes corregir rol, par, pesos…).</li>
<li>Paneles automáticos: Balance de inhibidor (ventana 80–150 %), De Waard–Milliams (modelo vs medido), Screening agrio MR0175 (pH₂S), Protección catódica y CUI.</li>
<li><strong>Expediente del punto:</strong> botón «Expediente del punto» → informe listo para imprimir/PDF.</li>
</ol>""",
        "Válvulas": """<h2>Válvulas de Alivio (PSV)</h2>
<ol>
<li><strong>Registrar:</strong> «Nueva PSV» → etiqueta, tipo (convencional / fuelle compensado / pilotada), fluido (11 pre-cargados, editables), presión de ajuste, temperatura, contrapresión, fechas de prueba.</li>
<li><strong>Dimensionar:</strong> en la ficha de la válvula, pestañas Gas y Líquido. Gas: caudal W, presión/temperatura, Z, M, k → área requerida con API 520; detecta flujo crítico/subcrítico. Líquido: caudal Q, gravedad G, viscosidad → área con corrección Kv (Re en el orificio). El sistema selecciona el orificio API 526 (D–T), muestra margen, capacidad real y avisos de validación.</li>
<li><strong>Guardar el dimensionamiento:</strong> en la válvula y generar el Datasheet (informe formato API 520/ISA S20).</li>
</ol>""",
        "Ductos": """<h2>Ductos (Midstream)</h2>
<ol>
<li><strong>Crear el sistema:</strong> nombre, operador, producto, diámetro, espesor, material, longitud, rango de estaciones (km).</li>
<li><strong>Activos de línea:</strong> dentro del sistema, «Nuevo activo de línea» → tipo (12: válvulas, bridas, estaciones de bombeo/compresión, tanques, cruces, ROW, medición…), estación km y lado.</li>
<li><strong>Inspecciones:</strong> tipo (ILD, corrosión externa, visual, UT, reparación, reemplazo), tramo km, severidad, hallazgos.</li>
<li><strong>Mapa:</strong> nodos sobre la línea a escala de km, color y forma por severidad de la última inspección. Navegable con Tab y Enter (accesible por teclado). Filtros por tipo y severidad.</li>
</ol>""",
        "APM": """<h2>Desempeño de Activos (APM)</h2>
<ol>
<li><strong>Crear activo:</strong> código, nombre, sector, categoría (pozos, plataformas, bombas, compresores, intercambiadores, torres, utilidades…), criticidad A/B/C, estado, POF×COF (riesgo RBI) e intervalo base de inspección (la fecha siguiente se sugiere sola por banda de riesgo).</li>
<li><strong>Registrar eventos:</strong> tipo (fallo, mantenimiento, parada no planificada, orden de trabajo, inspección), fechas y tiempo de parada → el sistema calcula disponibilidad, MTBF, MTTR y el semáforo de salud.</li>
<li><strong>Matriz de riesgo 5×5:</strong> muestra dónde cae cada activo y qué prioridad de inspección le toca.</li>
</ol>""",
        "Ingesta": """<h2>Ingesta de Datos</h2>
<ol>
<li><strong>Pestaña CSV:</strong> «Elegir archivo» (o arrastra el archivo). Acepta , ; y tabulador.</li>
<li><strong>Mapeo de columnas:</strong> se detecta automáticamente: punto, fecha, tasa, wi, wf, área, días, residual, temperatura, bsw, categoría, nota — admite variantes en español/inglés y con tildes.</li>
<li><strong>Crear puntos faltantes:</strong> marca si el archivo trae puntos nuevos.</li>
<li><strong>Ejecutar validación:</strong> tabla de errores por fila (fecha futura, Wf>Wi, fuera de rango, punto inexistente, duplicados omitidos). Si cambias la casilla de crear puntos, vuelve a validar antes de importar.</li>
<li><strong>Importar:</strong> resumen y registro en el historial.</li>
<li>Pestañas extra: WITSML (pozos/trayectorias/canales) y JSON (respaldo completo, modo merge o reemplazo).</li>
</ol>""",
        "Recomendaciones": """<h2>Recomendaciones</h2>
<ul>
<li>Lista con filtros por estado (Abierta/Reconocida/Resuelta) y gravedad.</li>
<li>Cada tarjeta muestra la regla, el mensaje con datos reales, la entidad afectada y el enlace a su ficha.</li>
<li><strong>Acciones:</strong> Reconocer → Resolver (con nota). Todo queda auditado con fecha y quién lo hizo.</li>
<li>Si la condición vuelve a cumplirse tras resolver, la recomendación se reabre automáticamente.</li>
</ul>""",
        "Informes": """<h2>Informes</h2>
<ol>
<li><strong>Informe trimestral:</strong> elige periodo → Generar → portada, KPIs, gráfico semanal, top de puntos críticos, eficiencia por par, campañas y recomendaciones. Botón Imprimir → «Guardar como PDF».</li>
<li><strong>Expediente por punto:</strong> ficha técnica + historial + cálculos ASTM G4 + clasificación SP0775 + screening MR0175.</li>
<li><strong>Datasheet de válvula:</strong> ficha de dimensionamiento completa, copiable al portapapeles.</li>
</ol>""",
        "Glosario y siglas": """<h2>Glosario y Siglas</h2>
<p><strong>Buscador:</strong> y filtro por categoría (corrosión, PSV, ductos, APM, normas, datos). 53 términos con su referencia normativa, en tu idioma.</p>
<p><strong>Siglas principales:</strong> API 520, API 526, ASTM G4, MR0175, SP0775, CUI, POF, COF, RBI, mpy, Wf, Wi, BS&W.</p>""",
        "Problemas": """<h2>Solución de Problemas</h2>
<table>
<tr><td>Síntoma</td><td>Causa probable</td><td>Solución</td></tr>
<tr><td>«El puerto está ocupado» al usar START-HERE</td><td>Otro proceso usa 8419</td><td>tools\serve.ps1 -Port 9000 (o cierra el otro proceso)</td></tr>
<tr><td>PowerShell bloquea el script</td><td>Política de ejecución</td><td>Usa START-HERE.bat (incluye el bypass) o py tools\serve.py</td></tr>
<tr><td>No veo la opción de instalar PWA</td><td>Abriste por file://</td><td>Usa START-HERE.bat</td></tr>
<tr><td>Los datos desaparecieron</td><td>Modo incógnito o borrado de datos del sitio</td><td>Restaura tu respaldo JSON; evita modo privado</td></tr>
<tr><td>«Actualización disponible</td><td>Nueva versión publicada</td><td>Pulsa Recargar en el aviso</td></tr>
<tr><td>El informe sale en blanco</td><td>Se generó y cambió de vista</td><td>Vuelve a Generar y pulsa Imprimir sin salir</td></tr>
<tr><td>Sigo viendo la versión anterior</td><td>Service worker conserva versión previa</td><td>Pulsa Recarga Ctrl+F5 o DevTools → Application → Service Workers → Update</td></tr>
</table>""",
        "Buenas prácticas": """<h2>Buenas Prácticas</h2>
<ol>
<li><strong>Respalda cada semana</strong> (Admin → Exportar) y antes de importaciones grandes.</li>
<li><strong>Valida antes de importar;</strong> revisa siempre la tabla de errores.</li>
<li><strong>Usa códigos consistentes</strong> (MP-CORR-nnn, PSV-nnn, SYS-…) para que los informes queden legibles.</li>
<li>Activa el PIN si el equipo es compartido.</li>
<li>Los cálculos son de apoyo: valida siempre contra las ediciones vigentes de las normas y los datos del fabricante.</li>
</ol>""",
    }

    # Build HTML
    html_parts = []
    
    # Header box with disclaimer, requirements, 3 startup methods, SHA256
    sha256 = sha256_file(BASE / "START-HERE.bat")
    
    html_parts.append("""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manual de Usuario — IntegrityWatch Field</title>
    <style>
        :root {
            --bg-color: #f8f9fa;
            --text-color: #212529;
            --sidebar-bg: #e9ecef;
            --accent-color: #2c3e50;
            --header-bg: #ffffff;
            --link-color: #3498db;
            --warning-color: #e74c3c;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg-color: #1a1a2e;
                --text-color: #e0e0e0;
                --sidebar-bg: #16213e;
                --accent-color: #1abc9c;
                --header-bg: #151525;
                --link-color: #34e89e;
                --warning-color: #e67e22;
            }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            min-height: 100vh;
        }
        a { color: var(--link-color); text-decoration: none; }
        a:hover { text-decoration: underline; }
        
        /* Fixed sidebar */
        .sidebar {
            width: 240px;
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            background-color: var(--sidebar-bg);
            padding: 20px 15px;
            overflow-y: auto;
            flex-shrink: 0;
            border-right: 1px solid var(--text-color);
        }
        .sidebar h2 { margin: 20px 0 15px; padding-bottom: 10px; border-bottom: 1px solid #ccc; color: var(--text-color); font-size: 1.2rem; }
        .sidebar nav a { display: block; padding: 10px 15px; margin: 5px 0; border-radius: 6px; color: var(--text-color); text-decoration: none; font-size: 0.95rem; transition: background 0.2s; }
        .sidebar nav a:hover, .sidebar nav a.active { background: var(--accent-color); color: white; }
        .sidebar .toc-btn { width: 100%; padding: 10px; margin: 20px 0; background: var(--accent-color); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.9rem; }
        .sidebar .back-to-top { position: fixed; left: 240px; top: 20px; width: 40px; height: 40px; background: var(--accent-color); color: white; border: none; border-radius: 50%; font-size: 1.2rem; cursor: pointer; display: none; align-items: center; justify-content: center; }
        
        /* Main content */
        .main { margin-left: 240px; padding: 20px; max-width: calc(100vw - 240px); }
        .content { line-height: 1.6; }
        .content h1, .content h2, .content h3 { color: var(--accent-color); margin: 20px 0 10px; }
        .content p { margin-bottom: 15px; }
        .content ol { margin: 15px 0; padding-left: 20px; }
        .content ol li { margin-bottom: 8px; }
        .content table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .content table th, .content table td { border: 1px solid #ddd; padding: 8px; font-size: 0.85rem; }
        .content table th { background: #f2f2f2; }
        .content code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.85rem; }
        .content pre { background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto; margin: 10px 0; }
        .content figcaption { text-align: center; font-size: 0.8rem; margin-top: 5px; color: #666; }
        .content figcaption ⚠ { color: var(--warning-color); font-weight: bold; }
        
        /* Warning symbols as text */
        .warning { color: var(--warning-color); font-weight: bold; }
        
        /* Code copy button */
        .code-wrapper { position: relative; margin: 10px 0; }
        .copy-btn { position: absolute; top: 4px; right: 8px; padding: 3px 8px; background: #e0e0e0; border: none; border-radius: 3px; font-size: 0.7rem; cursor: pointer; display: none; }
        .code-wrapper:hover .copy-btn { display: inline-block; }
        
        /* Header box */
        .header-box { background: var(--header-bg); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid var(--accent-color); }
        .header-box h3 { margin-top: 5px; color: var(--text-color); }
        .header-box .req { font-family: monospace; background: #f0f0f0; padding: 2px 6px; border-radius: 3px; margin: 2px; }
        
        /* Footer */
        .footer { margin-top: 40px; padding: 20px; text-align: center; font-size: 0.85rem; color: #666; border-top: 1px solid #ddd; }
        .footer span { color: var(--accent-color); }
        
        /* Responsive */
        @media (max-width: 768px) {
            .sidebar { width: 100%; position: relative; height: auto; flex-shrink: 1; }
            .main { margin-left: 0; }
            .sidebar nav a { padding: 8px; font-size: 0.8rem; }
            .back-to-top { display: none; }
        }
    </style>
</head>
<body>
    <div class="sidebar" id="sidebar">
        <h2>Índice de Contenidos</h2>
        <nav>
            <a href="#seccion1">1. Portada/Descargo</a>
            <a href="#seccion2">2. Instalación</a>
            <a href="#seccion3">3. Primeros pasos</a>
            <a href="#seccion4">4. Panel</a>
            <a href="#seccion5">5. Corrosión</a>
            <a href="#seccion6">6. Válvulas</a>
            <a href="#seccion7">7. Ductos</a>
            <a href="#seccion8">8. APM</a>
            <a href="#seccion9">9. Ingesta</a>
            <a href="#seccion10">10. Recomendaciones</a>
            <a href="#seccion11">11. Informes</a>
            <a href="#seccion12">12. Glosario y Siglas</a>
            <a href="#seccion13">13. Problemas</a>
            <a href="#seccion14">14. Buenas prácticas</a>
        </nav>
        <button class="toc-btn" onclick="toggleTOC()">Mostrar/Ocultar Índice</button>
        <button class="back-to-top" onclick="scrollToTop()">↑</button>
    </div>
    
    <div class="main" id="main">
        <header>
            <div class="header-box">
                <h3>Aviso Importante</h3>
                <p>Este manual es para IntegrityWatch Field. La aplicación funciona 100% sin internet y todos tus datos permanecen en tu equipo.</p>
                <div class="req">Requisitos: Chrome, Edge, Firefox o Safari de los últimos dos años. Resolución mínima 1366×768.</div>
                <div class="req req">Paquete portable verificado: SHA256SUMS.txt <span id="sha256">""" + sha256 + """</span></div>
                <div class="req">3 formas de arranque: (A) START-HERE.bat (PWA), (B) index.html (modo archivo), (C) tools\serve.ps1 (servidor manual)</div>
            </header>
        """)
    
    # Add sections
    for i, section_name in enumerate(SECTIONS, 1):
        content = section_contents.get(section_name, f"<h2>{section_name}</h2><p>Contenido no disponible.</p>")
        html_parts.append(f"<section id='seccion{i}'>")
        html_parts.append(content)
        html_parts.append(f"</section>")
    
    # Add images section after header
    html_parts.append("<section id='seccion15'>")
    html_parts.append("<h2>Evidencia Visual</h2>")
    html_parts.append("<p>Las siguientes imágenes están embebidas en el manual para funcionamiento sin conexión:</p>")
    for fname, b64 in images:
        html_parts.append(f'<figure><img src="{b64}" width="400" alt="{fname}"><figcaption>{fname}</figcaption></figure>')
    html_parts.append("</section>")
    
    # TOC toggle script
    html_parts.append("""
    <script>
        function toggleTOC() {
            const sidebar = document.getElementById('sidebar');
            sidebar.style.width = sidebar.style.width === '240px' ? '0' : '240px';
            const main = document.getElementById('main');
            main.style.marginLeft = sidebar.style.width === '0' ? '0' : '240px';
        }
        function scrollToTop() { window.scrollTo({top: 0, behavior: 'smooth'}); }
        
        // IntersectionObserver for active section highlighting
        const sections = document.querySelectorAll('section');
        const navLinks = document.querySelectorAll('.sidebar nav a');
        
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    const id = entry.target.getAttribute('id');
                    if (entry.isIntersecting) {
                        navLinks.forEach(link => {
                            link.classList.toggle('active', link.getAttribute('href') === '#' + id);
                        });
                    }
                });
            },
            { root: null, threshold: 0.3 }
        );
        
        sections.forEach(section => {
            observer.observe(section);
        });
        
        // Navigate back to top button
        window.onscroll = function() {
            const btn = document.querySelector('.back-to-top');
            if (window.pageYOffset > 300) {
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
        };
        
        // Theme toggle with localStorage
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
        const html = document.documentElement;
        function setTheme(isDark) {
            if (isDark) {
                html.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
            } else {
                html.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
            }
        }
        // Check saved theme or prefers-color-scheme
        const saved = localStorage.getItem('theme');
        if (saved) { setTheme(saved === 'dark'); }
        else { setTheme(prefersDark.matches ? 'dark' : 'light'); }
        
        const themeBtn = document.createElement('button');
        themeBtn.style.position = 'fixed';
        themeBtn.style.top = '20px';
        themeBtn.style.right = '260px';
        themeBtn.style.zIndex = '1000';
        themeBtn.innerHTML = saved === 'dark' ? '☀' : '🌙';
        themeBtn.onclick = () => {
            const current = html.getAttribute('data-theme');
            setTheme(current === 'dark' ? 'light' : 'dark');
            themeBtn.innerHTML = saved === 'dark' ? '☀' : '🌙';
        };
        document.body.appendChild(themeBtn);
        
        // Code copy functionality
        document.querySelectorAll('.content code').forEach(code => {
            const wrapper = code.parentNode;
            if (!wrapper || wrapper.classList.contains('code-wrapper')) return;
            wrapper.classList.add('code-wrapper');
            const btn = document.createElement('button');
            btn.className = 'copy-btn';
            btn.innerText = 'Copiar';
            btn.onclick = () => {
                navigator.clipboard.writeText(code.innerText).then(() => {
                    btn.innerText = 'Copiado!';
                    setTimeout(() => btn.innerText = 'Copiar', 2000);
                });
            };
            wrapper.appendChild(btn);
        });
        
        // Table of contents click smoothing
        document.querySelectorAll('.sidebar nav a').forEach(link => {
            link.addEventListener('click', function(e) {
                const targetId = this.getAttribute('href').substring(1);
                const target = document.getElementById(targetId);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    </script>
    </body>
    </html>
    """)
    
    return "\n".join(html_parts)


if __name__ == "__main__":
    html = generate_html()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"Manual generado: {OUTPUT}")
    print(f"Peso: {OUTPUT.stat().st_size / 1024:.1f} KB")