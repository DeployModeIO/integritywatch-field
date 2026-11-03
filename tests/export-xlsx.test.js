/* IntegrityWatch Field — exportador XLSX (P3-b): round-trip contra NUESTRO
   lector (IW.ingest.xlsx), estructura zip OOXML, sanitizado de nombres,
   negrita de cabecera, determinismo y límites. Node 24, sin dependencias.

   Equivalencias del round-trip (documentadas en xlsxWriter.js): boolean →
   0/1 numérico, Date → string ISO, undefined → null. Se comparan con norm().
   Los caracteres de control XML-1.0 inválidos viajan como _xHHHH_ (ECMA-376)
   y tanto nuestro lector leniente como openpyxl 3.1.5 los devuelven
   escapados (verificado): no hay round-trip exacto para esos caracteres —
   el escape garantiza XML bien formado, no re-hidratación.

   Fixture externo: este archivo ESCRIBE %TEMP%\kilo\iw-xlsx-fixture.xlsx con
   contenido fijo y determinista para que python+openpyxl lo valide APARTE
   (fuera del ciclo de Node). El test solo comprueba que quedó en disco. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const zip = require('../src/export/zip.js'); // debe cargar antes que xlsxWriter
const xlsxWriter = require('../src/export/xlsxWriter.js');
const xlsxReader = require('../src/ingest/xlsx.js');

// Valor esperado tras round-trip con las equivalencias documentadas.
function normCell(v) {
  if (v === undefined) { return null; }
  if (v === true) { return 1; }
  if (v === false) { return 0; }
  if (v instanceof Date) { return v.toISOString(); }
  return v;
}
function norm(rows) {
  return rows.map(function (r) { return r.map(normCell); });
}

const REQUIRED_PARTS = [
  '[Content_Types].xml',
  '_rels/.rels',
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  'xl/styles.xml',
  'xl/worksheets/sheet1.xml'
];

// ---------------------------------------------------------------------
// Round-trip duro: lo que escribe TU escritor lo lee TU lector, valor por
// valor, hoja por hoja.
// ---------------------------------------------------------------------

test('round-trip 2 hojas: acentos, ¿ñ, números, nulls, booleanos y Date', async function () {
  const sheets = [
    {
      name: 'Datos',
      rows: [
        ['Identificador', 'Valor', 'Observación', 'Activo', 'Fecha'],
        ['Tubería Ñ—12 ¿qué?', 12.5, null, true, new Date(Date.UTC(2026, 0, 2))],
        ['A&B <v>', -0.001, 'línea1\nlínea2', false, '2026-01-02'],
        ['', 0, '  con espacios  ', null, undefined],
        ['Punto "crítico"', 1048576, 'ñ¿…fin…¡!', true, null]
      ]
    },
    {
      name: 'Notas',
      rows: [
        ['nota'],
        ['primera fila tras cabecera'],
        [null, 'segunda columna suelta']
      ]
    }
  ];

  const bytes = await xlsxWriter.build(sheets);
  assert.ok(bytes instanceof Uint8Array, 'build devuelve Uint8Array');

  const listed = await xlsxReader.listSheets(bytes);
  assert.deepStrictEqual(listed.map(function (s) { return s.name; }), ['Datos', 'Notas']);

  for (let i = 0; i < sheets.length; i++) {
    const got = await xlsxReader.read(bytes, { sheet: i });
    assert.strictEqual(got.name, sheets[i].name, 'nombre de hoja preservado');
    assert.deepStrictEqual(got.rows, norm(sheets[i].rows), 'round-trip exacto en "' + sheets[i].name + '"');
    assert.deepStrictEqual(got.warnings, [], 'el lector no emitió warnings');
    assert.deepStrictEqual(got.dateColumns, [], 'sin formato de fecha: nada se interpreta como fecha');
  }
});

// ---------------------------------------------------------------------
// Estructura del paquete: partes OOXML mínimas con los nombres exactos
// que exige ECMA-376; sin sharedStrings (todo inlineStr).
// ---------------------------------------------------------------------

test('paquete zip: contiene las 6 partes OOXML mínimas + sheet2', async function () {
  const bytes = await xlsxWriter.build([
    { name: 'A', rows: [['x', 1]] },
    { name: 'B', rows: [['y', 2]] }
  ]);
  const entries = await zip.unpack(bytes);
  const names = entries.map(function (e) { return e.name; }).sort();
  for (const part of REQUIRED_PARTS) {
    assert.ok(names.includes(part), 'falta la parte ' + part);
  }
  assert.ok(names.includes('xl/worksheets/sheet2.xml'), 'falta sheet2.xml');
  assert.ok(!names.includes('xl/sharedStrings.xml'), 'inlineStr: no debe existir sharedStrings');
});

test('workbook.xml: r:id coherentes con workbook.xml.rels y nombre escapado', async function () {
  const bytes = await xlsxWriter.build([{ name: 'Hoja & Co.', rows: [['a']] }]);
  const byName = {};
  for (const e of await zip.unpack(bytes)) { byName[e.name] = new TextDecoder().decode(e.data); }
  assert.match(byName['xl/workbook.xml'], /name="Hoja &amp; Co\." sheetId="1" r:id="rId1"/);
  assert.match(byName['xl/_rels/workbook.xml.rels'], /Id="rId1"[^>]*worksheets\/sheet1\.xml/);
  assert.match(byName['xl/_rels/workbook.xml.rels'], /Id="rId2"[^>]*Target="styles\.xml"/);
  assert.match(byName['[Content_Types].xml'], /PartName="\/xl\/worksheets\/sheet1\.xml"/);
  assert.match(byName['_rels/.rels'], /Target="xl\/workbook\.xml"/);
});

// ---------------------------------------------------------------------
// Styles: la fila 1 usa s="1" (negrita) solo si boldHeader (default true)
// ---------------------------------------------------------------------

test('boldHeader: fila 1 con estilo 1 por defecto; sin estilo si boldHeader=false', async function () {
  const withBold = await xlsxWriter.build([{ name: 'H', rows: [['cab'], ['dato', 7]] }]);
  const without = await xlsxWriter.build([{ name: 'H', rows: [['cab'], ['dato', 7]] }], { boldHeader: false });

  const xml1 = new TextDecoder().decode(
    (await zip.unpack(withBold)).find(function (e) { return e.name === 'xl/worksheets/sheet1.xml'; }).data);
  assert.match(xml1, /<row r="1"><c r="A1" s="1"/, 'fila 1 debe usar s="1"');
  assert.match(xml1, /<c r="A2"(?! s=)/, 'A2 sin atributo s');
  assert.match(xml1, /<c r="B2"(?! s=)/, 'B2 sin atributo s');

  const xml2 = new TextDecoder().decode(
    (await zip.unpack(without)).find(function (e) { return e.name === 'xl/worksheets/sheet1.xml'; }).data);
  assert.ok(!/ s="1"/.test(xml2), 'con boldHeader=false ninguna celda usa estilo 1');

  // override por hoja: boldHeader global false + true en una hoja
  const mixed = await xlsxWriter.build(
    [{ name: 'N', rows: [['a']] }, { name: 'B', rows: [['a']], boldHeader: true }],
    { boldHeader: false });
  const parts = await zip.unpack(mixed);
  const xmlN = new TextDecoder().decode(parts.find(function (e) { return e.name === 'xl/worksheets/sheet1.xml'; }).data);
  const xmlB = new TextDecoder().decode(parts.find(function (e) { return e.name === 'xl/worksheets/sheet2.xml'; }).data);
  assert.ok(!/ s="1"/.test(xmlN), 'hoja N sin negrita');
  assert.match(xmlB, /<c r="A1" s="1"/, 'hoja B con negrita por override');

  const stXml = new TextDecoder().decode(
    (await zip.unpack(withBold)).find(function (e) { return e.name === 'xl/styles.xml'; }).data);
  assert.match(stXml, /<cellXfs count="2">/);
  assert.match(stXml, /<b\/>/, 'existe fuente en negrita (fontId 1)');
  assert.match(stXml, /<cellStyle name="Normal" xfId="0" builtinId="0"\/>/, 'estilo Normal declarado (evita warning de openpyxl)');
});

// ---------------------------------------------------------------------
// Sanitizado de nombres de hoja (regla Excel: sin []:*?/\, máx 31)
// ---------------------------------------------------------------------

test('nombres sucios: A/B:C[D]*? se sanitiza y el largo se trunca a 31', async function () {
  const long = 'MuyLarga'.repeat(10); // 80 chars
  const bytes = await xlsxWriter.build([
    { name: 'A/B:C[D]*?', rows: [['x']] },
    { name: long, rows: [['y']] }
  ]);
  const names = (await xlsxReader.listSheets(bytes)).map(function (s) { return s.name; });
  assert.deepStrictEqual(names, ['ABCD', long.slice(0, 31)]);
  for (const n of names) {
    assert.ok(n.length <= 31, 'máximo 31 caracteres: ' + n);
    assert.ok(!/[\[\]:*?/\\]/.test(n), 'sin caracteres prohibidos: ' + n);
  }
});

test('nombres: vacío → "Hoja N" y duplicados tras sanitizar → XLSXW_BAD_INPUT', async function () {
  const bytes = await xlsxWriter.build([
    { name: '', rows: [['a']] },
    { name: '   ', rows: [['b']] }
  ]);
  const names = (await xlsxReader.listSheets(bytes)).map(function (s) { return s.name; });
  assert.deepStrictEqual(names, ['Hoja 1', 'Hoja 2']);

  await assert.rejects(function () {
    return xlsxWriter.build([{ name: 'A/B', rows: [[1]] }, { name: 'A\\B', rows: [[2]] }]);
  }, function (e) { return e.code === 'XLSXW_BAD_INPUT' && /duplicados/.test(e.message); });
});

// ---------------------------------------------------------------------
// Hoja vacía: dimension A1:A1 con 0 filas
// ---------------------------------------------------------------------

test('hoja vacía: dimension A1:A1, <sheetData/> y el lector devuelve 0 filas', async function () {
  const bytes = await xlsxWriter.build([{ name: 'Vacia', rows: [] }]);
  const sh = (await zip.unpack(bytes)).find(function (e) { return e.name === 'xl/worksheets/sheet1.xml'; });
  const xml = new TextDecoder().decode(sh.data);
  assert.match(xml, /<dimension ref="A1:A1"\/>/);
  assert.match(xml, /<sheetData\/>/);
  const got = await xlsxReader.read(bytes, { sheet: 0 });
  assert.strictEqual(got.rows.length, 0);
  assert.strictEqual(got.name, 'Vacia');
});

// ---------------------------------------------------------------------
// colWidths: <cols> con fusión de consecutivas iguales
// ---------------------------------------------------------------------

test('colWidths: emite <cols> fusionando iguales y el round-trip sigue exacto', async function () {
  const rows = [['a', 'b', 'c'], [1, 2, 3]];
  const bytes = await xlsxWriter.build([{ name: 'Anchos', rows: rows, colWidths: [12.5, 12.5, 4.25] }]);
  const sh = (await zip.unpack(bytes)).find(function (e) { return e.name === 'xl/worksheets/sheet1.xml'; });
  const xml = new TextDecoder().decode(sh.data);
  assert.match(xml, /<col min="1" max="2" width="12\.5" customWidth="1"\/>/);
  assert.match(xml, /<col min="3" max="3" width="4\.25" customWidth="1"\/>/);
  const got = await xlsxReader.read(bytes, { sheet: 0 });
  assert.deepStrictEqual(got.rows, rows);
});

// ---------------------------------------------------------------------
// buildFromTable: conveniencia mono-hoja
// ---------------------------------------------------------------------

test('buildFromTable: headers + rows → una hoja con cabecera arriba', async function () {
  const bytes = await xlsxWriter.buildFromTable({
    name: 'Informe',
    headers: ['Pozo', 'PTH mm'],
    rows: [['A-1', 12.5], ['B-2', null]]
  });
  const got = await xlsxReader.read(bytes, { sheet: 0 });
  assert.strictEqual(got.name, 'Informe');
  assert.deepStrictEqual(got.rows, [['Pozo', 'PTH mm'], ['A-1', 12.5], ['B-2', null]]);
  assert.strictEqual((await xlsxReader.listSheets(bytes)).length, 1);

  const def = await xlsxWriter.buildFromTable({ headers: ['h'], rows: [] });
  assert.strictEqual((await xlsxReader.listSheets(def))[0].name, 'Tabla');
});

test('validación de entrada con XLSXW_BAD_INPUT', async function () {
  const cases = [
    function () { return xlsxWriter.buildFromTable({ headers: 'no', rows: [] }); },
    function () { return xlsxWriter.buildFromTable(null); },
    function () { return xlsxWriter.build([]); },
    function () { return xlsxWriter.build('no'); },
    function () { return xlsxWriter.build([{ name: 'a', rows: 'no' }]); },
    function () { return xlsxWriter.build([{ name: 'a', rows: [[NaN]] }]); },
    function () { return xlsxWriter.build([{ name: 'a', rows: [[Infinity]] }]); },
    function () { return xlsxWriter.build([{ name: 'a', rows: [{}] }]); },
    function () { return xlsxWriter.build([{ name: 'a', rows: [[{ x: 1 }]] }]); },
    function () { return xlsxWriter.build([{ name: 'a', rows: [['x']] }], { startId: 0 }); },
    function () { return xlsxWriter.build([{ name: 'a', rows: [['x']] }], { startId: 1.5 }); },
    function () { return xlsxWriter.build([{ name: 'a', rows: [['x']], colWidths: [300] }]); }
  ];
  for (const f of cases) {
    await assert.rejects(f, function (e) { return e.code === 'XLSXW_BAD_INPUT'; },
      'rechazo esperado: ' + f.toString());
  }
});

// ---------------------------------------------------------------------
// Determinismo: mismo input → mismos bytes (zip.pack sorted + epoch fijo)
// ---------------------------------------------------------------------

test('determinismo: build dos veces con el mismo input produce bytes idénticos', async function () {
  const sheets = [
    { name: 'D1', rows: [['ñ', 1.5, null], [true, 'z', 3]], colWidths: [10, 20] },
    { name: 'D2', rows: [] }
  ];
  const a = await xlsxWriter.build(sheets);
  const b = await xlsxWriter.build(sheets);
  assert.deepStrictEqual(a, b, 'bytes idénticos entre dos llamadas');
});

// ---------------------------------------------------------------------
// Límites documentados: 1 048 576 filas y 16 384 columnas por hoja
// (el tope de filas no se construye por coste; se valida el mecanismo con
// rowLimit bajo y el opt-out rowLimit: Infinity sí acepta más allá del tope)
// ---------------------------------------------------------------------

test('límites: columnas > 16384 y filas > rowLimit se rechazan; rowLimit:Infinity opt-out', async function () {
  const wide = new Array(16385).fill('x');
  await assert.rejects(function () { return xlsxWriter.build([{ name: 'L', rows: [wide] }]); },
    function (e) { return e.code === 'XLSXW_BAD_INPUT' && /columnas/.test(e.message); });

  await assert.rejects(function () {
    return xlsxWriter.build([{ name: 'L', rows: [[1], [2], [3]] }], { rowLimit: 2 });
  }, function (e) { return e.code === 'XLSXW_BAD_INPUT' && /filas/.test(e.message); });

  // opt-out: rowLimit Infinity construye sin límite (solo para estrés).
  assert.strictEqual(xlsxWriter.MAX_ROWS, 1048576);
  const many = [[1]];
  for (let i = 2; i <= 3000; i++) { many.push([i]); }
  const bytes = await xlsxWriter.build([{ name: 'L', rows: many }], { rowLimit: Infinity });
  const got = await xlsxReader.read(bytes, { sheet: 0 });
  assert.strictEqual(got.rows.length, 3000);
});

// ---------------------------------------------------------------------
// Rendimiento / tamaño: 500 filas × 8 columnas ida y vuelta
// ---------------------------------------------------------------------

test('500 filas × 8 columnas: round-trip exacto en < 3 s', async function () {
  const rows = [];
  for (let r = 0; r < 500; r++) {
    rows.push(['pozo-' + r, r * 1.5, 'ñ¿' + r, null, r % 2 === 0, 'texto con "comillas" y & <tags>', -r, 'fila ' + r]);
  }
  const t0 = Date.now();
  const bytes = await xlsxWriter.build([{ name: 'Bulk', rows: rows }]);
  const got = await xlsxReader.read(bytes, { sheet: 0 });
  const dt = Date.now() - t0;
  assert.deepStrictEqual(got.rows, norm(rows), '500×8 idéntico tras round-trip');
  assert.ok(bytes.length < 400 * 1024, 'tamaño razonable (<400 KB), fue ' + bytes.length);
  assert.ok(dt < 3000, 'ida y vuelta en < 3 s, fue ' + dt + ' ms');
});

// ---------------------------------------------------------------------
// Escapes XML/_xHHHH_ visibles en el XML de la hoja
// ---------------------------------------------------------------------

test('escapes: &<> quedan como entidades y los control chars como _xHHHH_', async function () {
  const bytes = await xlsxWriter.build([{ name: 'E', rows: [['a & b <c> "d"', 'tab\there\x01\x1Fy', '_x0001_literal']] }]);
  const sh = (await zip.unpack(bytes)).find(function (e) { return e.name === 'xl/worksheets/sheet1.xml'; });
  const xml = new TextDecoder().decode(sh.data);
  assert.ok(xml.includes('a &amp; b &lt;c&gt; "d"'), 'entidades XML presentes (comilla literal en texto es legal)');
  assert.ok(/tab\there_x0001__x001F_y/.test(xml), '\\t literal y control chars vía _xHHHH_');
  assert.ok(xml.includes('_x005F_x0001_literal'), 'lookalike protegido con _x005F_');
  const got = await xlsxReader.read(bytes, { sheet: 0 });
  // Lector propio: &<> re-hidratados; _xHHHH_ queda literal (asimetría documentada).
  assert.deepStrictEqual(got.rows, [['a & b <c> "d"', 'tab\there_x0001__x001F_y', '_x005F_x0001_literal']]);
});

// ---------------------------------------------------------------------
// Referencias A1: columna 26+ sigue siendo AA, AB...
// ---------------------------------------------------------------------

test('refs A1 correctos: 27 columnas → última referencia AA1 y dimension A1:AA1', async function () {
  const row = new Array(27).fill(0);
  row[25] = 'Z'; row[26] = 'AA';
  const bytes = await xlsxWriter.build([{ name: 'R', rows: [row] }]);
  const sh = (await zip.unpack(bytes)).find(function (e) { return e.name === 'xl/worksheets/sheet1.xml'; });
  const xml = new TextDecoder().decode(sh.data);
  assert.ok(xml.includes('<c r="Z1"'), 'ref Z1 presente');
  assert.ok(xml.includes('<c r="AA1"'), 'ref AA1 presente');
  assert.ok(!xml.includes('<c r="AB1"'), 'AB1 no debe existir (27 cols = A..AA)');
  assert.match(xml, /<dimension ref="A1:AA1"\/>/);
  const got = await xlsxReader.read(bytes, { sheet: 0 });
  assert.strictEqual(got.rows[0].length, 27);
  assert.strictEqual(got.rows[0][26], 'AA');
  // 28 columnas para forzar AB
  const row2 = new Array(28).fill(0);
  const b2 = await xlsxWriter.build([{ name: 'R', rows: [row2] }]);
  const x2 = new TextDecoder().decode((await zip.unpack(b2)).find(function (e) { return e.name === 'xl/worksheets/sheet1.xml'; }).data);
  assert.ok(x2.includes('<c r="AB1"'), 'con 28 columnas sí hay AB1');
});

// ---------------------------------------------------------------------
// Fixture externo para verificación con openpyxl (se ejecuta APARTE, no
// dentro de Node): ruta fija %TEMP%\kilo\iw-xlsx-fixture.xlsx
// ---------------------------------------------------------------------

test('fixture openpyxl: escribe %TEMP%\\kilo\\iw-xlsx-fixture.xlsx determinista', async function () {
  const dir = path.join(os.tmpdir(), 'kilo');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'iw-xlsx-fixture.xlsx');
  const bytes = await xlsxWriter.build([
    { name: 'Datos', rows: [['Total', 'Cantidad'], ['Ñoño ¿qué?', 12.5], [null, 1], ['A&B <v>', 3]] },
    { name: 'Notas', rows: [['nota'], ['control literal', true]] }
  ]);
  fs.writeFileSync(file, bytes);
  assert.ok(fs.statSync(file).size > 0, 'el fixture quedó en disco para el chequeo openpyxl externo');
});
