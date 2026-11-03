/* IntegrityWatch Field — T-10 pipeline threat-integrity report model
    Plantilla T-10 del blueprint (docs/REPORTING-BLUEPRINT.md §T-10, spec propia):
    integridad de UN ducto por amenazas ASME B31.8S. Modelo puro (sin DOM, sin
    Intl, sin formateo de locale) que devuelve { id, meta, sections, disclaimer }
    con las factories de root.IW.reports.model, espejo de model-t06.js /
    model-t04.js. needs:['systemId'] con errores tipados al estilo T-06
    (E_MISSING_INPUT / E_NOT_FOUND).

    CAMPOS REALES USADOS (verificados contra src/data/seed.js y schemas):
    - pipelineSystems: id, name, operator, product, dnIn, wallThicknessMm,
      material, coating, opPressureMpa, stationFromKm, stationToKm. NO existe
      campo de registro de amenazas ("threats") en ningún store — la sección
      text 'reports.t10DataGaps' lo declara explícitamente (dato ausente).
    - lineAssets: systemId, stationKm (min/max -> km de tramo del cover; el
      spec lo pide desde lineAssets, no desde lengthKm del sistema).
    - lineInspections: systemId, type, date, severity, fromKm, toKm, findings
      (texto libre, no se reinterpretan), reportRef.
    - iliAnomalies: systemId, stationKm, depthPct, lengthMm, type,
      inspectionId (la severidad por anomalía se HEREDA de su inspección
      vinculada; sin vínculo queda null — no se inventa).

    MAOP: el store no tiene campo MAOP; se usa opPressureMpa (la misma presión
    con la que views/pipelines.js decide "exceeds" en el panel ILI).

    Mapeo honesto de amenazas B31.8S a 3 categorías desde los types REALES del
    seed (únicos valores de enum: anomalías metalLoss|crack|dent; inspecciones
    ild|externalCorrosion|visual|ut — pipelines.js:16-19 y es.js inspTypes):
    - 'timeDependent' (crece con el tiempo, B31.8S corrosion/SCC):
        anomalías 'metalLoss' (pérdida de metal por corrosión interna/externa)
        y 'crack' (grietas tipo SCC/fatiga que propagan bajo ciclos).
        Evidencia de inspección: 'externalCorrosion', 'ild' (detección de
        pérdida de metal progresiva) y 'ut' (monitoreo periódico de espesor).
    - 'stable' (configuracion fijada al ocurrir el evento): anomalía 'dent'
        (dano mecánico; B31.8S lo evalúa como condición puntuada al hallarse).
    - 'random' (aleatorias sin tiempo de gestación): TERCERÍA/daño de terceros,
        geotecnia, clima, procedimental — NINGÚN type del modelo de datos las
        representa, por eso la fila sale a 0 con nota; cero evidencia NO es
        cero amenaza (ver text 'reports.t10DataGapsBody').
    - La inspección 'visual' es un MÉTODO, no una amenaza: no cuenta como
        evidencia en ningún bucket (documentado en reports.t10ThreatNote).

    B31G: se reutiliza IW.calc.pipelineAssessment.assessAnomalies con el MISMO
    flujo y parámetros que renderIliPanel en views/pipelines.js (líneas
    551-574): Su = SMYS del catálogo o 414 (default X52), D = dnIn*25.4,
    t = wallThicknessMm, designFactor 0.72 fijo del panel, opPressure =
    opPressureMpa cuando > 0. El propio calc declara que B31G NO modela
    grietas ni abolladuras: se aplica a todas las anomalías igual que la app
    (coherencia informe-app) y la nota lo advierte.

    RUL: requires corrosion-rate series; los stores de línea no las contienen
    (las anomalías ILI son fotografías puntuales, sin serie temporal por
    defecto). El KPI 'corrosion.remainingLife' viaja null con nota
    (reports.t10RulNote) — precedente exacto T-06, nada inventado.

    Cobertura: km unidos de los tramos [fromKm,toKm] de las inspecciones del
    sistema DENTRO de opts.period {fromISO,toISO} cuando es válido (acotado por
    ambos lados, precedente T-09); sin periodo = todas las registradas
    ("últimas"). Los intervalos se recortan al tramo min/max de lineAssets
    cuando existe. Severidades por KPI cuentan INSPECCIONES del mismo filtro
    (crit=severity 'severe', alta='high', media='moderate'; 'low' no se
    lista por spec). Las tablas de amenazas/hallazgos muestran el ESTADO
    completo del sistema (no se filtran por periodo) salvo la columna de
    evidencia inspección, que sigue el filtro — documentado en la cabecera.

    Plan de mitigación (labelKeys puros, orden determinista): reparar exceden-
    cias B31G > evaluar grietas > verificar abolladuras > cubrir km sin
    inspección > reevaluar tras MOC (siempre).

    Pureza: no muta registros del store (solo filter/map sobre arrays nuevos y
    sort de copias); números finitos o null; campos categóricos (category,
    type, severity, b31g) viajan como identificadores crudos que la capa
    visual traduce ('pipelines.metalLoss', 'severity.*', ...), precedente
    T-03/T-04/T-06.

    GRAFICOS del blueprint (mapa de amenazas / perfil a lo largo de la línea):
    el renderer solo soporta kinds trend/cusum/bullet/matrix (IW.reports.
    charts); el perfil por km se lleva la table de hallazgos ordenada por
    estación y el mapa queda para la capa visual — mismo límite documentado
    en T-03/T-04.

    Standards: el catálogo (IW.data.standards) no tiene hoy 'asme-b31-8s' ni
    'api-1160' y editarlo está fuera de esta tarea; la sección prefiere esas
    ids si se añaden y mientras emite las referencias literales (patrón
    pickStandard de T-04). ASME B31G se añade solo cuando hay anomalías
    evaluadas (precedente T-06). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelT10 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var CATEGORIES = ['timeDependent', 'stable', 'random'];
  // Buckets de amenazas B31.8S desde los enums REALES del seed (ver cabecera).
  var ANOMALY_BUCKET = { metalLoss: 'timeDependent', crack: 'timeDependent', dent: 'stable' };
  var INSPECTION_BUCKET = { externalCorrosion: 'timeDependent', ild: 'timeDependent', ut: 'timeDependent' };
  // KPIs de severidad: los ids reales del enum pipelines.js:16 son
  // low|moderate|high|severe — la spec del informe los llama crit/alta/media.
  var SEVERITY_OF_KPI = { crit: 'severe', alta: 'high', media: 'moderate' };

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function pipelineAssessment() { return root.IW && root.IW.calc ? root.IW.calc.pipelineAssessment : null; }
  function materialsData() { return root.IW && root.IW.data ? root.IW.data.materials : null; }
  function standardsData() { return root.IW && root.IW.data ? root.IW.data.standards : null; }
  function registry() { return root.IW && root.IW.reports ? root.IW.reports.registry : null; }

  function rawNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }

  function typedError(code, message) {
    var e = new Error(code + ': ' + message);
    e.code = code;
    return e;
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

  // opts.period {fromISO,toISO} valido (precedente T-09) o null.
  function periodBounds(opts) {
    var p = (opts.period && typeof opts.period === 'object') ? opts.period : null;
    if (!p) { return null; }
    var fromMs = Date.parse(p.fromISO);
    var toMs = Date.parse(p.toISO);
    if (isNaN(fromMs) || isNaN(toMs) || toMs < fromMs) { return null; }
    return { fromMs: fromMs, toMs: toMs, period: p };
  }

  function inWindow(rec, bounds) {
    if (!bounds) { return true; }
    var ms = Date.parse(rec.date);
    if (isNaN(ms)) { return false; }
    return ms >= bounds.fromMs && ms <= bounds.toMs;
  }

  // Tramo km desde lineAssets min/max stationKm (spec); si no hay activos con
  // estacion, respaldo a stationFromKm/stationToKm del sistema; si no, null.
  function spanOf(assets, system) {
    var from = null;
    var to = null;
    assets.forEach(function (a) {
      var s = rawNum(a.stationKm);
      if (s === null) { return; }
      if (from === null || s < from) { from = s; }
      if (to === null || s > to) { to = s; }
    });
    if (from === null) {
      var f = rawNum(system.stationFromKm);
      var t = rawNum(system.stationToKm);
      if (f !== null && t !== null && t >= f) { return { from: f, to: t }; }
      return null;
    }
    return { from: from, to: to };
  }

  // Km cubiertos: union de los tramos [fromKm,toKm] de las inspecciones,
  // recortados al tramo del sistema cuando existe. Suma exacta sin redondear.
  function coveredKm(inspections, span) {
    var iv = [];
    inspections.forEach(function (r) {
      var a = rawNum(r.fromKm);
      var b = rawNum(r.toKm);
      if (a === null || b === null) { return; }
      if (b < a) { var tmp = a; a = b; b = tmp; }
      if (span) {
        a = Math.max(a, span.from);
        b = Math.min(b, span.to);
      }
      if (b > a) { iv.push([a, b]); }
    });
    iv.sort(function (p, q) { return p[0] - q[0]; });
    var total = 0;
    var curFrom = null;
    var curTo = null;
    iv.forEach(function (p) {
      if (curTo === null || p[0] > curTo) {
        if (curTo !== null) { total += curTo - curFrom; }
        curFrom = p[0];
        curTo = p[1];
      } else if (p[1] > curTo) {
        curTo = p[1];
      }
    });
    if (curTo !== null) { total += curTo - curFrom; }
    return total;
  }

  // Mismo lookup SMYS que el panel ILI de views/pipelines.js:561-566.
  function smysMpa(materialId) {
    var cat = materialsData();
    if (cat && typeof cat.byId === 'function' && materialId) {
      var m = cat.byId(materialId);
      if (m && m.smysMpa) { return Number(m.smysMpa); }
    }
    return 414;
  }

  function buildThreatRows(anomalies, inspections) {
    var acc = {};
    CATEGORIES.forEach(function (c) { acc[c] = { anomalies: 0, inspections: 0, maxDepthPct: null }; });
    anomalies.forEach(function (a) {
      var bucket = ANOMALY_BUCKET[a.type];
      if (!bucket) { return; }
      acc[bucket].anomalies += 1;
      var d = rawNum(a.depthPct);
      if (d !== null && (acc[bucket].maxDepthPct === null || d > acc[bucket].maxDepthPct)) {
        acc[bucket].maxDepthPct = d;
      }
    });
    inspections.forEach(function (r) {
      var bucket = INSPECTION_BUCKET[r.type];
      if (bucket) { acc[bucket].inspections += 1; }
    });
    return CATEGORIES.map(function (c) {
      return {
        category: c,
        anomalies: acc[c].anomalies,
        inspections: acc[c].inspections,
        maxDepthPct: acc[c].maxDepthPct
      };
    });
  }

  function buildThreatTable(rows) {
    var sec = model().table({
      titleKey: 'reports.t10Threats',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'category', labelKey: 'reports.t10Category' },
        { key: 'anomalies', labelKey: 'reports.t10Anomalies', align: true },
        { key: 'inspections', labelKey: 'reports.t10Evidence', align: true },
        { key: 'maxDepthPct', labelKey: 'reports.t10MaxDepth', align: true }
      ],
      rows: rows
    });
    sec.noteKey = 'reports.t10ThreatNote';
    return sec;
  }

  function buildFindingsTable(anomalies, severityById, assessed) {
    var sec = model().table({
      titleKey: 'reports.t10Findings',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'stationKm', labelKey: 'pipelines.stationKm', align: true },
        { key: 'type', labelKey: 'pipelines.anomalyType' },
        { key: 'severity', labelKey: 'reports.t10Severity' },
        { key: 'depthPct', labelKey: 'pipelines.depthPct', align: true },
        { key: 'pAllow', labelKey: 'pipelines.safePressure', align: true },
        { key: 'b31g', labelKey: 'reports.t10B31g' }
      ],
      rows: anomalies.map(function (a, i) {
        var r = assessed[i];
        return {
          stationKm: rawNum(a.stationKm),
          type: a.type || null,
          severity: severityById[a.inspectionId] || null,
          depthPct: rawNum(a.depthPct),
          pAllow: r ? rawNum(r.pAllow) : null,
          b31g: r ? (r.exceeds ? 'exceeds' : 'ok') : null
        };
      })
    });
    sec.noteKey = 'reports.t10RulNote';
    return sec;
  }

  function buildPlan(exceedsAny, crackCount, dentCount, uncoveredKm) {
    var items = [];
    if (exceedsAny) { items.push({ textKey: 'reports.t10ActionRepair', status: 'crit' }); }
    if (crackCount > 0) { items.push({ textKey: 'reports.t10ActionCrackAssess', status: 'crit' }); }
    if (dentCount > 0) { items.push({ textKey: 'reports.t10ActionDentAssess', status: 'warn' }); }
    if (uncoveredKm !== null && uncoveredKm > 0) { items.push({ textKey: 'reports.t10ActionCover', status: 'warn' }); }
    items.push({ textKey: 'reports.t10ActionReassess' });
    return model().list({ titleKey: 'reports.t10Plan', items: items });
  }

  function pickStandard(catalogId, fallbackCode, fallbackTitle) {
    var src = standardsData();
    var list = (src && src.standards) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === catalogId) {
        return { id: list[i].code || list[i].id, title: list[i].title || '' };
      }
    }
    return { id: fallbackCode, title: fallbackTitle };
  }

  function buildStandards(anyAssessed) {
    var items = [
      pickStandard('asme-b31-8s', 'ASME B31.8S', 'Managing Integrity for Gas Transmission and Distribution Piping Systems'),
      pickStandard('api-1160', 'API 1160', 'Managing Integrity Systems for Hazardous Liquid Pipeline Systems')
    ];
    if (anyAssessed) {
      items.push({
        id: 'ASME B31G',
        title: 'Determining the Remaining Strength of Corroded Sections in Pipelines'
      });
    }
    return model().standards({ titleKey: 'reports.standardsApplied', items: items });
  }

  function registerSelf() {
    var reg = registry();
    if (!reg || typeof reg.register !== 'function') { return; }
    try {
      reg.register({
        id: 'T-10',
        titleKey: 'reports.t10Title',
        needs: ['systemId'],
        buildModel: buildT10Model
      });
    } catch (e) {
      // Carga idempotente: el unico fallo tolerable es un duplicado
      // (modulo evaluado dos veces); todo lo demas debe surfacear.
      if (String((e && e.message) || '').indexOf('duplicate') === -1) { throw e; }
    }
  }

  // ---- builder -----------------------------------------------------------------

  function buildT10Model(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    registerSelf();

    if (typeof opts.systemId !== 'string' || opts.systemId === '') {
      return Promise.reject(typedError('E_MISSING_INPUT', 'systemId is required (string, non-empty)'));
    }
    var systemId = opts.systemId;

    function list(repo) {
      return (store[repo] && typeof store[repo].list === 'function') ? store[repo].list() : Promise.resolve([]);
    }
    function get(repo, id) {
      return (store[repo] && typeof store[repo].get === 'function') ? store[repo].get(id) : Promise.resolve(null);
    }

    return Promise.all([
      get('pipelineSystems', systemId),
      list('lineAssets'),
      list('lineInspections'),
      list('iliAnomalies')
    ]).then(function (data) {
      var system = data[0];
      if (!system) {
        throw typedError('E_NOT_FOUND', 'pipeline system not found: ' + systemId);
      }
      var assetsAll = (Array.isArray(data[1]) ? data[1] : []).filter(function (a) {
        return a && a.systemId === systemId;
      });
      var inspAll = (Array.isArray(data[2]) ? data[2] : []).filter(function (r) {
        return r && r.systemId === systemId;
      });
      var anomaliesAll = (Array.isArray(data[3]) ? data[3] : []).filter(function (x) {
        return x && x.systemId === systemId;
      });

      var bounds = periodBounds(opts);
      var inspWindow = inspAll.filter(function (r) { return inWindow(r, bounds); });

      var anomalies = anomaliesAll.slice().sort(function (p, q) {
        var sp = rawNum(p.stationKm);
        var sq = rawNum(q.stationKm);
        var a = sp === null ? Infinity : sp;
        var b = sq === null ? Infinity : sq;
        return a - b;
      });

      var severityById = {};
      inspAll.forEach(function (r) {
        if (r && r.id && typeof r.severity === 'string' && r.severity !== '') {
          severityById[r.id] = r.severity;
        }
      });

      // B31G por anomalía: flujo y parametros identicos a renderIliPanel
      // (views/pipelines.js:551-574), sobre las anomalias ya ordenadas.
      var assessed = [];
      var anyAssessed = false;
      var exceedsAny = false;
      var minPAllow = null;
      var hasWallData = system.wallThicknessMm != null && system.dnIn != null && system.material;
      var pa = pipelineAssessment();
      if (pa && typeof pa.assessAnomalies === 'function' && hasWallData && anomalies.length > 0) {
        var hasOpPressure = system.opPressureMpa != null && system.opPressureMpa > 0;
        try {
          assessed = pa.assessAnomalies([], anomalies, {
            Su: smysMpa(system.material),
            D: Number(system.dnIn) * 25.4,
            t: system.wallThicknessMm,
            designFactor: 0.72,
            opPressure: hasOpPressure ? system.opPressureMpa : 0
          });
        } catch (e) { assessed = []; }
        assessed.forEach(function (r) {
          if (!r) { return; }
          anyAssessed = true;
          if (r.exceeds) { exceedsAny = true; }
          var p = rawNum(r.pAllow);
          if (p !== null && (minPAllow === null || p < minPAllow)) { minPAllow = p; }
        });
      }

      var span = spanOf(assetsAll, system);
      var covered = coveredKm(inspWindow, span);
      var uncoveredKm = span ? Math.max(0, (span.to - span.from) - covered) : null;

      var sevCrit = inspWindow.filter(function (r) { return r.severity === SEVERITY_OF_KPI.crit; }).length;
      var sevAlta = inspWindow.filter(function (r) { return r.severity === SEVERITY_OF_KPI.alta; }).length;
      var sevMedia = inspWindow.filter(function (r) { return r.severity === SEVERITY_OF_KPI.media; }).length;

      var crackCount = anomalies.filter(function (a) { return a.type === 'crack'; }).length;
      var dentCount = anomalies.filter(function (a) { return a.type === 'dent'; }).length;

      var subtitleParts = [];
      if (system.operator) { subtitleParts.push(String(system.operator)); }
      if (system.name) { subtitleParts.push(String(system.name)); }
      if (span) { subtitleParts.push('km ' + span.from + '\u2013' + span.to); }
      var subtitle = subtitleParts.length ? subtitleParts.join(' \u00b7 ') : String(system.id || systemId);

      var generatedAt = generatedAtISO(opts);
      var m = model();
      var meta = { generatedAtISO: generatedAt };
      if (bounds) { meta.period = bounds.period; }

      var kpiMin = { labelKey: 'reports.t10KpiMinPAllow', value: minPAllow, unit: 'units.MPa' };
      if (anyAssessed) { kpiMin.status = exceedsAny ? 'crit' : 'ok'; }

      var sections = [
        m.cover({ titleKey: 'reports.t10Title', subtitle: subtitle, meta: meta }),
        m.kpiRow({
          titleKey: 'reports.kpis',
          items: [
            { labelKey: 'reports.t10KpiCoveredKm', value: covered, unit: 'units.km' },
            { labelKey: 'reports.t10KpiSevCrit', value: sevCrit },
            { labelKey: 'reports.t10KpiSevAlta', value: sevAlta },
            { labelKey: 'reports.t10KpiSevMedia', value: sevMedia },
            { labelKey: 'pipelines.opPressure', value: rawNum(system.opPressureMpa), unit: 'units.MPa' },
            kpiMin,
            { labelKey: 'corrosion.remainingLife', value: null, unit: 'common.months' }
          ]
        }),
        buildThreatTable(buildThreatRows(anomalies, inspWindow)),
        buildFindingsTable(anomalies, severityById, assessed),
        buildPlan(exceedsAny, crackCount, dentCount, uncoveredKm),
        m.text({
          titleKey: 'reports.t10MocQc',
          bodyKey: 'reports.t10MocBody',
          noteKey: 'reports.t10QcNote'
        }),
        m.text({ titleKey: 'reports.t10DataGaps', bodyKey: 'reports.t10DataGapsBody' }),
        buildStandards(anyAssessed)
      ];

      return {
        id: 'T-10',
        meta: {
          titleKey: 'reports.t10Title',
          subtitle: subtitle,
          generatedAtISO: generatedAt,
          footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' }
        },
        sections: sections,
        // Igual que el dossier y las hermanas: el disclaimer vive en la raiz.
        disclaimer: m.disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  // Claves i18n NUEVAS introducidas por T-10 (anadidas a es.js; pendiente
  // propagar al resto de locales en el lote del coordinador, misma condicion
  // que las hermanas T-03..T-09).
  var NEW_LOCALE_KEYS = [
    'reports.t10Anomalies',
    'reports.t10ActionCover',
    'reports.t10ActionCrackAssess',
    'reports.t10ActionDentAssess',
    'reports.t10ActionReassess',
    'reports.t10ActionRepair',
    'reports.t10B31g',
    'reports.t10Category',
    'reports.t10DataGaps',
    'reports.t10DataGapsBody',
    'reports.t10Evidence',
    'reports.t10Findings',
    'reports.t10KpiCoveredKm',
    'reports.t10KpiMinPAllow',
    'reports.t10KpiSevAlta',
    'reports.t10KpiSevCrit',
    'reports.t10KpiSevMedia',
    'reports.t10MaxDepth',
    'reports.t10MocBody',
    'reports.t10MocQc',
    'reports.t10Plan',
    'reports.t10QcNote',
    'reports.t10RulNote',
    'reports.t10Severity',
    'reports.t10ThreatNote',
    'reports.t10Threats',
    'reports.t10Title'
  ];

  registerSelf();

  return { buildT10Model: buildT10Model, NEW_LOCALE_KEYS: NEW_LOCALE_KEYS };
});
