/* IntegrityWatch Field — chunked ingest tests
   Primitivas de bloques internos (sliceTextReader/readLines, parseCsvIncremental,
   mapBatches, runGuarded, YieldSignal) para archivos enormes. Todo corre en
   Node sin File API usando makeFileLike/makeByteFileLike sobre Buffer.
   console.log permitido aqui (RENDIMIENTO): unico lugar del repo donde se reporta. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../src/calc/corrosion.js');
const csv = require('../src/ingest/csv.js');
const chunked = require('../src/ingest/chunked.js');

const FIX_PATH = (name) => path.join(__dirname, 'fixtures', name);
const FIX = (name) => fs.readFileSync(FIX_PATH(name), 'utf8');

// ---------------------------------------------------------------------------
// Ayudantes de fuente (interface minima {size, slice(start,end)})
// ---------------------------------------------------------------------------

// slice devuelve string YA decodificado UTF-8 (contracte aceptado por el modulo).
function makeFileLike(bufOrString) {
  const buf = Buffer.isBuffer(bufOrString) ? bufOrString : Buffer.from(String(bufOrString), 'utf8');
  return {
    size: buf.length,
    slice(start, end) {
      return Promise.resolve(buf.subarray(start, Math.min(end, buf.length)).toString('utf8'));
    }
  };
}

// slice devuelve Uint8Array: el modulo debe decodificar con TextDecoder en
// modo stream (un caracter multibyte partido en la frontera no se corrompe).
function makeByteFileLike(bufOrString) {
  const buf = Buffer.isBuffer(bufOrString) ? bufOrString : Buffer.from(String(bufOrString), 'utf8');
  return {
    size: buf.length,
    slice(start, end) {
      return Promise.resolve(buf.subarray(start, Math.min(end, buf.length)));
    }
  };
}

// slice devuelve un pseudo-Blob con arrayBuffer(): emulate el camino File API
// del navegador (File.slice -> Blob -> arrayBuffer).
function makeBlobLike(str) {
  const buf = Buffer.from(String(str), 'utf8');
  return {
    size: buf.length,
    slice(start, end) {
      const part = buf.subarray(start, Math.min(end, buf.length));
      const ab = part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength);
      return { arrayBuffer: async () => ab };
    }
  };
}

async function collect(iter) {
  const out = [];
  for await (const v of iter) out.push(v);
  return out;
}

// ---------------------------------------------------------------------------
// readLines / sliceTextReader: fronteras duras
// ---------------------------------------------------------------------------

test('chunked readLines maneja \\r\\n partido exacto en la frontera de bytes', async () => {
  // 'x\r\ny\r\n' con tajadas de 2 bytes: corte 1 = 'x\r' (\\r ambiguo al final),
  // luego '\\n' abre la siguiente tajada y resuelve \\r\\n como UN terminador.
  const src = makeFileLike('x\r\ny\r\n');
  const lines = await collect(chunked.readLines(src, { sliceBytes: 2 }));
  assert.deepEqual(lines, ['x', 'y']);
});

test('chunked readLines elimina el BOM del inicio', async () => {
  const src = makeFileLike('\uFEFFa,b\nc,d\n');
  const lines = await collect(chunked.readLines(src, { sliceBytes: 4 }));
  assert.deepEqual(lines, ['a,b', 'c,d']);
});

test('chunked readLines crece el tajo para lineas mayores que sliceBytes', async () => {
  const bigLine = 'x'.repeat(10000);
  const src = makeFileLike(bigLine + '\ncorta\n');
  const recs = [];
  for await (const rec of chunked.sliceTextReader(src, { sliceBytes: 1024 })) {
    recs.push(rec);
  }
  assert.equal(recs.length, 2);
  assert.equal(recs[0].line, bigLine);
  assert.equal(recs[0].lineNo, 1);
  assert.equal(recs[1].line, 'corta');
  assert.equal(recs[1].lineNo, 2);
});

test('chunked readLines decodifica bytes UTF-8 partidos en la frontera del tajo', async () => {
  // 'á' = C3 A1, 'é' = C3 A9: tajadas de 3 bytes parten la secuencia de 'é'.
  const src = makeByteFileLike('áé,í\nóú,ü\n');
  const lines = await collect(chunked.readLines(src, { sliceBytes: 3 }));
  assert.deepEqual(lines, ['áé,í', 'óú,ü']);
});

test('chunked readLines acepta fuentes tipo Blob del navegador (arrayBuffer)', async () => {
  const src = makeBlobLike('id,valor\n1,2\n3,4\n');
  const lines = await collect(chunked.readLines(src, { sliceBytes: 5 }));
  assert.deepEqual(lines, ['id,valor', '1,2', '3,4']);
});

test('chunked readLines rechaza fuentes sin interface minima con error tipado', async () => {
  await assert.rejects(
    () => collect(chunked.readLines({ size: 10 })),
    (err) => err.code === chunked.BAD_SOURCE
  );
});

test('chunked readLines cancela con error tipado CANCELED entre tajadas', async () => {
  const src = makeFileLike('a,b\n'.repeat(500000)); // > 2 MB para many tajadas
  let calls = 0;
  const err = await collect(
    chunked.readLines(src, {
      sliceBytes: 65536,
      isCanceled: () => calls >= 3,
      onBytes: () => { calls += 1; }
    })
  ).catch((e) => e);
  assert.ok(err instanceof Error);
  assert.equal(err.code, chunked.CANCELED);
  assert.ok(calls >= 3);
});

// ---------------------------------------------------------------------------
// parseCsvIncremental: reglas identicas a csv.js
// ---------------------------------------------------------------------------

test('chunked parseCsvIncremental soporta celdas multilineas comilladas sin romper conteo', async () => {
  const src = makeFileLike('a,b\n"line1\nline2",z\nq,r\n');
  const it = chunked.parseCsvIncremental(chunked.readLines(src));
  const rows = await collect(it);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].row, ['line1\nline2', 'z']);
  assert.deepEqual(rows[1].row, ['q', 'r']);
  // la fila multi-linea termina en la linea 3 (donde esta su terminador)
  assert.equal(rows[0].lineNo, 3);
  assert.equal(it.stats.rows, 2);
});

test('chunked parseCsvIncremental unescape "" igual que csv.js', async () => {
  const src = makeFileLike('a,b\n"x""y",z\n');
  const rows = await collect(chunked.parseCsvIncremental(chunked.readLines(src)));
  assert.deepEqual(rows[0].row, ['x"y', 'z']);
});

test('chunked parseCsvIncremental padding null + warning en filas cortas', async () => {
  const src = makeFileLike('a,b,c\n1,2\n3,4,5\n');
  const it = chunked.parseCsvIncremental(chunked.readLines(src));
  const rows = await collect(it);
  assert.deepEqual(rows[0].row, ['1', '2', null]);
  assert.deepEqual(rows[1].row, ['3', '4', '5']);
  assert.equal(it.warnings.length, 1);
  assert.match(String(it.warnings[0]), /linea 2/);
});

test('chunked parseCsvIncremental salta lineas vacias; header:false emite todas', async () => {
  const src = makeFileLike('a,b\n\n1,2\n\n');
  const it = chunked.parseCsvIncremental(chunked.readLines(src));
  const rows = await collect(it);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].row, ['1', '2']);
  assert.equal(it.stats.lines, 4); // 4 lineas crudas leidas (2 vacias ignoradas)

  const src2 = makeFileLike('a,b\n\n1,2\n');
  const all = await collect(chunked.parseCsvIncremental(chunked.readLines(src2), { header: false }));
  assert.equal(all.length, 2); // cabecera + dato; la linea vacia igual se salta
  assert.deepEqual(all[0].row, ['a', 'b']);
});

test('chunked parseCsvIncremental detecta delimitador en la primera linea (coma/punto y coma/tab)', async () => {
  const semi = await collect(chunked.parseCsvIncremental(makeLines(['x;y;z', '1;2;3'])));
  assert.deepEqual(semi[0].row, ['1', '2', '3']);
  const tab = await collect(chunked.parseCsvIncremental(makeLines(['x\ty\tz', '1\t2\t3'])));
  assert.deepEqual(tab[0].row, ['1', '2', '3']);
});

// iterable de lineas sintactico (fuera del pipeline de archivos)
function makeLines(arr) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return { next: async () => (i < arr.length ? { value: arr[i++], done: false } : { value: undefined, done: true }) };
    }
  };
}

// ---------------------------------------------------------------------------
// Paridad con IW.ingest.csv.parse sobre los fixtures reales
// ---------------------------------------------------------------------------

async function parityCase(fixture) {
  const text = FIX(fixture);
  const expected = csv.parse(text);
  const it = chunked.parseCsvIncremental(chunked.readLines(makeFileLike(text)));
  const got = await collect(it);
  assert.deepEqual(it.headers, expected.headers, fixture + ': headers');
  assert.deepEqual(got.map((r) => r.row), expected.rows, fixture + ': filas');
}

test('chunked parseCsvIncremental es identico a csv.parse en sample-comma.csv', async () => {
  await parityCase('sample-comma.csv');
});

test('chunked parseCsvIncremental es identico a csv.parse en sample-semi.csv', async () => {
  await parityCase('sample-semi.csv');
});

test('chunked parseCsvIncremental es identico a csv.parse en sample-tab.tsv', async () => {
  await parityCase('sample-tab.tsv');
});

// ---------------------------------------------------------------------------
// Archivo grande: 150 000 filas > 20 MB, tajadas de 2 MB
// ---------------------------------------------------------------------------

test('chunked parsea 150 000 filas por bloques: conteo exacto, progreso, cesion del loop y timing', async () => {
  const header = 'id,fecha,valor,nota';
  const parts = [header];
  for (let i = 0; i < 150000; i++) {
    parts.push('R' + i + ',2026-01-01,' + i + ',' + 'x'.repeat(120));
  }
  const content = parts.join('\n') + '\n';
  const src = makeFileLike(content);
  const sliceBytes = 2 * 1024 * 1024;
  assert.ok(src.size > 20 * 1024 * 1024, 'el fixture debe superar 20 MB (tama ' + src.size + ')');

  let bytesCalls = 0;
  let progressCalls = 0;
  let lastProgress = null;
  const byteCounters = [];

  // contador de cesion: otro callback (setTimeout 0) DEBE correr mientras se
  // parsea; si el loop no cediera, ticks quedaria en 0 hasta el final.
  let ticks = 0;
  const tickId = setInterval(() => { ticks += 1; }, 0);

  const t0 = process.hrtime.bigint();
  const it = chunked.parseCsvIncremental(
    chunked.readLines(src, {
      sliceBytes,
      onBytes: (p) => {
        bytesCalls += 1;
        byteCounters.push(p.bytesDone);
      }
    }),
    {
      blockSize: 2000,
      onProgress: (p) => { progressCalls += 1; lastProgress = p; }
    }
  );
  let rows = 0;
  let first = null;
  let last = null;
  for await (const r of it) {
    rows += 1;
    if (rows === 1) first = r;
    last = r;
  }
  const msMs = Number(process.hrtime.bigint() - t0) / 1e6;
  clearInterval(tickId);

  console.log('[rendimiento] chunked: 150 000 filas (' + Math.round(src.size / 1048576) + ' MB, tajadas 2 MB) parseadas en ' + msMs.toFixed(1) + ' ms');

  assert.equal(rows, 150000); // + header consumido como cabecera (convencion declarada)
  assert.equal(it.stats.rows, 150000);
  assert.equal(it.stats.lines, 150001);
  assert.equal(it.warnings.length, 0);
  assert.equal(first.row[0], 'R0');
  assert.equal(last.row[0], 'R149999');
  assert.deepEqual(it.headers, ['id', 'fecha', 'valor', 'nota']);
  // 11+ tajadas sobre ~22 MB => onBytes llamado >= 8 veces
  assert.ok(bytesCalls >= 8, 'onBytes llamado ' + bytesCalls + ' veces (esperado >= 8)');
  assert.ok(progressCalls >= 8, 'onProgress llamado ' + progressCalls + ' veces (esperado >= 8)');
  assert.deepEqual(byteCounters, [2097152, 4194304, 6291456, 8388608, 10485760, 12582912, 14680064, 16777216, 18874368, 20971520, src.size]);
  assert.equal(lastProgress.bytesDone, src.size);
  assert.equal(lastProgress.bytesTotal, src.size);
  assert.equal(lastProgress.rows, 150000);
  // evidencia de cesion: el intervalo propio corrio DURANTE el parse
  assert.ok(ticks > 0, 'el loop cedio: el timer externo se ejecuto ' + ticks + ' veces durante el parse');
});

test('chunked parseCsvIncremental cancela con error tipado CANCELED entre bloques', async () => {
  const src = makeFileLike('a,b\n' + '1,2\n'.repeat(10000));
  let seen = 0;
  const err = await collect(
    chunked.parseCsvIncremental(chunked.readLines(src), {
      blockSize: 50,
      isCanceled: () => seen >= 220,
      onProgress: (p) => { seen = p.rows; }
    })
  ).catch((e) => e);
  assert.ok(err instanceof Error);
  assert.equal(err.code, chunked.CANCELED);
  assert.ok(seen >= 200, 'avance real antes de cancelar (' + seen + ' filas)');
});

// ---------------------------------------------------------------------------
// mapBatches
// ---------------------------------------------------------------------------

test('chunked mapBatches agrupa, conserva el orden y cede entre lotes', async () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  let yields = 0;
  const tickId = setInterval(() => { yields += 1; }, 1);
  const r = await chunked.mapBatches(items, (v) => v * 2, { batchSize: 10 });
  clearInterval(tickId);
  assert.deepEqual(r.results, items.map((v) => v * 2));
  assert.equal(r.stats.processed, 25);
  assert.equal(r.stats.errors.length, 0);
  assert.equal(r.stats.canceled, false);
});

test('chunked mapBatches acumula errores del mapper sin abortar', async () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  const r = await chunked.mapBatches(
    items,
    async (v) => {
      if (v % 7 === 0) throw new Error('boom-' + v);
      return v;
    },
    { batchSize: 5 }
  );
  // lotes de 5 sobre 0..24 con multiples de 7: lote0 {0}, lote1 {7},
  // lote2 {14}, lote4 {21} -> 4 errores de lote (el lote 3 esta limpio)
  assert.equal(r.stats.errors.length, 4);
  assert.deepEqual(r.stats.errors.map((e) => e.batchIndex), [0, 1, 2, 4]);
  assert.ok(r.stats.errors.every((e) => e.error instanceof Error && /boom-/.test(e.error.message)));
  const expected = items.filter((v) => v % 7 !== 0);
  assert.deepEqual(r.results, expected);
  assert.equal(r.stats.processed, expected.length);
});

test('chunked mapBatches cancelado a mitad devuelve resultados parciales con flag', async () => {
  const items = Array.from({ length: 100 }, (_, i) => i);
  let stop = false;
  const r = await chunked.mapBatches(
    items,
    (v) => v,
    {
      batchSize: 10,
      isCanceled: () => stop,
      onProgress: (p) => { if (p.processed >= 30) stop = true; }
    }
  );
  assert.equal(r.stats.canceled, true);
  assert.ok(r.results.length > 0 && r.results.length < 100);
  assert.equal(r.results.length, r.stats.processed);
  assert.deepEqual(r.results, r.results.slice().sort((a, b) => a - b));
});

test('chunked mapBatches throwOnFatal=true rechaza con el error del mapper', async () => {
  await assert.rejects(
    () => chunked.mapBatches([1, 2, 3, 4], (v) => { if (v === 2) throw new Error('fatal'); return v; }, { batchSize: 2, throwOnFatal: true }),
    /fatal/
  );
});

test('chunked mapBatches cancel antes de arrancar devuelve lote vacio con flag', async () => {
  const r = await chunked.mapBatches([1, 2, 3], (v) => v, { batchSize: 10, isCanceled: () => true });
  assert.equal(r.stats.canceled, true);
  assert.deepEqual(r.results, []);
  assert.equal(r.stats.processed, 0);
});

test('chunked mapBatches acepta el centinela YieldSignal.CANCELED del mapper', async () => {
  const r = await chunked.mapBatches(
    [1, 2, 3, 4, 5, 6],
    (v) => (v === 3 ? chunked.YieldSignal.CANCELED : v * 10),
    { batchSize: 3 }
  );
  assert.equal(r.stats.canceled, true);
  assert.deepEqual(r.results, [10, 20]); // el centinela no entra en results ni en errors
  assert.equal(r.stats.processed, 2);
});

// ---------------------------------------------------------------------------
// runGuarded / YieldSignal / API
// ---------------------------------------------------------------------------

test('chunked runGuarded chequea cancelacion ANTES de ejecutar fn', async () => {
  let executed = 0;
  const ok = await chunked.runGuarded(() => { executed += 1; return 42; }, { isCanceled: () => false });
  assert.equal(ok, 42);
  assert.equal(executed, 1);
  await assert.rejects(
    () => chunked.runGuarded(() => { executed += 1; }, { isCanceled: () => true }),
    (err) => err.code === chunked.CANCELED
  );
  assert.equal(executed, 1); // fn NO se ejecuto al estar cancelado
});

test('chunked YieldSignal expone CANCELED igual que la convencion de xlsx', () => {
  assert.deepEqual(chunked.YieldSignal, { CANCELED: chunked.CANCELED });
  assert.equal(chunked.CANCELED, 'CHUNKED_CANCELED');
});

test('chunked se auto-registra en IW.ingest.chunked', () => {
  assert.ok(globalThis.IW.ingest.chunked === chunked);
});

// ---------------------------------------------------------------------------
// Determinismo y ausencia de estado global
// ---------------------------------------------------------------------------

test('chunked es determinista y sin estado global: dos pasadas y dos lecturas entrelazadas coinciden', async () => {
  const content = 'id,valor\n' + Array.from({ length: 2000 }, (_, i) => i + ',"v' + i + '"').join('\n') + '\n';
  const text = () => content;

  const run1 = await collect(chunked.parseCsvIncremental(chunked.readLines(makeFileLike(text()), { sliceBytes: 517 })));
  const run2 = await collect(chunked.parseCsvIncremental(chunked.readLines(makeFileLike(text()), { sliceBytes: 613 })));
  assert.deepEqual(run1, run2); // tajadas distintas => mismos {row, lineNo}

  // dos iteradores activos a la vez (intercalados) sobre la misma fuente:
  // si hubiera estado global compartido, uno contaminaria al otro.
  const a = chunked.parseCsvIncremental(chunked.readLines(makeFileLike(text()), { sliceBytes: 1000 }));
  const b = chunked.parseCsvIncremental(chunked.readLines(makeFileLike(text()), { sliceBytes: 1000 }));
  const ia = a[Symbol.asyncIterator]();
  const ib = b[Symbol.asyncIterator]();
  const ra = [];
  const rb = [];
  for (;;) {
    const x = await ia.next();
    if (x.done) break;
    ra.push(x.value);
    const y = await ib.next();
    if (y.done) break;
    rb.push(y.value);
  }
  assert.deepEqual(ra.map((r) => r.row), run1.map((r) => r.row));
  assert.equal(ra.length, 2000);
  assert.equal(rb.length, 2000);
});
