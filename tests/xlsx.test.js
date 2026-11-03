/* IntegrityWatch Field — pruebas del lector XLSX (src/ingest/xlsx.js)
   Cubre los 4 fixtures reales generados con openpyxl, un .xlsx hostil
   construido en memoria (zip propio con stored + deflate + data descriptor)
   y los códigos de error tipados. Node --test, CommonJS, sin dependencias. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const xlsx = require('../src/ingest/xlsx.js');

const FIX = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

// ---------------------------------------------------------------------------
// Helper propio: construir un .xlsx auténtico (zip) en memoria.
// entries: [{name, data (string|Uint8Array), method (0|8|9), descriptor (bool)}]
// method=9 se usa para probar compresión no soportada (se escribe crudo).
// descriptor=true simula el flag bit 3 de Excel: el header LOCAL lleva
// crc/tamaños a cero y los tamaños reales viven solo en el central directory.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) { c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8');
    const comp = e.method === 8 ? zlib.deflateRawSync(raw) : raw;
    const crc = crc32(raw);
    const flags = e.descriptor ? 0x0800 : 0;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(flags, 6);
    head.writeUInt16LE(e.method, 8);
    head.writeUInt16LE(0, 10); // hora
    head.writeUInt16LE(0, 12); // fecha
    // Con descriptor, el header local declara crc/tamaños a cero (así lo hace Excel).
    head.writeUInt32LE(e.descriptor ? 0 : crc, 14);
    head.writeUInt32LE(e.descriptor ? 0 : comp.length, 18);
    head.writeUInt32LE(e.descriptor ? 0 : raw.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    head.writeUInt16LE(0, 28);
    locals.push(Buffer.concat([head, nameBuf, comp]));
    if (e.descriptor) {
      const desc = Buffer.alloc(20);
      desc.writeUInt32LE(0x08074b50, 0);
      desc.writeUInt32LE(crc, 4);
      desc.writeUInt32LE(comp.length, 8);
      desc.writeUInt32LE(raw.length, 12);
      locals.push(desc);
    }
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(flags, 8);
    cd.writeUInt16LE(e.method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([cd, nameBuf]));
    offset += 30 + nameBuf.length + comp.length + (e.descriptor ? 20 : 0);
  }
  const cdBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

// XLSX hostil: sharedStrings con rich text partido, inlineStr con entidades,
// celda de error, salto de columna, fila/celdas sin atributo r, fecha serial
// con hora y sin hora, booleano, rels con target relativo y zip con descriptor.
function buildHostileXlsx() {
  const workbook =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="Hoja Uno" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
    '</Relationships>';
  // si0: rich text partido en 3 runs; si1: xml:space preserve; si2: entidades en shared string.
  const shared =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">' +
    '<si><r><t>Ho</t></r><r><t>la</t></r><r><t>!</t></r></si>' +
    '<si><t xml:space="preserve"> con espacios </t></si>' +
    '<si><t>Ch&#225;vez &amp; Asociados</t></si>' +
    '</sst>';
  // cellXfs: 0 general, 1 numFmtId 14 (fecha sin hora), 2 numFmtId 22 (fecha con hora),
  // 3 general, 4 numFmtId 164 custom 'dd/mm/yyyy' (fecha, cabeceras de hora con comillas).
  const styles =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy \\a.t."/></numFmts>' +
    '<fonts count="1"/><fills count="1"/><borders count="1"/>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>' +
    '<xf numFmtId="14" fontId="0" fillId="0" borderId="0"/>' +
    '<xf numFmtId="22" fontId="0" fillId="0" borderId="0"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0"/>' +
    '</cellXfs></styleSheet>';
  const sheet =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<dimension ref="A1:E4"/><sheetData>' +
    // Fila 1: A1 compartida rich (r en cualquier orden), salto A1->C1 (B1 null),
    // C1 inlineStr con entidades &#39; y &amp;.
    '<row r="1">' +
    '<c r="A1" t="s"><v>0</v></c>' +
    '<c r="C1" t="inlineStr"><is><t>&#39;Hola &amp; adi&#243;s&#39;</t></is></c>' +
    '</row>' +
    // Fila 2: A2 error t="e" -> null + warning; B2 serial con hora estilo 22; C2 booleano; D2 vacío.
    '<row r="2">' +
    '<c r="A2" t="e"><v>#DIV/0!</v></c>' +
    '<c r="B2" s="2" t="n"><v>46027.5</v></c>' +
    '<c r="C2" t="b"><v>1</v></c>' +
    '<c r="D2"/>' +
    '</row>' +
    // Fila 3 sin atributo r (secuencial) y celdas sin atributo r (columnas 0,1,2).
    '<row>' +
    '<c t="str"><v>=A1&amp;B1</v></c>' +
    '<c s="1" t="n"><v>46027.75</v></c>' +
    '<c t="s"><v>1</v></c>' +
    '</row>' +
    // Fila 4: inlineStr rich dentro de <is>; fecha custom numFmt 164 sin hora.
    '<row r="4">' +
    '<c r="A4" t="inlineStr"><is><r><t>PAR</t></r><r><t>TIDA</t></r></is></c>' +
    '<c r="B4" s="4"><v>46082</v></c>' +
    '<c r="E4" t="s"><v>2</v></c>' +
    '</row>' +
    '</sheetData></worksheet>';
  return makeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>', method: 0 },
    { name: 'xl/workbook.xml', data: workbook, method: 8 },
    { name: 'xl/_rels/workbook.xml.rels', data: rels, method: 0 },
    { name: 'xl/sharedStrings.xml', data: shared, method: 8 },
    { name: 'xl/styles.xml', data: styles, method: 8 },
    // Hoja con flag bit 3: tamaños solo en el central directory.
    { name: 'xl/worksheets/sheet1.xml', data: sheet, method: 8, descriptor: true }
  ]);
}

const HOSTILE = buildHostileXlsx();

// ---------------------------------------------------------------------------
// Registro UMD y constantes
// ---------------------------------------------------------------------------

test('xlsx: registro UMD en IW.ingest.xlsx y constante CANCELED exportada', () => {
  assert.equal(globalThis.IW.ingest.xlsx, xlsx);
  assert.equal(xlsx.CANCELED, 'XLSX_CANCELED');
  assert.equal(typeof xlsx.listSheets, 'function');
  assert.equal(typeof xlsx.read, 'function');
});

// ---------------------------------------------------------------------------
// listSheets
// ---------------------------------------------------------------------------

test('listSheets(dos-hojas) = [Activos, Notas] con sus índices', async () => {
  const sheets = await xlsx.listSheets(FIX('dos-hojas.xlsx'));
  assert.deepEqual(sheets, [
    { name: 'Activos', index: 0 },
    { name: 'Notas', index: 1 }
  ]);
});

test('listSheets(lecturas-basicas) = [Lecturas]; listSheets(hostil) conserva espacios del nombre', async () => {
  assert.deepEqual(await xlsx.listSheets(FIX('lecturas-basicas.xlsx')), [{ name: 'Lecturas', index: 0 }]);
  assert.deepEqual(await xlsx.listSheets(HOSTILE), [{ name: 'Hoja Uno', index: 0 }]);
});

// ---------------------------------------------------------------------------
// lecturas-basicas: cabeceras con acentos/°, fecha ISO, tipos numéricos
// ---------------------------------------------------------------------------

test('lecturas-basicas: cabecera exacta con acentos, 6 filas de datos, fechas ISO y tipos', async () => {
  const r = await xlsx.read(FIX('lecturas-basicas.xlsx'));
  assert.equal(r.name, 'Lecturas');
  assert.equal(r.rows.length, 7); // cabecera + 6 filas de datos
  assert.deepEqual(r.rows[0], ['Punto de Monitoreo', 'Fecha', 'Valor (mpy)', 'Temperatura (°C)', 'Presión (bar)']);
  assert.deepEqual(r.rows[1], ['PM-CR-001', '2026-01-05', 2.31, 65, 12.4]);
  assert.deepEqual(r.rows[6], ['PM-CR-003', '2026-05-20', 5.47, 141.2, 44.6]);
  assert.equal(typeof r.rows[1][0], 'string');
  assert.equal(typeof r.rows[1][1], 'string'); // fecha siempre ISO string
  assert.equal(typeof r.rows[1][2], 'number');
  assert.equal(r.rows[1][2], 2.31);
  assert.deepEqual(r.dateColumns, [1]);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.stats.rows, 7);
});

test('lecturas-basicas: leer por nombre y por índice 0 da el mismo resultado', async () => {
  const byName = await xlsx.read(FIX('lecturas-basicas.xlsx'), { sheet: 'Lecturas' });
  const byIndex = await xlsx.read(FIX('lecturas-basicas.xlsx'), { sheet: 0 });
  assert.deepEqual(byName, byIndex);
});

// ---------------------------------------------------------------------------
// dos-hojas: selección de hoja
// ---------------------------------------------------------------------------

test('dos-hojas: hoja "Notas" (índice 1) lee las 2 filas con acentos intactos', async () => {
  const r = await xlsx.read(FIX('dos-hojas.xlsx'), { sheet: 'Notas' });
  assert.equal(r.name, 'Notas');
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], ['Nota', 'Texto con acentuación: presión, temperatura, medición']);
  assert.deepEqual(r.rows[1], ['1', 'Área de transferencia de carga']);
  assert.deepEqual(r.dateColumns, []);
});

test('dos-hojas: hoja 0 "Activos" numérica y sin fechas', async () => {
  const r = await xlsx.read(FIX('dos-hojas.xlsx'), { sheet: 0 });
  assert.equal(r.name, 'Activos');
  assert.equal(r.rows.length, 4);
  assert.deepEqual(r.rows[1], ['BOM-101A', 'Bomba centrífuga multietapa 101-A', 'Alta', 1500]);
});

// ---------------------------------------------------------------------------
// activos-2000: determinismo por bloques, progreso y cancelación
// ---------------------------------------------------------------------------

test('activos-2000: 2001 filas completas, onProgress >=6 con blockSize=300 e idéntico a blockSize=∞', async () => {
  const bytes = FIX('activos-2000.xlsx');
  const events = [];
  const chunked = await xlsx.read(bytes, {
    blockSize: 300,
    onProgress: (p) => events.push(p)
  });
  const full = await xlsx.read(bytes, { blockSize: Infinity });

  assert.equal(chunked.rows.length, 2001); // cabecera + 2000 filas
  assert.equal(full.rows.length, 2001);
  assert.deepEqual(chunked.rows, full.rows); // determinismo exacto
  assert.ok(events.length >= 6, 'esperado >=6 eventos de progreso, llegaron ' + events.length);
  for (let i = 1; i < events.length; i++) {
    assert.ok(events[i].rows >= events[i - 1].rows, 'el progreso debe ser monótono');
  }
  assert.deepEqual(chunked.rows[0], ['assetCode', 'name', 'sector', 'criticality', 'design_pressure_bar']);
  assert.deepEqual(chunked.rows[1], ['ACT-00001', 'Activo número 1', 'Producción', 'Media', 11.5]);
  assert.deepEqual(chunked.rows[2000], ['ACT-02000', 'Activo número 2000', 'Extracción', 'Baja', 40]);
});

test('activos-2000: cancelación a la fila 500 -> error XLSX_CANCELED (isCanceled cuenta llamadas)', async () => {
  const bytes = FIX('activos-2000.xlsx');
  let checks = 0;
  let lastRows = 0;
  await assert.rejects(
    xlsx.read(bytes, {
      blockSize: 300,
      onProgress: (p) => { lastRows = p.rows; },
      // cancela cuando ya se procesaron >=500 filas: la 3ª verificación ocurre
      // al cerrar el bloque de 600... se cuenta por llamadas como pide la consigna.
      isCanceled: () => { checks++; return checks >= 3 && lastRows >= 500; }
    }),
    (err) => {
      assert.equal(err.code, xlsx.CANCELED);
      assert.equal(err.code, 'XLSX_CANCELED');
      assert.ok(checks >= 2);
      return true;
    }
  );
});

test('maxRows limita las filas leídas y avisa en warnings', async () => {
  const r = await xlsx.read(FIX('activos-2000.xlsx'), { maxRows: 5 });
  assert.equal(r.rows.length, 5);
  assert.equal(r.stats.rows, 5);
  assert.ok(r.warnings.some((w) => /maxRows/.test(w)), 'debe avisar el corte por maxRows');
});

// ---------------------------------------------------------------------------
// dedupe-3: el lector NO deduplica (eso le toca a commit.js)
// ---------------------------------------------------------------------------

test('dedupe-3: 10 filas tal cual, duplicados por Cupón+Fecha preservados', async () => {
  const r = await xlsx.read(FIX('dedupe-3.xlsx'));
  assert.equal(r.name, 'Coupons');
  assert.equal(r.rows.length, 11); // cabecera + 10 filas
  assert.deepEqual(r.rows[0], ['Cupón', 'Fecha de extracción', 'Pérdida de masa (g/m²)', 'Material']);
  assert.deepEqual(r.rows[1], ['CP-01', '2026-03-01', 12.5, 'Acero al carbón']);
  assert.deepEqual(r.rows[3], r.rows[1]); // duplicado idéntico conservado
  assert.deepEqual(r.rows[2], ['CP-02', '2026-03-01', 9.1, 'Acero inoxidable 304']);
  assert.deepEqual(r.rows[5], ['CP-02', '2026-03-01', 9.1, 'Acero inoxidable 304']); // segundo duplicado
  assert.deepEqual(r.rows[10], ['CP-06', '2026-04-01', 15.2, 'Monel 400']);
});

// ---------------------------------------------------------------------------
// XLSX hostil construido en memoria
// ---------------------------------------------------------------------------

test('hostil: shared rich text, inlineStr con entidades, salto de columna, t="e", filas/celdas sin r, fechas con/sin hora, booleano, descriptor y rels relativo', async () => {
  const r = await xlsx.read(HOSTILE);
  assert.equal(r.name, 'Hoja Uno');

  // Fila 1: A1 = shared si0 rich partido 'Ho'+'la'+'!'; B1 null por salto A1->C1;
  // C1 inlineStr con entidades &#39; &amp; &#243; decodificadas.
  assert.deepEqual(r.rows[0], ['Hola!', null, "'Hola & adiós'"]);

  // Fila 2: A2 error t="e" -> null; B2 serial 46027.5 con estilo fecha+hora (numFmt 22);
  // C2 booleano; D2 celda vacía self-closed -> null.
  assert.deepEqual(r.rows[1], [null, '2026-01-05T12:00:00', 'TRUE', null]);

  // Fila 3 sin atributo r (secuencial) y celdas sin atributo r (columnas secuenciales):
  // t="str" fórmula con &amp;, serial 46027.75 con numFmt 14 (sin hora -> se descarta el .75),
  // shared si1 con xml:space="preserve".
  assert.deepEqual(r.rows[2], ['=A1&B1', '2026-01-05', ' con espacios ']);

  // Fila 4: inlineStr rico dentro de <is>; numFmt custom 164 'dd/mm/yyyy a.t.' -> fecha sin hora;
  // salto a E4 rellena C4/D4 con null; shared con entidades &#225; y &amp;.
  assert.deepEqual(r.rows[3], ['PARTIDA', '2026-03-01', null, null, 'Chávez & Asociados']);

  assert.equal(r.stats.rows, 4);
  assert.equal(r.stats.skipped, 1); // la celda de error
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /#DIV\/0!/);
  assert.deepEqual(r.dateColumns, [1]);
});

// ---------------------------------------------------------------------------
// Errores tipados
// ---------------------------------------------------------------------------

test('bytes basura -> code XLSX_BAD_ZIP sin throw de sistema', async () => {
  const basura = Buffer.from('esto-no-es-un-xlsx-y-no-tiene-eocd-xxxxxxxxxxxxxxxx');
  await assert.rejects(xlsx.read(basura), (err) => {
    assert.equal(err.code, 'XLSX_BAD_ZIP');
    return true;
  });
  await assert.rejects(xlsx.listSheets(basura), (err) => {
    assert.equal(err.code, 'XLSX_BAD_ZIP');
    return true;
  });
});

test('zip truncado (EOCD perdido) -> XLSX_BAD_ZIP', async () => {
  const full = FIX('lecturas-basicas.xlsx');
  await assert.rejects(xlsx.read(full.subarray(0, Math.floor(full.length / 2))), (err) => {
    assert.equal(err.code, 'XLSX_BAD_ZIP');
    return true;
  });
});

test('hoja inexistente por nombre o índice -> XLSX_NO_SHEET', async () => {
  const bytes = FIX('dos-hojas.xlsx');
  await assert.rejects(xlsx.read(bytes, { sheet: 'NoExiste' }), (err) => {
    assert.equal(err.code, 'XLSX_NO_SHEET');
    return true;
  });
  await assert.rejects(xlsx.read(bytes, { sheet: 7 }), (err) => {
    assert.equal(err.code, 'XLSX_NO_SHEET');
    return true;
  });
});

test('método de compresión no soportado (9) -> XLSX_UNSUPPORTED_COMPRESSION', async () => {
  const bytes = makeZip([
    { name: 'xl/workbook.xml', data: '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>', method: 8 },
    { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>', method: 0 },
    { name: 'xl/worksheets/sheet1.xml', data: '<worksheet><sheetData><row><c t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>', method: 9 }
  ]);
  await assert.rejects(xlsx.read(bytes), (err) => {
    assert.equal(err.code, 'XLSX_UNSUPPORTED_COMPRESSION');
    return true;
  });
});

// ---------------------------------------------------------------------------
// Aceptación de entrada ArrayBuffer y hoja vacía
// ---------------------------------------------------------------------------

test('read acepta ArrayBuffer puro', async () => {
  const file = FIX('lecturas-basicas.xlsx');
  const ab = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const r = await xlsx.read(ab);
  assert.equal(r.rows.length, 7);
});
