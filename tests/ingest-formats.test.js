/* IntegrityWatch Field — ingest/formats tests
   Capa "archivo -> filas" para la UI y commit.js: deteccion por extension y
   contenido, lectura unificada de csv/tsv/xlsx/json/jsonl/xml/witsml con
   meta.headers, warnings (SHEET_DEFAULT, fila null en jsonl), cancelacion y
   progreso transparentes. Usa los fixtures reales + fuentes sinteticas sobre
   la interfaz minima {name, size, slice} (string o bytes, como en
   ingest-chunked.test.js). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../src/calc/corrosion.js');
const csv = require('../src/ingest/csv.js');
const xlsx = require('../src/ingest/xlsx.js');
const witsmlLite = require('../src/ingest/witsmlLite.js');
const formats = require('../src/ingest/formats.js');

const FIX_PATH = (name) => path.join(__dirname, 'fixtures', name);
const FIX = (name) => fs.readFileSync(FIX_PATH(name));
const FIX_TXT = (name) => fs.readFileSync(FIX_PATH(name), 'utf8');

// slice devuelve string YA decodificado (camino texto: csv/jsonl/xml/witsml).
function makeTextFileLike(name, str) {
  const buf = Buffer.isBuffer(str) ? str : Buffer.from(String(str), 'utf8');
  return {
    name: name,
    size: buf.length,
    slice(start, end) {
      return Promise.resolve(buf.subarray(start, Math.min(end, buf.length)).toString('utf8'));
    }
  };
}

// slice devuelve Uint8Array (camino binario: xlsx).
function makeBytesFileLike(name, buf) {
  return {
    name: name,
    size: buf.length,
    slice(start, end) {
      return Promise.resolve(buf.subarray(start, Math.min(end, buf.length)));
    }
  };
}

// FAKE Blob del navegador: slice() devuelve un OBJETO Blob (no una Promise),
// con arrayBuffer() y text() como en la spec File/Blob real.
function makeFakeBlob(bytes) {
  return {
    size: bytes.length,
    type: '',
    arrayBuffer() {
      return Promise.resolve(new Uint8Array(bytes).buffer); // ArrayBuffer independiente
    },
    text() {
      return Promise.resolve(Buffer.from(bytes).toString('utf8'));
    }
  };
}

// FAKE File del navegador: {name,size,type,slice(start,end)->Blob,
// arrayBuffer()->Promise<ArrayBuffer>}. Imite EXACTAMENTE la interfaz que
// llega desde <input type=file> (slices sincronos devolviendo Blob).
// Acepta Buffer o string (se codifica UTF-8 como haria el navegador).
function makeFakeFile(name, content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
  return {
    name: name,
    size: buf.length,
    type: '',
    slice(start, end) {
      const a = Math.max(0, start | 0);
      const b = end === undefined ? buf.length : Math.min(buf.length, end | 0);
      return makeFakeBlob(buf.subarray(a, Math.max(a, b)));
    },
    arrayBuffer() {
      return Promise.resolve(new Uint8Array(buf).buffer);
    }
  };
}

async function collect(iter) {
  const out = [];
  for await (const rec of iter) out.push(rec);
  return out;
}

// ---------------------------------------------------------------------------
// detectFormat: extension y contenido XML
// ---------------------------------------------------------------------------

test('detectFormat por extension: .csv/.tsv/.txt/.xlsx/.xlsm/.json/.jsonl/.ndjson (case-insensitive, token suelto)', async () => {
  assert.equal(await formats.detectFormat(makeTextFileLike('a.csv', 'x')), 'csv');
  assert.equal(await formats.detectFormat(makeTextFileLike('a.CSV', 'x')), 'csv');
  assert.equal(await formats.detectFormat(makeTextFileLike('a.tsv', 'x')), 'tsv');
  assert.equal(await formats.detectFormat(makeTextFileLike('a.txt', 'x')), 'csv');
  assert.equal(await formats.detectFormat(makeTextFileLike('a.xlsx', 'x')), 'xlsx');
  assert.equal(await formats.detectFormat(makeTextFileLike('a.XLSM', 'x')), 'xlsx');
  assert.equal(await formats.detectFormat(makeTextFileLike('a.json', 'x')), 'json');
  assert.equal(await formats.detectFormat(makeTextFileLike('a.jsonl', 'x')), 'jsonl');
  assert.equal(await formats.detectFormat(makeTextFileLike('a.ndjson', 'x')), 'jsonl');
  assert.equal(await formats.detectFormat(makeTextFileLike('sin-extension', 'x')), null);
  // nameOrExt suelto manda sobre el nombre del archivo
  assert.equal(await formats.detectFormat(makeTextFileLike('blob', 'x'), '.tsv'), 'tsv');
  assert.equal(await formats.detectFormat(makeTextFileLike('blob', 'x'), 'xlsx'), 'xlsx');
});

test('detectFormat por contenido XML: witsml (raiz o namespace) vs generico, con los fixtures', async () => {
  // inspecciones-generico.xml: raiz <registros>, sin 'WITSML' -> xml
  assert.equal(await formats.detectFormat(makeTextFileLike('inspecciones-generico.xml', FIX_TXT('inspecciones-generico.xml'))), 'xml');
  // sample-witsml.xml: raiz <iw-lite> sin token WITSML -> la regla de contenido
  // lo clasifica xml (el import de lecturas pasa format:'witsml' explicito).
  assert.equal(await formats.detectFormat(makeTextFileLike('sample-witsml.xml', FIX_TXT('sample-witsml.xml'))), 'xml');
  // raiz WITSML
  assert.equal(await formats.detectFormat(makeTextFileLike('r.xml', '<WITSML><Well</WITSML>')), 'witsml');
  // namespace/prefijo witsml:
  assert.equal(await formats.detectFormat(makeTextFileLike('p.xml', '<witsml:iw-lite><witsml:well uid="1"/></witsml:iw-lite>')), 'witsml');
  assert.equal(await formats.detectFormat(makeTextFileLike('n.xml', '<?xml version="1.0"?><root xmlns="http://www.witsml.org/schemas/131">')), 'witsml');
});

test('detectFormat rechaza fuente sin interface minima con FORMATS_BAD_SOURCE', async () => {
  await assert.rejects(() => formats.detectFormat({ size: 10 }), (err) => err.code === formats.BAD_SOURCE);
});

// ---------------------------------------------------------------------------
// xlsx: dedupe-3, selection de hoja y SHEET_DEFAULT
// ---------------------------------------------------------------------------

test('xlsx dedupe-3: 10 filas de datos, headers de la fila 1 y rowNo desde 2', async () => {
  const out = await formats.readAllRows(makeBytesFileLike('dedupe-3.xlsx', FIX('dedupe-3.xlsx')));
  assert.equal(out.meta.format, 'xlsx');
  assert.equal(out.meta.sheetName, 'Coupons');
  assert.deepEqual(out.meta.headers, ['Cupón', 'Fecha de extracción', 'Pérdida de masa (g/m²)', 'Material']);
  assert.equal(out.rows.length, 10); // el lector NO deduplica (eso es de commit.js)
  assert.deepEqual(out.rows[0], { row: ['CP-01', '2026-03-01', 12.5, 'Acero al carbón'], rowNo: 2 });
  assert.deepEqual(out.rows[9].row, ['CP-06', '2026-04-01', 15.2, 'Monel 400']);
  assert.deepEqual(out.meta.warnings, []);
});

test('xlsx dos-hojas con sheet:"Notas": elige la hoja correcta y NO avisa SHEET_DEFAULT', async () => {
  const src = makeBytesFileLike('dos-hojas.xlsx', FIX('dos-hojas.xlsx'));
  const out = await formats.readAllRows(src, { sheet: 'Notas' });
  assert.equal(out.meta.sheetName, 'Notas');
  assert.deepEqual(out.meta.sheets, ['Activos', 'Notas']);
  assert.deepEqual(out.meta.headers, ['Nota', 'Texto con acentuación: presión, temperatura, medición']);
  assert.equal(out.rows.length, 1); // filas 2..n
  assert.deepEqual(out.rows[0].row, ['1', 'Área de transferencia de carga']);
  assert.deepEqual(out.rows[0], { row: ['1', 'Área de transferencia de carga'], rowNo: 2 });
  assert.ok(!out.meta.warnings.some((w) => /SHEET_DEFAULT/.test(w)), 'con sheet explicita no debe haber SHEET_DEFAULT');
});

test('xlsx dos-hojas sin sheet: usa la PRIMERA ("Activos") y avisa SHEET_DEFAULT listando "Notas"', async () => {
  const out = await formats.readAllRows(makeBytesFileLike('dos-hojas.xlsx', FIX('dos-hojas.xlsx')));
  assert.equal(out.meta.sheetName, 'Activos');
  assert.deepEqual(out.meta.sheets, ['Activos', 'Notas']);
  assert.equal(out.rows.length, 3);
  assert.ok(out.meta.warnings.some((w) => /^SHEET_DEFAULT/.test(w) && /"Notas"/.test(w)),
    'warning SHEET_DEFAULT debe listar las demas hojas: ' + JSON.stringify(out.meta.warnings));
});

test('xlsx cancelacion a mitad en activos-2000 -> error CANCELED propagado', async () => {
  const src = makeBytesFileLike('activos-2000.xlsx', FIX('activos-2000.xlsx'));
  let checks = 0;
  let lastRows = 0;
  const err = await formats.readAllRows(src, {
    blockSize: 300,
    onProgress: (p) => { lastRows = p.rows; },
    isCanceled: () => { checks += 1; return checks >= 3 && lastRows >= 500; }
  }).catch((e) => e);
  assert.ok(err instanceof Error, 'debe rechazar con error');
  assert.match(String(err.code), /CANCELED$/);
  assert.ok(lastRows >= 500, 'avance real antes de cancelar (' + lastRows + ' filas)');
});

// ---------------------------------------------------------------------------
// csv / tsv
// ---------------------------------------------------------------------------

test('csv sample-comma: identico a IW.ingest.csv.parse (headers + 5 filas) con lineNo', async () => {
  const text = FIX_TXT('sample-comma.csv');
  const expected = csv.parse(text);
  const out = await formats.readAllRows(makeTextFileLike('sample-comma.csv', text));
  assert.equal(out.meta.format, 'csv');
  assert.deepEqual(out.meta.headers, expected.headers);
  assert.deepEqual(out.rows.map((r) => r.row), expected.rows);
  assert.equal(out.rows.length, 5);
  assert.equal(out.rows[0].lineNo, 2);
});

test('tsv autodetect por nombre (.tsv fuerza tab; .txt autodetecta), headers y 2 filas', async () => {
  const text = FIX_TXT('sample-tab.tsv');
  const tsv = await formats.readAllRows(makeTextFileLike('muestra.tsv', text));
  assert.equal(tsv.meta.format, 'tsv');
  assert.deepEqual(tsv.meta.headers, ['punto', 'fecha', 'wi', 'wf', 'área', 'días']);
  assert.equal(tsv.rows.length, 2);
  assert.deepEqual(tsv.rows[0].row, ['MP-CORR-003', '2026-09-01', '5200', '4980', '2.0', '30']);
  // .txt -> csv con autodetect del delimitador (tab gana por mayoria)
  const txt = await formats.readAllRows(makeTextFileLike('muestra.txt', text));
  assert.equal(txt.meta.format, 'csv');
  assert.deepEqual(txt.meta.headers, tsv.meta.headers);
  assert.deepEqual(txt.rows.map((r) => r.row), tsv.rows.map((r) => r.row));
});

// ---------------------------------------------------------------------------
// json
// ---------------------------------------------------------------------------

test('json array de objetos: headers = union en orden de aparicion, anidados con stringify estable, nulls', async () => {
  const data = [
    { a: 1, b: { y: 2, x: 3 }, n: null },
    { a: 2, c: [1, 2], b: { x: 0, y: 9 } },
    { a: 3 }
  ];
  const out = await formats.readAllRows(makeTextFileLike('datos.json', JSON.stringify(data)));
  assert.equal(out.meta.format, 'json');
  assert.deepEqual(out.meta.headers, ['a', 'b', 'n', 'c']); // union, primera aparicion
  assert.deepEqual(out.rows[0].row, [1, '{"x":3,"y":2}', null, null]);
  assert.deepEqual(out.rows[1].row, [2, '{"x":0,"y":9}', null, '[1,2]']);
  assert.deepEqual(out.rows[2].row, [3, null, null, null]);
  assert.deepEqual(out.rows.map((r) => r.rowNo), [1, 2, 3]);
  assert.deepEqual(out.meta.warnings, []);
});

test('json 11 MB sintético -> JSON_TOO_LARGE con hint "usa JSONL"', async () => {
  const big = Buffer.alloc(11 * 1024 * 1024, 0x20); // 11 MiB; ni hace falta leerlo
  await assert.rejects(
    () => formats.readAllRows(makeBytesFileLike('gigante.json', big)),
    (err) => {
      assert.equal(err.code, formats.JSON_TOO_LARGE);
      assert.equal(err.code, 'JSON_TOO_LARGE');
      assert.match(String(err.hint), /JSONL/);
      return true;
    }
  );
});

test('json mal formado -> FORMATS_BAD_JSON tipado', async () => {
  await assert.rejects(
    () => formats.readAllRows(makeTextFileLike('roto.json', '{"a":1,}[')),
    (err) => err.code === formats.BAD_JSON
  );
});

// ---------------------------------------------------------------------------
// jsonl
// ---------------------------------------------------------------------------

test('jsonl 1000 lineas con 1 basura y clave nueva tardia: fila null + warnings, cede el loop, progreso con bytesDone', async () => {
  const lines = [];
  for (let i = 1; i <= 1000; i++) {
    if (i === 10) { lines.push(JSON.stringify({ i: i, v: 'x' + i, extra: true })); continue; }
    if (i === 42) { lines.push('{"i":42,"v":"sin cerrar'); continue; } // basura: llave sin cerrar
    if (i === 200) { lines.push(JSON.stringify({ i: i, v: 'x' + i, late: 'z' })); continue; } // clave fuera de ventana
    lines.push(JSON.stringify({ i: i, v: 'x' + i }));
  }
  const text = lines.join('\n') + '\n';
  const src = makeTextFileLike('flujo.jsonl', text);

  let ticks = 0;
  const tickId = setInterval(() => { ticks += 1; }, 0);
  const progress = [];
  const out = await formats.readAllRows(src, {
    blockSize: 50,
    onProgress: (p) => progress.push(p)
  });
  clearInterval(tickId);

  assert.equal(out.meta.format, 'jsonl');
  assert.deepEqual(out.meta.headers, ['i', 'v', 'extra']); // 'extra' entro en ventana (linea 10), 'late' NO
  assert.equal(out.rows.length, 1000);
  const valid = out.rows.filter((r) => r.row !== null);
  assert.equal(valid.length, 999);
  const bad = out.rows.filter((r) => r.row === null);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].lineNo, 42);
  assert.ok(out.meta.warnings.some((w) => /linea 42/.test(w)), 'warning de la linea basura: ' + JSON.stringify(out.meta.warnings.slice(0, 3)));
  assert.ok(out.meta.warnings.some((w) => /linea 200/.test(w) && /descart/.test(w)), 'clave nueva tardia descartada con warning');
  const row200 = out.rows.find((r) => r.lineNo === 200);
  assert.deepEqual(row200.row, [200, 'x200', null]); // 'late' descartado, 'extra' ausente -> null
  // cesion del loop: el timer externo corrio DURANTE la lectura
  assert.ok(ticks > 0, 'el loop cedio: el timer externo se ejecuto ' + ticks + ' veces');
  // progreso transparente: >=19 eventos con rows y bytesDone
  assert.ok(progress.length >= 19, 'eventos de progreso: ' + progress.length);
  assert.equal(progress[progress.length - 1].rows, 1000);
  assert.equal(progress[progress.length - 1].bytesDone, src.size);
});

// ---------------------------------------------------------------------------
// xml generico
// ---------------------------------------------------------------------------

test('xml generico inspecciones-generico.xml: 3 filas, headers de campos, vacio con <x/> y acentos intactos', async () => {
  const out = await formats.readAllRows(makeTextFileLike('inspecciones-generico.xml', FIX_TXT('inspecciones-generico.xml')));
  assert.equal(out.meta.format, 'xml');
  assert.deepEqual(out.meta.headers, ['sistema', 'fecha', 'tipo', 'resultado', 'observaciones']);
  assert.equal(out.rows.length, 3);
  assert.deepEqual(out.rows[0].row, ['Oleoducto Transversal Norte', '2026-02-10', 'caminata', 'Normal', 'Sin novedades en derechos de vía']);
  assert.deepEqual(out.rows[1].row, ['Oleoducto Transversal Norte', '10/03/2026', 'inspección', 'Anomalía', 'Cruce con zanja de 1,2 m al km 84,5']);
  assert.deepEqual(out.rows[2].row, ['Oleoducto Transversal Norte', '45778', 'caminata', 'Normal', '']); // <observaciones/> -> ''
  assert.deepEqual(out.rows.map((r) => r.rowNo), [1, 2, 3]);
});

test('xml generico inline: entidades decodificadas, <x></x> vacio, atributos ignorados, prefijo de namespace local', async () => {
  const xml = '<?xml version="1.0"?>' +
    '<rows>' +
    '<row id="R1"><a>P&#233;rez</a><b>x &amp; y</b><c></c></row>' +
    '<row><a>seg&uacute;nda</a><b>2</b><c>hija<b>anidada</b></c></row>' +
    '</rows>';
  const out = await formats.readAllRows(makeTextFileLike('inline.xml', xml), { format: 'xml' });
  assert.deepEqual(out.meta.headers, ['a', 'b', 'c']);
  assert.equal(out.rows[0].row[0], 'Pérez');       // referencia numerica
  assert.equal(out.rows[0].row[1], 'x & y');       // &amp; al final
  assert.equal(out.rows[0].row[2], '');            // <c></c> -> ''
  assert.equal(out.rows[1].row[0], 'segúnda');     // entidad nombrada
  assert.equal(out.rows[1].row[2], 'hijaanidada'); // tolerante: texto sin tags anidados
});

// ---------------------------------------------------------------------------
// witsml (solo lecturas)
// ---------------------------------------------------------------------------

test('witsml sample-witsml.xml: meta.targetStore=readings, headers fijos y conteo identico a witsmlLite directo', async () => {
  const text = FIX_TXT('sample-witsml.xml');
  const p = witsmlLite.parse(text);
  const expected = p.channels
    .filter((ch) => !!ch.mpCode)
    .flatMap((ch) => ch.points.filter((pt) => pt.value !== undefined && pt.value !== null))
    .length;
  const out = await formats.readAllRows(makeTextFileLike('sample-witsml.xml', text), { format: 'witsml' });
  assert.equal(out.meta.format, 'witsml');
  assert.equal(out.meta.targetStore, 'readings');
  assert.deepEqual(out.meta.headers, ['code', 'fecha', 'valor', 'unidad', 'source']);
  assert.equal(out.rows.length, expected);
  assert.equal(out.rows.length, 4); // el fixture tiene 1 canal con mpCode y 4 puntos validos
  assert.deepEqual(out.rows[0].row, ['MP-CORR-001', '2026-09-01T00:00:00Z', 3.2, 'mpy', 'import']);
  assert.ok(out.meta.warnings.some((w) => /E_WITSML_POINT/.test(w)), 'el punto sin valor viaja como warning: ' + JSON.stringify(out.meta.warnings));
});

// ---------------------------------------------------------------------------
// errores de formato y registro del modulo
// ---------------------------------------------------------------------------

test('formato no soportado -> FORMATS_UNSUPPORTED_FORMAT; formats se auto-registra en IW.ingest.formats', async () => {
  await assert.rejects(
    () => formats.readRows(makeTextFileLike('dato.parquet', 'x'), { format: 'parquet' }),
    (err) => {
      assert.equal(err.code, formats.UNSUPPORTED_FORMAT);
      assert.match(String(err.code), /^FORMATS_/);
      return true;
    }
  );
  assert.equal(globalThis.IW.ingest.formats, formats);
});

// ---------------------------------------------------------------------------
// File/Blob del navegador (regresión del bug Forms_bad_source en la UI)
// Un File real cumple {name,size,slice->Blob} + arrayBuffer(): chunked ya
// convertia las tajadas Blob via .text()/.arrayBuffer(), pero la rama xlsx
// exijo bytes DIRECTOS y fallaba con FORMATS_BAD_SOURCE.
// ---------------------------------------------------------------------------

test('fake File (navegador) xlsx: readRows da las mismas 10 filas de dedupe-3', async () => {
  const src = makeFakeFile('dedupe-3.xlsx', FIX('dedupe-3.xlsx'));
  const out = await formats.readAllRows(src, { format: 'xlsx' });
  assert.equal(out.meta.format, 'xlsx');
  assert.equal(out.meta.sheetName, 'Coupons');
  assert.deepEqual(out.meta.headers, ['Cupón', 'Fecha de extracción', 'Pérdida de masa (g/m²)', 'Material']);
  assert.equal(out.rows.length, 10);
  assert.deepEqual(out.rows[0], { row: ['CP-01', '2026-03-01', 12.5, 'Acero al carbón'], rowNo: 2 });
  assert.deepEqual(out.rows[9].row, ['CP-06', '2026-04-01', 15.2, 'Monel 400']);
  assert.deepEqual(out.meta.warnings, []);
});

test('fake File (navegador): detectFormat sigue funcionando (por extension y por contenido via tajadas Blob)', async () => {
  assert.equal(await formats.detectFormat(makeFakeFile('dedupe-3.xlsx', FIX('dedupe-3.xlsx'))), 'xlsx');
  assert.equal(await formats.detectFormat(makeFakeFile('muestra.txt', FIX_TXT('sample-comma.csv'))), 'csv');
  // sin extension util: la sonda de contenido lee tajadas Blob -> csv
  assert.equal(await formats.detectFormat(makeFakeFile('subido-sin-extension', FIX_TXT('sample-comma.csv'))), null);
  // xml por contenido sobre fake File
  assert.equal(await formats.detectFormat(makeFakeFile('r.xml', '<WITSML><Well</WITSML>')), 'witsml');
});

test('fake File (navegador): ramas texto csv/json/xml via tajadas Blob sin regresiones', async () => {
  const csvOut = await formats.readAllRows(makeFakeFile('sample-comma.csv', FIX_TXT('sample-comma.csv')));
  assert.equal(csvOut.meta.format, 'csv');
  assert.equal(csvOut.rows.length, 5);
  const jsonOut = await formats.readAllRows(makeFakeFile('datos.json', '[{"a":1},{"a":2}]'));
  assert.deepEqual(jsonOut.meta.headers, ['a']);
  assert.equal(jsonOut.rows.length, 2);
  const xmlOut = await formats.readAllRows(makeFakeFile('inspecciones.xml', FIX_TXT('inspecciones-generico.xml')));
  assert.equal(xmlOut.rows.length, 3);
});
