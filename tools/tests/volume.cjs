'use strict';
/* IntegrityWatch Field — volume / throughput harness (CommonJS, no browser, no network).
 *
 * Generates a deterministic 10 000-row CSV in memory (LCG seed 12345, no
 * Math.random), runs the real ingest pipeline (csv.js -> dbMemory.js/store.js)
 * and reports per-phase PASS/FAIL against fixed budgets.
 *
 * Location: tools/tests/volume.cjs  -> project modules live two levels up
 * (../../src). The prompt's literal require('../src/...') would resolve to
 * tools/src, so src/ is resolved from __dirname instead.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('node:perf_hooks');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
function src(...parts) { return path.join(PROJECT_ROOT, 'src', ...parts); }

const csv = require(src('ingest', 'csv.js'));
const dbMemory = require(src('core', 'dbMemory.js'));
const storeApi = require(src('core', 'store.js'));

const DAY_MS = 86400000;

/* ------------------------------------------------------------------ *
 * 1. Deterministic generator (LCG, seed 12345)
 * ------------------------------------------------------------------ */
let lcgState = 12345;
function nextRand() {
  lcgState = (Math.imul(lcgState, 1103515245) + 12345) & 0x7fffffff;
  return lcgState / 0x80000000;
}
function randInt(maxExclusive) { return Math.floor(nextRand() * maxExclusive); }

const START_MS = Date.UTC(2026, 0, 1);   // 2026-01-01
const END_MS = Date.UTC(2026, 9, 16);    // 2026-10-16
const SPAN_DAYS = Math.round((END_MS - START_MS) / DAY_MS); // 288
function randDateISO() {
  const off = randInt(SPAN_DAYS + 1);
  return new Date(START_MS + off * DAY_MS).toISOString().slice(0, 10);
}
function pad(n, w) { return String(n).padStart(w, '0'); }

const HEADER = 'punto,fecha,tasa,wi,wf,área,días,residual,temperatura,bsw,categoría,nota';
const CATS = ['sweet', 'sour', 'oxygen', 'sweet', 'sour'];
const NOTES = ['volumen', 'lectura de campo', 'cupon gravimetrico', 'yacimiento A', 'linea 12'];

const N_POINTS = 20;
const PER_POINT = { valid: 450, future: 25, negRate: 15, badDate: 5, coupon: 5 }; // = 500/point

const lines = [HEADER];
function pushRow(point, fecha, tasa, wi, wf, area, dias, residual, temp, bsw, cat, nota) {
  lines.push([point, fecha, tasa, wi, wf, area, dias, residual, temp, bsw, cat, nota].join(','));
}
function auxFields() {
  return [
    randInt(51),                       // residual ppm
    (20 + nextRand() * 75).toFixed(1), // temperatura C
    (nextRand() * 2).toFixed(3),       // bsw %
    CATS[randInt(CATS.length)],
    NOTES[randInt(NOTES.length)]
  ];
}

for (let p = 1; p <= N_POINTS; p++) {
  const point = 'MP-VOL-' + pad(p, 3);

  // 450 unique-in-point corrosion rates spanning [0.5, 12], shuffled with the LCG
  // (guarantees no (code|date|rate) duplicate key inside a point).
  const rates = [];
  for (let j = 0; j < PER_POINT.valid; j++) {
    rates.push(Math.round((0.5 + ((j + 0.5) / PER_POINT.valid) * 11.5) * 10000) / 10000);
  }
  for (let j = rates.length - 1; j > 0; j--) {
    const k = randInt(j + 1);
    const t = rates[j]; rates[j] = rates[k]; rates[k] = t;
  }

  for (let j = 0; j < PER_POINT.valid; j++) {
    const a = auxFields();
    pushRow(point, randDateISO(), rates[j].toFixed(4), '', '', '', '', a[0], a[1], a[2], a[3], a[4]);
  }
  for (let j = 0; j < PER_POINT.future; j++) { // 2027-06-01 -> E_DATE_FUTURE
    const a = auxFields();
    pushRow(point, '2027-06-01', (1 + nextRand() * 5).toFixed(3), '', '', '', '', a[0], a[1], a[2], a[3], a[4]);
  }
  for (let j = 0; j < PER_POINT.negRate; j++) { // -1 -> E_RANGE
    const a = auxFields();
    pushRow(point, randDateISO(), '-1', '', '', '', '', a[0], a[1], a[2], a[3], a[4]);
  }
  for (let j = 0; j < PER_POINT.badDate; j++) { // 99/99/2026 -> E_DATE_FORMAT
    const a = auxFields();
    pushRow(point, '99/99/2026', (1 + nextRand() * 5).toFixed(3), '', '', '', '', a[0], a[1], a[2], a[3], a[4]);
  }
  for (let j = 0; j < PER_POINT.coupon; j++) { // valid coupon; wf for target ~ (j+1) mpy
    const targetMpy = j + 1;
    const deltaWmg = targetMpy * 7.85 * 3.72 * 720 / 534;
    const wfMg = (24100 - deltaWmg).toFixed(4);
    const a = auxFields();
    pushRow(point, randDateISO(), '', '24100', wfMg, '3.72', '30', a[0], a[1], a[2], a[3], a[4]);
  }
}

const csvText = lines.join('\n') + '\n';
const outPath = path.join(os.tmpdir(), 'iw-volume-10k.csv');
fs.writeFileSync(outPath, csvText, 'utf8');
const fileBytes = fs.statSync(outPath).size;

const rowCount = lines.length - 1;

/* ------------------------------------------------------------------ *
 * 2. Pipeline instrumentation
 * ------------------------------------------------------------------ */
function buildRowObjects(headers, rows, mapping) {
  return rows.map(function (cells) {
    const obj = {};
    headers.forEach(function (h, i) {
      const field = mapping[h];
      if (field && cells[i] !== undefined) { obj[field] = String(cells[i]).trim(); }
    });
    return obj;
  });
}

function timeit(fn) {
  const t0 = performance.now();
  const out = fn();
  return { out: out, ms: performance.now() - t0 };
}

const tDelim = timeit(function () { return csv.detectDelimiter(csvText); });
const tParse = timeit(function () { return csv.parse(csvText, { delimiter: tDelim.out }); });
const tMap = timeit(function () { return csv.mapColumns(tParse.out.headers); });

const canonicalRows = buildRowObjects(tParse.out.headers, tParse.out.rows, tMap.out.mapping);

const tValidate = timeit(function () {
  return csv.validateRows({
    rows: canonicalRows,
    existingPointIds: [],
    nowISO: new Date().toISOString(),
    autoCreatePoints: true
  });
});

const validation = tValidate.out;
const tRecords = timeit(function () { return csv.toRecords(validation.valid, tMap.out.mapping); });

const records = tRecords.out;
const totalPipelineMs = tDelim.ms + tParse.ms + tMap.ms + tValidate.ms + tRecords.ms;

console.log('--- Pipeline (volumen real) ---');
console.log('archivo     : ' + outPath + '  (' + fileBytes + ' bytes, ' + rowCount + ' filas)');
console.log('delimitador : ' + JSON.stringify(tDelim.out));
console.log('counts      : valid=' + validation.valid.length +
  ' invalid=' + validation.invalid.length +
  ' duplicates=' + validation.duplicates.length +
  ' newPoints=' + validation.newPoints.length +
  ' | readings=' + records.readings.length +
  ' coupons=' + records.coupons.length);
console.log('ms          : detectDelimiter=' + tDelim.ms.toFixed(2) +
  ' parse=' + tParse.ms.toFixed(2) +
  ' mapColumns=' + tMap.ms.toFixed(2) +
  ' validateRows=' + tValidate.ms.toFixed(2) +
  ' toRecords=' + tRecords.ms.toFixed(2) +
  ' | total=' + totalPipelineMs.toFixed(2));

/* ------------------------------------------------------------------ *
 * 3. Persistence (dbMemory adapter + store)
 * ------------------------------------------------------------------ */
let readingsSaved = 0;
let couponsSaved = 0;
let storeMs = 0;
let listed = 0;
let counted = 0;

async function persist() {
  const adapter = dbMemory.create();
  const store = storeApi.create(adapter);

  let seq = 0;
  records.readings.forEach(function (r) { r.id = 'R-V-' + pad(++seq, 5); });
  seq = 0;
  records.coupons.forEach(function (c) { c.id = 'C-V-' + pad(++seq, 5); });

  const t0 = performance.now();
  const outR = await store.readings.saveAll(records.readings);
  const outC = await store.coupons.saveAll(records.coupons);
  storeMs = performance.now() - t0;
  readingsSaved = outR.length;
  couponsSaved = outC.length;

  // NOTE: store repos expose list/get/save/saveAll/remove/clear but NOT count();
  // the adapter is the layer that implements count(name).
  const t1 = performance.now();
  const all = await store.readings.list();
  listed = all.length;
  const t2 = performance.now();
  counted = await adapter.count('readings');
  const listMs = t2 - t1;
  const countMs = performance.now() - t2;

  console.log('--- Persistencia (dbMemory + store) ---');
  console.log('saveAll : readings=' + readingsSaved + ' coupons=' + couponsSaved +
    ' total=' + (readingsSaved + couponsSaved) + ' | ' + storeMs.toFixed(2) + ' ms');
  console.log('list    : total leido=' + listed + ' | ' + listMs.toFixed(2) + ' ms');
  console.log('count   : ' + counted + ' | ' + countMs.toFixed(2) + ' ms');

  return { listMs: listMs, countMs: countMs };
}

/* ------------------------------------------------------------------ *
 * 4. PASS/FAIL
 * ------------------------------------------------------------------ */
function check(name, ms, limit, detail) {
  const ok = ms < limit;
  return {
    name: name,
    ms: ms,
    limit: limit,
    ok: ok,
    line: (ok ? 'PASS' : 'FAIL') + ' ' + name + ' ' + ms.toFixed(2) + 'ms ' + detail +
      (ok ? '' : ' [> ' + limit + 'ms — hallazgo de rendimiento]')
  };
}

function coherence(name, ok, detail) {
  return { name: name, ms: null, limit: null, ok: ok, line: (ok ? 'PASS' : 'FAIL') + ' ' + name + ' - ' + detail };
}

(async function main() {
  const results = [];
  results.push(check('detectDelimiter', tDelim.ms, 500, 'delim=' + JSON.stringify(tDelim.out)));
  results.push(check('parse', tParse.ms, 2000, 'filas=' + tParse.out.rows.length));
  results.push(check('mapColumns', tMap.ms, 500, 'mapeadas=' + Object.keys(tMap.out.mapping).length + ' sin mapa=' + tMap.out.unmapped.length));
  results.push(check('validateRows', tValidate.ms, 5000, 'valid=' + validation.valid.length + ' invalid=' + validation.invalid.length));
  results.push(check('toRecords', tRecords.ms, 5000, 'readings=' + records.readings.length + ' coupons=' + records.coupons.length));
  results.push(check('totalPipeline', totalPipelineMs, 10000, 'suma de las 5 fases'));
  results.push(coherence('invalid==900', validation.invalid.length === 900,
    'invalid=' + validation.invalid.length + ' (esperado 900 = 500 futuras + 300 rango + 100 fecha)'));
  results.push(coherence('duplicates==0', validation.duplicates.length === 0,
    'duplicates=' + validation.duplicates.length));
  results.push(coherence('newPoints==20', validation.newPoints.length === 20,
    'newPoints=' + validation.newPoints.length));
  results.push(coherence('readings+coupons==valid',
    (records.readings.length + records.coupons.length) === validation.valid.length,
    records.readings.length + '+' + records.coupons.length + '=' +
    (records.readings.length + records.coupons.length) + ' vs valid=' + validation.valid.length));

  let persistRes = null;
  try {
    persistRes = await persist();
    results.push(check('saveAll', storeMs, 5000, 'readings=' + readingsSaved + ' coupons=' + couponsSaved));
    results.push(check('list', persistRes.listMs, 3000, 'total leido=' + listed));
  } catch (err) {
    results.push({ name: 'saveAll', ms: null, limit: 5000, ok: false, line: 'FAIL saveAll - error: ' + (err && err.message ? err.message : err) });
    results.push({ name: 'list', ms: null, limit: 3000, ok: false, line: 'FAIL list - error: ' + (err && err.message ? err.message : err) });
  }

  console.log('--- PASS/FAIL ---');
  results.forEach(function (r) { console.log(r.line); });

  const fails = results.filter(function (r) { return !r.ok; });
  console.log('--- Resumen ---');
  console.log('veredicto: ' + (fails.length === 0 ? 'TODO PASS' : fails.length + ' FAIL'));
  console.log('pipeline total=' + totalPipelineMs.toFixed(2) + 'ms | saveAll=' + storeMs.toFixed(2) +
    'ms | list=' + (persistRes ? persistRes.listMs.toFixed(2) : 'n/a') + 'ms');
  if (fails.length) {
    console.log('fallos: ' + fails.map(function (f) { return f.name; }).join(', '));
  }

  process.exit(fails.length === 0 ? 0 : 1);
})();
