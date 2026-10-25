/* IntegrityWatch Field — ffs
   API 579-1 Part 3 Level 1 Fitness-For-Service: general metal loss assessment.
   UMD-lite, pure, deterministic. No runtime dependencies.

   Assumptions & limitations (golden rule, see docs/STANDARDS.md §6):
   - Circumferential stress formula for cylindrical shells (thin-wall approximation).
   - Level 1 screening only: general uniform metal loss, no pitting interaction,
     no weld joint efficiency for dissimilar metals.
   - Pit screening is conservative L1: pitDepth ≤ tMeas − tRequired.
     Full API 579 L2/L3 requires LTA interaction rules, RSF, and reference stress.
   - Units: MPa for pressure and stress, mm for thickness and radius.
   - Corrosion allowance (CA) reduces the effective wall for MAWP assessment:
     assessed MAWP uses (t − CA) as the effective thickness.
*/
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.ffs = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function isNumber(v) { return typeof v === 'number' && isFinite(v); }
  function isPositive(v) { return isNumber(v) && v > 0; }

  function badInput(msg) {
    var e = new Error(msg);
    e.code = 'E_BAD_INPUT';
    return e;
  }

  // t_req = P * Ri / (S * E − 0.6 * P) + CA   (mm)
  // P in MPa, S in MPa, Ri in mm, E 0..1, CA in mm
  function requiredThickness(input) {
    input = input || {};
    var P = input.P;
    var Ri = input.Ri;
    var S = input.S;
    var E = input.E != null ? input.E : 1;
    var CA = input.CA != null ? input.CA : 0;
    if (!isPositive(P)) { throw badInput('E_BAD_INPUT: P must be > 0'); }
    if (!isPositive(Ri)) { throw badInput('E_BAD_INPUT: Ri must be > 0'); }
    if (!isPositive(S)) { throw badInput('E_BAD_INPUT: S must be > 0'); }
    if (!isNumber(E) || E <= 0 || E > 1) { throw badInput('E_BAD_INPUT: E must be in (0, 1]'); }
    if (!isNumber(CA) || CA < 0) { throw badInput('E_BAD_INPUT: CA must be >= 0'); }
    var denom = S * E - 0.6 * P;
    if (denom <= 0) { throw badInput('E_BAD_INPUT: S*E − 0.6*P must be > 0 (got ' + denom + ')'); }
    return P * Ri / denom + CA;
  }

  // MAWP assessed = S * E * (t − CA) / (Ri + 0.6 * (t − CA))   (MPa)
  // Returns 0 if t − CA ≤ 0 (wall fully consumed).
  function mawpAssessed(input) {
    input = input || {};
    var t = input.t;
    var Ri = input.Ri;
    var S = input.S;
    var E = input.E != null ? input.E : 1;
    var CA = input.CA != null ? input.CA : 0;
    if (!isPositive(t) && t !== 0) { throw badInput('E_BAD_INPUT: t must be >= 0'); }
    if (!isPositive(Ri)) { throw badInput('E_BAD_INPUT: Ri must be > 0'); }
    if (!isPositive(S)) { throw badInput('E_BAD_INPUT: S must be > 0'); }
    if (!isNumber(E) || E <= 0 || E > 1) { throw badInput('E_BAD_INPUT: E must be in (0, 1]'); }
    if (!isNumber(CA) || CA < 0) { throw badInput('E_BAD_INPUT: CA must be >= 0'); }
    var te = t - CA;
    if (te <= 0) { return 0; }
    return S * E * te / (Ri + 0.6 * te);
  }

  // assessment = { tRequired, mawpAssessed, pass: tMeas >= tRequired,
  //                 utilization: P / mawpAssessed }
  function assessGeneralMetalLoss(input) {
    var tRequired = requiredThickness(input);
    var mawp = mawpAssessed({
      t: input.tMeas,
      Ri: input.Ri,
      S: input.S,
      E: input.E,
      CA: input.CA
    });
    return {
      tRequired: tRequired,
      mawpAssessed: mawp,
      pass: input.tMeas >= tRequired,
      utilization: mawp > 0 ? input.P / mawp : Infinity
    };
  }

  // L1 pit screening (conservative): pitDepth ≤ tMeas − tRequired.
  // tRequired computed with the given CA.
  // Full API 579 L2/L3 requires LTA interaction, RSF, and reference stress.
  function screenPit(input) {
    input = input || {};
    var tMeas = input.tMeas;
    var pitDepth = input.pitDepth;
    var CA = input.CA != null ? input.CA : 0;
    if (!isPositive(tMeas)) { throw badInput('E_BAD_INPUT: tMeas must be > 0'); }
    if (!isNumber(pitDepth) || pitDepth < 0) { throw badInput('E_BAD_INPUT: pitDepth must be >= 0'); }
    if (!isNumber(CA) || CA < 0) { throw badInput('E_BAD_INPUT: CA must be >= 0'); }
    var tReq = requiredThickness({
      P: input.P, Ri: input.Ri, S: input.S, E: input.E, CA: CA
    });
    var pass = pitDepth <= tMeas - tReq;
    return {
      pass: pass,
      tRequired: tReq,
      remainingMetal: tMeas - tReq - pitDepth
    };
  }

  // ---- assessLineSystem (pipe-system entry point) -----------------------------
  // Derives FFS parameters from a pipeline system record.
  // Defaults (documented assumptions):
  //   E = 0.85 (ERW longitudinal seam — conservative for Level 1 screening).
  //   CA = 1.5 mm (typical corrosion allowance for carbon steel pipelines).
  //   S = smysMpa from materials catalogue if available; else S = 414 MPa (X52 default).
  //   D = dnIn * 25.4 mm, Ri = D/2 − wallThicknessMm.
  //   P = opPressureMpa.
  // Returns null if any required field is missing.
  function assessLineSystem(sys, materials) {
    sys = sys || {};
    if (sys.dnIn == null || sys.wallThicknessMm == null || sys.opPressureMpa == null) {
      return null;
    }
    var D = Number(sys.dnIn) * 25.4;
    var t = Number(sys.wallThicknessMm);
    var P = Number(sys.opPressureMpa);
    var Ri = D / 2 - t;
    if (Ri <= 0) { return null; }

    // Allowable stress: SMYS from materials catalogue, else 414 MPa (X52).
    var S = 414;
    if (materials && typeof materials.byId === 'function' && sys.material) {
      var mat = materials.byId(sys.material);
      if (mat && mat.smysMpa) { S = Number(mat.smysMpa); }
    }
    // Also check global registry root.IW.data.materials.
    if (S === 414) {
      var globalMats = root.IW && root.IW.data && root.IW.data.materials;
      if (globalMats && typeof globalMats.byId === 'function' && sys.material) {
        var globalMat = globalMats.byId(sys.material);
        if (globalMat && globalMat.smysMpa) { S = Number(globalMat.smysMpa); }
      }
    }

    // Conservative defaults (Level 1 screening).
    var E = 0.85;   // ERW longitudinal seam joint efficiency.
    var CA = 1.5;   // Corrosion allowance (mm).

    var tReq = requiredThickness({ P: P, Ri: Ri, S: S, E: E, CA: CA });
    var mawp = mawpAssessed({ t: t, Ri: Ri, S: S, E: E, CA: CA });

    return {
      dnIn: Number(sys.dnIn),
      wallThicknessMm: t,
      opPressureMpa: P,
      Ri: Ri,
      S: S,
      E: E,
      CA: CA,
      tRequired: tReq,
      mawpAssessed: mawp,
      pass: t >= tReq,
      utilization: mawp > 0 ? P / mawp : Infinity
    };
  }

  return {
    requiredThickness: requiredThickness,
    mawpAssessed: mawpAssessed,
    assessGeneralMetalLoss: assessGeneralMetalLoss,
    screenPit: screenPit,
    assessLineSystem: assessLineSystem
  };
});