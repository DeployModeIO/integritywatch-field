"""Build src/components/symbols.js from vendored FUXA (MIT) SVGs + IFS custom symbols.

Normalisation rules:
  - drop <script>, <style>, <text>, <title>, <desc>, <defs>
  - drop ids, pointer-events, inline styles and hard-coded colours
  - every shape: fill=none, stroke=currentColor, vector-effect=non-scaling-stroke
  - stroke width stays 1.75 CSS px whatever the symbol's viewBox

Run: python tools/build-symbols.py
"""

from __future__ import annotations

import json
import os
import re
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "assets", "symbols", "fuxa")
OUT = os.path.join(ROOT, "src", "components", "symbols.js")
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

DROP = {"script", "style", "text", "title", "desc", "metadata", "defs"}
SHAPES = {"path", "rect", "circle", "ellipse", "line", "polyline", "polygon"}
KEEP_ATTRS = {"d", "x", "y", "width", "height", "rx", "ry", "cx", "cy", "r",
              "x1", "y1", "x2", "y2", "points", "transform"}

# Symbols drawn by hand: viewBox 24, they complete what FUXA does not cover.
CUSTOM = {
    # --- vessels -------------------------------------------------------------
    "tank-atmospheric": (
        '<path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/>'
        '<path d="M4 8c0-1.7 3.6-3 8-3s8 1.3 8 3"/>'
        '<path d="M4 15h16"/>'
    ),
    "tank-level": (
        '<path d="M4 7v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7"/>'
        '<ellipse cx="12" cy="7" rx="8" ry="3"/>'
        '<path d="M4 14h16"/><path d="M4 17.5h16"/>'
    ),
    "drum": (
        '<rect x="3" y="8" width="18" height="8" rx="4"/>'
        '<path d="M7 8v8M17 8v8"/>'
    ),
    "column": (
        '<rect x="8" y="3" width="8" height="18" rx="3"/>'
        '<path d="M8 8h8M8 12h8M8 16h8"/>'
    ),
    "separator-gravity": (
        '<rect x="3" y="8" width="18" height="8" rx="4"/>'
        '<path d="M9 8v8"/><path d="M15 12h6"/>'
    ),
    # --- heat transfer -------------------------------------------------------
    "hx-tubes": (
        '<circle cx="12" cy="12" r="8"/>'
        '<path d="M6 15l3-6 3 6 3-6 3 6"/>'
    ),
    "hx-plate": (
        '<rect x="5" y="6" width="14" height="12" rx="1"/>'
        '<path d="M9 6v12M12 6v12M15 6v12"/>'
    ),
    "furnace": (
        '<rect x="4" y="5" width="16" height="14" rx="2"/>'
        '<path d="M12 9c2 2 3 3 3 5a3 3 0 0 1-6 0c0-2 1-3 3-5z"/>'
    ),
    "filter": (
        '<rect x="5" y="4" width="14" height="16" rx="2"/>'
        '<path d="M5 9h14M5 14h14"/>'
    ),
    # --- rotating ------------------------------------------------------------
    "pump-centrifugal": (
        '<circle cx="12" cy="12" r="7"/><path d="M9 15l6-3-6-3z"/>'
    ),
    "pump-piston": (
        '<circle cx="12" cy="12" r="7"/>'
        '<path d="M8 12h3M13 12h3M11 9v6"/>'
    ),
    "compressor-centrifugal": (
        '<circle cx="12" cy="12" r="7"/><path d="M8 9h8l-2 6H10z"/>'
    ),
    "compressor-screw": (
        '<circle cx="12" cy="12" r="7"/>'
        '<path d="M9 8v8M15 8v8"/><path d="M9 10l6 4M15 10l-6 4"/>'
    ),
    "compressor-piston": (
        '<circle cx="12" cy="12" r="7"/>'
        '<path d="M9 8v8M15 8v8"/><path d="M8 12h8"/>'
    ),
    "barrel": (
        '<rect x="8" y="4" width="8" height="16" rx="2"/>'
        '<path d="M8 8h8M8 12h8M8 16h8"/>'
    ),
    "heater": (
        '<rect x="5" y="6" width="14" height="12" rx="2"/>'
        '<path d="M8 18V6M12 18V6M16 18V6"/>'
    ),
    "blower": (
        '<circle cx="12" cy="12" r="7"/>'
        '<path d="M12 5c2.5 0 3 3 0 7-3-4-2.5-7 0-7z"/>'
    ),
    "generator": (
        '<circle cx="12" cy="12" r="7"/><path d="M13 8l-4 5h4l-2 5"/>'
    ),
    # --- valves --------------------------------------------------------------
    "valve-gate": (
        '<path d="M3 8l9 4-9 4zM21 8l-9 4 9 4z"/>'
    ),
    "valve-ball": (
        '<path d="M3 8l9 4-9 4zM21 8l-9 4 9 4z"/><circle cx="12" cy="12" r="3"/>'
    ),
    "valve-butterfly": (
        '<rect x="4" y="8" width="16" height="8"/>'
        '<path d="M9 8l6 8M15 8l-6 8"/>'
    ),
    "valve-check": (
        '<path d="M4 8l8 4-8 4zM20 8l-8 4 8 4z"/><path d="M9 12h6"/>'
    ),
    "valve-control": (
        '<path d="M3 10l8 4-8 4zM21 10l-8 4 8 4z"/>'
        '<path d="M12 6v6"/><rect x="9" y="3" width="6" height="3" rx="1"/>'
    ),
    "psv": (
        '<path d="M5 18h6l4-4h4"/><path d="M15 10V6"/><path d="M13 6h4"/>'
        '<path d="M15 7l-2 1 2 1"/>'
    ),
    "rupture-disc": (
        '<path d="M4 8h16M4 16h16"/><path d="M8 8v8M16 8v8"/><path d="M10 12h4"/>'
    ),
    # --- line ----------------------------------------------------------------
    "pipeline": (
        '<path d="M3 9h18M3 15h18"/><path d="M7 9v6M17 9v6"/>'
    ),
    "pipeline-segment": (
        '<path d="M2 12h20"/><path d="M5 9v6M19 9v6"/>'
    ),
    "riser": (
        '<path d="M7 21V9a5 5 0 0 1 10 0v12"/><path d="M4 21h6M14 21h6"/>'
    ),
    "pig-trap": (
        '<rect x="4" y="8" width="13" height="8" rx="4"/><path d="M17 12h4"/>'
        '<path d="M7 8v8"/>'
    ),
    "flare": (
        '<path d="M10 21V7h4v14"/><path d="M12 7c-2-2-2-4 0-5 2 1 2 3 0 5z"/>'
    ),
    "wellhead": (
        '<path d="M12 21V9"/><path d="M8 9h8"/><path d="M9 21h6"/>'
        '<path d="M7 9l5-6 5 6"/>'
    ),
    # --- degradation ---------------------------------------------------------
    "corrosion": (
        '<path d="M4 12a2 2 0 0 1 2-2h9l5 2-5 2H6a2 2 0 0 1-2-2z"/>'
        '<path d="M7 8v8M11 8v8"/>'
    ),
    "cui": (
        '<rect x="4" y="7" width="16" height="10" rx="2"/>'
        '<path d="M4 12h16M9 7v10M15 7v10"/>'
    ),
    "mic": (
        '<circle cx="12" cy="12" r="6"/>'
        '<path d="M9 10h.01M15 10h.01M9 15h.01M15 15h.01M12 12h.01"/>'
    ),
}


def strip_ns(tag: str) -> str:
    return tag.split("}")[-1]


def clean(path: str) -> tuple[str, str]:
    tree = ET.parse(path)
    root = tree.getroot()
    parents = {c: p for p in root.iter() for c in p}
    for el in list(root.iter()):
        if strip_ns(el.tag) in DROP:
            parent = parents.get(el)
            if parent is not None:
                parent.remove(el)
    for el in root.iter():
        if strip_ns(el.tag) not in SHAPES:
            continue
        for attr in list(el.attrib.keys()):
            name = strip_ns(attr)
            if name in KEEP_ATTRS:
                if name != attr:
                    el.set(name, el.attrib.pop(attr))
            else:
                el.attrib.pop(attr, None)
        el.set("fill", "none")
        el.set("stroke", "currentColor")
        el.set("vector-effect", "non-scaling-stroke")
    vb = root.get("viewBox")
    if not vb:
        w = root.get("width", "100").replace("px", "")
        h = root.get("height", "100").replace("px", "")
        vb = f"0 0 {float(w):g} {float(h):g}"
    body = "".join(ET.tostring(c, encoding="unicode") for c in list(root))
    body = re.sub(r"\s+", " ", body).replace("ns0:", "").replace(f' xmlns="{SVG_NS}"', "")
    # safety net: no colour may survive on any element (groups, use, etc.)
    body = re.sub(r'\s(?:fill|stroke|style|color)="[^"]*"', "", body)
    return vb, body.strip()


def js_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("'", "\\'")


def main() -> int:
    bbox_path = os.path.join(ROOT, "assets", "symbols", "bbox.json")
    bbox = {}
    if os.path.exists(bbox_path):
        with open(bbox_path, encoding="utf-8") as fh:
            bbox = json.load(fh)

    def crop(key, vb):
        b = bbox.get(key)
        if not b or not b.get("w") or not b.get("h"):
            return vb
        pad = max(b["w"], b["h"]) * 0.05
        x = round(b["x"] - pad, 2)
        y = round(b["y"] - pad, 2)
        w = round(b["w"] + pad * 2, 2)
        h = round(b["h"] + pad * 2, 2)
        return f"{x} {y} {w} {h}"

    entries = {}
    for key, body in CUSTOM.items():
        entries[key] = {"vb": "0 0 24 24", "body": body}

    lines = []
    for key, val in sorted(entries.items()):
        lines.append(
            f"    '{key}': {{ vb: '{val['vb']}', body: '{js_escape(val['body'])}' }},")
    payload = "\n".join(lines)

    js = f"""// AUTO-GENERATED by tools/build-symbols.py — do not edit by hand.
// FUXA symbols: MIT, github.com/frangoteam/FUXA-SVG-Widgets (see THIRD-PARTY-NOTICES.md)
// IFS custom symbols: original work for IntegrityWatch Field.
(function (root, factory) {{
  var api = factory();
  root.IW = root.IW || {{}};
  root.IW.symbols = api;
  if (typeof module === 'object' && module.exports) {{ module.exports = api; }}
}})(typeof self !== 'undefined' ? self : this, function () {{
  var SYMBOLS = {{
{payload}
  }};

  var STATE_CLASS = {{
    ok: 'sym-ok', warn: 'sym-warn', crit: 'sym-crit',
    nodata: 'sym-nodata', off: 'sym-off'
  }};

  function names() {{ return Object.keys(SYMBOLS); }}
  function has(name) {{ return Object.prototype.hasOwnProperty.call(SYMBOLS, name); }}
  function meta(name) {{ return has(name) ? SYMBOLS[name] : null; }}

  function parseViewBox(vb) {{
    var p = String(vb || '0 0 24 24').split(/[ ,]+/).map(Number);
    return {{ x: p[0] || 0, y: p[1] || 0, w: p[2] || 24, h: p[3] || 24 }};
  }}

  function badge(svg, box, state) {{
    var ns = 'http://www.w3.org/2000/svg';
    var s = Math.max(3, box.w * 0.16);
    var cx = box.x + box.w - s * 0.9;
    var cy = box.y + s * 0.9;
    var el;
    if (state === 'warn') {{
      el = document.createElementNS(ns, 'circle');
      el.setAttribute('cx', cx); el.setAttribute('cy', cy); el.setAttribute('r', s / 2);
      el.setAttribute('class', 'sym-badge sym-badge-warn');
    }} else if (state === 'crit') {{
      el = document.createElementNS(ns, 'path');
      var r = s / 2;
      el.setAttribute('d', 'M' + cx + ' ' + (cy - r) + 'l' + r + ' ' + r + 'v' + r +
        'l-' + r + ' ' + r + 'l-' + r + ' ' + r + 'v-' + r + 'z');
      el.setAttribute('class', 'sym-badge sym-badge-crit');
    }} else if (state === 'off') {{
      el = document.createElementNS(ns, 'circle');
      el.setAttribute('cx', cx); el.setAttribute('cy', cy); el.setAttribute('r', s / 2);
      el.setAttribute('class', 'sym-badge sym-badge-off');
    }}
    if (el) {{ el.setAttribute('vector-effect', 'non-scaling-stroke'); svg.appendChild(el); }}
  }}

  /** Build an <svg> node for a symbol. opts = {{ size, state, title }} */
  function node(name, opts) {{
    opts = opts || {{}};
    var def = meta(name);
    if (!def) {{ return null; }}
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    var box = parseViewBox(def.vb);
    var size = opts.size || 24;
    var w = Math.round(size * (box.w / box.h) * 100) / 100;
    svg.setAttribute('viewBox', def.vb);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(size));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.title || name);
    var state = opts.state || 'ok';
    svg.setAttribute('class', 'sym ' + (STATE_CLASS[state] || 'sym-ok'));
    svg.innerHTML = '<g fill="none" stroke="currentColor" stroke-width="1.75" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + def.body + '</g>';
    if (state === 'warn' || state === 'crit' || state === 'off') {{
      badge(svg, parseViewBox(def.vb), state);
    }}
    return svg;
  }}

  return {{ SYMBOLS: SYMBOLS, names: names, has: has, meta: meta, node: node }};
}});
"""
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(js)
    size = os.path.getsize(OUT)
    print(f"symbols: {len(entries)} ({len(CUSTOM)} custom) -> {OUT} ({size/1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
