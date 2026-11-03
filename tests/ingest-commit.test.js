/* IntegrityWatch Field — ingest/commit tests
   Motor de preview / UPSERT por clave natural / rollback por diario / reanudacion.
   Todo sobre dbMemory + fixtures reales (dedupe-3.xlsx) y un CSV sintetico de
   200 000 filas (>20 MB) para RENDIMIENTO REAL. Nota de diseno: dedupe-3 se
   importa al store `readings` (clave natural mpId+date = Cupon+Fecha, que es
   como el propio fixture declara sus duplicados); el store `coupons` exige 8
   campos que el fixture no tiene, lo que invalidaria cada fila.
   console.log permitido aqui (RENDIMIENTO), igual que en ingest-chunked.test.js. */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../src/calc/corrosion.js');
require('../src/core/bus.js');
const storeMod = require('../src/core/store.js');
const schemas = require('../src/ingest/schemas.js');
const mapping = require('../src/ingest/mapping.js');
const formats = require('../src/ingest/formats.js');
const commit = require('../src/ingest/commit.js');

const FIX_PATH = (name) => path.join(__dirname, 'fixtures', name);
const FIX = (name) => fs.readFileSync(FIX_PATH(name));

// fileLike propio (camino binario xlsx y camino texto csv), como en
// tests/ingest-formats.test.js / ingest-chunked.test.js.
function makeBytesFileLike(name, buf) {
  return {
    name: name,
    size: buf.length,
    slice(start, end) {
      return Promise.resolve(buf.subarray(start, Math.min(end, buf.length)));
    }
  };
}
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

function newRepos() {
  const adapter = require('../src/core/dbMemory.js').create();
  const repos = storeMod.create(adapter);
  repos.db = adapter; // acceso crudo a count() para aserciones de conteo
  return repos;
}

// columnPlan manual para dedupe-3: Cupon->mpId, Fecha->date, Perdida->crMpy;
// la columna 'Material' queda FUERA del plan (fuera de plan = no se toca).
const PLAN_DEDUPE = [
  { col: 0, field: 'mpId', unitFrom: null },
  { col: 1, field: 'date', unitFrom: null },
  { col: 2, field: 'crMpy', unitFrom: null }
];

async function dedupeRows() {
  const src = makeBytesFileLike('dedupe-3.xlsx', FIX('dedupe-3.xlsx'));
  const out = await formats.readRows(src);
  return out.rows;
}

async function dedupeRows2() {
  const src = makeBytesFileLike('dedupe-3.xlsx', FIX('dedupe-3.xlsx'));
  const out = await formats.readRows(src);
  return out.rows;
}

function csvFile(name, text) {
  return makeTextFileLike(name, text);
}

// ---------------------------------------------------------------------------
// CSV sintetico de 200 000 filas (>20 MB) para rendimiento / cancelacion /
// limites. Construido en memoria y COMPARTIDO como texto base (cada test crea
// su propio fileLike sobre el mismo string, no comparte iterables).
// ---------------------------------------------------------------------------
const BIG_ROWS = 200000;
let bigCsvPromise = null;
function bigCsvText() {
  if (!bigCsvPromise) {
    bigCsvPromise = Promise.resolve().then(() => {
      const parts = ['code,fecha,valor,nota'];
      const pad = 'x'.repeat(80);
      for (let i = 0; i < BIG_ROWS; i++) {
        parts.push('MP-' + String(i).padStart(6, '0') + ',2026-01-01,' + ((i % 997) / 10) + ',' + pad);
      }
      return parts.join('\n') + '\n';
    });
  }
  return bigCsvPromise;
}
async function bigCsvFile() {
  return csvFile('big-200k.csv', await bigCsvText());
}
const PLAN_BIG = [
  { col: 0, field: 'mpId', unitFrom: null },
  { col: 1, field: 'date', unitFrom: null },
  { col: 2, field: 'crMpy', unitFrom: null }
];

function msOf(t0) {
  return (Number(process.hrtime.bigint() - t0) / 1e6).toFixed(0);
}

async function journalDocs(importLogRepo, journalId) {
  const all = await importLogRepo.list();
  return all
    .filter((d) => d.importId === journalId && typeof d.batchNo === 'number')
    .sort((a, b) => a.batchNo - b.batchNo);
}

async function checkpointFor(repos, fingerprint) {
  const v = await repos.meta.get('ingest.resume.' + fingerprint);
  return v === null ? undefined : v; // rollback 'borra' con set(key, null)
}

// ---------------------------------------------------------------------------
// preview
// ---------------------------------------------------------------------------

test('preview dedupe-3: nuevos=6 y dupEnArchivo=4 sobre store vacio', async () => {
  const p = await commit.preview({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    rowIterable: await dedupeRows()
  });
  assert.equal(p.counts.total, 10);
  assert.equal(p.counts.valid, 10);
  assert.equal(p.counts.invalid, 0);
  assert.equal(p.counts.dupEnArchivo, 4);
  assert.equal(p.counts.nuevos, 6);
  assert.equal(p.counts.cambios, 0);
  assert.equal(p.counts.sinCambios, 0);
  assert.equal(p.truncado, false);
  assert.deepEqual(p.errores, []);
  assert.equal(p.muestras.length, 10);
  assert.equal(p.muestras[0].rowNo, 2);
  assert.ok(p.muestras[0].record);
  assert.equal(p.muestras[0].record.mpId, 'CP-01');
});

test('preview NO escribe: conteos de stores identicos antes y despues', async () => {
  const repos = newRepos();
  await repos.readings.save({ id: 'R1', mpId: 'CP-09', date: '2026-02-02', crMpy: 1, source: 'import' });
  const before = {
    readings: await repos.db.count('readings'),
    importLog: await repos.db.count('importLog'),
    meta: await repos.db.count('meta')
  };
  const p = await commit.preview({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    rowIterable: await dedupeRows(),
    repo: repos.readings
  });
  const after = {
    readings: await repos.db.count('readings'),
    importLog: await repos.db.count('importLog'),
    meta: await repos.db.count('meta')
  };
  assert.deepEqual(after, before);
  assert.equal(p.counts.nuevos, 6, 'el registro preexistente (CP-09) no esta en el archivo');
  assert.equal(p.counts.cambios, 0);
  assert.equal(p.counts.sinCambios, 0);
});

test('preview: errores tipados por fila invalida y truncado por limits.maxRows', async () => {
  const bad = csvFile('bad.csv', 'code,fecha,valor,nota\nCP-01,,1,zz\n');
  const out = await formats.readRows(bad);
  const p = await commit.preview({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    rowIterable: out.rows
  });
  assert.equal(p.counts.valid, 0);
  assert.equal(p.counts.invalid, 1);
  assert.equal(p.errores.length, 1);
  assert.equal(p.errores[0].rowNo, 2);
  assert.equal(p.errores[0].code, 'REQUIRED');
  assert.ok(p.errores[0].message);
  assert.ok(p.muestras[0].errores);

  const t = await commit.preview({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    rowIterable: await dedupeRows(),
    limits: { maxRows: 4 }
  });
  assert.equal(t.truncado, true);
  assert.equal(t.counts.total, 4);
});

// ---------------------------------------------------------------------------
// run + dedupe ACEPTACION
// ---------------------------------------------------------------------------

test('dedupe-3 ACEPTACION: run inserta 6; re-load mismo archivo -> cambios=0, sinCambios=6, store sigue en 6', async () => {
  const repos = newRepos();
  const r1 = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    source: makeBytesFileLike('dedupe-3.xlsx', FIX('dedupe-3.xlsx')),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'dedupe-3.xlsx+5253'
  });
  assert.equal(r1.status, 'done');
  assert.equal(r1.counts.inserts, 6);
  assert.equal(r1.counts.updates, 0);
  assert.equal(r1.counts.dupEnArchivo, 4);
  assert.equal(r1.counts.rowsDone, 10);
  assert.ok(r1.journalId);
  assert.equal(await repos.db.count('readings'), 6);

  // actor: store.stamp NO pone autoria -> commit la pone explicitamente.
  const recs = await repos.readings.list();
  recs.forEach((rec) => {
    assert.equal(rec.createdBy, 'ana');
    assert.equal(rec.updatedBy, 'ana');
    assert.equal(rec.source, 'import');
    assert.equal(rec.quality.mark, 'medido');
    assert.equal(rec.quality.sourceFile, 'dedupe-3.xlsx');
    assert.equal(rec.quality.importId, r1.journalId);
  });

  // checkpoint done con counts
  const cp = await checkpointFor(repos, 'dedupe-3.xlsx+5253');
  assert.equal(cp.status, 'done');
  assert.equal(cp.journalId, r1.journalId);
  assert.equal(cp.rowsDone, 10);
  assert.equal(cp.storeName, 'readings');

  // re-load del MISMO archivo: preview y run dicen 0 cambios / 6 sin cambios.
  const p2 = await commit.preview({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    rowIterable: await dedupeRows2(),
    repo: repos.readings
  });
  assert.equal(p2.counts.nuevos, 0);
  assert.equal(p2.counts.cambios, 0);
  assert.equal(p2.counts.sinCambios, 6);

  const r2 = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    source: makeBytesFileLike('dedupe-3.xlsx', FIX('dedupe-3.xlsx')),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'dedupe-3.xlsx+5253-v2'
  });
  assert.equal(r2.counts.inserts, 0);
  assert.equal(r2.counts.updates, 0);
  assert.equal(r2.counts.unchanged, 6);
  assert.equal(r2.counts.dupEnArchivo, 4);
  assert.equal(await repos.db.count('readings'), 6, '0 duplicados aceptados');
});

// ---------------------------------------------------------------------------
// update parcial + journal + rollback
// ---------------------------------------------------------------------------

test('update parcial: preserva campos fuera del plan; diario guarda before exactos; rollback revuelve', async () => {
  const repos = newRepos();
  await repos.readings.save({
    id: 'RD-EXIST', mpId: 'CP-01', date: '2026-03-01', crMpy: 999,
    source: 'import', note: 'no me toques', createdBy: 'juez', createdAt: '2026-01-01T00:00:00.000Z'
  });
  const f = csvFile('upd.csv', 'code,fecha,valor,nota\nCP-01,2026-03-01,12.5,z\n');
  const r = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    rows: (await formats.readRows(f)).rows,
    sourceFile: 'upd.csv',
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'upd.csv+28'
  });
  assert.equal(r.counts.updates, 1);
  assert.equal(r.counts.inserts, 0);
  assert.equal(r.counts.unchanged, 0);

  const after = await repos.readings.get('RD-EXIST');
  assert.equal(after.crMpy, 12.5, 'campo del plan actualizado');
  assert.equal(after.note, 'no me toques', 'campo fuera del plan PRESERVADO');
  assert.equal(after.createdBy, 'juez', 'createdBy del dueno original preservado');
  assert.equal(after.updatedBy, 'ana');
  assert.equal(after.createdAt, '2026-01-01T00:00:00.000Z');

  const docs = await journalDocs(repos.importLog, r.journalId);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].batchNo, 1);
  assert.deepEqual(docs[0].changes, [{ id: 'RD-EXIST', before: { crMpy: 999 } }]);
  assert.deepEqual(docs[0].inserts, []);

  const back = await commit.rollback({
    journalId: r.journalId,
    importLogRepo: repos.importLog,
    repo: repos.readings,
    metaRepo: repos.meta
  });
  assert.equal(back.rolled.updates, 1);
  assert.equal(back.rolled.inserts, 0);
  assert.deepEqual(back.warnings, []);

  const undone = await repos.readings.get('RD-EXIST');
  assert.equal(undone.crMpy, 999, 'valor viejo EXACTO restaurado');
  assert.equal(undone.note, 'no me toques');
  assert.equal(undone.createdBy, 'juez');
  const docsAfter = await journalDocs(repos.importLog, r.journalId);
  assert.ok(docsAfter.every((d) => d.rolledBack === true));
  assert.equal(await checkpointFor(repos, 'upd.csv+28'), undefined, 'checkpoint borrado tras rollback');
});

test('rollback de inserts: store vuelve a 0, diario rolledBack:true, checkpoint borrado', async () => {
  const repos = newRepos();
  const r = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    source: makeBytesFileLike('dedupe-3.xlsx', FIX('dedupe-3.xlsx')),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'rollback-inserts'
  });
  assert.equal(await repos.db.count('readings'), 6);
  const back = await commit.rollback({
    journalId: r.journalId,
    importLogRepo: repos.importLog,
    repo: repos.readings,
    metaRepo: repos.meta
  });
  assert.equal(back.rolled.inserts, 6);
  assert.equal(back.rolled.updates, 0);
  assert.equal(await repos.db.count('readings'), 0);
  const docs = await journalDocs(repos.importLog, r.journalId);
  assert.ok(docs.length >= 1);
  assert.ok(docs.every((d) => d.rolledBack === true));
  assert.equal(await checkpointFor(repos, 'rollback-inserts'), undefined);
});

test('rollback de un diario inexistente falla con COMMIT_NO_JOURNAL', async () => {
  const repos = newRepos();
  await assert.rejects(
    () => commit.rollback({ journalId: 'J-NOPE', importLogRepo: repos.importLog, repo: repos.readings }),
    (err) => err.code === commit.NO_JOURNAL
  );
});

// ---------------------------------------------------------------------------
// limites
// ---------------------------------------------------------------------------

test('limits.maxRows: 150000 con archivo de 200k -> COMMIT_LIMIT_ROWS y ROLLBACK automatico de lo hecho en el run', async () => {
  const repos = newRepos();
  const err = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_BIG,
    source: await bigCsvFile(),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'limite-fila',
    limits: { maxRows: 150000 }
  }).catch((e) => e);
  assert.ok(err instanceof Error);
  assert.equal(err.code, commit.LIMIT_ROWS);
  assert.equal(err.maxRows, 150000);
  // comportamiento documentado: rollback automatico -> el store queda como antes del run
  assert.equal(await repos.db.count('readings'), 0);
  assert.equal(await checkpointFor(repos, 'limite-fila'), undefined, 'checkpoint borrado por el rollback automatico');
  const docs = await journalDocs(repos.importLog, err.journalId);
  assert.ok(docs.length > 0);
  assert.ok(docs.every((d) => d.rolledBack === true));
});

test('limits.maxBytes: archivo sobre el limite se rechaza ANTES de procesar', async () => {
  const repos = newRepos();
  const err = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    source: makeBytesFileLike('dedupe-3.xlsx', FIX('dedupe-3.xlsx')),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    limits: { maxBytes: 1024 }
  }).catch((e) => e);
  assert.ok(err instanceof Error);
  assert.equal(err.code, commit.LIMIT_BYTES);
  assert.equal(err.maxBytes, 1024);
  assert.equal(await repos.db.count('readings'), 0);
});

// ---------------------------------------------------------------------------
// cancelacion + reanudacion (200k)
// ---------------------------------------------------------------------------

test('cancelacion a la fila 100 000 -> partial con checkpoint; resume procesa el resto sin duplicar (200k)', async () => {
  const repos = newRepos();
  let rowsSeen = 0;
  const t0 = process.hrtime.bigint();
  const r1 = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_BIG,
    source: await bigCsvFile(),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'big-cancel',
    isCanceled: () => rowsSeen >= 100000,
    onProgress: (p) => { rowsSeen = p.rowsDone; }
  });
  const t1 = process.hrtime.bigint();
  assert.equal(r1.status, 'partial');
  assert.equal(r1.counts.inserts, 100000);
  assert.equal(r1.counts.rowsDone, 100000);
  assert.equal(await repos.db.count('readings'), 100000);
  const cp = await checkpointFor(repos, 'big-cancel');
  assert.equal(cp.status, 'partial');
  assert.equal(cp.rowsDone, 100000);
  assert.ok(cp.journalId);
  console.log('[rendimiento] commit cancel parcial: 100 000 inserts en ' + msOf(t0) + ' ms');

  const t2 = process.hrtime.bigint();
  const r2 = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_BIG,
    source: await bigCsvFile(),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'big-cancel',
    journalId: cp.journalId,
    resume: true
  });
  const t3 = process.hrtime.bigint();
  console.log('[rendimiento] commit resume: ultimos 100 000 inserts en ' + msOf(t2) + ' ms');
  assert.equal(r2.status, 'done');
  assert.equal(r2.journalId, cp.journalId, 'el resume continua el MISMO diario');
  assert.equal(r2.counts.inserts, 100000);
  assert.equal(await repos.db.count('readings'), 200000, 'total 200 000 registros SIN duplicados');

  const docs = await journalDocs(repos.importLog, cp.journalId);
  assert.equal(docs.length, 40, '40 lotes de 5000 sin solapar batchNo');
  docs.forEach((d, i) => assert.equal(d.batchNo, i + 1));
  const cpDone = await checkpointFor(repos, 'big-cancel');
  assert.equal(cpDone.status, 'done');
  void t1;
});

// ---------------------------------------------------------------------------
// rendimiento real 200k (mismo store: run -> re-run dedup -> rollback)
// ---------------------------------------------------------------------------

test('RENDIMIENTO 200k: run completo, re-run sinCambios y rollback total sobre dbMemory', async () => {
  const repos = newRepos();

  const t0 = process.hrtime.bigint();
  const r1 = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_BIG,
    source: await bigCsvFile(),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'big-perf'
  });
  const tIns = msOf(t0);
  assert.equal(r1.counts.inserts, BIG_ROWS);
  assert.equal(r1.counts.updates, 0);
  assert.equal(r1.counts.rowsDone, BIG_ROWS);
  assert.equal(await repos.db.count('readings'), BIG_ROWS);
  const src1 = await bigCsvFile();
  assert.ok(src1.size > 20 * 1024 * 1024, 'el fixture debe superar 20 MB (es ' + src1.size + ')');

  const t1 = process.hrtime.bigint();
  const r2 = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_BIG,
    source: await bigCsvFile(),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'big-perf-v2'
  });
  const tRe = msOf(t1);
  assert.equal(r2.counts.unchanged, BIG_ROWS);
  assert.equal(r2.counts.inserts, 0);
  assert.equal(await repos.db.count('readings'), BIG_ROWS, 'dedup escala: siguen 200 000');

  const t2 = process.hrtime.bigint();
  const back = await commit.rollback({
    journalId: r1.journalId,
    importLogRepo: repos.importLog,
    repo: repos.readings,
    metaRepo: repos.meta
  });
  const tRb = msOf(t2);
  console.log('[rendimiento] commit 200k: inserts=' + tIns + ' ms | re-run dedup=' + tRe + ' ms | rollback total=' + tRb + ' ms');
  assert.equal(back.rolled.inserts, BIG_ROWS);
  assert.equal(await repos.db.count('readings'), 0);
});

// ---------------------------------------------------------------------------
// sesiones de import
// ---------------------------------------------------------------------------

test('importSessions agrupa el diario por importId con status y counts; clearSession lo borra', async () => {
  const repos = newRepos();
  const r = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    source: makeBytesFileLike('dedupe-3.xlsx', FIX('dedupe-3.xlsx')),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'sesiones'
  });
  const list = await commit.importSessions({
    importLogRepo: repos.importLog,
    metaRepo: repos.meta
  });
  assert.equal(list.length, 1);
  const s = list[0];
  assert.equal(s.importId, r.journalId);
  assert.equal(s.storeName, 'readings');
  assert.equal(s.inserts, 6);
  assert.equal(s.updates, 0);
  assert.equal(s.batches, 1);
  assert.equal(s.status, 'done');
  assert.equal(s.rolledBack, false);
  assert.ok(s.lastAt);

  const c = await commit.clearSession({
    journalId: r.journalId,
    importLogRepo: repos.importLog,
    metaRepo: repos.meta
  });
  assert.equal(c.docs, 1);
  assert.equal(c.checkpoints, 1);
  assert.equal((await commit.importSessions({ importLogRepo: repos.importLog })).length, 0);
  assert.equal(await checkpointFor(repos, 'sesiones'), undefined);
});

// ---------------------------------------------------------------------------
// autoMap -> toColumnPlan sobre el fixture (plan 'auto' permitido)
// ---------------------------------------------------------------------------

test('columnPlan via autoMap+toColumnPlan funciona end-to-end (headers de readings, unidad en el valor)', async () => {
  const headers = ['code', 'fecha', 'valor', 'nota'];
  const assigns = mapping.autoMap('readings', headers);
  const plan = mapping.toColumnPlan(assigns);
  assert.ok(plan.length >= 3, 'code/fecha/valor deben mapear limpios');

  const repos = newRepos();
  const f = csvFile('auto.csv', 'code,fecha,valor,nota\nCP-77,2026-05-05,12.5 mpy,hola\nCP-78,2026-05-06,3.2 mpy,chao\n');
  const out = await formats.readRows(f);
  const res = await commit.run({
    storeName: 'readings',
    columnPlan: plan,
    rows: out.rows,
    sourceFile: 'auto.csv',
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' }
  });
  assert.ok(res.journalId);
  assert.equal(res.counts.inserts, 2);
  const r77 = (await repos.readings.list()).find((r) => r.mpId === 'CP-77');
  assert.equal(r77.crMpy, 12.5, 'unidad embebida en el valor resuelta por stripUnit');
});

// ---------------------------------------------------------------------------
// validaciones tipadas
// ---------------------------------------------------------------------------

test('run valida store/plan/fuente/repo con errores COMMIT_* tipados', async () => {
  const repos = newRepos();
  await assert.rejects(
    () => commit.run({
      storeName: 'noExiste', columnPlan: PLAN_DEDUPE, rows: [],
      repo: repos.readings, metaRepo: repos.meta, importLogRepo: repos.importLog
    }),
    (err) => err.code === commit.UNKNOWN_STORE
  );
  await assert.rejects(
    () => commit.run({
      storeName: 'readings', columnPlan: [{ col: 0, field: 'noExiste' }], rows: [],
      repo: repos.readings, metaRepo: repos.meta, importLogRepo: repos.importLog
    }),
    (err) => err.code === commit.BAD_PLAN
  );
  await assert.rejects(
    () => commit.run({
      storeName: 'readings', columnPlan: PLAN_DEDUPE,
      repo: repos.readings, metaRepo: repos.meta, importLogRepo: repos.importLog
    }),
    (err) => err.code === commit.BAD_SOURCE
  );
  await assert.rejects(
    () => commit.run({
      storeName: 'readings', columnPlan: PLAN_DEDUPE, rows: [],
      repo: { list: null }, metaRepo: repos.meta, importLogRepo: repos.importLog
    }),
    (err) => err.code === commit.BAD_REPO
  );
});

test('commit se auto-registra en IW.ingest.commit con la API completa', () => {
  assert.equal(globalThis.IW.ingest.commit, commit);
  ['preview', 'run', 'rollback', 'importSessions', 'clearSession'].forEach((fn) => {
    assert.equal(typeof commit[fn], 'function', fn + ' debe ser funcion');
  });
});

test('ingest.keepMaps: el mapa clave->registro se persiste en meta y la reanudacion lo usa', async () => {
  const repos = newRepos();
  await repos.meta.set('ingest.keepMaps', true);
  const r1 = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    source: makeBytesFileLike('dedupe-3.xlsx', FIX('dedupe-3.xlsx')),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'keepmaps'
  });
  assert.equal(r1.counts.inserts, 6);
  const savedMap = await repos.meta.get('ingest.map.readings');
  assert.ok(Array.isArray(savedMap), 'meta debe guardar el mapa por store');
  assert.equal(savedMap.length, 6);
  assert.equal(savedMap[0][1].id, savedMap[0][1].id); // [key, {id, values}]
  // re-run: usa el mapa guardado (no repo.list) y sigue sin duplicar
  const r2 = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    source: makeBytesFileLike('dedupe-3.xlsx', FIX('dedupe-3.xlsx')),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'keepmaps-v2',
    journalId: 'J-segundo-' + Date.now().toString(36)
  });
  assert.equal(r2.counts.inserts, 0);
  assert.equal(await repos.db.count('readings'), 6);

  // reanudacion con checkpoint parcial sintetico: el mapa lo toma de
  // 'ingest.map.readings' (no de repo.list) y no reinserta nada.
  const recsA = await repos.readings.list();
  await repos.meta.set('ingest.map.readings', recsA.map((r) => [
    schemas.naturalKeyOf('readings', r),
    { id: r.id, values: { mpId: r.mpId, date: r.date, crMpy: r.crMpy } }
  ]));
  await repos.meta.set('ingest.resume.keepmaps-v3', {
    journalId: 'J-x1', rowsDone: 6, storeName: 'readings', at: new Date().toISOString(), status: 'partial'
  });
  const r3 = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    source: makeBytesFileLike('dedupe-3.xlsx', FIX('dedupe-3.xlsx')),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'keepmaps-v3',
    journalId: 'J-x1',
    resume: true
  });
  assert.equal(r3.counts.rowsDone, 10);
  assert.equal(r3.counts.inserts, 0);
  assert.equal(await repos.db.count('readings'), 6);
  assert.equal((await journalDocs(repos.importLog, 'J-x1')).length, 0, 'sin ops nuevas no hay lotes nuevos en el diario');
});

test('rollback avisa GONE (no muere) si un registro del diario ya no existe', async () => {
  const repos = newRepos();
  const r = await commit.run({
    storeName: 'readings',
    columnPlan: PLAN_DEDUPE,
    source: makeBytesFileLike('dedupe-3.xlsx', FIX('dedupe-3.xlsx')),
    repo: repos.readings,
    metaRepo: repos.meta,
    importLogRepo: repos.importLog,
    actor: { user: 'ana', role: 'engineer' },
    fingerprint: 'gone-check'
  });
  const recs = await repos.readings.list();
  await repos.readings.remove(recs[0].id); // alguien lo borro antes del rollback
  const back = await commit.rollback({
    journalId: r.journalId,
    importLogRepo: repos.importLog,
    repo: repos.readings,
    metaRepo: repos.meta
  });
  assert.equal(back.rolled.inserts, 5);
  assert.equal(back.warnings.length, 1);
  assert.equal(back.warnings[0].code, 'GONE');
  assert.equal(await repos.db.count('readings'), 0);
});
