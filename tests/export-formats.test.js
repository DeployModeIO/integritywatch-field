/* IntegrityWatch Field — export.reportFormats (P3-c1): capa de salida sobre un
   modelo T-09 REAL generado en el harness con el seed demo (mismo patrón de
   tests/report-t09.test.js: NOW fijo 2026-09-15, build now 2026-11-03T12:00:00Z,
   t traducida desde src/i18n/locales/es.js). Cubre: aplanado de hojas con
   nombres sanitizados/únicos y KPIs formateados (Intl es, <=3 decimales),
   round-trip xlsx contra IW.ingest.xlsx + namelist OOXML via zip.unpack, docx
   con el título del informe en word/document.xml y determinismo byte a byte
   (epoch fijo heredado de zip), csv BOM+';' releído por IW.ingest.csv.parse,
   xml bajo la raíz 'informe' recuperado por IW.ingest.formats readAllRows,
   json deepEqual sin mutación, pdf → action print sin generar nada, formato
   desconocido → RF_BAD_FORMAT y filename '../malicioso' sanitizado.
   NO corre el suite completo: solo este archivo (hermanas en paralelo). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

require('../src/calc/units.js');
require('../src/calc/apm.js');
require('../src/data/standards.js');
const dbMemory = require('../src/core/dbMemory.js');
const storeApi = require('../src/core/store.js');
const seed = require('../src/data/seed.js');
require('../src/reports/model.js');
require('../src/reports/registry.js');
const modelT09 = require('../src/reports/model-t09.js');
const es = require('../src/i18n/locales/es.js');

const formats = require('../src/export/reportFormats.js');
const zip = require('../src/export/zip.js');
require('../src/ingest/xlsx.js');
require('../src/ingest/csv.js');
require('../src/ingest/formats.js');

const IW = globalThis.IW;
const BOM = '\uFEFF';
const SEED_NOW = '2026-09-15T00:00:00.000Z';
const BUILD_NOW = '2026-11-03T12:00:00.000Z';

function seededRepos() {
  const store = storeApi.create(dbMemory.create());
  return seed.demo(store, { nowISO: SEED_NOW }).then(() => store);
}

function resolveKey(obj, dotted) {
  return dotted.split('.').reduce((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), obj);
}

// t al estilo de la UI: undefined si la clave no existe (tr cae a la clave cruda).
const t = (key) => {
  const v = resolveKey(es, key);
  return typeof v === 'string' ? v : undefined;
};

const OPTS = { t, locale: 'es' };

// Hojas esperadas del T-09 completo (nombres = título traducido, sin []:*?/\
// y truncados a 31; kpiRow fijo 'KPIs'; el resto de tipos → 'Metadatos' final):
const EXPECTED_SHEETS = [
  'KPIs',
  'Activos eventos, MTBF, MTTR y d',
  'Pareto de causas de fallo',
  'MTBF mensual',
  'Acciones para los peores activo',
  'Metadatos'
];
// Goldenes Intl es (maximumFractionDigits 3, verificados en Node 24):
// 99.31069958847736 → '99,311' · 1599.777777777778 → '1599,778'
// 80.22222222222221 → '80,222' (MTTR medio all-sector, GOLDEN_KPIS[2] de T-09)
// 0.0023148148148148147 → '0,002'
const EXPECTED_KPI_ROWS = [
  ['Disponibilidad', '99,311', '%'],
  ['MTBF', '1599,778', 'h'],
  ['MTTR', '80,222', 'h'],
  ['OEE', '99,311', '%'],
  ['Tasa de fallos en la ventana', '0,002', '1/h']
];

async function buildModel() {
  const repos = await seededRepos();
  return modelT09.buildT09Model({ repos, t: (k) => k, now: BUILD_NOW });
}

// Fuente compatible con IW.ingest.formats: {name, size(bytes), slice}.
function fakeTextFile(text, name) {
  const bytes = new TextEncoder().encode(text).length;
  return { name: name || 'datos.txt', size: bytes, slice(start, end) { return text.slice(start, end); } };
}

function decodedZip(bytes) {
  return zip.unpack(bytes).then((entries) => {
    const byName = {};
    entries.forEach((e) => { byName[e.name] = e; });
    return byName;
  });
}

// ---------------------------------------------------------------------------
// flatten
// ---------------------------------------------------------------------------

test('flatten T-09: hojas nombradas y únicas, KPIs formateados, csv/xml/jsonObject', async () => {
  const model = await buildModel();
  const f = formats.flatten(model, OPTS);

  assert.deepStrictEqual(f.sheets.map((s) => s.name), EXPECTED_SHEETS);
  assert.strictEqual(f.jsonObject, model, 'jsonObject es el modelo TAL CUAL (referencia, sin mutación)');

  const kpis = f.sheets.find((s) => s.name === 'KPIs');
  assert.deepStrictEqual(kpis.rows, EXPECTED_KPI_ROWS);

  const assets = f.sheets.find((s) => s.name === EXPECTED_SHEETS[1]);
  assert.deepStrictEqual(assets.rows[0], ['Código de activo', 'Categoría', 'Eventos', 'MTBF', 'MTTR', 'Disponibilidad']);
  assert.deepStrictEqual(assets.rows[1], ['PMP-02', 'pump', '3', '711,333', '8,667', '98,796']);

  const chart = f.sheets.find((s) => s.name === 'MTBF mensual');
  assert.deepStrictEqual(chart.rows[0], ['Mes', 'MTBF', 'etiqueta']);
  assert.deepStrictEqual(chart.rows[1], ['1', '343', '2026-04']);
  assert.deepStrictEqual(chart.rows[6], ['6', '226,667', '2026-09']);

  const meta = f.sheets.find((s) => s.name === 'Metadatos');
  assert.deepStrictEqual(meta.rows[0], [t('reports.t09Title'), '']);
  assert.deepStrictEqual(meta.rows[1], ['Generado', '2026-11-03T12:00:00.000Z']);
  assert.strictEqual(meta.rows[2][0], t('reports.standardsApplied'));
  assert.ok(meta.rows[2][1].startsWith('ISO 55000 —') && meta.rows[2][1].includes('ISO 14224 —'));
  assert.strictEqual(meta.rows[3][0], t('reports.disclaimer'), 'disclaimer de model.disclaimer va a Metadatos');

  // CSV: BOM + ';' con una fila de título separadora por hoja.
  assert.strictEqual(f.csvText.charCodeAt(0), 0xFEFF);
  assert.ok(f.csvText.includes('Indicadores clave' + '\r\n'), 'fila separadora con el título traducido del kpiRow');
  assert.ok(f.csvText.includes('Metadatos\r\n'));
  assert.ok(f.csvText.endsWith('\r\n'));

  // XML: raíz 'informe' con el modelo CRUDO (claves sanitizadas por xmlWriter).
  assert.ok(f.xmlString.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(f.xmlString.includes('<informe>'));
  assert.ok(f.xmlString.includes('<secciones>'));
  assert.ok(f.xmlString.includes('<generatedAtISO>2026-11-03T12:00:00.000Z</generatedAtISO>'));
  assert.ok(!f.xmlString.includes('99,311'), 'el XML no formatea: lleva los doubles crudos del modelo');
});

test('flatten: colisión de títulos se resuelve con sufijo único', async () => {
  const dup = {
    meta: { titleKey: 'x' },
    sections: [
      { type: 'table', titleKey: 'Dup', columns: [{ key: 'k', labelKey: 'kk' }], rows: [{ k: 1 }] },
      { type: 'table', titleKey: 'Dup', columns: [{ key: 'k', labelKey: 'kk' }], rows: [{ k: 2 }] }
    ]
  };
  const f = formats.flatten(dup, {});
  assert.deepStrictEqual(f.sheets.map((s) => s.name), ['Dup', 'Dup 2']);
});

// ---------------------------------------------------------------------------
// produce — xlsx
// ---------------------------------------------------------------------------

test("produce('xlsx'): hojas esperadas vía IW.ingest.xlsx, KPI disponibilidad formateado y namelist OOXML", async () => {
  const model = await buildModel();
  const out = await formats.produce(model, 'xlsx', { ...OPTS, filename: 'T09' });
  assert.strictEqual(out.format, 'xlsx');
  assert.strictEqual(out.filename, 'T09.xlsx');
  assert.strictEqual(out.mime, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.ok(out.data instanceof Uint8Array);

  const listed = await IW.ingest.xlsx.listSheets(out.data);
  assert.deepStrictEqual(listed.map((s) => s.name), EXPECTED_SHEETS);

  const kpi = await IW.ingest.xlsx.read(out.data, { sheet: 'KPIs' });
  assert.deepStrictEqual(kpi.rows, EXPECTED_KPI_ROWS);
  assert.deepStrictEqual(kpi.warnings, [], 'el lector propio no emite warnings sobre nuestro libro');

  const parts = await decodedZip(out.data);
  for (const p of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml']) {
    assert.ok(parts[p], 'falta la parte ' + p);
  }
  for (let i = 1; i <= EXPECTED_SHEETS.length; i++) {
    assert.ok(parts['xl/worksheets/sheet' + i + '.xml'], 'falta sheet' + i + '.xml');
  }
});

// ---------------------------------------------------------------------------
// produce — docx + determinismo
// ---------------------------------------------------------------------------

test("produce('docx'): document.xml trae el título del informe; xlsx y docx son byte-idénticos entre runs", async () => {
  const model = await buildModel();
  const out = await formats.produce(model, 'docx', { ...OPTS, filename: 'T09' });
  assert.strictEqual(out.filename, 'T09.docx');
  assert.strictEqual(out.mime, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  const parts = await decodedZip(out.data);
  assert.ok(parts['word/document.xml'], 'partes OOXML de Word presentes');
  const xml = new TextDecoder().decode(parts['word/document.xml'].data);
  assert.ok(xml.includes('Confiabilidad y disponibilidad de activos'), 'título traducido del cover en el documento');

  // Determinismo: ni produce ni los zip hermanos tocan Date.now (epoch fijo).
  const again = await formats.produce(model, 'docx', { ...OPTS, filename: 'T09' });
  assert.strictEqual(Buffer.compare(Buffer.from(out.data), Buffer.from(again.data)), 0, 'docx: dos produce idénticos byte a byte');
  const x1 = await formats.produce(model, 'xlsx', OPTS);
  const x2 = await formats.produce(model, 'xlsx', OPTS);
  assert.strictEqual(Buffer.compare(Buffer.from(x1.data), Buffer.from(x2.data)), 0, 'xlsx: dos produce idénticos byte a byte');
});

// ---------------------------------------------------------------------------
// produce — csv / xml / json
// ---------------------------------------------------------------------------

test("produce('csv'): BOM + ';' y round-trip parseable por IW.ingest.csv.parse", async () => {
  const model = await buildModel();
  const out = await formats.produce(model, 'csv', { ...OPTS, filename: 'T09' });
  assert.strictEqual(out.filename, 'T09.csv');
  assert.strictEqual(out.mime, 'text/csv');
  assert.strictEqual(out.data.charCodeAt(0), 0xFEFF, 'empieza con BOM');

  const parsed = IW.ingest.csv.parse(out.data.slice(1), { delimiter: ';' });
  assert.deepStrictEqual(parsed.headers, ['Indicadores clave'], 'primera fila = título separador del bloque KPIs');
  assert.ok(parsed.rows.length > 30, 'filas tabulares presentes, got ' + parsed.rows.length);
  assert.ok(parsed.rows.some((r) => r[0] === 'Disponibilidad' && r[1] === '99,311'), 'KPI formateado releído en el CSV');
});

test("produce('xml'): formats readRows('xml') recupera la raíz informe con sus secciones", async () => {
  const model = await buildModel();
  const out = await formats.produce(model, 'xml', { ...OPTS, filename: 'T09' });
  assert.strictEqual(out.filename, 'T09.xml');
  assert.strictEqual(out.mime, 'application/xml');
  assert.ok(out.data.includes('<informe>'));

  const read = await IW.ingest.formats.readAllRows(fakeTextFile(out.data, 'informe.xml'), { format: 'xml' });
  assert.strictEqual(read.meta.format, 'xml');
  assert.ok(read.meta.headers.includes('type') && read.meta.headers.includes('titleKey'));
  assert.strictEqual(read.rows.length, model.sections.length, 'un nodo <secciones> por sección de la raíz');
  const ti = read.meta.headers.indexOf('type');
  assert.deepStrictEqual(read.rows.map((r) => r.row[ti]), model.sections.map((s) => s.type));
});

test("produce('json'): JSON.parse deepEqual al modelo, sin mutación del original", async () => {
  const model = await buildModel();
  const snapshot = JSON.stringify(model);
  const out = await formats.produce(model, 'json', OPTS);
  assert.strictEqual(out.filename, 'informe.json', 'sin opts.filename → fallback informe + extensión');
  assert.strictEqual(out.mime, 'application/json');
  assert.deepStrictEqual(JSON.parse(out.data), model);
  assert.strictEqual(JSON.stringify(model), snapshot, 'produce no muta el modelo');
});

// ---------------------------------------------------------------------------
// produce — pdf, errores y filename
// ---------------------------------------------------------------------------

test("produce('pdf') no genera: action print; 'rtf' y modelo inválido → errores RF_ tipados", async () => {
  const model = await buildModel();
  const out = await formats.produce(model, 'pdf', OPTS);
  assert.strictEqual(out.format, 'pdf');
  assert.strictEqual(out.action, 'print');
  assert.strictEqual(out.data, undefined, 'pdf no produce bytes: imprime la UI');

  await assert.rejects(() => formats.produce(model, 'rtf', OPTS), (e) => {
    assert.strictEqual(e.code, 'RF_BAD_FORMAT');
    assert.match(e.message, /formato desconocido/);
    return true;
  });
  await assert.rejects(() => formats.produce(null, 'json', OPTS), (e) => e.code === 'RF_BAD_INPUT');
});

test('filename: "../malicioso" queda sanitizado; extensiones conocidas se reemplazan; paths se recortan', async () => {
  const model = await buildModel();
  const evil = await formats.produce(model, 'csv', { filename: '../malicioso' });
  assert.strictEqual(evil.filename, 'malicioso.csv');
  assert.ok(!evil.filename.includes('..') && !evil.filename.includes('/') && !evil.filename.includes('\\'));

  const swap = await formats.produce(model, 'csv', { filename: 'informe.xlsx' });
  assert.strictEqual(swap.filename, 'informe.csv', 'extensión conocida → reemplazada por la del formato');

  const win = await formats.produce(model, 'docx', { filename: 'C:\\ruta\\informe final.docx' });
  assert.strictEqual(win.filename, 'informe final.docx');
});

test('FORMATS/formatsFor: orden canónico y pdf incluido como entrada plana (action print solo en produce)', () => {
  assert.deepStrictEqual(formats.FORMATS, ['pdf', 'csv', 'xlsx', 'docx', 'json', 'xml']);
  const list = formats.formatsFor();
  assert.deepStrictEqual(list, formats.FORMATS);
  assert.ok(list.includes('pdf'));
  assert.notStrictEqual(list, formats.FORMATS, 'formatsFor devuelve una copia, no la constante');
});
