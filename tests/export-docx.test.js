/* IntegrityWatch Field — exportador DOCX (P3-c): OOXML mínimo válido, escape
   XML estricto, determinismo byte a byte y mapeo de secciones del renderer.
   Node 24, sin dependencias. La verificación con lector DOCX real (python-docx)
   se hace fuera del test: este solo escribe %TEMP%\kilo\dtest*.docx. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const docxWriter = require('../src/export/docxWriter.js');
const zip = require('../src/export/zip.js');

const dec = new TextDecoder('utf-8');

async function parts(bytes) {
  const entries = await zip.unpack(bytes);
  const map = {};
  for (const e of entries) { map[e.name] = dec.decode(e.data); }
  return map;
}

// Un bloque de cada tipo, con acentos UTF-8 y saltos de línea.
const FULL_DOC = {
  title: 'Informe de Integridad',
  meta: { author: 'Arquitecto', date: '2026-10-31T10:00:00Z' },
  blocks: [
    { type: 'h1', text: 'Óxido ¿cuánto queda?' },
    { type: 'h2', text: 'Sección de Corrosión' },
    { type: 'h3', text: 'Bajo el aislante' },
    { type: 'p', text: 'Primera línea\nSegunda línea con <tag> & "comillas" y ó ñ ¿' },
    { type: 'p', text: 'texto en negrita', bold: true },
    { type: 'p', text: 'texto en cursiva', italic: true },
    { type: 'table', headers: ['Punto', 'mpy'], rows: [['MP-1', 3.2], [null, undefined]], widths: [60, 40] },
    { type: 'list', items: ['hallazgo uno', 'hallazgo dos'] },
    { type: 'list', items: ['primero', 'segundo'], ordered: true },
    { type: 'pagebreak' },
    { type: 'kpi', items: [{ label: 'CR promedio', value: 2.5 }, { label: 'Sin dato', value: null }] }
  ]
};

const REQUIRED_PATHS = [
  '[Content_Types].xml',
  '_rels/.rels',
  'word/document.xml',
  'word/styles.xml',
  'word/_rels/document.xml.rels',
  'docProps/core.xml',
  'docProps/app.xml',
  'word/settings.xml'
];

test('build con 1 bloque de cada tipo: los 8 paths y textos escapados', async function () {
  const bytes = await docxWriter.build(FULL_DOC);
  assert.ok(bytes instanceof Uint8Array, 'build devuelve Promise<Uint8Array>');
  const p = await parts(bytes);
  for (const rp of REQUIRED_PATHS) {
    assert.ok(Object.prototype.hasOwnProperty.call(p, rp), 'zip debe contener ' + rp);
  }
  assert.ok(p['[Content_Types].xml'].includes('wordprocessingml.document.main+xml'), 'content type del documento');

  const doc = p['word/document.xml'];
  // Acentos UTF-8 literales en el XML (no entidades numéricas).
  assert.ok(doc.includes('Óxido ¿'), 'acento UTF-8 literal "Óxido ¿" en document.xml');
  assert.ok(doc.includes('&lt;tag&gt; &amp; &quot;comillas&quot;'), 'escape estricto & < > "');
  assert.ok(!doc.includes('Primera línea\nSegunda'), '\\n se separa en párrafos, no viaja crudo');
  assert.ok(doc.includes('Primera línea') && doc.includes('Segunda'), 'ambas líneas presentes');
  assert.ok(doc.includes('<w:pStyle w:val="Heading1"'), 'h1 usa pStyle Heading1');
  assert.ok(doc.includes('<w:pStyle w:val="Heading2"'), 'h2 usa pStyle Heading2');
  assert.ok(doc.includes('<w:pStyle w:val="Heading3"'), 'h3 usa pStyle Heading3');
  assert.ok(doc.includes('<w:pgSz w:w="11906" w:h="16838"'), 'sectPr A4');
  assert.ok(doc.includes('<w:tbl>'), 'tabla presente (w:tbl)');
  assert.ok(doc.includes('<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"'), 'encabezado de tabla sombreado');
  assert.ok(doc.includes('<w:br w:type="page"/>'), 'pagebreak como w:br tipo page');
  assert.ok(doc.includes('<w:numId w:val="1"/>'), 'lista con viñetas referencia numId 1');
  assert.ok(doc.includes('<w:numId w:val="2"/>'), 'lista ordenada referencia numId 2');
  assert.ok(doc.includes('<w:rPr><w:b/></w:rPr>'), 'run en negrita');

  const styles = p['word/styles.xml'];
  for (const sid of ['Normal', 'Heading1', 'Heading2', 'Heading3', 'TableGrid', 'ListParagraph']) {
    assert.ok(styles.includes('w:styleId="' + sid + '"'), 'styles.xml define ' + sid);
  }
  const core = p['docProps/core.xml'];
  assert.ok(core.includes('<dc:creator>Arquitecto</dc:creator>'), 'author en core.xml');
  assert.ok(core.includes('2026-10-31T10:00:00Z'), 'date en core.xml');
  assert.ok(p['word/_rels/document.xml.rels'].includes('Target="styles.xml"'), 'rels apuntan a styles.xml');
});

test('caracteres de control eliminados sin romper el XML', async function () {
  const CTRL = 'a' + String.fromCharCode(0) + 'b' + String.fromCharCode(31) + 'c' + String.fromCharCode(7) + 'd';
  const bytes = await docxWriter.build({ blocks: [{ type: 'p', text: CTRL }, { type: 'p', text: 'H\u00e9llo W\u00f6rld' }] });
  const doc = (await parts(bytes))['word/document.xml'];
  assert.ok(doc.includes('abcd'), 'controles NUL/US/BEL eliminados, el texto sobrevive');
  assert.ok(doc.includes('H\u00e9llo W\u00f6rld'), 'acentos latin1 no revientan el escritor');
});

// Secciones literales con las formas que renderiza src/reports/renderer.js.
const SECTIONS = [
  {
    type: 'cover', titleKey: 'reports.title', subtitle: 'L\u00ednea 12" \u00b7 Tramo Norte',
    meta: { generatedAtISO: '2026-10-01T08:00:00Z', period: { fromISO: '2026-07-01T00:00:00Z', toISO: '2026-09-30T00:00:00Z' } }
  },
  { type: 'kpiRow', titleKey: 'reports.kpis', items: [{ labelKey: 'kpi.crAvg', value: 2.5, unit: 'units.mpy' }, { labelKey: 'kpi.empty', value: null }] },
  { type: 'table', titleKey: 'reports.assets', columns: [{ key: 'code', labelKey: 'col.code' }, { key: 'cr', labelKey: 'col.cr' }], rows: [{ code: 'A-1', cr: 1.2 }, { code: 'A-2', cr: null }] },
  { type: 'table', titleKey: 'reports.kv', rows: [{ label: 'Sistema', value: 'Upstream' }, { key: 'fluido', value: 96 }] },
  { type: 'list', titleKey: 'reports.findings', items: [{ text: '\u00d3xido bajo aislante' }, { textKey: 'reports.noData' }] },
  { type: 'text', titleKey: 'reports.summary', body: 'Conclusi\u00f3n operativa.\nSegundo p\u00e1rrafo.' },
  { type: 'standards', titleKey: 'reports.stds', items: [{ id: 'API 510', title: 'Recipientes a presi\u00f3n' }, { id: 'NORSOK M-101' }] },
  { type: 'chart', kind: 'trend', titleKey: 'reports.trend', data: [{ x: 0, y: 1.2 }, { x: 1, y: 1.5, label: 'codo' }] },
  { type: 'chart', kind: 'matrix', titleKey: 'reports.nodata' },
  { type: 'couponCards', titleKey: 'reports.coupons', items: [{ label: 'MP-1', roleKey: 'role.wall', deltaW: 12.5, density: 7.85, areaIn2: 2.1, hours: 720, mpy: 3.9, level: 'high', hasResult: true }, { label: 'MP-2', roleKey: 'role.wall', hasResult: false }] },
  { type: 'disclaimer', labelKey: 'reports.disclaimerLabel', textKey: 'reports.disclaimerText' },
  { type: 'tipoInexistente', algo: 1 }
];

test('buildFromSections mapea las secciones del renderer a bloques DOCX', async function () {
  const bytes = await docxWriter.buildFromSections(SECTIONS, { author: 'IW-Field' });
  const p = await parts(bytes);
  const doc = p['word/document.xml'];
  // cover -> titulo del documento + meta en parrafos.
  assert.ok(doc.includes('reports.title'), 'cover.titleKey va como titulo (Heading1)');
  assert.ok(doc.includes('L\u00ednea 12&quot;'), 'subtitle de cover escapado');
  assert.ok(doc.includes('2026-09-30'), 'periodo de cover.meta en el cuerpo');
  assert.ok(p['docProps/core.xml'].includes('<dc:creator>IW-Field</dc:creator>'), 'opts.author a core.xml');
  assert.ok(p['docProps/core.xml'].includes('2026-10-01T08:00:00Z'), 'generatedAtISO de cover como date');
  // kpiRow -> ficha; table con columns; kv sin columns -> 2 columnas.
  assert.ok(doc.includes('kpi.crAvg') && doc.includes('2.5 units.mpy'), 'kpiRow renderiza label+valor+unidad (identity translate)');
  assert.ok(doc.includes('col.cr') && doc.includes('A-1'), 'tabla con columnas/headers');
  assert.ok(doc.includes('Sistema') && doc.includes('Upstream'), 'tabla key-value sin columns');
  assert.ok(doc.includes('\u00d3xido bajo aislante'), 'list items text');
  assert.ok(doc.includes('Conclusi\u00f3n operativa'), 'text body');
  assert.ok(doc.includes('API 510'), 'standards como lista');
  // chart con data -> tabla de datos; chart sin data -> marcador honesto.
  assert.ok(doc.includes('1.5') && doc.includes('codo'), 'chart.data exportado como tabla de datos');
  assert.ok(doc.includes('[gr\u00e1fico no exportado a Word]'), 'chart sin data -> marcador, no SVG inventado');
  assert.ok(doc.includes('role.wall') && doc.includes('3.9'), 'couponCards como tabla con valores');
  assert.ok(doc.includes('reports.disclaimerLabel'), 'disclaimer como parrafo pequeno');
  assert.ok(doc.includes('<w:sz w:val="16"/>'), 'disclaimer usa tamano de fuente reducido');
  // tipo desconocido: se omite sin romper (igual que el renderer).
  assert.ok(!doc.includes('tipoInexistente'), 'seccion desconocida omitida sin ruido');
  const trCount = (doc.match(/<w:tr(?:\s|>)/g) || []).length;
  assert.ok(trCount >= 6, 'tablas de kpi/table/kv/couponRows presentes');
});

test('errores tipados DOCXW_BAD_INPUT', async function () {
  await assert.rejects(function () { return docxWriter.build(null); }, { code: 'DOCXW_BAD_INPUT' });
  await assert.rejects(function () { return docxWriter.build({ blocks: 'no-es-array' }); }, { code: 'DOCXW_BAD_INPUT' });
  await assert.rejects(function () { return docxWriter.build({ blocks: [{ type: 'diagrama', text: 'x' }] }); }, { code: 'DOCXW_BAD_INPUT' });
  await assert.rejects(function () { return docxWriter.build({ blocks: [{ type: 'table', headers: 'no', rows: [] }] }); }, { code: 'DOCXW_BAD_INPUT' });
  await assert.rejects(function () { return docxWriter.build({ blocks: [{ type: 'table', headers: [], rows: 'no' }] }); }, { code: 'DOCXW_BAD_INPUT' });
  await assert.rejects(function () { return docxWriter.buildFromSections('no-es-array'); }, { code: 'DOCXW_BAD_INPUT' });
});

test('escribe %TEMP%\\kilo\\dtest.docx y dtest-xss.docx para verificacion externa', async function () {
  const dir = path.join(os.tmpdir(), 'kilo');
  fs.mkdirSync(dir, { recursive: true });
  const good = await docxWriter.build(FULL_DOC);
  fs.writeFileSync(path.join(dir, 'dtest.docx'), good);
  const xss = await docxWriter.build({
    title: 'Doc de Prueba',
    blocks: [
      { type: 'p', text: '<script>alert("xss \u00f1")</script> & <b>negrita</b> fin' },
      { type: 'table', headers: ['Nota'], rows: [['<img src=x onerror=esc>']] }
    ]
  });
  fs.writeFileSync(path.join(dir, 'dtest-xss.docx'), xss);
  const doc = (await parts(xss))['word/document.xml'];
  assert.ok(doc.includes('&lt;script&gt;'), '<script> sale escapado como texto');
  assert.ok(!/<w:t[^>]*>[^<]*<script/.test(doc), 'ningun w:t contiene una etiqueta script cruda');
  assert.ok(fs.statSync(path.join(dir, 'dtest.docx')).size > 1000, 'dtest.docx escrito en disco');
});

test('round-trip estable: dos builds del mismo doc producen bytes ID\u00c9NTICOS', async function () {
  const a = await docxWriter.build(FULL_DOC);
  const b = await docxWriter.build(FULL_DOC);
  assert.deepStrictEqual(a, b, 'mismos bytes con meta.date expl\u00edcita');
  // Sin fecha: epoch fijo (mismo contrato determinista que export.zip).
  const c = await docxWriter.build({ title: 'T', blocks: [{ type: 'p', text: 'x' }] });
  const d = await docxWriter.build({ title: 'T', blocks: [{ type: 'p', text: 'x' }] });
  assert.deepStrictEqual(c, d, 'mismos bytes con default determinista');
});

test('tabla con 50 filas: w:tr count = 51 y celdas null -> vac\u00edo sin romperse', async function () {
  const rows = [];
  for (let i = 0; i < 50; i++) { rows.push(['MP-' + i, i % 7 === 0 ? null : i * 0.1, i % 3 === 0 ? undefined : 'ok']); }
  const bytes = await docxWriter.build({
    blocks: [{ type: 'table', headers: ['Punto', 'mpy', 'Estado'], rows: rows }]
  });
  const doc = (await parts(bytes))['word/document.xml'];
  const trCount = (doc.match(/<w:tr(?:\s|>)/g) || []).length;
  assert.strictEqual(trCount, 51, '50 filas de datos + 1 fila de encabezado');
  assert.ok(!doc.includes('null'), 'null no se serializa como texto en las celdas');
  assert.ok(doc.includes('<w:t xml:space="preserve"></w:t>'), 'celda null -> w:t vac\u00edo');
  assert.ok(doc.includes('MP-49'), '\u00faltima fila presente');
});