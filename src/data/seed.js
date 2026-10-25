/* IntegrityWatch Field — seed
   Deterministic demo data generator (SCHEMA §8.5). Uses IW.calc.units.mulberry32(42)
   for reproducible jitter. All dates are derived from an injectable reference "now"
   (opts.nowISO) and are never in the future. PSV sizing is computed with the real
   IW.calc.psv engine, and derived hooks (coupon crMpy caching, PSV status) run through
   repos.save. No recommendations are created: the first rules sweep generates them. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.data = root.IW.data || {};
  root.IW.data.seed = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var DAY = 86400000;
  var HOUR = 3600000;

  // Protected sibling require: resolves at load time in Node only, never in the browser.
  var units = null;
  var psv = null;
  try { units = require('../calc/units.js'); } catch (e) { units = null; }
  try { psv = require('../calc/psv.js'); } catch (e) { psv = null; }

  // Cross-module access ONLY at call time (CONTRACTS §1).
  function getUnits() { return (root.IW && root.IW.calc && root.IW.calc.units) || units; }
  function getPsv() { return (root.IW && root.IW.calc && root.IW.calc.psv) || psv; }

  function referenceNow(opts) {
    if (opts && typeof opts.nowISO === 'string') {
      var ms = Date.parse(opts.nowISO);
      if (!isNaN(ms)) { return ms; }
    }
    var d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  function iso(ms) { return new Date(ms).toISOString(); }
  function daysAgo(nowMs, days) { return iso(nowMs - days * DAY); }
  function hoursAgo(nowMs, hours) { return iso(nowMs - hours * HOUR); }

  function jitter(rand, amp) { return (rand() * 2 - 1) * amp; }

  // ---- entity builders ---------------------------------------------------------

  function buildMonitoringPoints(nowMs) {
    function mp(id, code, name, sector, material, sensorType, line, stationKm, location, process) {
      var rec = {
        id: id, code: code, name: name, sector: sector, material: material,
        sensorType: sensorType, line: line, process: process
      };
      if (stationKm !== undefined && stationKm !== null) { rec.stationKm = stationKm; }
      if (location) { rec.location = location; }
      return rec;
    }

    return [
      mp('MP-CORR-001', 'MP-CORR-001', 'Wellhead Norte 1', 'upstream', 'api5l-x52', 'couponGravimetric', 'Wellhead Norte 1', 12, 'km 12, wellhead',
        { h2sPpm: 2000, co2Ppm: 12000, totalPressureKpa: 6895, tempC: 60, bswPct: 5, velocityMs: 1.2, inhibitorTargetPpm: 25, inhibitorResidualPpm: 24 }),
      mp('MP-CORR-002', 'MP-CORR-002', 'Flowline A', 'upstream', 'api5l-gr-b', 'couponGravimetric', 'Flowline A', 5, 'km 5, flowline',
        { co2Ppm: 8000, totalPressureKpa: 4137, tempC: 55, bswPct: 8, velocityMs: 0.9 }),
      mp('MP-CORR-003', 'MP-CORR-003', 'Trunk Norte 16', 'midstream', 'a106-b', 'erProbe', 'Trunk Norte 16', 40, 'km 40, trunk',
        { h2sPpm: 50, co2Ppm: 3000, totalPressureKpa: 517, tempC: 40 }),
      mp('MP-CORR-004', 'MP-CORR-004', 'Station suction', 'midstream', 'api5l-x60', 'lprProbe', 'Station suction', 84, 'km 84, pump suction',
        { co2Ppm: 2000, totalPressureKpa: 690, tempC: 35 }),
      mp('MP-CORR-005', 'MP-CORR-005', 'Separator outlet', 'downstream', 'ss-316l', 'couponGravimetric', 'Separator V-101', undefined, 'Separator V-101 outlet',
        { co2Ppm: 500, totalPressureKpa: 200, tempC: 70 }),
      mp('MP-CORR-006', 'MP-CORR-006', 'Gas lift header', 'upstream', 'duplex-2205', 'h2Probe', 'Gas lift header', 18, 'km 18, gas lift header',
        { h2sPpm: 500, totalPressureKpa: 4137, tempC: 80 }),
      mp('MP-CORR-007', 'MP-CORR-007', 'Column overhead', 'downstream', 'a516-70', 'utInspection', 'Column C-201', undefined, 'Column C-201 overhead',
        { co2Ppm: 300, totalPressureKpa: 150, tempC: 90 }),
      mp('MP-CORR-008', 'MP-CORR-008', 'ROW crossing', 'midstream', 'cs-coated', 'visual', 'ROW crossing', 104, 'km 104, river crossing', {})
    ];
  }

  function buildReadings(nowMs, rand) {
    var out = [];
    var idSeq = 0;
    function push(mpId, k, date, crMpy) {
      idSeq += 1;
      out.push({ id: 'RD-' + mpId + '-' + idSeq, mpId: mpId, date: date, crMpy: crMpy, source: 'seed' });
    }

    // MP-001: 30-day spaced baseline over 90 days + a >=10 mpy spike in the last 24 h (R1).
    for (var a = 0; a < 30; a++) {
      push('MP-CORR-001', a, daysAgo(nowMs, 90 - a * 3), 3.2 + jitter(rand, 1.0));
    }
    push('MP-CORR-001', 'spike', hoursAgo(nowMs, 6), 12.4);

    // MP-002: daily over the last 30 days; last 7 days at 6.0 mpy vs 1.5 mpy before (R2).
    for (var b = 0; b < 30; b++) {
      var cr = b >= 23 ? 6.0 : 1.5 + jitter(rand, 0.2);
      push('MP-CORR-002', b, daysAgo(nowMs, 30 - b), cr);
    }

    // MP-003: 12 identical ER-probe readings (R5 stuck sensor).
    for (var c = 0; c < 12; c++) {
      push('MP-CORR-003', c, daysAgo(nowMs, 36 - c * 3), 4.0);
    }

    // MP-004..008: calm, non-triggering series of varying length.
    var calm = [
      { mpId: 'MP-CORR-004', n: 10, span: 30, base: 2.0, amp: 0.5 },
      { mpId: 'MP-CORR-005', n: 10, span: 28, base: 1.8, amp: 0.4 },
      { mpId: 'MP-CORR-006', n: 10, span: 27, base: 2.5, amp: 0.6 },
      { mpId: 'MP-CORR-007', n: 9, span: 26, base: 1.2, amp: 0.3 },
      { mpId: 'MP-CORR-008', n: 8, span: 24, base: 1.0, amp: 0.3 }
    ];
    calm.forEach(function (cfg) {
      for (var k = 0; k < cfg.n; k++) {
        push(cfg.mpId, k, daysAgo(nowMs, cfg.span - k * 3), cfg.base + jitter(rand, cfg.amp));
      }
    });

    return out;
  }

  function buildCoupons(nowMs) {
    var density = 7.85;
    var area = 2.0;
    var days = 30;
    function deltaFor(targetCr) { return targetCr * density * area * 24 * days / 534; }
    function coupon(id, pairId, role, targetCr) {
      var wi = 1000;
      var wf = wi - deltaFor(targetCr);
      return {
        id: id, mpId: 'MP-CORR-001', pairId: pairId, role: role, material: 'api5l-x52',
        densityGcm3: density, wiMg: wi, wfMg: wf, areaIn2: area, days: days,
        startDate: daysAgo(nowMs, 90), endDate: daysAgo(nowMs, 30), status: 'active'
      };
    }
    return [
      coupon('CP-P1-BLANK', 'P1', 'blank', 8.0),
      coupon('CP-P1-INH', 'P1', 'inhibited', 0.64),
      coupon('CP-P2-BLANK', 'P2', 'blank', 10.0),
      coupon('CP-P2-INH', 'P2', 'inhibited', 3.5)
    ];
  }

  function buildPsvs(nowMs, nowISO) {
    var api = getPsv();

    function gas(id, tag, fluid, setPsig, Wlbh, tempF, backPsig, valveType, assetId, location, nextTestDaysAgo) {
      var op = 10;
      var P1 = setPsig * (1 + op / 100) + 14.7;
      var P2 = backPsig + 14.7;
      var Kb = api.kbBackpressure({ valveType: valveType, backPressurePsig: backPsig, setPressurePsig: setPsig, overpressurePct: op });
      var r = api.sizeGasVapor({ Wlbh: Wlbh, P1psia: P1, P2psia: P2, TR: tempF + 459.67, Z: fluid.Z != null ? fluid.Z : 1, M: fluid.M, k: fluid.k, Kd: 0.975, Kb: Kb, Kc: 1 });
      var orf = api.selectOrifice(r.AreqIn2);
      var cap = api.realCapacity({ orificeAreaIn2: orf.areaIn2, AreqIn2: r.AreqIn2, Wlbh: Wlbh });
      return {
        id: id, tag: tag, assetId: assetId, location: location, valveType: valveType,
        fluidId: fluid.id, fluid: fluid, setPressurePsig: setPsig, operatingTempF: tempF,
        backPressurePsig: backPsig, Wlbh: Wlbh, Kd: 0.975, Kc: 1,
        orificeLetter: orf.letter, certifiedCapacity: orf.areaIn2,
        sizing: {
          AreqIn2: r.AreqIn2, AreqCm2: r.AreqCm2, critical: r.critical, C: r.C,
          Kb: Kb, selectedAreaIn2: orf.areaIn2, WrealLbh: cap.WrealLbh,
          marginPct: cap.marginPct, computedAtISO: nowISO
        },
        lastTestDate: daysAgo(nowMs, 365), nextTestDate: daysAgo(nowMs, nextTestDaysAgo)
      };
    }

    function liquid(id, tag, fluid, setPsig, Qgpm, backPsig, valveType, assetId, location, nextTestDaysAgo) {
      var op = 10;
      var Kw = api.kwBackpressureLiquid({ backPressurePsig: backPsig, setPressurePsig: setPsig, valveType: valveType });
      var r = api.sizeLiquid({ Qgpm: Qgpm, G: fluid.G, setPressurePsig: setPsig, overpressurePct: op, backPressurePsig: backPsig, Kd: 0.65, Kw: Kw, Kc: 1, viscCp: fluid.viscCp });
      var orf = api.selectOrifice(r.AreqIn2);
      var cap = api.realCapacity({ orificeAreaIn2: orf.areaIn2, AreqIn2: r.AreqIn2, Qgpm: Qgpm });
      return {
        id: id, tag: tag, assetId: assetId, location: location, valveType: valveType,
        fluidId: fluid.id, fluid: fluid, setPressurePsig: setPsig,
        backPressurePsig: backPsig, Qgpm: Qgpm, Kd: 0.65, Kc: 1,
        orificeLetter: orf.letter, certifiedCapacity: orf.areaIn2,
        sizing: {
          AreqIn2: r.AreqIn2, AreqCm2: r.AreqCm2, Kv: r.Kv, Re: r.Re, iterations: r.iterations,
          Kw: Kw, selectedAreaIn2: orf.areaIn2, QrealGpm: cap.QrealGpm,
          marginPct: cap.marginPct, computedAtISO: nowISO
        },
        lastTestDate: daysAgo(nowMs, 365), nextTestDate: daysAgo(nowMs, nextTestDaysAgo)
      };
    }

    var methane = { id: 'methane', name: 'Methane', phase: 'gas', M: 16.04, k: 1.31, Z: 0.95 };
    var natGas = { id: 'natural-gas', name: 'Natural gas', phase: 'gas', M: 19.0, k: 1.30, Z: 0.95 };
    var crude = { id: 'crude-oil', name: 'Crude oil', phase: 'liquid', G: 0.85, viscCp: 15 };

    var out = [
      gas('PSV-520-001', 'PSV-520-001', methane, 150, 50000, 140, 0, 'conventional', 'APM-MD-003', 'Compressor K-101 discharge', 10),
      gas('PSV-520-002', 'PSV-520-002', natGas, 100, 30000, 120, 0, 'conventional', 'APM-UP-002', 'Platform A gas header', 25),
      liquid('PSV-520-003', 'PSV-520-003', crude, 100, 300, 10, 'conventional', 'APM-MD-001', 'Pump station 16 discharge', 60),
      gas('PSV-520-004', 'PSV-520-004', methane, 120, 15000, 100, 5, 'pilot', 'APM-MD-003', 'Gas plant inlet', 15),
      gas('PSV-520-005', 'PSV-520-005', methane, 130, 20000, 140, 0, 'conventional', 'APM-DN-001', 'Heat exchanger E-101 shell', 40)
    ];
    // API 576 inspection records (demo): PSV-001 overdue (R16 fires), PSV-003 current
    out[0].inspLast = new Date(nowMs - 400 * 86400000).toISOString();
    out[0].inspNext = new Date(nowMs - 35 * 86400000).toISOString();
    out[0].inspResult = 'pass';
    out[2].inspLast = new Date(nowMs - 30 * 86400000).toISOString();
    out[2].inspNext = new Date(nowMs + 335 * 86400000).toISOString();
    out[2].inspResult = 'pass';
    return out;
  }

  function buildPipelineSystem() {
    return {
      id: 'SYS-NORTE-16', name: 'Norte 16" Crude', operator: 'Norte Operator S.A.', product: 'crude',
      dnIn: 16, wallThicknessMm: 9.53, material: 'api5l-x52', coating: 'FBE',
      opPressureMpa: 6.0,
      lengthKm: 120, stationFromKm: 0, stationToKm: 120
    };
  }

  function buildLineAssets(nowMs) {
    function asset(id, code, name, type, stationKm, side, lastInspectionDaysAgo, certExpiryDaysAgo) {
      var rec = { id: id, code: code, name: name, systemId: 'SYS-NORTE-16', type: type, stationKm: stationKm, side: side };
      if (lastInspectionDaysAgo) { rec.lastInspectionISO = daysAgo(nowMs, lastInspectionDaysAgo); }
      if (certExpiryDaysAgo) { rec.certExpiryISO = daysAgo(nowMs, certExpiryDaysAgo); }
      return rec;
    }
    return [
      asset('LA-N16-001', 'LA-N16-001', 'Section valve SV-01', 'sectionValve', 0, 'left'),
      asset('LA-N16-002', 'LA-N16-002', 'Flange FL-02', 'flange', 12, 'center'),
      asset('LA-N16-003', 'LA-N16-003', 'Block valve BV-03', 'blockValve', 24, 'right', 120, 25),
      asset('LA-N16-004', 'LA-N16-004', 'Road crossing CR-04', 'crossing', 30, 'center'),
      asset('LA-N16-005', 'LA-N16-005', 'Pump station PS-16', 'pumpStation', 40, 'left', 200),
      asset('LA-N16-006', 'LA-N16-006', 'Right of way ROW-06', 'row', 50, 'center'),
      asset('LA-N16-007', 'LA-N16-007', 'Section valve SV-07', 'sectionValve', 60, 'right'),
      asset('LA-N16-008', 'LA-N16-008', 'Tank TK-08', 'tank', 72, 'left'),
      asset('LA-N16-009', 'LA-N16-009', 'Block valve BV-09', 'blockValve', 84, 'right'),
      asset('LA-N16-010', 'LA-N16-010', 'Fitting FT-10', 'fitting', 90, 'center'),
      asset('LA-N16-011', 'LA-N16-011', 'River crossing CR-11', 'crossing', 104, 'left', 45),
      asset('LA-N16-012', 'LA-N16-012', 'Metering station MS-12', 'meteringStation', 120, 'center')
    ];
  }

  function buildLineInspections(nowMs) {
    function insp(id, type, lineAssetId, daysAgoN, severity, fromKm, toKm, findings, reportRef) {
      var rec = {
        id: id, systemId: 'SYS-NORTE-16', type: type, lineAssetId: lineAssetId,
        date: daysAgo(nowMs, daysAgoN), severity: severity, fromKm: fromKm, toKm: toKm
      };
      if (findings) { rec.findings = findings; }
      if (reportRef) { rec.reportRef = reportRef; }
      return rec;
    }
    return [
      insp('INSP-N16-001', 'ild', 'LA-N16-011', 80, 'moderate', 100, 120, 'Metal loss at river crossing', 'ILD-2026-01'),
      insp('INSP-N16-002', 'externalCorrosion', 'LA-N16-002', 60, 'low', 10, 14, 'Minor coating damage'),
      insp('INSP-N16-003', 'visual', 'LA-N16-005', 45, 'high', 38, 42, 'Severe pitting on discharge flange'),
      insp('INSP-N16-004', 'ut', 'LA-N16-003', 30, 'severe', 22, 26, 'Wall thickness below minimum at block valve', 'UT-2026-02'),
      insp('INSP-N16-005', 'visual', 'LA-N16-008', 15, 'low', 70, 74, 'Routine visual inspection')
    ];
  }

  function buildApmAssets(nowMs) {
    function asset(id, code, name, sector, category, criticality, pof, cof, nextInspectionDaysAgo) {
      var rbi = { pof: pof, cof: cof, inspectionBaseMonths: 24 };
      if (nextInspectionDaysAgo) { rbi.nextInspectionISO = daysAgo(nowMs, nextInspectionDaysAgo); }
      return { id: id, code: code, name: name, sector: sector, category: category, criticality: criticality, status: 'running', rbi: rbi };
    }
    return [
      asset('APM-UP-001', 'WELL-01', 'Well Norte 1', 'upstream', 'well', 'B', 2, 4),
      asset('APM-UP-002', 'PLAT-01', 'Platform A', 'upstream', 'platform', 'A', 3, 5),
      asset('APM-UP-003', 'ESP-01', 'ESP Well 1', 'upstream', 'esp', 'C', 4, 4),
      asset('APM-MD-001', 'PPS-01', 'Pump station 16', 'midstream', 'pumpStation', 'A', 3, 3),
      asset('APM-MD-002', 'PL-16', 'Pipeline Norte 16', 'midstream', 'pipeline', 'B', 3, 4),
      asset('APM-MD-003', 'GP-01', 'Gas plant Norte', 'midstream', 'gasPlant', 'B', 2, 3),
      asset('APM-DN-001', 'HEX-01', 'Heat exchanger E-101', 'downstream', 'heatExchanger', 'C', 5, 4, 45),
      asset('APM-DN-002', 'PMP-02', 'Crude pump P-102', 'downstream', 'pump', 'A', 4, 5),
      asset('APM-DN-004', 'COL-01', 'Column C-201', 'downstream', 'column', 'B', 2, 2),
      // O&G equipment catalogue (pumps, power generation, fire protection, substation).
      asset('APM-MD-105', 'PUMP-201A', 'Centrifugal pump P-201A (API 610)', 'midstream', 'centrifugalPump', 'A', 3, 4, 4),
      asset('APM-MD-106', 'GEN-101', 'Emergency generator G-101 — 2.5 MW (ISO 8528)', 'midstream', 'generator', 'A', 2, 5),
      asset('APM-MD-107', 'FP-01', 'Fire water pump FP-01 (NFPA 20)', 'midstream', 'firePump', 'A', 2, 5, 40),
      asset('APM-MD-108', 'FPS-01', 'Foam deluge system — tank farm (NFPA 11 / NBR 13714)', 'midstream', 'fireSystem', 'A', 2, 5),
      asset('APM-DN-003', 'PUMP-305', 'Centrifugal pump P-305 (API 610)', 'downstream', 'centrifugalPump', 'B', 2, 3),
      asset('APM-MD-004', 'TK-101', 'Tank farm TK-101', 'midstream', 'storageTank', 'B', 2, 3),
      asset('APM-MD-005', 'C-501', 'Compressor C-501', 'midstream', 'compressorStation', 'C', 3, 4),
      asset('APM-MD-006', 'SEP-7', 'Test separator SEP-7', 'midstream', 'separator', 'B', 2, 3),
      asset('APM-DN-005', 'FT-201', 'Field instrument FT-201', 'downstream', 'sensor', 'C', 4, 3)
    ];
  }

  function buildIliAnomalies() {
    return [
      { id: 'ILI-N16-001', assetId: 'LA-N16-011', systemId: 'SYS-NORTE-16', stationKm: 106.2, depthPct: 18, lengthMm: 45, widthMm: 15, type: 'metalLoss', inspectionId: 'INSP-N16-001', date: '2025-08-01T00:00:00.000Z' },
      { id: 'ILI-N16-002', assetId: 'LA-N16-003', systemId: 'SYS-NORTE-16', stationKm: 24.5, depthPct: 42, lengthMm: 120, widthMm: 30, type: 'metalLoss', inspectionId: 'INSP-N16-004', date: '2025-09-15T00:00:00.000Z' },
      { id: 'ILI-N16-003', assetId: 'LA-N16-005', systemId: 'SYS-NORTE-16', stationKm: 40.8, depthPct: 12, lengthMm: 60, widthMm: 18, type: 'dent', inspectionId: 'INSP-N16-003', date: '2025-09-15T00:00:00.000Z' },
      { id: 'ILI-N16-004', assetId: 'LA-N16-009', systemId: 'SYS-NORTE-16', stationKm: 85.1, depthPct: 58, lengthMm: 200, widthMm: 50, type: 'metalLoss', inspectionId: 'INSP-N16-004', date: '2025-09-15T00:00:00.000Z' },
      { id: 'ILI-N16-005', assetId: 'LA-N16-002', systemId: 'SYS-NORTE-16', stationKm: 13.7, depthPct: 25, lengthMm: 80, widthMm: 22, type: 'crack', inspectionId: 'INSP-N16-002', date: '2025-07-20T00:00:00.000Z' },
      { id: 'ILI-N16-006', assetId: 'LA-N16-010', systemId: 'SYS-NORTE-16', stationKm: 92.3, depthPct: 8, lengthMm: 30, widthMm: 10, type: 'metalLoss', inspectionId: 'INSP-N16-001', date: '2025-08-01T00:00:00.000Z' }
    ];
  }

  function buildApmEvents(nowMs) {
    function event(id, assetId, type, startDaysAgo, downtimeH, extra) {
      var rec = { id: id, assetId: assetId, type: type, start: daysAgo(nowMs, startDaysAgo), downtimeH: downtimeH };
      if (extra) {
        if (extra.description) { rec.description = extra.description; }
        if (extra.workOrderRef) { rec.workOrderRef = extra.workOrderRef; }
      }
      return rec;
    }
    return [
      event('EV-001', 'APM-UP-001', 'maintenance', 120, 8),
      event('EV-002', 'APM-UP-002', 'inspection', 200, 0),
      event('EV-003', 'APM-UP-002', 'maintenance', 50, 6),
      event('EV-004', 'APM-UP-003', 'failure', 150, 12),
      event('EV-005', 'APM-UP-003', 'maintenance', 30, 4),
      event('EV-006', 'APM-MD-001', 'failure', 10, 24),
      event('EV-007', 'APM-MD-001', 'unplannedOutage', 30, 200),
      event('EV-008', 'APM-MD-001', 'maintenance', 60, 100),
      event('EV-009', 'APM-MD-002', 'inspection', 250, 0),
      event('EV-010', 'APM-MD-003', 'maintenance', 70, 10),
      event('EV-011', 'APM-MD-003', 'workOrder', 20, 0),
      event('EV-012', 'APM-DN-001', 'failure', 100, 16),
      event('EV-013', 'APM-DN-001', 'inspection', 15, 0),
      event('EV-014', 'APM-DN-002', 'failure', 5, 8),
      event('EV-015', 'APM-DN-002', 'failure', 20, 12),
      event('EV-016', 'APM-DN-002', 'failure', 40, 6),
      event('EV-017', 'APM-DN-002', 'maintenance', 160, 4),
      event('EV-018', 'APM-DN-004', 'maintenance', 45, 6),
      event('EV-019', 'APM-MD-105', 'failure', 12, 8, { description: 'Mechanical seal failure on pump P-201A', workOrderRef: 'OT-2026-612' }),
      event('EV-020', 'APM-MD-106', 'maintenance', 25, 6, { description: 'Preventive maintenance on emergency generator G-101', workOrderRef: 'OT-2026-618' }),
      event('EV-021', 'APM-MD-108', 'inspection', 18, 0, { description: 'Inspection of foam deluge system FPS-01', workOrderRef: 'OT-2026-621' }),
      // Wear-out demo for Weibull reliability faceplate (P-102 crude pump, 6 failure events
      // with decreasing TBF: intervals 40→30→20→15→10→5 days → β>1.2 wear-out pattern).
      event('EV-022', 'APM-DN-002', 'failure', 70, 10, { description: 'Bearing failure on P-102', workOrderRef: 'OT-2026-710' }),
      event('EV-023', 'APM-DN-002', 'failure', 110, 14, { description: 'Mechanical seal failure on P-102', workOrderRef: 'OT-2026-705' }),
      event('EV-024', 'APM-DN-002', 'failure', 160, 18, { description: 'Impeller wear on P-102', workOrderRef: 'OT-2026-698' })
    ];
  }

  // ---- demo --------------------------------------------------------------------

  function demo(repos, opts) {
    var nowMs = referenceNow(opts);
    var nowISO = iso(nowMs);
    var u = getUnits();
    var rand = (u && typeof u.mulberry32 === 'function') ? u.mulberry32(42) : (function () { return 0.5; });

    var monitoringPoints = buildMonitoringPoints(nowMs);
    var readings = buildReadings(nowMs, rand);
    var coupons = buildCoupons(nowMs);
    var psvs = buildPsvs(nowMs, nowISO);
    var pipelineSystems = [buildPipelineSystem()];
    var lineAssets = buildLineAssets(nowMs);
    var lineInspections = buildLineInspections(nowMs);
    var iliAnomalies = buildIliAnomalies();
    var apmAssets = buildApmAssets(nowMs);
    var apmEvents = buildApmEvents(nowMs);

    var writes = [];
    monitoringPoints.forEach(function (r) { writes.push(repos.monitoringPoints.save(r, nowISO)); });
    readings.forEach(function (r) { writes.push(repos.readings.save(r, nowISO)); });
    coupons.forEach(function (r) { writes.push(repos.coupons.save(r, nowISO)); });
    psvs.forEach(function (r) { writes.push(repos.psvs.save(r, nowISO)); });
    pipelineSystems.forEach(function (r) { writes.push(repos.pipelineSystems.save(r, nowISO)); });
    lineAssets.forEach(function (r) { writes.push(repos.lineAssets.save(r, nowISO)); });
    lineInspections.forEach(function (r) { writes.push(repos.lineInspections.save(r, nowISO)); });
    iliAnomalies.forEach(function (r) { writes.push(repos.iliAnomalies.save(r, nowISO)); });
    apmAssets.forEach(function (r) { writes.push(repos.apmAssets.save(r, nowISO)); });
    apmEvents.forEach(function (r) { writes.push(repos.apmEvents.save(r, nowISO)); });

    return Promise.all(writes).then(function () {
      return {
        counts: {
          pipelineSystems: pipelineSystems.length,
          lineAssets: lineAssets.length,
          lineInspections: lineInspections.length,
          iliAnomalies: iliAnomalies.length,
          monitoringPoints: monitoringPoints.length,
          readings: readings.length,
          coupons: coupons.length,
          psvs: psvs.length,
          apmAssets: apmAssets.length,
          apmEvents: apmEvents.length,
          recommendations: 0
        }
      };
    });
  }

  return { demo: demo };
});
