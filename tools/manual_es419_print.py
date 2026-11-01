"""Render MANUAL.es-419.md to a standalone HTML and a DOCX (print-ready).

    python tools/manual_es419_print.py

Outputs (docs/manual/):
    IntegrityWatch-Field-Manual-es-419.html
    IntegrityWatch-Field-Manual-es-419.docx

The markdown subset handled: h1-h3, paragraphs, bullets, tables, images, code
fences, horizontal rules and inline **bold** / `code` / [links](url).
"""

from __future__ import annotations

import base64
import html
import os
import re

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MANUAL = os.path.join(ROOT, "docs", "manual", "MANUAL.es-419.md")
OUT_HTML = os.path.join(ROOT, "docs", "manual", "IntegrityWatch-Field-Manual-es-419.html")
OUT_DOCX = os.path.join(ROOT, "docs", "manual", "IntegrityWatch-Field-Manual-es-419.docx")
IMG_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")


def load_lines():
    with open(MANUAL, encoding="utf-8") as fh:
        return fh.read().split("\n")


def resolve(path: str) -> str:
    return os.path.normpath(os.path.join(os.path.dirname(MANUAL), path))


def inline_html(text: str) -> str:
    out = html.escape(text)
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"`(.+?)`", r"<code>\1</code>", out)
    out = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', out)
    return out


def build_html(lines) -> str:
    body, i = [], 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line:
            i += 1
            continue
        if line.startswith("### "):
            body.append(f"<h3>{inline_html(line[4:])}</h3>")
        elif line.startswith("## "):
            body.append(f"<h2>{inline_html(line[3:])}</h2>")
        elif line.startswith("# "):
            body.append(f"<h1>{inline_html(line[2:])}</h1>")
        elif line.strip() == "---":
            body.append("<hr>")
        elif line.startswith("```"):
            i += 1
            code = []
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(html.escape(lines[i]))
                i += 1
            body.append("<pre><code>" + "\n".join(code) + "</code></pre>")
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(set(c) <= set("-: ") for c in cells):
                    rows.append(cells)
                i += 1
            head, rest = rows[0], rows[1:]
            t = ["<table><thead><tr>"] + [f"<th>{inline_html(c)}</th>" for c in head] + ["</tr></thead><tbody>"]
            for r in rest:
                t.append("<tr>" + "".join(f"<td>{inline_html(c)}</td>" for c in r) + "</tr>")
            t.append("</tbody></table>")
            body.append("".join(t))
            continue
        elif line.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append(f"<li>{inline_html(lines[i][2:])}</li>")
                i += 1
            body.append("<ul>" + "".join(items) + "</ul>")
            continue
        elif IMG_RE.fullmatch(line.strip()):
            alt, src = IMG_RE.fullmatch(line.strip()).groups()
            path = resolve(src)
            if os.path.exists(path):
                with open(path, "rb") as fh:
                    b64 = base64.b64encode(fh.read()).decode("ascii")
                body.append(f'<figure><img alt="{html.escape(alt)}" src="data:image/png;base64,{b64}">'
                            f'<figcaption>{inline_html(alt)}</figcaption></figure>')
            else:
                body.append(f"<p><em>[imagen no encontrada: {html.escape(src)}]</em></p>")
        else:
            body.append(f"<p>{inline_html(line)}</p>")
        i += 1

    css = """
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: "Segoe UI", Arial, sans-serif; color:#14181c; line-height:1.55; max-width: 900px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 26px; border-bottom: 3px solid #0b5cad; padding-bottom: 8px; }
    h2 { font-size: 19px; color:#0b5cad; margin-top: 28px; page-break-after: avoid; }
    h3 { font-size: 15px; margin-top: 20px; page-break-after: avoid; }
    table { border-collapse: collapse; width:100%; margin: 12px 0; font-size: 13px; }
    th, td { border: 1px solid #9aa3ac; padding: 6px 8px; text-align: left; }
    th { background:#eceef0; }
    code { background:#eceef0; padding:1px 4px; border-radius:3px; font-size: 12px; }
    pre { background:#11161c; color:#e8eef4; padding:10px 12px; border-radius:6px; overflow-x:auto; }
    figure { margin: 14px 0; page-break-inside: avoid; }
    figure img { width:100%; border:1px solid #9aa3ac; border-radius:6px; }
    figcaption { font-size: 12px; color:#49535d; margin-top:4px; }
    hr { border:0; border-top:1px solid #9aa3ac; margin:22px 0; }
    """
    return ("<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\">"
            "<title>IntegrityWatch Field — Manual extendido (es-419)</title>"
            f"<style>{css}</style></head><body>" + "\n".join(body) + "</body></html>")


def build_docx(lines) -> None:
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Segoe UI"
    style.font.size = Pt(10.5)
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line:
            i += 1
            continue
        if line.startswith("### "):
            doc.add_heading(line[4:], level=3)
        elif line.startswith("## "):
            doc.add_heading(line[3:], level=2)
        elif line.startswith("# "):
            doc.add_heading(line[2:], level=1)
        elif line.strip() == "---":
            doc.add_paragraph("_" * 60)
        elif line.startswith("```"):
            i += 1
            code = []
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            p = doc.add_paragraph("\n".join(code))
            for run in p.runs:
                run.font.name = "Consolas"
                run.font.size = Pt(9)
        elif line.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(set(c) <= set("-: ") for c in cells):
                    rows.append(cells)
                i += 1
            table = doc.add_table(rows=len(rows), cols=len(rows[0]))
            table.style = "Table Grid"
            for r, row in enumerate(rows):
                for c, cell in enumerate(row[:len(rows[0])]):
                    table.cell(r, c).text = cell
            continue
        elif line.startswith("- "):
            while i < len(lines) and lines[i].startswith("- "):
                doc.add_paragraph(lines[i][2:], style="List Bullet")
                i += 1
            continue
        elif IMG_RE.fullmatch(line.strip()):
            alt, src = IMG_RE.fullmatch(line.strip()).groups()
            path = resolve(src)
            if os.path.exists(path):
                doc.add_picture(path, width=Cm(16))
                doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
                cap = doc.add_paragraph(alt)
                cap.runs[0].italic = True
                cap.runs[0].font.size = Pt(8.5)
        else:
            doc.add_paragraph(alt_strip(line))
        i += 1
    doc.save(OUT_DOCX)


def alt_strip(text: str) -> str:
    return re.sub(r"\*\*(.+?)\*\*", r"\1", re.sub(r"`(.+?)`", r"\1", text))


def main() -> int:
    lines = load_lines()
    html_out = build_html(lines)
    with open(OUT_HTML, "w", encoding="utf-8") as fh:
        fh.write(html_out)
    build_docx(lines)
    print(f"html {os.path.getsize(OUT_HTML)/1024:.0f} KB · docx {os.path.getsize(OUT_DOCX)/1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
