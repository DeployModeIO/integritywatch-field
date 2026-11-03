/* IntegrityWatch Field — ingest/units tests (T-units)
   Normalizadores de ingesta masiva: normalizeNumber (heuristica ES/EN/RU),
   convert (tabla por dimension, basis gauge/abs, MMY_AMBIGUOUS), parseDate
   (ambiguedad, serie Excel epoch 1899-12-30, rechazos), stripUnit y
   canonicalize (clave de alias para schemas/mapping). */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const C = require('../src/calc/units.js');
const U = require('../src/ingest/units.js');

function approx(actual, expected, rel) {
  rel = rel === undefined ? 0.005 : rel;
  assert.ok(
    Math.abs(actual - expected) / Math.abs(expected) < rel,
    actual + ' vs ' + expected + ' (rel tolerance ' + rel + ')'
  );
}

test('modulo: superficie y registro UMD', () => {
  assert.equal(typeof U.normalizeNumber, 'function');
  assert.equal(typeof U.convert, 'function');
  assert.equal(typeof U.parseDate, 'function');
  assert.equal(typeof U.stripUnit, 'function');
  assert.equal(typeof U.canonicalize, 'function');
  assert.equal(typeof U.UNITS, 'object');
  assert.equal(globalThis.IW.ingest.units, U, 'UMD root.IW.ingest.units');
});

// ---------------------------------------------------------------- normalizeNumber
test('normalizeNumber: decimales simples y ruido', () => {
  assert.equal(U.normalizeNumber('2.31'), 2.31);
  assert.equal(U.normalizeNumber(' 5 '), 5);
  assert.equal(U.normalizeNumber('42'), 42);
  assert.equal(U.normalizeNumber(42), 42);
  assert.equal(U.normalizeNumber('-7.5'), -7.5);
});

test('normalizeNumber: estilos ES/EN/RU con miles', () => {
  assert.equal(U.normalizeNumber('1 234,56'), 1234.56, 'espacio mil + coma decimal (ru/ES)');
  assert.equal(U.normalizeNumber('1.234,56'), 1234.56, 'punto mil + coma decimal (ES)');
  assert.equal(U.normalizeNumber('1,234.56'), 1234.56, 'coma mil + punto decimal (EN)');
  assert.equal(U.normalizeNumber('1.234.567'), 1234567, 'agrupacion multiple ES');
  assert.equal(U.normalizeNumber('1,234,567'), 1234567, 'agrupacion multiple EN');
  assert.equal(U.normalizeNumber('1,234,56'), 1234.56, 'coma doble con cola 2 -> decimal (ES)');
  assert.equal(U.normalizeNumber('12,34'), 12.34, 'coma con cola 2 -> decimal');
});

test('normalizeNumber: cola de exactamente 3 digitos decide por longitud del grupo izquierdo', () => {
  assert.equal(U.normalizeNumber('1.234'), 1234, 'grupo izq 1-3 + cola 3 -> MILES (no 1.234)');
  assert.equal(U.normalizeNumber('1,234'), 1234, 'idem con coma (EN thousands)');
  assert.equal(U.normalizeNumber('45.000'), 45000, 'ES miles');
  assert.equal(U.normalizeNumber('1234.500'), 1234.5, 'izquierdo de 4+ digitos -> decimal');
  assert.equal(U.normalizeNumber('1.2345'), 1.2345, 'cola 4+ -> decimal (no agrupa de 4 en 4)');
});

test('normalizeNumber: heuristica 1.234,56 vs 1,234.56 (la spec exige distinguirlas)', () => {
  assert.equal(U.normalizeNumber('1.234,56'), 1234.56);
  assert.equal(U.normalizeNumber('1,234.56'), 1234.56);
  // Con ambos simbolos el mas a la derecha es el decimal; si el otro
  // no forma grupos validos de 3, se rechaza en vez de adivinar.
  assert.equal(U.normalizeNumber('1.2345,678'), null);
  assert.equal(U.normalizeNumber('1,23,456'), null);
});

test('normalizeNumber: porcentaje y menos unicode', () => {
  assert.equal(U.normalizeNumber('45%'), 0.45);
  assert.equal(U.normalizeNumber('−12,5'), -12.5, 'U+2212 minus unicode + coma decimal');
  assert.equal(U.normalizeNumber('–12.5'), -12.5, 'U+2013 en dash');
});

test('normalizeNumber: NA/vacios/invalidos -> null', () => {
  assert.equal(U.normalizeNumber('N/A'), null);
  assert.equal(U.normalizeNumber('NA'), null);
  assert.equal(U.normalizeNumber('-'), null);
  assert.equal(U.normalizeNumber(''), null);
  assert.equal(U.normalizeNumber(null), null);
  assert.equal(U.normalizeNumber(undefined), null);
  assert.equal(U.normalizeNumber(NaN), null, 'NaN -> null');
  assert.equal(U.normalizeNumber(Infinity), null);
  assert.equal(U.normalizeNumber('abc'), null);
  assert.equal(U.normalizeNumber('5.'), null, 'separador con cola vacia');
  assert.equal(U.normalizeNumber('1e3'), null, 'exponencial no es formato de campo');
});

// ---------------------------------------------------------------- convert
test('convert: from===to -> factor 1, case-insensitive', () => {
  const r = U.convert(5, 'BAR', 'bar');
  assert.equal(r.value, 5);
  assert.equal(r.factor, 1);
  assert.equal(r.code, undefined);
});

test('convert: longitud (canonica mm), exacta en idas y vueltas', () => {
  assert.equal(U.convert(2, 'in', 'mm', 'longitud').value, 50.8);
  assert.equal(U.convert(25.4, 'mm', 'in', 'longitud').value, 1);
  approx(U.convert(5, 'mil', 'thou').value, 5);
  approx(U.convert(1, 'in.', 'cm').value, 2.54);
  assert.equal(U.convert(1, 'pulgadas', 'mm').value, 25.4);
  approx(U.convert(1000, 'µm', 'mm').value, 1);
  approx(U.convert(1000, 'um', 'mm').value, 1);
  assert.equal(U.canonicalize('µm'), 'µm', 'micro no colapsa con m (metros)');
  assert.equal(U.convert(1000, 'µm', 'mm', 'longitud').dimension, 'longitud');
  assert.equal(U.convert(5, 'm', 'mm', 'longitud').value, 5000);
});

test('convert: presion (canonica bar) con acentos y factor exacto', () => {
  const r = U.convert(1, 'bar', 'psi', 'presion');
  approx(r.value, 14.5037738, 0.0001);
  approx(U.convert(2.5, 'psi', 'bar', 'presion').value, 0.172368932, 0.0001);
  approx(U.convert(1, 'Kg/cm²', 'psi', 'presion').value, 14.223343, 0.0001);
  approx(U.convert(1, 'kgf/cm²', 'bar', 'presion').value, 0.980665, 0.0001);
  approx(U.convert(1, 'atm', 'bar').value, 1.01325, 0.0001);
  approx(U.convert(1, 'MPa', 'kPa').value, 1000, 0.0001);
});

test('convert: psig -> basis gauge y NO se convierte a absoluta', () => {
  const r = U.convert(100, 'psig', 'bar', 'presion');
  assert.equal(r.basis, 'gauge');
  approx(r.value, 100 * 0.06894757293, 0.0001, 'numerico identico a psi (no +1 atm)');
  assert.equal(U.convert(1, 'barg', 'bar').basis, 'gauge');
  assert.equal(U.convert(1, 'bara', 'bar').basis, 'abs');
  assert.equal(U.convert(1, 'psi', 'bara').basis, 'abs');
  assert.equal(U.convert(1, 'psi', 'bar').basis, 'unknown');
});

test('convert: mpam y MPaG son gauge numerico-identico a MPa', () => {
  const a = U.convert(1, 'atm', 'mpag');
  assert.equal(a.basis, 'gauge');
  approx(a.value, 0.101325, 0.0001);
  approx(U.convert(1, 'MPAM', 'bar').value, 10, 0.0001);
});

test('convert: BASIS_MISMATCH solo al cruzar gauge explicito con abs explicito', () => {
  assert.ok(U.convert(1, 'barg', 'bara').warnings.indexOf('BASIS_MISMATCH') >= 0);
  assert.equal(U.convert(1, 'psig', 'bar').warnings, undefined);
});

test('convert: temperatura via funciones offset de IW.calc.units (canonica C)', () => {
  assert.equal(U.convert(212, 'F', '°C').value, 100);
  assert.equal(U.convert(100, 'C', '°F').value, 212);
  assert.equal(U.convert(212, 'degF', 'degC').value, 100);
  approx(U.convert(300, 'K', '°C').value, 26.85, 0.0001);
  const err = U.convert(100, 'C', 'K');
  assert.equal(err.code, 'UNIT_DIMENSION');
  assert.equal(err.error, 'NO_TARGET', 'kelvin no es destino: la canonica es C');
});

test('convert: tasaCorrosion (canonica mpy) reutiliza IW.calc.units', () => {
  assert.equal(U.convert(1, 'mm/a', 'mpy').value, C.mmYearToMpy(1));
  assert.equal(U.convert(1, 'mpy', 'µm/a').value, C.mpyToUmYear(1));
  approx(U.convert(0.1, 'mm/a', 'mpy').value, 3.937007874015748, 0.0001);
  approx(U.convert(1, 'mpy', 'mm/a').value, 0.0254, 0.0001);
});

test('convert: mmpy se trata como mm/a con warning MMY_AMBIGUOUS', () => {
  const r = U.convert(1, 'mmpy', 'mpy');
  assert.deepEqual(r.warnings, ['MMY_AMBIGUOUS']);
  assert.equal(r.value, C.mmYearToMpy(1));
  approx(U.convert(1, 'mm/a', 'mmpy').value, 1, 0.0001);
});

test('convert: masa, masaPerArea y estacion', () => {
  assert.equal(U.convert(2, 'kg', 'g').value, 2000);
  approx(U.convert(1, 'oz', 'mg').value, 28349.523125, 0.000001);
  approx(U.convert(1, 'oz/ft²', 'g/m^2').value, 305.151727, 0.0001);
  approx(U.convert(1, 'g/m2', 'oz/ft2').value, 1 / 305.151727, 0.0001);
  approx(U.convert(3, 'millas', 'km').value, 4.828032, 0.0001);
  approx(U.convert(5280, 'ft', 'km').value, 1.609344, 0.0001);
  assert.equal(U.convert(5, 'm', 'km', 'estacion').from, 'm', 'm ambigua: dimension desempata');
});

test('convert: errores tipados UNIT_UNKNOWN / UNIT_DIMENSION', () => {
  assert.equal(U.convert(1, 'zork', 'bar').code, 'UNIT_UNKNOWN');
  assert.equal(U.convert(1, 'bar', 'zork').code, 'UNIT_UNKNOWN');
  assert.equal(U.convert(1, 'bar', 'mm').code, 'UNIT_DIMENSION');
  assert.equal(U.convert(1, 'bar', 'mm', 'longitud').code, 'UNIT_UNKNOWN', 'scoping: bar no existe en longitud');
  assert.equal(U.convert(NaN, 'bar', 'psi').code, 'UNIT_DIMENSION');
  assert.equal(U.convert(1, 'bar', 'psi', 'dimensionInventada').code, 'UNIT_UNKNOWN');
});

test('convert: acentos/espacios/case-insensitive y alias de dimension', () => {
  const a = U.convert(1, '  Kg/CM²  ', 'psi', 'Presión ');
  approx(a.value, 14.223343, 0.0001);
  approx(U.convert(1, 'in', 'mm', 'esesor').value, 25.4, 0.0001, 'esesor es alias de longitud (mm)');
  approx(U.convert(1, 'oz/ft2', 'g/m2', 'masa_per_area').value, 305.151727, 0.0001);
});

test('UNITS: canonicas por dimension (mapping/schemas las consulta)', () => {
  assert.equal(U.UNITS.presion.canonical, 'bar');
  assert.equal(U.UNITS.longitud.canonical, 'mm');
  assert.equal(U.UNITS.tasaCorrosion.canonical, 'mpy');
  assert.equal(U.UNITS.temperatura.canonical, 'c');
  assert.equal(U.UNITS.masa.canonical, 'g');
  assert.equal(U.UNITS.masaPerArea.canonical, 'g_m2');
  assert.equal(U.UNITS.estacion.canonical, 'km');
  assert.equal(U.UNITS.presion.units.psig.basis, 'gauge');
  assert.equal(U.UNITS.tasaCorrosion.units.mmpy.warn, 'MMY_AMBIGUOUS');
  assert.equal(U.UNITS.tasaCorrosion.units['g/m2·h'], undefined, 'flujo de masa NO es tasa de corrosion');
});

// ---------------------------------------------------------------- parseDate
test('parseDate: formatos numericos no ambiguos', () => {
  assert.deepEqual(
    { iso: U.parseDate('2026-06-05').iso, f: U.parseDate('2026-06-05').format },
    { iso: '2026-06-05', f: 'iso' });
  assert.equal(U.parseDate('2026/06/05').iso, '2026-06-05');
  assert.equal(U.parseDate('05-06-2026').iso, '2026-06-05');
  assert.equal(U.parseDate('05/06/2026').format, 'dmy');
  assert.equal(U.parseDate('5.6.2026').iso, '2026-06-05');
  assert.equal(U.parseDate('20260605').iso, '2026-06-05');
  assert.equal(U.parseDate('20260605').format, 'ymd8');
  assert.equal(U.parseDate('2026-06-05T08:30:00Z').iso, '2026-06-05T08:30:00');
  assert.equal(U.parseDate('2026-06-05T08:30').iso, '2026-06-05T08:30:00');
});

test('parseDate: ambiguedad 05/06/2026 con y sin preferDMY (default false -> es: dia primero)', () => {
  const def = U.parseDate('05/06/2026');
  assert.equal(def.iso, '2026-06-05');
  assert.equal(def.ambiguous, true);
  const pd = U.parseDate('05/06/2026', { preferDMY: true });
  assert.equal(pd.iso, '2026-06-05');
  assert.equal(pd.ambiguous, true);
  // evidencia de rango: b>12 solo cabe MM/DD por default;
  // preferDMY:true fuerza DD/MM y entonces el mes 13 es imposible.
  const forced = U.parseDate('05/13/2026');
  assert.equal(forced.iso, '2026-05-13');
  assert.equal(forced.ambiguous, false);
  const strict = U.parseDate('05/13/2026', { preferDMY: true });
  assert.equal(strict.iso, null);
  assert.equal(strict.reason, 'BAD_MONTH');
});

test('parseDate: nombres de mes EN y ES (incl. formas completas)', () => {
  assert.equal(U.parseDate('5 jun 2026').iso, '2026-06-05');
  assert.equal(U.parseDate('05-Jun-2026').iso, '2026-06-05');
  assert.equal(U.parseDate('4 julio 2026').iso, '2026-07-04');
  assert.equal(U.parseDate('22 Dec 2025').iso, '2025-12-22');
  assert.equal(U.parseDate('May 6, 2026').iso, '2026-05-06');
  assert.equal(U.parseDate('1 ene 2026').iso, '2026-01-01');
  assert.equal(U.parseDate('10 set 2026').iso, '2026-09-10', 'set = septiembre ES');
  assert.equal(U.parseDate('10 sep 2026').iso, '2026-09-10');
});

test('parseDate: serie Excel con epoch 1899-12-30 (igual que xlsx.js)', () => {
  // 45658 = 2025-01-01 (ancla conocida); 46023 = 45658 + 365 -> 2026-01-01.
  // La spec proponia '2025-12-19' para 46023: la fecha REAL verificada
  // contra el epoch es '2026-01-01' y se deja esa, documentada aqui.
  assert.equal(U.parseDate(46023).iso, '2026-01-01');
  assert.equal(U.parseDate(46023).format, 'excelSerial');
  assert.equal(U.parseDate('46023').iso, '2026-01-01', 'tambien como texto numerico');
  assert.equal(U.parseDate(45658).iso, '2025-01-01');
  assert.equal(U.parseDate(46023.5).iso, '2026-01-01T12:00:00', 'fraccion = hora');
  assert.equal(U.parseDate(109939).iso, '2200-12-31', 'ultimo serial dentro del rango de anios 1900-2200');
  assert.equal(U.parseDate(109940).reason, 'YEAR_RANGE');
  assert.equal(U.parseDate(2958465).iso, null);
  assert.equal(U.parseDate(2958465).reason, 'YEAR_RANGE', 'tope Excel 2958465 = 9999-12-31, fuera de 1900-2200');
  assert.equal(U.parseDate(2958466).reason, 'SERIAL_RANGE');
  assert.equal(U.parseDate('3000000').reason, 'SERIAL_RANGE');
});

test('parseDate: fechas imposibles y rangos -> iso:null con reason', () => {
  assert.equal(U.parseDate('31-02-2026').iso, null);
  assert.equal(U.parseDate('31-02-2026').reason, 'BAD_DAY');
  assert.equal(U.parseDate('2026-13-01').reason, 'BAD_MONTH');
  assert.equal(U.parseDate('29-02-2025').reason, 'BAD_DAY', '2025 no bisiesto');
  assert.equal(U.parseDate('29-02-2024').iso, '2024-02-29', '2024 bisiesto');
  assert.equal(U.parseDate('1899-12-31').reason, 'YEAR_RANGE');
  assert.equal(U.parseDate('2201-01-01').reason, 'YEAR_RANGE');
  assert.equal(U.parseDate(0).reason, 'YEAR_RANGE', 'serie 0 = 1899-12-30, fuera de 1900-2200');
});

test('parseDate: vacios e inentendibles', () => {
  assert.equal(U.parseDate('').iso, null);
  assert.equal(U.parseDate('').reason, 'EMPTY');
  assert.equal(U.parseDate(null).reason, 'EMPTY');
  assert.equal(U.parseDate(undefined).reason, 'EMPTY');
  assert.equal(U.parseDate('hola').reason, 'UNPARSEABLE');
  assert.equal(U.parseDate('05/06').reason, 'UNPARSEABLE');
  assert.equal(U.parseDate('2026/6').reason, 'INCOMPLETE');
  assert.equal(U.parseDate('2026-02-30T25:00:00').reason, 'BAD_DAY');
});

// ---------------------------------------------------------------- stripUnit
test('stripUnit: celdas valor+unidad', () => {
  assert.deepEqual(U.stripUnit('12.4 bar'), { value: 12.4, unit: 'bar' });
  assert.deepEqual(U.stripUnit('45 °C'), { value: 45, unit: '°C' });
  assert.deepEqual(U.stripUnit('1.500 psi'), { value: 1500, unit: 'psi' }, "'1.500' agrupa por la regla (c)");
  assert.deepEqual(U.stripUnit('−12,5 mpy'), { value: -12.5, unit: 'mpy' });
  assert.deepEqual(U.stripUnit('10 kg/m2'), { value: 10, unit: 'kg/m2' });
  assert.deepEqual(U.stripUnit('5'), { value: 5, unit: null });
  assert.deepEqual(U.stripUnit('45%'), { value: 45, unit: '%' }, 'stripUnit no escala: el '%' se devuelve como unidad');
  assert.deepEqual(U.stripUnit('abc'), { value: null, unit: 'abc' });
  assert.deepEqual(U.stripUnit(123), { value: null, unit: null });
});

// ---------------------------------------------------------------- canonicalize
test('canonicalize: definicion pactada y requisito exacto de la spec', () => {
  assert.equal(U.canonicalize('Presión (Kg/cm²)'), 'presion_kg_cm2');
  assert.equal(U.canonicalize('MPY'), 'mpy');
  assert.equal(U.canonicalize('°C'), 'c', 'grado se elimina');
  assert.equal(U.canonicalize('Fecha de Vencimiento'), 'fecha_de_vencimiento');
  assert.equal(U.canonicalize('mp-code'), 'mp_code', 'guion colapsa a _');
  assert.equal(U.canonicalize('  A 1 '), 'a_1');
  assert.equal(U.canonicalize(null), '');
  assert.equal(U.canonicalize('\u00B5m'), '\u00B5m', 'micro se conserva (no colapsa con metros)');
});

test('canonicalize: idempotente (los valores de UNITS ya estan canonicalizados)', () => {
  const cases = ['Presión (Kg/cm²)', 'Tasa (mm/a)', 'Fecha Lectura', 'µm/a', 'Área (m²)'];
  cases.forEach((c) => {
    assert.equal(U.canonicalize(U.canonicalize(c)), U.canonicalize(c), 'idempotencia: ' + c);
  });
  Object.keys(U.UNITS).forEach((dim) => {
    Object.keys(U.UNITS[dim].units).forEach((k) => {
      assert.equal(U.canonicalize(k), k, 'clave de unidad ya canonical: ' + dim + '/' + k);
    });
  });
});
