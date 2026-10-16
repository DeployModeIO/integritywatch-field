'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const psv = require('../src/calc/psv.js');

const TOL = 0.005;

function approx(actual, expected, label, tol) {
  tol = tol === undefined ? TOL : tol;
  assert.ok(
    Math.abs(actual - expected) <= Math.abs(expected) * tol + 1e-12,
    `${label || 'value'} expected ${expected} (±${(tol * 100).toFixed(2)}%) got ${actual}`
  );
}

// Caso agua reutilizado: Q=300 gpm, G=0.85, P1psig=124.7, P2psig=14.7 (ΔP=110), Kd=0.65.
const WATER = { Qgpm: 300, G: 0.85, P1psig: 124.7, P2psig: 14.7, Kd: 0.65 };

test('1 sizeLiquid agua → AreqIn2 ≈ 1.0677 (ΔP=110 psig)', () => {
  const r = psv.sizeLiquid(WATER);
  approx(r.AreqIn2, 1.0677, 'AreqIn2');
  assert.equal(r.Kv, 1);
});

test('2 selectOrifice → J (1.287); realCapacity margen ≈20.5 %, Qreal ≈361.9 gpm', () => {
  const r = psv.sizeLiquid(WATER);
  const o = psv.selectOrifice(r.AreqIn2);
  assert.equal(o.letter, 'J');
  assert.equal(o.areaIn2, 1.287);
  const rc = psv.realCapacity({ orificeAreaIn2: o.areaIn2, AreqIn2: r.AreqIn2, Qgpm: WATER.Qgpm });
  approx(rc.marginPct, 20.5, 'marginPct');
  approx(rc.QrealGpm, 361.9, 'QrealGpm');
});

test('3 Kv=1 y sin iterar cuando viscCp está ausente o ≤0', () => {
  const a = psv.sizeLiquid(WATER);
  assert.equal(a.Kv, 1);
  assert.equal(a.iterations, 0);
  assert.equal(a.Re, null);

  const b = psv.sizeLiquid(Object.assign({}, WATER, { viscCp: 0 }));
  assert.equal(b.Kv, 1);
  assert.equal(b.iterations, 0);
  assert.equal(b.Re, null);

  const c = psv.sizeLiquid(Object.assign({}, WATER, { viscCp: -5 }));
  assert.equal(c.Kv, 1);
  assert.equal(c.iterations, 0);
  assert.equal(c.Re, null);
});

test('4 caso viscoso: Re≈356, Kv≈0.8355, A≈0.4597, iteraciones<20', () => {
  const r = psv.sizeLiquid({ Qgpm: 100, G: 0.9, P1psig: 114.7, P2psig: 14.7, viscCp: 1000 });
  approx(r.Re, 356, 'Re');
  approx(r.Kv, 0.8355, 'Kv');
  approx(r.AreqIn2, 0.4597, 'AreqIn2');
  assert.ok(r.iterations > 0, 'debía iterar: ' + r.iterations);
  assert.ok(r.iterations < 20, 'iteraciones<20 got ' + r.iterations);
});

test('5 A_con_Kv ≥ A_sin_Kv (mismo caso viscoso vs sin viscCp)', () => {
  const viscous = psv.sizeLiquid({ Qgpm: 100, G: 0.9, P1psig: 114.7, P2psig: 14.7, viscCp: 1000 });
  const plain = psv.sizeLiquid({ Qgpm: 100, G: 0.9, P1psig: 114.7, P2psig: 14.7 });
  assert.ok(viscous.AreqIn2 >= plain.AreqIn2, `${viscous.AreqIn2} >= ${plain.AreqIn2}`);
});

test('6 reRangeWarning presente cuando Re<100 (Q=0.5 gpm, viscCp=5000)', () => {
  const r = psv.sizeLiquid({ Qgpm: 0.5, G: 0.9, P1psig: 114.7, P2psig: 14.7, viscCp: 5000 });
  assert.ok(r.Re < 100, 'Re<100 got ' + r.Re);
  assert.equal(r.reRangeWarning, 'E_RE_RANGE');
});

test('7 setPressurePsig+overpressurePct+backPressurePsig da el MISMO ΔP que P1/P2 directos', () => {
  const direct = psv.sizeLiquid(WATER);
  const viaSet = psv.sizeLiquid({
    Qgpm: 300,
    G: 0.85,
    Kd: 0.65,
    setPressurePsig: 100,
    overpressurePct: 24.7,
    backPressurePsig: 14.7
  });
  approx(viaSet.AreqIn2, direct.AreqIn2, 'AreqIn2 via set vs direct');
});

test('8 ΔP≤0 (P2psig>P1psig) lanza E_P1LEP2', () => {
  assert.throws(
    () => psv.sizeLiquid({ Qgpm: 100, G: 1, P1psig: 100, P2psig: 150 }),
    (e) => e && e.code === 'E_P1LEP2'
  );
});

test('9 kbBackpressure conventional→1 y pilot→1 con cualquier backpressure', () => {
  assert.equal(psv.kbBackpressure({ valveType: 'conventional', setPressurePsig: 100, backPressurePsig: 80 }), 1);
  assert.equal(psv.kbBackpressure({ valveType: 'pilot', setPressurePsig: 100, backPressurePsig: 80 }), 1);
  assert.equal(psv.kbBackpressure({ valveType: 'conventional' }), 1);
});

test('10 kbBackpressure balanced NO creciente con el ratio (0 %→1, ≤1)', () => {
  const op = 10;
  const P1 = 100 * (1 + op / 100);
  const pts = [0, 10, 20, 30, 40, 50];
  const kbs = pts.map((pct) =>
    psv.kbBackpressure({
      valveType: 'balanced',
      setPressurePsig: 100,
      overpressurePct: op,
      backPressurePsig: (P1 * pct) / 100
    })
  );
  approx(kbs[0], 1, 'Kb@0%');
  for (let i = 1; i < kbs.length; i++) {
    assert.ok(kbs[i] <= kbs[i - 1] + 1e-12, `Kb debe ser no creciente en ${i}: ${kbs[i - 1]} → ${kbs[i]}`);
    assert.ok(kbs[i] <= 1 + 1e-12, `Kb<=1 en ${i}: ${kbs[i]}`);
  }
});

test('11 kwBackpressureLiquid conventional→1; balanced ratio bajo→1, ratio alto→<1', () => {
  assert.equal(
    psv.kwBackpressureLiquid({ valveType: 'conventional', setPressurePsig: 100, backPressurePsig: 80 }),
    1
  );
  const low = psv.kwBackpressureLiquid({ valveType: 'balanced', setPressurePsig: 100, backPressurePsig: 20 });
  assert.equal(low, 1);
  const high = psv.kwBackpressureLiquid({ valveType: 'balanced', setPressurePsig: 100, backPressurePsig: 100 });
  assert.ok(high < 1, 'Kw ratio alto <1 got ' + high);
});

test('12 validateInput líquido: E_G (G:0), E_T (TR:0), E_SET (set 0)', () => {
  const has = (errs, code) => errs.some((e) => e.code === code);
  assert.ok(has(psv.validateInput({ setPressurePsig: 100, Qgpm: 10, G: 0 }), 'E_G'), 'E_G');
  assert.ok(has(psv.validateInput({ setPressurePsig: 100, Qgpm: 10, G: 1, TR: 0 }), 'E_T'), 'E_T');
  assert.ok(has(psv.validateInput({ setPressurePsig: 0, Qgpm: 10, G: 1 }), 'E_SET'), 'E_SET');
});
