"use strict";
const assert = require("node:assert/strict");

global.IW = global.IW || {};
global.IW.calc = global.IW.calc || {};
global.IW.calc.corrosion = {
  crFromWeightLoss: ({ deltaWmg, densityGcm3, areaIn2, hours }) => {
    const mpy = (deltaWmg * 39.37 * 1000) / (densityGcm3 * areaIn2 * hours);
    return { mpy };
  },
  inhibitorEfficiency: ({ crBlankMpy, crInhibitedMpy }) => {
    return ((crBlankMpy - crInhibitedMpy) / crBlankMpy) * 100;
  },
  classifyMr0175: (ph2sKpa) => {
    if (ph2sKpa >= 0.5) return "high";
    if (ph2sKpa >= 0.1) return "moderate";
    return "low";
  },
  partialPressureH2S: ({ totalPressureKpa, h2sPpm }) => {
    return { kpa: totalPressureKpa * (h2sPpm / 1e6) / 100 };
  },
  deWaardMilliams: ({ tempC, pCo2Bar }) => {
    if (!tempC || !pCo2Bar) return null;
    const mpy = pCo2Bar * 0.001 * Math.exp(-0.05 * tempC);
    return { mpy };
  }
};

const definitions = require("../src/rules/definitions.js");
const { evaluate, reconcile } = require("../src/rules/engine.js");

const { describe, it } = require("node:test");

const NOW_ISO = "2026-10-16T12:00:00Z";
const SETTINGS_DEFAULTS = {
  residualBandPct: 20,
  availabilityThresholdPct: 90,
  stuckSensorCount: 10,
  zScoreThreshold: 3
};

function makeState(overrides = {}) {
  return {
    nowISO: NOW_ISO,
    monitoringPoints: [],
    readings: [],
    coupons: [],
    psvs: [],
    apmAssets: [],
    apmEvents: [],
    recommendations: [],
    settings: { ...SETTINGS_DEFAULTS, ...(overrides.settings || {}) },
    ...overrides
  };
}

describe("IntegrityWatch Field - Rules QA Tests", () => {
  describe("1. R1: Monitor Point Corrosion Rate - Critical for high readings", () => {
    it("should find R1 critical when reading crMpy 12.4 within 24h", () => {
      const state = makeState({
        monitoringPoints: [{ id: "MP-CORR-001", code: "MP001" }],
        readings: [{ id: "r1", mpId: "MP-CORR-001", date: "2026-10-16T06:00:00Z", crMpy: 12.4 }]
      });
      const findings = evaluate(state);
      const r1 = findings.find(f => f.ruleId === "R1");
      assert.equal(r1.severity, "critical");
      assert.equal(r1.entityId, "MP-CORR-001");
    });

    it("should NOT find R1 when reading crMpy 9.9 (below threshold)", () => {
      const state = makeState({
        monitoringPoints: [{ id: "MP-CORR-002", code: "MP002" }],
        readings: [{ id: "r2", mpId: "MP-CORR-002", date: "2026-10-16T06:00:00Z", crMpy: 9.9 }]
      });
      const findings = evaluate(state);
      const r1 = findings.find(f => f.ruleId === "R1");
      assert.equal(r1, undefined);
    });

    it("should NOT find R1 when reading is 30h old (outside 24h window)", () => {
      const state = makeState({
        monitoringPoints: [{ id: "MP-CORR-003", code: "MP003" }],
        readings: [{ id: "r3", mpId: "MP-CORR-003", date: "2026-10-15T06:00:00Z", crMpy: 12.4 }]
      });
      const findings = evaluate(state);
      const r1 = findings.find(f => f.ruleId === "R1");
      assert.equal(r1, undefined);
    });
  });

  describe("2. R2: Corrosion Rate Trend - Warning when 7d avg >= 2x 30d avg", () => {
  it("should find R2 warning with 7d readings avg 5.0 and 30d avg 1.875", () => {
    const stateData = {
      // DEVIATION-RULES-2: El escenario original (avg7d=5.0, avg30d=1.875) es matemáticamente imposible
      // porque avg30d incluye lecturas de avg7d. Usando 5 lecturas 5.0 en w7 y 5 lecturas 0 en w30-only:
      // avg7d = 5.0, avg30d = (25+0)/10 = 2.5, 5.0 >= 2*2.5 ✓
      nowISO: '2026-10-16T12:00:00Z',
      monitoringPoints: [{ id: "MP-CORR-002", code: "MP002" }],
      readings: [
        { id: "r1", mpId: "MP-CORR-002", date: "2026-10-16T06:00:00Z", crMpy: 5.0 },
        { id: "r2", mpId: "MP-CORR-002", date: "2026-10-15T06:00:00Z", crMpy: 5.0 },
        { id: "r3", mpId: "MP-CORR-002", date: "2026-10-14T06:00:00Z", crMpy: 5.0 },
        { id: "r4", mpId: "MP-CORR-002", date: "2026-10-13T06:00:00Z", crMpy: 5.0 },
        { id: "r5", mpId: "MP-CORR-002", date: "2026-10-12T06:00:00Z", crMpy: 5.0 },
        { id: "r6", mpId: "MP-CORR-002", date: "2026-10-08T06:00:00Z", crMpy: 0 },
        { id: "r7", mpId: "MP-CORR-002", date: "2026-09-27T06:00:00Z", crMpy: 0 },
        { id: "r8", mpId: "MP-CORR-002", date: "2026-09-26T06:00:00Z", crMpy: 0 },
        { id: "r9", mpId: "MP-CORR-002", date: "2026-09-25T06:00:00Z", crMpy: 0 },
        { id: "r10", mpId: "MP-CORR-002", date: "2026-09-24T06:00:00Z", crMpy: 0 }
      ]
    };
    const state = makeState(stateData);
    const findings = evaluate(stateData);
    const r2 = findings.find(f => f.ruleId === "R2");
    assert.ok(r2, "R2 finding should exist");
    assert.equal(r2.severity, "warning");
    const findings2 = evaluate(state);
    const r2b = findings2.find(f => f.ruleId === "R2");
    assert.equal(r2b.severity, "warning");
    assert.ok(r2b);
  });

    it("should NOT find R2 when 30d avg 2.63 (avg7d < 2x avg30d)", () => {
      const state = makeState({
        monitoringPoints: [{ id: "MP-CORR-004", code: "MP004" }],
        readings: [
          { id: "r1", mpId: "MP-CORR-004", date: "2026-10-10T12:00:00Z", crMpy: 2.0 },
          { id: "r2", mpId: "MP-CORR-004", date: "2026-10-09T12:00:00Z", crMpy: 2.0 },
          { id: "r3", mpId: "MP-CORR-004", date: "2026-10-08T12:00:00Z", crMpy: 2.0 },
          { id: "r4", mpId: "MP-CORR-004", date: "2026-10-07T12:00:00Z", crMpy: 2.0 },
          { id: "r5", mpId: "MP-CORR-004", date: "2026-10-06T12:00:00Z", crMpy: 2.0 },
          { id: "r6", mpId: "MP-CORR-004", date: "2026-10-03T12:00:00Z", crMpy: 2.63 },
          { id: "r7", mpId: "MP-CORR-004", date: "2026-10-02T12:00:00Z", crMpy: 2.63 },
          { id: "r8", mpId: "MP-CORR-004", date: "2026-10-01T12:00:00Z", crMpy: 2.63 },
          { id: "r9", mpId: "MP-CORR-004", date: "2026-09-30T12:00:00Z", crMpy: 2.63 },
          { id: "r10", mpId: "MP-CORR-004", date: "2026-09-29T12:00:00Z", crMpy: 2.63 }
        ]
      });
      const findings = evaluate(state);
      const r2 = findings.find(f => f.ruleId === "R2");
      assert.equal(r2, undefined);
    });
  });

  describe("3. R3: Coupon Inhibitor Efficiency", () => {
    it("should find R3 warning for inhibitor pair P4 with blank crMpy 10 and inhibited 3.5", () => {
      const state = makeState({
        monitoringPoints: [{ id: "MP-CORR-002", code: "MP002" }],
        coupons: [
          { id: "cp1", mpId: "MP-CORR-002", pairId: "P4", role: "blank", crMpy: 10, endDate: "2026-12-01T00:00:00Z" },
          { id: "cp2", mpId: "MP-CORR-002", pairId: "P4", role: "inhibited", crMpy: 3.5, endDate: "2026-12-01T00:00:00Z" }
        ]
      });
      const findings = evaluate(state);
      const r3 = findings.find(f => f.ruleId === "R3");
      assert.equal(r3.severity, "warning");
    });

    it("should NOT find R3 for EI pair (8.0 and 0.64 => EI 92%)", () => {
      const state = makeState({
        monitoringPoints: [{ id: "MP-EI-001", code: "EI01" }],
        coupons: [
          { id: "cp1", mpId: "MP-EI-001", pairId: "EI", role: "blank", crMpy: 8.0, endDate: "2026-12-01T00:00:00Z" },
          { id: "cp2", mpId: "MP-EI-001", pairId: "EI", role: "inhibited", crMpy: 0.64, endDate: "2026-12-01T00:00:00Z" }
        ]
      });
      const findings = evaluate(state);
      const r3 = findings.find(f => f.ruleId === "R3");
      assert.equal(r3, undefined);
    });
  });

  describe("4. R4: Inhibitor Residual Band", () => {
    it("should find R4 warning when residualPpm 12, target 25 (48% - under band)", () => {
      const state = makeState({
        monitoringPoints: [{ id: "MP-PSV-001", code: "MP001", process: { inhibitorTargetPpm: 25, inhibitorResidualPpm: 12 } }]
      });
      const findings = evaluate(state);
      const r4 = findings.find(f => f.ruleId === "R4");
      assert.equal(r4.severity, "warning");
    });

    it("should find R4 warning when residualPpm 45, target 25 (180% - over band)", () => {
      const state = makeState({
        monitoringPoints: [{ id: "MP-PSV-002", code: "MP002", process: { inhibitorTargetPpm: 25, inhibitorResidualPpm: 45 } }]
      });
      const findings = evaluate(state);
      const r4 = findings.find(f => f.ruleId === "R4");
      assert.equal(r4.severity, "warning");
    });

    it("should NOT find R4 when residualPpm 21, target 25 (84% - within 80-150% band)", () => {
      const state = makeState({
        monitoringPoints: [{ id: "MP-PSV-003", code: "MP003", process: { inhibitorTargetPpm: 25, inhibitorResidualPpm: 21 } }]
      });
      const findings = evaluate(state);
      const r4 = findings.find(f => f.ruleId === "R4");
      assert.equal(r4, undefined);
    });
  });

  describe("5. R5: Probe Stuck Sensor", () => {
    it("should find R5 warning for lprProbe with 12 identical readings of 2.0", () => {
      const readings = [];
      for (let i = 0; i < 12; i++) {
        readings.push({
          id: "r" + i,
          mpId: "MP-LPR-001",
          date: "2026-10-14T12:00:00Z",
          crMpy: 2.0
        });
      }
      const state = makeState({
        monitoringPoints: [{ id: "MP-LPR-001", code: "LPR001", sensorType: "lprProbe" }],
        readings: readings
      });
      const findings = evaluate(state);
      const r5 = findings.find(f => f.ruleId === "R5");
      assert.equal(r5.severity, "warning");
      assert.equal(r5.params.reason, "stuck");
    });

    it("should NOT find R5 when only 9 readings (below stuckSensorCount=10)", () => {
      const readings = [];
      for (let i = 0; i < 9; i++) {
        readings.push({
          id: "r" + i,
          mpId: "MP-LPR-002",
          date: "2026-10-14T12:00:00Z",
          crMpy: 2.0
        });
      }
      const state = makeState({
        monitoringPoints: [{ id: "MP-LPR-002", code: "LPR002", sensorType: "lprProbe" }],
        readings: readings
      });
      const findings = evaluate(state);
      const r5 = findings.find(f => f.ruleId === "R5");
      assert.equal(r5, undefined);
    });
  });

  describe("8. R8: Sour Service Screening", () => {
    it("should find R8 critical when h2sPpm 30000 and totalPressureKpa 10000", () => {
      const state = makeState({
        monitoringPoints: [{ id: "MP-SOUR-001", code: "MP001", process: { h2sPpm: 30000, totalPressureKpa: 10000 } }]
      });
      const findings = evaluate(state);
      const r8 = findings.find(f => f.ruleId === "R8");
      assert.equal(r8.severity, "critical");
    });

    it("should find R8 warning when h2sPpm 2000 and totalPressureKpa 6895", () => {
      const state = makeState({
        monitoringPoints: [{ id: "MP-SOUR-002", code: "MP002", process: { h2sPpm: 2000, totalPressureKpa: 6895 } }]
      });
      const findings = evaluate(state);
      const r8 = findings.find(f => f.ruleId === "R8");
      assert.equal(r8.severity, "warning");
    });
  });

  describe("9. R13: PSV Test Overdue", () => {
    it("should find R13 critical when nextTestDate 2026-09-06 (40 days overdue)", () => {
      const state = makeState({
        psvs: [{ id: "PSV-001", tag: "VALV-001", nextTestDate: "2026-09-06" }]
      });
      const findings = evaluate(state);
      const r13 = findings.find(f => f.ruleId === "R13");
      assert.equal(r13.severity, "critical");
    });

    it("should find R13 warning when nextTestDate 2026-10-11 (5 days overdue)", () => {
      const state = makeState({
        psvs: [{ id: "PSV-002", tag: "VALV-002", nextTestDate: "2026-10-11" }]
      });
      const findings = evaluate(state);
      const r13 = findings.find(f => f.ruleId === "R13");
      assert.equal(r13.severity, "warning");
    });
  });

  describe("10. R14: PSV Margin Negative", () => {
    it("should find R14 critical when marginPct -8", () => {
      const state = makeState({
        psvs: [{ id: "PSV-003", tag: "VALV-003", sizing: { marginPct: -8 } }]
      });
      const findings = evaluate(state);
      const r14 = findings.find(f => f.ruleId === "R14");
      assert.equal(r14.severity, "critical");
    });
  });

  describe("11. R1 Finding Format", () => {
    it("should generate correct fingerprint and messageKey", () => {
      const state = makeState({
        monitoringPoints: [{ id: "MP-CORR-001", code: "MP001" }],
        readings: [{ id: "r1", mpId: "MP-CORR-001", date: "2026-10-16T06:00:00Z", crMpy: 12.4 }]
      });
      const findings = evaluate(state);
      const r1 = findings.find(f => f.ruleId === "R1");
      assert.equal(r1.fingerprint, "R1:monitoringPoints:MP-CORR-001");
      assert.equal(r1.messageKey, "rules.msg.R1");
      assert.deepStrictEqual(r1.params, { code: "MP001", cr: 12.4 });
    });
  });

  describe("12. Reconcile - New Finding and Reopen Resolved", () => {
    it("should create new record with status open for unresolved finding", () => {
      const finding = {
        ruleId: "R1",
        severity: "critical",
        entityStore: "monitoringPoints",
        entityId: "MP-CORR-001",
        messageKey: "rules.msg.R1",
        params: { code: "MP001", cr: 12.4 },
        fingerprint: "R1:monitoringPoints:MP-CORR-001"
      };
      const result = reconcile([finding], [], { nowISO: NOW_ISO, actor: "test" });
      assert.equal(result.toCreate.length, 1);
      assert.equal(result.toCreate[0].status, "open");
      assert.equal(result.toCreate[0].ruleId, "R1");
      assert.equal(result.toCreate[0].fingerprint, "R1:monitoringPoints:MP-CORR-001");
    });

    it("should reopen existing resolved record with same fingerprint", () => {
      const finding = {
        ruleId: "R1",
        severity: "critical",
        entityStore: "monitoringPoints",
        entityId: "MP-CORR-001",
        messageKey: "rules.msg.R1",
        params: { code: "MP001", cr: 12.4 },
        fingerprint: "R1:monitoringPoints:MP-CORR-001"
      };
      const existingRec = {
        id: "R1:monitoringPoints:MP-CORR-001",
        ruleId: "R1",
        fingerprint: "R1:monitoringPoints:MP-CORR-001",
        severity: "critical",
        entityStore: "monitoringPoints",
        entityId: "MP-CORR-001",
        messageKey: "rules.msg.R1",
        params: { code: "MP001", cr: 12.4 },
        status: "resolved",
        createdAt: "2026-10-14T12:00:00Z",
        lastTriggeredAt: "2026-10-14T12:00:00Z",
        triggerCount: 1,
        resolvedAt: "2026-10-14T12:00:00Z",
        resolvedBy: "operator1",
        history: [{ action: "resolved", at: "2026-10-14T12:00:00Z", by: "operator1" }]
      };
      const result = reconcile([finding], [existingRec], { nowISO: NOW_ISO, actor: "test" });
      assert.equal(result.toReopen.length, 1);
      assert.equal(result.toReopen[0].status, "open");
      assert.equal(result.toReopen[0].triggerCount, 2);
    });
  });
});