/* IntegrityWatch Field — escritores CSV y XML (P3-d): cuoteo RFC-4180 mínimo,
   BOM para Excel, simetría dura contra los lectores propios (IW.ingest.csv,
   IW.ingest.witsmlLite, IW.ingest.formats xml genérico). Node 24, sin deps. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const csvWriter = require('../src/export/csvWriter.js');
const xmlWriter = require('../src/export/xmlWriter.js');
require('../src/ingest/csv.js');
require('../src/ingest/witsmlLite.js');
require('../src/ingest/formats.js');

const IW = globalThis.IW;
const BOM = '\uFEFF';

// Fuente compatible con IW.ingest.formats: {name, size(bytes), slice}.
function fakeTextFile(text, name) {
  const bytes = new TextEncoder().encode(text).length;
  return {
    name: name || 'datos.csv',
    size: bytes,
    slice(start, end) { return text.slice(start, end); }
  };
}

// ---------------------------------------------------------------------------
// csvWriter.toText
// ---------------------------------------------------------------------------

test('csvWriter: defaults BOM + ; + CRLF; cabecera y cada fila terminan en lineEnd', function () {
  const t = csvWriter.toText(['a', 'b'], [['1', '2']]);
  assert.strictEqual(t.charCodeAt(0), 0xFEFF, 'BOM presente (default true → Excel lee UTF-8)');
  assert.strictEqual(t, BOM + 'a;b\r\n1;2\r\n');
});

test('csvWriter: cuoteo mínimo — comillas solo por delim, " o \\r\\n; "" duplicado', function () {
  // Con delimiter ';' un campo con ',' NO se entrecomilla (cuoteo mínimo).
  const t = csvWriter.toText(['x'], [['a,b'], ['c;d'], ['e"f'], ['g\nh'], ['i\r\nj'], ['normal']], { bom: false });
  assert.ok(t.startsWith('x\r\na,b\r\n'), 'a,b sin comas con delimiter ;: ' + JSON.stringify(t));
  assert.ok(t.includes('"c;d"\r\n'), 'delim → quoting');
  assert.ok(t.includes('"e""f"\r\n'), 'comillas internas duplicadas');
  assert.ok(t.includes('"g\nh"\r\n'), 'LF interno entrecomillado');
  assert.ok(t.includes('"i\r\nj"\r\n'), 'CRLF interno entrecomillado');
  assert.ok(t.endsWith('normal\r\n'), 'campo limpio sin comillas');
});

test('csvWriter: acentos intactos (UTF-8 + BOM): ñ é ¿ ¡ á', function () {
  const t = csvWriter.toText(['código'], [['ñ ¿Cómo está? áéíóú']]);
  assert.ok(t.indexOf('código') !== -1, 'acentos crudos, sin escapes HTML/XML');
  assert.strictEqual(t.charCodeAt(0), 0xFEFF);
});

test('csvWriter: null/undefined → campo vacío; número SIEMPRE con punto decimal; Date → ISO', function () {
  const t = csvWriter.toText(['n', 'd', 'b'], [
    [null, new Date(Date.UTC(2026, 0, 2, 3, 4, 5)), true],
    [undefined, 1.5, false],
    [-0.25, 0.1 + 0.2, 12]
  ], { bom: false });
  const rows = t.split('\r\n');
  assert.strictEqual(rows[0], 'n;d;b');
  assert.strictEqual(rows[1], ';2026-01-02T03:04:05.000Z;true', 'null → vacío, Date → ISO, boolean → String');
  assert.strictEqual(rows[2], ';1.5;false', 'undefined → vacío, número con punto decimal');
  assert.strictEqual(rows[3], '-0.25;0.30000000000000004;12');
});

test('csvWriter: formato numérico con punto sin localizar (decisión documentada)', function () {
  const t = csvWriter.toText(['v'], [['x'], [1.5], [0.30000000000000004], [12], [-0.25]], { bom: false });
  const lines = t.split('\r\n');
  assert.deepStrictEqual(lines.slice(2, 6), ['1.5', '0.30000000000000004', '12', '-0.25']);
});

test('csvWriter: opts delimiter "," y lineEnd "\\n" respetados; bom:false sin BOM', function () {
  const t = csvWriter.toText(['a', 'b'], [['1;2', '3,4'], ['sin comas', 'x']], { delimiter: ',', lineEnd: '\n', bom: false });
  // Cuoteo mínimo con delimiter ',': "1;2" NO lleva comillas; "3,4" sí.
  assert.strictEqual(t, 'a,b\n1;2,"3,4"\nsin comas,x\n');
});

test('csvWriter: round-trip con IW.ingest.csv.parse → mismas filas (simetría)', function () {
  const headers = ['código', 'fecha', 'nota'];
  const rows = [
    ['CR-101', '2026-10-01', 'grieta "leve"; revisar'],
    ['CR-102', '2026-10-02', 'línea1\r\nlínea2'],
    ['Ñ ¿¡', '2026-10-03', null],
    ['MP-9', '2026-10-04', undefined],
    ['A-1', '2026-10-05', 1.5]
  ];
  const expected = rows.map(function (r) {
    return r.map(function (v) { return v === null || v === undefined ? '' : String(v); });
  });
  const text = csvWriter.toText(headers, rows);
  assert.strictEqual(text.charCodeAt(0), 0xFEFF, 'BOM presente en la salida');
  const stripped = text.slice(1); // csv.parse no quita BOM: se retira como haría formats.js
  const parsed = IW.ingest.csv.parse(stripped, { delimiter: ';' });
  assert.deepStrictEqual(parsed.headers, headers);
  assert.deepStrictEqual(parsed.rows, expected);
});

test('csvWriter: downloadText sin DOM (Node) → false, nunca lanza', function () {
  assert.strictEqual(csvWriter.downloadText('a.csv', 'x;1\r\n'), false);
});

// ---------------------------------------------------------------------------
// xmlWriter.objToXml
// ---------------------------------------------------------------------------

test('xmlWriter.objToXml: declaration + estructura anidada, arrays → elementos repetidos', function () {
  const xml = xmlWriter.objToXml('reporte', {
    titulo: 'Informe ñ',
    puntos: [{ code: 'CR-101' }, { code: 'CR-202' }],
    meta: { empresa: 'ACME', total: 2 }
  }, { indent: 2 });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'), 'declaración XML incluida');
  // Convención documentada: cada ítem del array repite el nombre de la clave.
  assert.ok(xml.includes('<puntos>\n    <code>CR-101</code>'), 'array repetido con indent: ' + xml);
  assert.ok(xml.includes('<meta>\n    <empresa>ACME</empresa>'), 'anidado recursivo');
  assert.strictEqual((xml.match(/<puntos>/g) || []).length, 2);
});

test('xmlWriter.objToXml: escapa hostiles & < > " \' y control chars', function () {
  const xml = xmlWriter.objToXml('r', {
    html: '<script>alert("x & y")</script>',
    raro: "apóstrofe ' aquí",
    ctrl: 'a\u0001b\u001Fc'
  });
  assert.ok(xml.includes('&lt;script&gt;'), 'lt/gt escapados');
  assert.ok(!xml.includes('<script>'), 'sin <script> crudo');
  assert.ok(xml.includes('alert(&quot;x &amp; y&quot;)'), '& y comillas escapadas');
  assert.ok(xml.includes('apóstrofe &apos; aquí'), 'apóstrofo escapado (acentos crudos UTF-8)');
  assert.ok(xml.includes('a&#x1;b&#x1f;c'), 'control chars → referencias numéricas');
});

test('xmlWriter.objToXml: claves inseguras sanitizadas a [A-Za-z_][\\w.-]* y documentado', function () {
  const xml = xmlWriter.objToXml('r', { 'mi clave!': 1, '2do': 2 });
  assert.ok(xml.includes('<mi_clave_>1</mi_clave_>'), 'espacio y ! → _ : ' + xml);
  assert.ok(xml.includes('<_2do>2</_2do>'), 'dígito inicial → prefijo _');
});

test('xmlWriter.objToXml: null/objeto vacío → auto-cerrado; array vacío nada; compacto sin indent', function () {
  const xml = xmlWriter.objToXml('r', { a: null, b: {}, c: [], d: 1 });
  assert.ok(xml.includes('<a/>'));
  assert.ok(xml.includes('<b/>'));
  assert.ok(!xml.includes('<c>'), 'array vacío no emite elementos');
  const body = xml.split('\n').slice(1).join(''); // todo tras la declaración
  assert.ok(body.indexOf('\n') === -1 && body.includes('<d>1</d>'), 'compacto: cuerpo en una sola línea: ' + xml);
});

test('xmlWriter.objToXml → readRows(xml genérico) recupera la tabla (redondeo informe)', async function () {
  const report = {
    informe: [
      { punto: 'MP-01', fecha: '2026-10-01', valor: 1.5, nota: 'grieta & corrosión <leve>' },
      { punto: 'MP-02', fecha: '2026-10-02', valor: 2.25, nota: null }
    ]
  };
  const xml = xmlWriter.objToXml('reporte', report, { indent: 2 });
  const out = await IW.ingest.formats.readAllRows(fakeTextFile(xml, 'informe.xml'), { format: 'xml' });
  assert.deepStrictEqual(out.meta.headers, ['punto', 'fecha', 'valor', 'nota']);
  assert.deepStrictEqual(out.rows.map(function (r) { return r.row; }), [
    ['MP-01', '2026-10-01', '1.5', 'grieta & corrosión <leve>'],
    ['MP-02', '2026-10-02', '2.25', '']
  ]);
});

// ---------------------------------------------------------------------------
// xmlWriter.witsmlOut — simetría dura con IW.ingest.witsmlLite.parse
// ---------------------------------------------------------------------------

function buildReadings12() {
  const out = [];
  for (let i = 0; i < 12; i++) {
    out.push({
      mpId: (i % 2) ? 'mp-2' : 'mp-1',
      date: '2026-09-' + String(i + 10) + 'T00:00:00Z',
      value: Math.round((0.5 + i * 1.25) * 100) / 100,
      unit: 'mpy'
    });
  }
  return out;
}

test('witsmlOut → witsmlLite.parse: simetría dura 12 lecturas (fecha, valor, code)', function () {
  const readings = buildReadings12();
  const mpCodeByMpId = { 'mp-1': 'CR-101', 'mp-2': 'CR-202' };
  const xml = xmlWriter.witsmlOut(readings, { mpCodeByMpId: mpCodeByMpId, companyId: 'ACME' });
  const parsed = IW.ingest.witsmlLite.parse(xml);
  assert.deepStrictEqual(parsed.errors, [], 'ningún punto descartado');
  assert.strictEqual(parsed.channels.length, 12, 'un canal por lectura → orden exacto');
  const flat = [];
  parsed.channels.forEach(function (ch) {
    ch.points.forEach(function (pt) {
      flat.push({ code: ch.mpCode, date: pt.time, value: pt.value });
    });
  });
  const expected = readings.map(function (r) {
    return { code: mpCodeByMpId[r.mpId], date: r.date, value: r.value };
  });
  assert.deepStrictEqual(flat, expected);
  parsed.channels.forEach(function (ch, i) {
    assert.strictEqual(ch.unit, readings[i].unit, 'unidad preservada');
  });
});

test('witsmlOut: sin unit no se emite el atributo; lectura sin fecha/valor se omite (documentado)', function () {
  const xml = xmlWriter.witsmlOut(
    [{ mpId: 'a', date: '2026-01-01', value: 1 }, { mpId: 'a', value: 2 }, { mpId: 'a', date: '2026-01-02' }],
    { mpCodeByMpId: { a: 'CR-1' } }
  );
  const parsed = IW.ingest.witsmlLite.parse(xml);
  assert.strictEqual(parsed.channels.length, 1);
  assert.strictEqual(parsed.channels[0].unit, undefined);
  assert.strictEqual(parsed.channels[0].points.length, 1);
  assert.deepStrictEqual(parsed.errors, []);
});

test('witsmlOut → formats.readRows(witsml): 12 filas [code, fecha, valor, unidad, source]', async function () {
  const readings = buildReadings12();
  const mpCodeByMpId = { 'mp-1': 'CR-101', 'mp-2': 'CR-202' };
  const xml = xmlWriter.witsmlOut(readings, { mpCodeByMpId: mpCodeByMpId });
  const out = await IW.ingest.formats.readAllRows(fakeTextFile(xml, 'ts.xml'), { format: 'witsml' });
  assert.strictEqual(out.meta.targetStore, 'readings');
  assert.deepStrictEqual(out.meta.headers, ['code', 'fecha', 'valor', 'unidad', 'source']);
  assert.strictEqual(out.rows.length, 12);
  out.rows.forEach(function (r, i) {
    assert.deepStrictEqual(r.row, [mpCodeByMpId[readings[i].mpId], readings[i].date, readings[i].value, 'mpy', 'import']);
  });
});

// ---------------------------------------------------------------------------
// csvWriter.downloadBytes — espejo de downloadText para payloads binarios
// ---------------------------------------------------------------------------

// Stub DOM mínimo (el dom-shim de helpers no trae body/click/Blob/URL):
// graba anclas creadas, blobs, y revokeObjectURL. Aisla y restaura los
// globales en finally tras dejar correr el setTimeout(0) de la revocación.
async function withDownloadStub(fn) {
  const hadDoc = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  const savedDoc = globalThis.document;
  const savedBlob = globalThis.Blob;
  const savedURL = globalThis.URL;
  const made = [];
  const blobs = [];
  const revoked = [];
  let urlSeq = 0;
  globalThis.document = {
    createElement(tag) {
      const el = {
        tagName: String(tag).toUpperCase(), href: '', download: '', clicks: 0,
        click() { this.clicks += 1; }
      };
      made.push(el);
      return el;
    },
    body: {
      kids: [],
      appendChild(el) { this.kids.push(el); return el; },
      removeChild(el) {
        const i = this.kids.indexOf(el);
        if (i !== -1) { this.kids.splice(i, 1); }
        return el;
      }
    }
  };
  globalThis.Blob = function BlobStub(parts, opts) {
    this.parts = parts;
    this.type = (opts && opts.type) || '';
    blobs.push(this);
  };
  globalThis.URL = {
    createObjectURL(blob) { return 'blob:stub-' + (++urlSeq); },
    revokeObjectURL(u) { revoked.push(u); }
  };
  // El revoke va en setTimeout(...,0): dejarlo correr ANTES de los asserts
  // (el timer de csvWriter se registró primero → dispara antes que este).
  const flush = function () { return new Promise(function (r) { setTimeout(r, 10); }); };
  try {
    const result = await fn({ made: made, blobs: blobs, revoked: revoked, flush: flush });
    await flush();
    return result;
  } finally {
    if (hadDoc) { globalThis.document = savedDoc; } else { delete globalThis.document; }
    globalThis.Blob = savedBlob;
    globalThis.URL = savedURL;
  }
}

test('csvWriter: downloadBytes con stub DOM → ancla descargada, nombre saneado y MIME aplicado', async function () {
  await withDownloadStub(async function (s) {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const ok = csvWriter.downloadBytes('informe.xlsx', bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.strictEqual(ok, true, 'stub DOM completo → dispara la descarga');
    assert.strictEqual(s.made.length, 1);
    const a = s.made[0];
    assert.strictEqual(a.tagName, 'A');
    assert.strictEqual(a.download, 'informe.xlsx', 'filename crudo String() (mismo saneado que downloadText)');
    assert.ok(a.href.startsWith('blob:stub-'), 'href = URL.createObjectURL del blob');
    assert.strictEqual(a.clicks, 1, 'a.click() invocado');
    assert.strictEqual(s.blobs.length, 1);
    assert.strictEqual(s.blobs[0].type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'MIME propagado al Blob');
    assert.strictEqual(s.blobs[0].parts[0], bytes, 'los bytes llegan tal cual al Blob');
    await s.flush();
    assert.deepStrictEqual(s.revoked, [a.href], 'revokeObjectURL tras el tick del setTimeout');
  });
});

test('csvWriter: downloadBytes sanea filename como downloadText (String + default) y acepta ArrayBuffer/string con default octet-stream', async function () {
  await withDownloadStub(async function (s) {
    const buf = new ArrayBuffer(4);
    assert.strictEqual(csvWriter.downloadBytes(42, buf), true, 'filename numérico → String()');
    assert.strictEqual(s.made[0].download, '42');
    assert.strictEqual(s.made[0].clicks, 1);
    assert.strictEqual(s.blobs[0].parts[0], buf, 'ArrayBuffer llega tal cual');
    assert.strictEqual(s.blobs[0].type, 'application/octet-stream', 'mime undefined → octet-stream');
    assert.strictEqual(csvWriter.downloadBytes('', 'hola', 'text/plain;charset=utf-8'), true, 'filename vacío → default');
    assert.strictEqual(s.made[1].download, 'export.bin', 'default binario documentado');
    assert.strictEqual(s.blobs[1].parts[0], 'hola', 'string también vale como payload');
    assert.strictEqual(s.blobs[1].type, 'text/plain;charset=utf-8');
    await s.flush();
    assert.strictEqual(s.revoked.length, 2, 'ambas URLs revocadas tras el tick');
  });
});

test('csvWriter: downloadBytes sin document (Node) → false, nunca lanza', function () {
  assert.strictEqual(typeof globalThis.document, 'undefined', 'los stubs anteriores restauraron el entorno');
  assert.strictEqual(csvWriter.downloadBytes('a.zip', new Uint8Array([1, 2])), false);
  assert.strictEqual(csvWriter.downloadBytes('a.zip', 'texto'), false);
});
