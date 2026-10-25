/* IntegrityWatch Field — pipeline assessment
   ASME B31G original + Modified B31G pipeline defect assessment.
   UMD-lite, pure, deterministic. No runtime dependencies.

   Assumptions & limitations (golden rule, see docs/STANDARDS.md §7):
   - Original B31G: Sf = 1.25 * SMYS (flow stress).
     Q = sqrt(1 + 0.628 * L² / (D * t))  (metric form; the original 67*L²/(D*t)
     uses in-lb units — this implementation uses the metric equivalent).
   - Modified B31G: Sf = SMYS + 68.95 MPa (SMYS + 10,000 psi).
     Effective length L'_mod = min(L, b * 0.85) where b = 2 * sqrt(D * t).
     This caps the interaction length and may produce higher Pf than original
     for long defects, but for worst-case alignment, modified is more
     conservative overall (lower Pf for equal inputs).
   - Safety factor 1.43 (B31G standard) applied to allowable pressure:
     pAllow = Pf / (1.43 * designFactor).
   - Assumes single isolated metal-loss defect on straight pipe.
     Does not model interacting defects (RSTRENG), cracks, or dents.
     Does not model axial or bending loads.
   - All units metric: D mm, t mm, Su MPa, L mm, depthPct %. Pf in MPa.
*/
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.calc = root.IW.calc || {};
  root.IW.calc.pipelineAssessment = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function isNumber(v) { return typeof v === 'number' && isFinite(v); }

  function b31g(input) {
    input = input || {};
    var D = input.D;
    var t = input.t;
    var Su = input.Su;
    var depthPct = input.depthPct != null ? input.depthPct : 0;
    var L = input.lengthMm != null ? input.lengthMm : 0;
    var modified = !!input.modified;

    if (!isNumber(D) || D <= 0) { return { Pf: 0, error: 'E_BAD_INPUT: D must be > 0' }; }
    if (!isNumber(t) || t <= 0) { return { Pf: 0, error: 'E_BAD_INPUT: t must be > 0' }; }
    if (!isNumber(Su) || Su <= 0) { return { Pf: 0, error: 'E_BAD_INPUT: Su must be > 0' }; }

    var a = (depthPct / 100) * t;
    if (a > t) { a = t; }
    if (a < 0) { a = 0; }

    var Sf;
    var L_eff;

    if (modified) {
      Sf = Su + 68.95; // SMYS + 10,000 psi
      var b = 2 * Math.sqrt(D * t);
      L_eff = Math.min(L, b * 0.85);
    } else {
      Sf = 1.25 * Su;
      L_eff = L;
    }

    // Q-factor for axial extent of corrosion
    var Q;
    if (L_eff <= 0 || D * t <= 0) {
      Q = 1; // no axial extent → Q → 1
    } else {
      Q = Math.sqrt(1 + 0.628 * L_eff * L_eff / (D * t));
    }

    var at = a / t;
    if (at >= 1) { return { Pf: 0 }; }

    // Pf = (2/3) * Sf * t / D * (1 − at) / (1 − at / Q)
    var num = (1 - at);
    var den = (1 - at / Q);
    if (den <= 0) { den = 1e-12; }
    var Pf = (2 / 3) * Sf * t / D * num / den;

    return { Pf: Pf };
  }

  function allowableOperatingPressure(input) {
    input = input || {};
    var Pf = input.Pf;
    var designFactor = input.designFactor != null ? input.designFactor : 0.72;
    if (!isNumber(Pf) || Pf <= 0) { return 0; }
    if (!isNumber(designFactor) || designFactor <= 0) { return 0; }
    return Pf / (1.43 * designFactor);
  }

  function assessAnomalies(assets, anomalies, params) {
    params = params || {};
    var Su = params.Su;
    var D = params.D;
    var t = params.t;
    var designFactor = params.designFactor != null ? params.designFactor : 0.72;
    var opPressure = params.opPressure != null ? params.opPressure : 0;

    return (anomalies || []).map(function (a) {
      var r = b31g({
        D: D,
        t: t,
        Su: Su,
        depthPct: a.depthPct,
        lengthMm: a.lengthMm,
        modified: false
      });
      var Pf = r.Pf;
      var pAllow = allowableOperatingPressure({ Pf: Pf, designFactor: designFactor });
      return {
        id: a.id,
        Pf: Pf,
        pAllow: pAllow,
        exceeds: opPressure > 0 && pAllow > 0 ? opPressure > pAllow : false
      };
    });
  }

  return {
    b31g: b31g,
    allowableOperatingPressure: allowableOperatingPressure,
    assessAnomalies: assessAnomalies
  };
});