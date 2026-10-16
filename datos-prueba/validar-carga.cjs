/* Validador de carga — IntegrityWatch Field
   Ejecuta el PARSER REAL de la aplicación (src/ingest/csv.js + src/calc/corrosion.js)
   contra el CSV de prueba y muestra exactamente lo que la app hará al importar.
   Uso:  node datos-prueba/validar-carga.cjs  */
'use strict';
const fs = require('fs');
const path = require('path');
const csv = require('../src/ingest/csv.js');

const file = path.join(__dirname, 'integritywatch-carga-prueba.csv');
const text = fs.readFileSync(file, 'utf8');
const nowISO = '2026-10-16T12:00:00Z';
const EXISTING = ['MP-CORR-001', 'MP-CORR-002', 'MP-CORR-003', 'MP-CORR-004',
  'MP-CORR-005', 'MP-CORR-006', 'MP-CORR-007', 'MP-CORR-008'];

console.log('=== Validación de carga: integritywatch-carga-prueba.csv ===\n');

// 1) Delimitador
const delim = csv.detectDelimiter(text);
console.log('[1] Delimitador detectado:', delim === '\t' ? 'TAB' : JSON.stringify(delim));
console.log('    BOM presente:', text.charCodeAt(0) === 0xFEFF ? 'SÍ (¡revisar!)' : 'No');

// 2) Parse
const parsed = csv.parse(text, { delimiter: delim });
console.log('[2] Cabeceras (' + parsed.headers.length + '):', parsed.headers.join(' | '));
console.log('    Filas de datos:', parsed.rows.length);

// 3) Mapeo automático de columnas
const mapped = csv.mapColumns(parsed.headers);
const unmapped = mapped.unmapped || [];
console.log('[3] Mapeo:', Object.keys(mapped.mapping).map(function (h) {
  return h + '→' + mapped.mapping[h];
}).join(', '));
console.log('    Sin mapear:', unmapped.length ? unmapped.join(', ') : '(ninguno)');

// 4) Zip filas → objetos canónicos (como hace la vista)
const objects = parsed.rows.map(function (cells) {
  const o = {};
  parsed.headers.forEach(function (h, i) {
    const field = mapped.mapping[h];
    if (field) { o[field] = cells[i]; }
  });
  return o;
});

// 5) Validación MODO A: sin auto-crear puntos (debe dar E_MP_UNKNOWN)
const strict = csv.validateRows({ rows: objects, existingPointIds: EXISTING, nowISO: nowISO, autoCreatePoints: false });
console.log('\n[5] MODO sin auto-crear puntos:');
console.log('    válidas:', strict.valid.length,
  '| con error:', strict.invalid.length,
  '| duplicadas:', strict.duplicates.length);

// 6) Validación MODO B: con auto-crear (como importación final)
const auto = csv.validateRows({ rows: objects, existingPointIds: EXISTING, nowISO: nowISO, autoCreatePoints: true });
console.log('[6] MODO con auto-crear puntos:');
console.log('    válidas:', auto.valid.length,
  '| con error:', auto.invalid.length,
  '| duplicadas:', auto.duplicates.length,
  '| puntos nuevos:', auto.newPoints.map(function (p) { return p.code + '→' + p.id; }).join(', ') || '(ninguno)');

// Detalle de errores (iguales en ambos modos salvo MP-FANTASMA)
console.log('\n[7] Errores esperados en la tabla de la app:');
auto.invalid.forEach(function (e) {
  console.log('    fila ' + e.rowNum + ': ' + e.code + ' [' + e.field + '] ' + (e.message || ''));
});
console.log('\n    Duplicadas omitidas (filas):', auto.duplicates.map(function (d) { return d.rowNum; }).join(', ') || '(ninguna)');

// 7) Registros que se guardarían
const recs = csv.toRecords(auto.valid, mapped.mapping);
console.log('\n[8] Registros a guardar: lecturas=' + recs.readings.length + ', cupones=' + recs.coupons.length);

console.log('\n[9] Cupones: CR calculada por el MOTOR REAL (ASTM G4, 534·ΔW/(ρ·A·t)):');
recs.coupons.forEach(function (c) {
  console.log('    ' + c.mpId + ' ' + (c.note ? ('«' + c.note + '»') : '') +
    ' → CR = ' + (c.crMpy !== undefined && c.crMpy !== null ? c.crMpy.toFixed(3) + ' mpy' : '(sin calcular)'));
});

// 8) Estadísticas rápidas de lecturas válidas por punto
const byPoint = {};
recs.readings.forEach(function (r) {
  (byPoint[r.mpId] = byPoint[r.mpId] || []).push(r.crMpy);
});
console.log('\n[10] Lecturas válidas por punto (media de ESTE archivo):');
Object.keys(byPoint).sort().forEach(function (mp) {
  const vals = byPoint[mp];
  const mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  console.log('    ' + mp + ': n=' + vals.length + ', media=' + mean.toFixed(2) + ' mpy, min=' +
    Math.min.apply(null, vals) + ', max=' + Math.max.apply(null, vals));
});

console.log('\n=== Fin — estos son los resultados reales del parser de la aplicación ===');
