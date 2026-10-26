#!/usr/bin/env node
/* gen-seed-assistant.mjs — F5 T2 (spec docs/SPEC-F5-ASSISTANT.md)
   Genera docs/seed-assistant.json: resumenes legibles de los datos seed reales
   (monitoring points, readings, coupons, PSVs con dimensionado API 520 real,
   pipeline, anomalias ILI, inspecciones, APM) para el corpus RAG del asistente.
   Truco de extraccion: seed.demo(repos, opts) guarda cada entidad via
   repos.<store>.save(); le pasamos un repos mock que captura todo.  */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const seed = require(path.join(root, 'src', 'data', 'seed.js'));

const nowISO = new Date().toISOString();
const nowMs = Date.parse(nowISO);

const captured = {};
const stores = ['monitoringPoints', 'readings', 'coupons', 'psvs', 'pipelineSystems',
  'lineAssets', 'lineInspections', 'iliAnomalies', 'apmAssets', 'apmEvents'];
const repos = {};
stores.forEach(function (k) {
  repos[k] = { save: function (r) { (captured[k] = captured[k] || []).push(r); return Promise.resolve(r); } };
});

function n1(v) { return (typeof v === 'number' && isFinite(v)) ? v.toFixed(1) : String(v); }

function buildFacts() {
  const facts = [];
  const push = (section, text) => facts.push({ section: section, text: text });

  // Monitoring points
  (captured.monitoringPoints || []).forEach(function (mp) {
    const p = mp.process || {};
    const head = `${mp.code} "${mp.name}" (${mp.sector}, material ${mp.material}, sensor ${mp.sensorType})`;
    const where = (mp.stationKm !== undefined && mp.stationKm !== null ? ` at km ${mp.stationKm}` : '') +
      (mp.location ? ` — ${mp.location}` : '');
    const proc = [];
    if (p.h2sPpm != null) { proc.push(`H2S ${p.h2sPpm} ppm`); }
    if (p.co2Ppm != null) { proc.push(`CO2 ${p.co2Ppm} ppm`); }
    if (p.totalPressureKpa != null) { proc.push(`${p.totalPressureKpa} kPa`); }
    if (p.tempC != null) { proc.push(`${p.tempC} °C`); }
    if (p.bswPct != null) { proc.push(`BSW ${p.bswPct}%`); }
    if (p.velocityMs != null) { proc.push(`velocity ${p.velocityMs} m/s`); }
    if (p.inhibitorTargetPpm != null) { proc.push(`inhibitor target ${p.inhibitorTargetPpm} ppm / residual ${p.inhibitorResidualPpm} ppm`); }
    push('monitoring-points', head + where + '. Process: ' + (proc.length ? proc.join(', ') + '.' : 'no gas data (visual monitoring point).'));
  });

  // Readings (aggregates per MP)
  const byMp = {};
  (captured.readings || []).forEach(function (r) { (byMp[r.mpId] = byMp[r.mpId] || []).push(r); });
  Object.keys(byMp).forEach(function (mpId) {
    const rs = byMp[mpId].slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    const last = rs[rs.length - 1];
    const vals = rs.map(function (r) { return r.crMpy; });
    const max = Math.max.apply(null, vals);
    const avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
    push('readings', `${mpId}: ${rs.length} corrosion-rate readings; latest ${n1(last.crMpy)} mpy (${String(last.date).slice(0, 10)}), max ${n1(max)} mpy, mean ${n1(avg)} mpy.`);
  });
  push('readings', 'MP-CORR-001 seeded story: ~3.2 mpy baseline over 90 days plus a 12.4 mpy spike 6 hours ago; rule R1 classifies this as critical corrosion rate.');
  push('readings', 'MP-CORR-002 seeded story: 1.5 mpy baseline shifted to 6.0 mpy over the last 7 days; rule R2 (residual band trend) triggers.');
  push('readings', 'MP-CORR-003 seeded story: 12 identical 4.0 mpy ER-probe readings; rule R5 flags a stuck sensor.');

  // Coupons (inhibitor efficiency pairs)
  const cps = captured.coupons || [];
  const pairs = {};
  cps.forEach(function (c) { (pairs[c.pairId] = pairs[c.pairId] || {})[c.role] = c; });
  Object.keys(pairs).forEach(function (pid) {
    const b = pairs[pid].blank, i = pairs[pid].inhibited;
    if (!b || !i) { return; }
    const crB = Math.round(((b.wiMg - b.wfMg) * 534) / (b.densityGcm3 * b.areaIn2 * 24 * b.days) * 10) / 10;
    const crI = Math.round(((i.wiMg - i.wfMg) * 534) / (i.densityGcm3 * i.areaIn2 * 24 * i.days) * 10) / 10;
    const eff = Math.round((1 - crI / crB) * 1000) / 10;
    push('coupons', `Coupon pair ${pid} on MP-CORR-001 (api5l-x52, 30 days): blank ${crB} mpy vs inhibited ${crI} mpy → inhibitor efficiency ≈ ${eff}%.`);
  });

  // PSVs (real API 520 sizing from seed)
  (captured.psvs || []).forEach(function (v) {
    const overdue = v.inspNext && v.inspNext < nowISO;
    push('psv', `${v.tag}: ${v.fluid.name} ${v.valveType} PSV, set ${v.setPressurePsig} psig, backpressure ${v.backPressurePsig} psig, orifice ${v.orificeLetter}, capacity margin ${n1(v.sizing.marginPct)}%${overdue ? '; API 576 inspection OVERDUE (rule R16 fires)' : ''}. Location: ${v.location}.`);
  });

  // Pipeline system + ILI anomalies + inspections
  const pl = (captured.pipelineSystems || [])[0] || {};
  (captured.pipelineSystems || []).forEach(function (s) {
    push('pipeline', `${s.id} "${s.name}": ${s.product} pipeline, API ${String(s.material).toUpperCase()}, DN${s.dnIn}", wall ${s.wallThicknessMm} mm, ${s.coating} coating, MAOP ${s.opPressureMpa} MPa, ${s.lengthKm} km, operator ${s.operator}.`);
  });
  (captured.iliAnomalies || []).forEach(function (a) {
    push('ili-anomalies', `${a.id}: ${a.type} anomaly at km ${a.stationKm} of ${a.systemId}, depth ${a.depthPct}% (${a.lengthMm}×${a.widthMm} mm), from ILI run ${String(a.date).slice(0, 10)}; assessed against MAOP ${pl.opPressureMpa} MPa in the pipelines view.`);
  });
  (captured.lineInspections || []).forEach(function (i) {
    push('line-inspections', `${i.id}: ${i.type} inspection on ${i.lineAssetId} (${i.systemId}), severity ${i.severity}, km ${i.fromKm}–${i.toKm}${i.findings ? ': ' + i.findings : ''}.`);
  });

  // APM assets (notables) + events
  const apm = captured.apmAssets || [];
  push('apm-assets', `${apm.length} APM assets seeded; criticality A (highest): ` +
    apm.filter(function (a) { return a.criticality === 'A'; }).map(function (a) { return `${a.code} (${a.name})`; }).join('; ') + '.');
  push('apm-events', (captured.apmEvents || []).length + ' APM events seeded, including failures, inspections and maintenance across wells, platform, pump stations, gas plant and downstream equipment.');
  push('apm-events', 'APM-DN-002 (crude pump P-102): 6 failure events with decreasing time between failures (40→30→20→15→10→5 days) — Weibull wear-out pattern (β > 1.2) shown in the reliability faceplate.');
  push('apm-events', 'APM-MD-105 (pump P-201A): mechanical seal failure 12 days ago, work order OT-2026-612. APM-MD-106 (generator G-101): preventive maintenance 25 days ago, OT-2026-618.');

  return facts;
}

seed.demo(repos, {}).then(function () {
  const facts = buildFacts();
  const out = {
    generated: nowISO,
    generator: 'tools/rag/gen-seed-assistant.mjs',
    counts: stores.reduce(function (acc, k) { acc[k] = (captured[k] || []).length; return acc; }, {}),
    facts: facts
  };
  const dest = path.join(root, 'docs', 'seed-assistant.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  console.log('OK docs/seed-assistant.json →', facts.length, 'facts desde', stores.reduce(function (a, k) { return a + (captured[k] || []).length; }, 0), 'entidades');
}).catch(function (e) { console.error('ERROR:', e); process.exit(1); });
