/* IntegrityWatch Field — T-06 Fitness-for-Service report model
   Plantilla T-06 del blueprint (docs/REPORTING-BLUEPRINT.md §T-06): aptitud
   para el servicio de UNA inspección de línea (pérdida de metal y picadura).
   Modelo puro (sin DOM, sin Intl, sin formateo de locale) que devuelve
   { id, meta, sections, disclaimer } con las factories de
   root.IW.reports.model, espejo de model-dossier.js / model-t03.js.

   NO reimplementa fórmulas: toda la matemática vive en calc/ffs.js y
   calc/pipelineAssessment.js, y reutiliza el MISMO flujo que la vista de
   ductos (src/views/pipelines.js):
   - ffs.assessLineSystem(system, IW.data.materials) — igual que el faceplate
     FFS (renderFfsFaceplate): Ri = dnIn*25.4/2 − t, S = SMYS del catálogo o
     414 MPa (X52), E = 0.85 (ERW), CA = 1.5 mm. El resultado expone
     Ri/S/E/CA/tRequired/mawpAssessed/pass/utilization y se reutilizan para
     los tamizajes por anomalía.
   - ffs.screenPit({tMeas, pitDepth, P, Ri, S, E, CA}) — tamizaje L1 de
     picadura por anomalía (pitDepth = depthPct/100 del espesor nominal).
   - pipelineAssessment.assessAnomalies([], anomalies, {Su, D, t,
     designFactor: 0.72, opPressure}) — B31G original por anomalía, con los
     mismos parámetros que renderIliPanel (D = dnIn*25.4, t = espesor
     nominal, Su = SMYS del catálogo o 414).

   Clasificación: calc/ffs.js solo implementa screening API 579-1 Parte 3
   Nivel 1 (sus cabeceras lo declaran: L2/L3 requieren reglas de interacción
   LTA, RSF y esfuerzo de referencia). El modelo NO inventa criterios fuera
   de calc: lista los resultados L1 y, cuando algo falla o no es evaluable,
   añade la decisión genérica 'requiere evaluación de ingeniero'
   (reports.t06EngineerReview).

   Decisión (monitorizar / reparar / reemplazar / revisar) DERIVADA
   exclusivamente de booleanos que calc expone:
   - !assessLineSystem().pass (espesor nominal < requerido) -> reemplazar
   - algún screenPit().pass false O algún assessAnomalies().exceeds true
     -> reparar
   - todo aprobada -> monitorizar
   - sin resultado de calc (sistema incompleto) -> revisar (ingeniero)

   RUL: calc/remainingLife requiere series de tasa de corrosión; las
   inspecciones de línea no las contienen (los espesores UT por posición
   viven en lineInspections como hallazgos + anomalías ILI, sin serie de
   CR). El KPI de RUL se muestra vacío con nota (reports.t06RulNote) — no se
   inventa una tasa.

   Pureza: no muta los registros del store; números finitos o null; campos
   categóricos (type, l1, b31g) viajan como identificadores crudos que la
   capa visual traduce (precedente: model-t03.js 'region'/'apto'). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelT06 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function ffsCalc() { return root.IW && root.IW.calc ? root.IW.calc.ffs : null; }
  function pipelineAssessment() { return root.IW && root.IW.calc ? root.IW.calc.pipelineAssessment : null; }
  function materials() { return root.IW && root.IW.data ? root.IW.data.materials : null; }
  function registry() { return root.IW && root.IW.reports ? root.IW.reports.registry : null; }

  // Modelo crudo: números finitos o null, fechas ISO, sin Intl/localDate/sin DOM.
  function rawNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  function typedError(code, message) {
    var e = new Error(code + ': ' + message);
    e.code = code;
    return e;
  }

  // Mismo material lookup que el faceplate FFS / el panel ILI de pipelines.js:
  // SMYS del catálogo si existe; si no, 414 MPa (default X52). assessLineSystem
  // ya resolvió S en su resultado — se reutiliza como Su para B31G; este
  // fallback solo cubre el caso sin resultado FFS.
  function smysMpa(materialId) {
    var cat = materials();
    if (cat && typeof cat.byId === 'function' && materialId) {
      var m = cat.byId(materialId);
      if (m && m.smysMpa) { return Number(m.smysMpa); }
    }
    return 414;
  }

  function generatedAtISO(opts) {
    var d;
    if (typeof opts.now === 'number' || typeof opts.now === 'string') {
      d = new Date(opts.now);
      if (isNaN(d.getTime())) { d = new Date(); }
    } else {
      d = new Date();
    }
    return d.toISOString();
  }

  // ---- secciones -------------------------------------------------------------

  function buildDesignTable(t, system, res, tMinMeas) {
    // Datos de diseño del sistema frente a los valores evaluados/medidos.
    // Símbolos geométricos (Ri, S, E, CA) se muestran como notación técnica,
    // igual que la fórmula literal del renderer de cupones.
    var rows = [];
    if (system) {
      rows.push({
        param: t('pipelines.wallThickness') + ' (mm)',
        design: rawNum(system.wallThicknessMm),
        assessed: rawNum(tMinMeas)
      });
      rows.push({
        param: t('pipelines.opPressure') + ' (MPa)',
        design: rawNum(system.opPressureMpa),
        assessed: res ? rawNum(res.mawpAssessed) : null
      });
      if (res) {
        rows.push({ param: 'Ri (mm)', design: rawNum(res.Ri), assessed: rawNum(res.Ri) });
        rows.push({ param: 'S (MPa)', design: rawNum(res.S), assessed: rawNum(res.S) });
        rows.push({ param: 'E', design: rawNum(res.E), assessed: rawNum(res.E) });
        rows.push({
          param: t('ffs.corrosionAllowance') + ' (mm)',
          design: rawNum(res.CA),
          assessed: rawNum(res.CA)
        });
      }
    }
    var sec = model().table({
      titleKey: 'reports.t06DesignVsMeasured',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'param', labelKey: 'reports.t06Param' },
        { key: 'design', labelKey: 'reports.t06Design', align: true },
        { key: 'assessed', labelKey: 'reports.t06Assessed', align: true }
      ],
      rows: rows
    });
    // El KPI de RUL queda vacío: documentar por qué (sin series de CR aquí).
    sec.noteKey = 'reports.t06RulNote';
    return sec;
  }

  function buildProfileTable(t, anomalies, tNom, pits, assessed) {
    return model().table({
      titleKey: 'reports.t06Profile',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'stationKm', labelKey: 'pipelines.stationKm', align: true },
        { key: 'type', labelKey: 'pipelines.anomalyType' },
        { key: 'depthPct', labelKey: 'pipelines.depthPct', align: true },
        { key: 'tLocal', labelKey: 'reports.t06TLocal', align: true },
        { key: 'l1', labelKey: 'reports.t06ScreenL1' },
        { key: 'pAllow', labelKey: 'pipelines.safePressure', align: true },
        { key: 'b31g', labelKey: 'reports.t06B31g' }
      ],
      rows: anomalies.map(function (a, i) {
        var depthMm = (rawNum(a.depthPct) !== null && rawNum(tNom) !== null)
          ? (a.depthPct / 100) * tNom
          : null;
        var pit = pits[i];
        var r = assessed[i];
        return {
          stationKm: rawNum(a.stationKm),
          type: a.type || 'metalLoss',
          depthPct: rawNum(a.depthPct),
          tLocal: (depthMm !== null && tNom !== null) ? tNom - depthMm : null,
          l1: pit ? (pit.pass ? 'pass' : 'fail') : null,
          pAllow: r ? rawNum(r.pAllow) : null,
          b31g: r ? (r.exceeds ? 'exceeds' : 'ok') : null
        };
      })
    });
  }

  function buildAcceptanceList(res, pits, assessed, anyFail) {
    var items = [];
    if (res) {
      items.push({
        textKey: res.pass ? 'reports.t06WallPass' : 'reports.t06WallFail',
        status: res.pass ? 'ok' : 'crit'
      });
      if (pits.length) {
        var pitFail = pits.some(function (p) { return p === null || !p.pass; });
        items.push({
          textKey: pitFail ? 'reports.t06PitFail' : 'reports.t06PitPass',
          status: pitFail ? 'crit' : 'ok'
        });
      }
      if (assessed.length) {
        var b31gFail = assessed.some(function (r) { return !r || r.exceeds; });
        items.push({
          textKey: b31gFail ? 'reports.t06B31gFail' : 'reports.t06B31gPass',
          status: b31gFail ? 'crit' : 'ok'
        });
      }
    }
    // Sin clasificación L1 (datos incompletos) o con algún tamizaje fallido:
    // la disposición final es de un ingeniero (L2/L3 no implementados en calc).
    if (!res || anyFail) {
      items.push({ textKey: 'reports.t06EngineerReview', status: 'warn' });
    }
    return model().list({ titleKey: 'reports.t06Acceptance', items: items });
  }

  function deriveDecisionBodyKey(res, pits, assessed) {
    if (!res) { return 'reports.t06DecisionReview'; }
    if (!res.pass) { return 'reports.t06DecisionReplace'; }
    var pitFail = pits.some(function (p) { return p === null || !p.pass; });
    var b31gFail = assessed.some(function (r) { return !r || r.exceeds; });
    if (pitFail || b31gFail) { return 'reports.t06DecisionRepair'; }
    return 'reports.t06DecisionMonitor';
  }

  function buildStandards(anyAssessed) {
    var items = [{ id: 'API 579-1/ASME FFS-1', title: 'Fitness-For-Service' }];
    if (anyAssessed) {
      items.push({
        id: 'ASME B31G',
        title: 'Determining the Remaining Strength of Corroded Sections in Pipelines'
      });
    }
    return model().standards({ titleKey: 'reports.standardsApplied', items: items });
  }

  // ---- registro en el registry (idempotente, patrón T-03) ---------------------

  function registerSelf() {
    var reg = registry();
    if (!reg || typeof reg.register !== 'function') { return; }
    try {
      reg.register({
        id: 'T-06',
        titleKey: 'reports.t06Title',
        needs: ['inspectionId'],
        buildModel: buildT06Model
      });
    } catch (e) {
      // Carga idempotente: el único fallo tolerable es un duplicado
      // (módulo evaluado dos veces); todo lo demás debe surfacear.
      if (String((e && e.message) || '').indexOf('duplicate') === -1) { throw e; }
    }
  }

  // ---- builder -----------------------------------------------------------------

  function buildT06Model(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    var t = (typeof opts.t === 'function') ? opts.t : function (k) { return k; };
    registerSelf();

    if (typeof opts.inspectionId !== 'string' || opts.inspectionId === '') {
      return Promise.reject(typedError('E_MISSING_INPUT', 'inspectionId is required (string, non-empty)'));
    }
    var inspectionId = opts.inspectionId;

    function list(repo) {
      return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]);
    }
    function get(repo, id) {
      return (store[repo] && typeof store[repo].get === 'function') ? store[repo].get(id) : Promise.resolve(null);
    }

    return Promise.all([
      get('lineInspections', inspectionId),
      list('pipelineSystems'),
      list('lineAssets'),
      list('iliAnomalies')
    ]).then(function (data) {
      var inspection = data[0];
      if (!inspection) {
        throw typedError('E_NOT_FOUND', 'line inspection not found: ' + inspectionId);
      }
      var systems = Array.isArray(data[1]) ? data[1] : [];
      var assets = Array.isArray(data[2]) ? data[2] : [];
      var ili = Array.isArray(data[3]) ? data[3] : [];

      var system = null;
      systems.forEach(function (s) { if (!system && s.id === inspection.systemId) { system = s; } });
      var asset = null;
      assets.forEach(function (a) { if (!asset && a.id === inspection.lineAssetId) { asset = a; } });
      var anomalies = ili
        .filter(function (x) { return x.inspectionId === inspectionId; })
        .slice()
        .sort(function (p, q) { return (p.stationKm < q.stationKm) ? -1 : (p.stationKm > q.stationKm ? 1 : 0); });

      // Flujo idéntico al faceplate FFS de pipelines.js.
      var ffs = ffsCalc();
      var res = null;
      if (ffs && typeof ffs.assessLineSystem === 'function') {
        try { res = ffs.assessLineSystem(system || {}, materials()); } catch (e) { res = null; }
      }

      var tNom = (system && typeof system.wallThicknessMm === 'number' && isFinite(system.wallThicknessMm))
        ? system.wallThicknessMm : null;

      // Tamizaje L1 de picadura por anomalía (mismos P/Ri/S/E/CA del resultado FFS).
      var pits = anomalies.map(function (a) {
        if (!res || tNom === null || typeof a.depthPct !== 'number' || !isFinite(a.depthPct)) { return null; }
        try {
          return ffs.screenPit({
            tMeas: tNom,
            pitDepth: (a.depthPct / 100) * tNom,
            P: res.opPressureMpa,
            Ri: res.Ri,
            S: res.S,
            E: res.E,
            CA: res.CA
          });
        } catch (e) { return null; }
      });

      // B31G con el mismo flujo y parámetros que renderIliPanel (designFactor 0.72).
      var assessed = [];
      var pa = pipelineAssessment();
      if (pa && typeof pa.assessAnomalies === 'function' && system &&
          system.dnIn != null && tNom !== null && anomalies.length > 0) {
        var opOk = system.opPressureMpa != null && system.opPressureMpa > 0;
        try {
          assessed = pa.assessAnomalies([], anomalies, {
            Su: (res && rawNum(res.S) !== null) ? res.S : smysMpa(system.material),
            D: Number(system.dnIn) * 25.4,
            t: tNom,
            designFactor: 0.72,
            opPressure: opOk ? system.opPressureMpa : 0
          });
        } catch (e) { assessed = []; }
      }

      var maxDepthPct = null;
      if (tNom !== null) {
        maxDepthPct = 0;
        anomalies.forEach(function (a) {
          if (typeof a.depthPct === 'number' && isFinite(a.depthPct) && a.depthPct > maxDepthPct) {
            maxDepthPct = a.depthPct;
          }
        });
      }
      var tMinMeas = (tNom !== null) ? tNom * (1 - (maxDepthPct || 0) / 100) : null;

      var pitFail = pits.some(function (p) { return p === null || !p.pass; });
      var b31gFail = assessed.some(function (r) { return !r || r.exceeds; });
      var anyFail = (res && !res.pass) || pitFail || b31gFail;

      var subtitleParts = [];
      if (asset) { subtitleParts.push(asset.code || asset.name || asset.id); }
      if (system) { subtitleParts.push(system.name || system.id); }
      var subtitle = subtitleParts.length ? subtitleParts.join(' · ') : (inspection.id || inspectionId);

      var generatedAtISOStr = generatedAtISO(opts);
      var m = model();

      var sections = [
        m.cover({ titleKey: 'reports.t06Title', subtitle: subtitle, meta: { generatedAtISO: generatedAtISOStr } }),
        m.kpiRow({
          titleKey: 'reports.kpis',
          items: [
            { labelKey: 'ffs.tRequired', value: res ? rawNum(res.tRequired) : null, unit: 'units.mm' },
            { labelKey: 'reports.t06TMeasuredMin', value: rawNum(tMinMeas), unit: 'units.mm' },
            { labelKey: 'ffs.mawpAssessed', value: res ? rawNum(res.mawpAssessed) : null, unit: 'units.MPa' },
            { labelKey: 'reports.t06WallLossPct', value: rawNum(maxDepthPct), unit: 'units.pct' },
            { labelKey: 'corrosion.remainingLife', value: null, unit: 'common.months' }
          ]
        }),
        buildDesignTable(t, system, res, tMinMeas),
        buildProfileTable(t, anomalies, tNom, pits, assessed),
        buildAcceptanceList(res, pits, assessed, anyFail),
        m.text({
          titleKey: 'reports.t06DecisionTitle',
          bodyKey: deriveDecisionBodyKey(res, pits, assessed),
          noteKey: 'reports.t06DecisionNote'
        }),
        buildStandards(assessed.length > 0)
      ];

      return {
        id: 'T-06',
        meta: {
          titleKey: 'reports.t06Title',
          subtitle: subtitle,
          generatedAtISO: generatedAtISOStr,
          footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' }
        },
        sections: sections,
        // Igual que el dossier y las hermanas: el disclaimer vive en la raíz.
        disclaimer: m.disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  // Claves i18n NUEVAS introducidas por T-06 (añadidas a es.js; pendiente
  // propagar al resto de locales, misma condición que las hermanas T-03/T-05).
  var NEW_LOCALE_KEYS = [
    'reports.t06Title',
    'reports.t06TMeasuredMin',
    'reports.t06WallLossPct',
    'reports.t06DesignVsMeasured',
    'reports.t06Param',
    'reports.t06Design',
    'reports.t06Assessed',
    'reports.t06RulNote',
    'reports.t06Profile',
    'reports.t06TLocal',
    'reports.t06ScreenL1',
    'reports.t06B31g',
    'reports.t06Acceptance',
    'reports.t06WallPass',
    'reports.t06WallFail',
    'reports.t06PitPass',
    'reports.t06PitFail',
    'reports.t06B31gPass',
    'reports.t06B31gFail',
    'reports.t06EngineerReview',
    'reports.t06DecisionTitle',
    'reports.t06DecisionMonitor',
    'reports.t06DecisionRepair',
    'reports.t06DecisionReplace',
    'reports.t06DecisionReview',
    'reports.t06DecisionNote',
    'units.mm',
    'units.MPa'
  ];

  registerSelf();

  return { buildT06Model: buildT06Model, NEW_LOCALE_KEYS: NEW_LOCALE_KEYS };
});
