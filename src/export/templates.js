/* IntegrityWatch Field — export/templates (P3c2)
   Transformadores PUROS filas→columnas de destino para exportación a sistemas
   de terceros (SAP PM / IBM Maximo / ISO 14224 / PHMSA-B31.8S). Reciben arrays
   YA traídos por la UI (nunca tocan repos); devuelven la forma pactada con el
   exportador de formatos (P3c1) y con csvWriter/xlsxWriter:
     { sheetName, headers, rows }        — hoja única (nota opcional en `note`)
     { sheets: [ {sheetName, headers, rows, note?}, ... ] }  — solo phmsa.performance
   Sin DOM, sin repos, sin fórmulas propias: los cálculos ajenos se REUTILIZAN
   por llamada (banda RBI → IW.calc.apm.rbiRisk; B31G → SOLO el mapa
   precomputado assessmentByAnomalyId que pasa el llamador — prohibido recalcular).

   Honestidad de columnas (regla del proyecto, precedente T-09/T-10): cada fila
   sale con los campos que EXISTEN en los registros; lo ausente viaja '' (CMMS)
   o '—' (tabla ISO 14224), NUNCA se inventa. Los ids crudos (category, type,
   severity, band) viajan sin traducir: la capa visual/i18n los traduce.

   ---------------------------------------------------------------------------
   Mapeos (convención SAP PM / Maximo: campo destino → campo local)
   ---------------------------------------------------------------------------
   sapPm.equipment — IL01/IL02 simplificado, 15 columnas:
     EQUNR  → code              (convención SAP PM: EQUNR ← apmAssets.code;
                                 aquí el code hace de functional location)
     TXT    → name              (TXT ← apmAssets.name)
     TYP    → category          (TYP ← apmAssets.category, id crudo)
     STLZ   → sector            (convención: STLZ ← apmAssets.sector)
     INSP   → banda RBI         (INSP ← rbi.band, si no IW.calc.apm.rbiRisk(pof,cof).band:
                                 low|medium|high|veryHigh, reutilizado, no duplicado)
     NDISC  → rbi.nextInspectionISO (NDISC ← fecha próxima inspección)
     OBJE   → status            (estado operativo local: running|standby|down|maintenance)
     CRIT   → criticality       (A|B|C)
     POF    → rbi.pof           COF → rbi.cof
     RSK    → score pof*cof     (vía IW.calc.apm.rbiRisk, no fórmula propia)
     INTVL  → rbi.inspectionBaseMonths
     FMOD   → iso14224.failureMode        FCON → iso14224.failureConsequence
     ORIG   → 'IW-FIELD' constante de procedencia (marcador de origen del export)
   maximo.asset — 12 columnas (convención Maximo: campo destino → campo local):
     ASSETNUM → code · ASSETNAME → name · CLASSNAME → category ·
     LOCATION → sector · OPERATINGSTATUS → status · CRITICALITY → criticality ·
     PLANNEDSTART → rbi.nextInspectionISO · PROBABILITY → rbi.pof ·
     IMPACT → rbi.cof · RISK → score (rbiRisk) · FAILUREMODE → iso14224.failureMode ·
     NOTES → notes
   psv.sapPm — 11 columnas: EQUNR→tag · TXT→location · TYP→valveType ·
     FLUID→fluid.name (o fluidId) · SETP→setPressurePsig (psig, unidad real del
     registro) · OPTMP→operatingTempF · BACKP→backPressurePsig · ORIF→orificeLetter ·
     NDISC→nextTestDate · LASTD→lastTestDate · INSPD→inspNext (externa API 576).
   psv.maximo — 11 columnas: ASSETNUM→tag · ASSETNAME→location · CLASSNAME→
     valveType · FLUID→fluid.name · SETPRESSURE→setPressurePsig · ORIFICE→
     orificeLetter · STATUS→psv.status (YA calculado por store.js: ok|due|overdue,
     aquí es passthrough, no se recalcula) · PLANNEDSTART→nextTestDate ·
     LASTTEST→lastTestDate · INSPNEXT→inspNext · INSPRESULT→inspResult.

   ---------------------------------------------------------------------------
   iso14224.events — numeración de columnas del parte de evento ISO 14224
   (hoja de cálculo habitual de registro de eventos, categorías 1-3 de la norma
   en su anexo: 1 número de evento · 2 fecha/hora de la categoría 1 (cuando la
   condición se registró — aquí `start` del evento) · 3-6 niveles de componente
   (sistema→subsistema→elemento→subelemento) · 7 equipo · 10-11 parada
   (tiempo que el equipo estuvo fuera de servicio) · 12 modo de falla ·
   13-15 mecanismo/consecuencia/acción · 16-17 método de detección y causa).
   Simplificación DOCUMENTADA ('niveles 3-6 simplificados'), porque el modelo de
   datos de la app (src/ingest/schemas.js §apmAssets/apmEvents) NO tiene
   jerarquía de componentes por evento:
     3 nivel sistema    → apmAssets.sector
     4 nivel subsistema → apmAssets.category (opcional categoryMap id→texto)
     5 nivel elemento   → apmAssets.iso14224.failureMode
     6 nivel subelemento→ siempre '—' (no existe en el modelo)
   Campos VERIFICADOS del evento real (schemas.js apmEvents: assetId, type,
   start, end, downtimeH, description, workOrderRef): NO existen detectionMethod
   ni cause en ningún registro → columnas 16/17 salen '—'. Si algn import
   futuro trajera esos campos, la plantilla los lee (`e.detectionMethod`/
   `e.cause`) sin cambiar nada. Modo de falla (col. 12): iso14224.failureMode
   del activo si registrado; en su defecto el type del evento — el evento no
   trae campo de modo propio (precedente exacto T-09 causeOf).
   ---------------------------------------------------------------------------
   phmsa.performance — DOS hojas 'medidas_desempeno' + 'hallazgos_ili'.
   Mapeo honesto a categorías de amenaza ASME B31.8S desde los types REALES del
   modelo (únicos enums existentes; anomalías: metalLoss|dent|crack;
   inspecciones: ild|externalCorrosion|visual|ut|repair|replacement), idéntico
   criterio que src/reports/model-t10.js:
     timeDependent (crecen con el tiempo: corrosión interna/externa y grietas)
       → anomalías 'metalLoss' y 'crack'; EVIDENCIA_CORROSION_EXTERNA cuenta
         inspecciones type 'externalCorrosion' (el modelo no distingue
         corrosión interna vs externa en anomalías: NO se inventa el desglose).
     estable/static → anomalías 'dent'.
     terceros/random (daño de terceros, geotecnia, clima, procedimental) → 0
       SIEMPRE: ningún type del modelo los representa; cero evidencia no es
       cero amenaza (nota en la hoja, precedente T-10 DataGaps).
     'visual'/'repair'/'replacement' son métodos/acciones, no amenazas: no
       nutren categorías (sí cuentan en INSPECCIONES).
   Tramos: bucket de 10 km por sistema desde stationFromKm (anomalía según su
   stationKm; inspección si su intervalo [fromKm,toKm] cruza el tramo; el borde
   km == stationToKm cae en el ÚLTIMO tramo). Sistemas sin stationFrom/To
   derivan el rango de sus propios datos; sin datos → sin filas.
   PRES_ADMISIBLE_B31G: se rellena SOLO si el llamador pasa
   opts.assessmentByAnomalyId (map id→{pAllow,exceeds} o id→pAllow, precomputado
   con IW.calc.pipelineAssessment — ej. assessAnomalies). Está PROHIBIDO
   recalcular B31G aquí. ACCION derivada solo del booleano `exceeds` del resultado
   aportado: true→'reparar', false→'monitorear', ausente→''. SEVERIDAD heredada
   de lineInspections.severity vía inspectionId (precedente T-10); sin vínculo ''.
   --------------------------------------------------------------------------- */
(function (root, factory) {
  'use strict';
  // Protected sibling require: resuelve solo en Node (patrón de src/data/seed.js).
  var apmCalc = null;
  try { apmCalc = require('../calc/apm.js'); } catch (e) { apmCalc = null; }
  var api = factory(root, apmCalc);
  root.IW = root.IW || {};
  root.IW.export = root.IW.export || {};
  root.IW.export.templates = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, apmRequired) {
  'use strict';

  // ---------------------------------------------------------------- primitivos

  function list(x) { return Array.isArray(x) ? x : []; }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function str(v) { return (typeof v === 'string' && v !== '') ? v : ''; }
  // Celda CMMS: ausente → '' (csvWriter formatea '' como campo vacío).
  function cell(v) { var n = num(v); if (n !== null) { return n; } return str(v); }
  // Celda ISO: ausente → '—' (marker de 'campo no registrado', nunca inventar).
  function dash(v) { var s = cell(v); return s === '' ? '—' : s; }
  function apm() { return (root.IW && root.IW.calc && root.IW.calc.apm) || apmRequired; }

  // ------------------------------------------------------------------- RBI band
  // Reuso EXCLUSIVO de IW.calc.apm.rbiRisk (banda y score) — cero fórmula propia.
  // Si el registro ya trae rbi.band/rbi.score (derivados de ingesta), manda el
  // valor persistido.
  function riskOf(asset) {
    var r = (asset && asset.rbi) || {};
    var engine = apm();
    if (engine && typeof engine.rbiRisk === 'function' && num(r.pof) !== null && num(r.cof) !== null) {
      var res = engine.rbiRisk({ pof: r.pof, cof: r.cof });
      return { band: str(r.band) || res.band, score: r.score != null ? r.score : res.score };
    }
    return { band: str(r.band), score: r.score != null ? r.score : '' };
  }

  // --------------------------------------------------------------- SAP PM / Maximo

  var SAP_EQ_HEADERS = ['EQUNR', 'TXT', 'TYP', 'STLZ', 'INSP', 'NDISC', 'OBJE',
    'CRIT', 'POF', 'COF', 'RSK', 'INTVL', 'FMOD', 'FCON', 'ORIG'];

  var MAX_ASSET_HEADERS = ['ASSETNUM', 'ASSETNAME', 'CLASSNAME', 'LOCATION',
    'OPERATINGSTATUS', 'CRITICALITY', 'PLANNEDSTART', 'PROBABILITY', 'IMPACT',
    'RISK', 'FAILUREMODE', 'NOTES'];

  var PSV_SAP_HEADERS = ['EQUNR', 'TXT', 'TYP', 'FLUID', 'SETP', 'OPTMP',
    'BACKP', 'ORIF', 'NDISC', 'LASTD', 'INSPD'];

  var PSV_MAX_HEADERS = ['ASSETNUM', 'ASSETNAME', 'CLASSNAME', 'FLUID',
    'SETPRESSURE', 'ORIFICE', 'STATUS', 'PLANNEDSTART', 'LASTTEST', 'INSPNEXT',
    'INSPRESULT'];

  function sapEquipment(apmAssets) {
    var rows = list(apmAssets).map(function (a) {
      var r = (a && a.rbi) || {};
      var rk = riskOf(a);
      var iso = (a && a.iso14224) || {};
      return [
        cell(a && a.code), cell(a && a.name), cell(a && a.category),
        cell(a && a.sector), cell(rk.band), cell(r.nextInspectionISO),
        cell(a && a.status), cell(a && a.criticality),
        cell(r.pof), cell(r.cof), cell(rk.score), cell(r.inspectionBaseMonths),
        cell(iso.failureMode), cell(iso.failureConsequence),
        'IW-FIELD'
      ];
    });
    return { sheetName: 'equipos_sap_pm', headers: SAP_EQ_HEADERS, rows: rows };
  }

  function maximoAsset(apmAssets) {
    var rows = list(apmAssets).map(function (a) {
      var r = (a && a.rbi) || {};
      var rk = riskOf(a);
      var iso = (a && a.iso14224) || {};
      return [
        cell(a && a.code), cell(a && a.name), cell(a && a.category),
        cell(a && a.sector), cell(a && a.status), cell(a && a.criticality),
        cell(r.nextInspectionISO), cell(r.pof), cell(r.cof), cell(rk.score),
        cell(iso.failureMode), cell(a && a.notes)
      ];
    });
    return { sheetName: 'activos_maximo', headers: MAX_ASSET_HEADERS, rows: rows };
  }

  function psvFluidName(p) {
    if (!p) { return ''; }
    return str(p.fluid && p.fluid.name) || str(p.fluidId);
  }

  function psvSap(psvs) {
    var rows = list(psvs).map(function (p) {
      return [
        cell(p && p.tag), cell(p && p.location), cell(p && p.valveType),
        cell(psvFluidName(p)), cell(p && p.setPressurePsig),
        cell(p && p.operatingTempF), cell(p && p.backPressurePsig),
        cell(p && p.orificeLetter), cell(p && p.nextTestDate),
        cell(p && p.lastTestDate), cell(p && p.inspNext)
      ];
    });
    return { sheetName: 'psv_sap_pm', headers: PSV_SAP_HEADERS, rows: rows };
  }

  function psvMaximo(psvs) {
    var rows = list(psvs).map(function (p) {
      return [
        cell(p && p.tag), cell(p && p.location), cell(p && p.valveType),
        cell(psvFluidName(p)), cell(p && p.setPressurePsig),
        cell(p && p.orificeLetter), cell(p && p.status),
        cell(p && p.nextTestDate), cell(p && p.lastTestDate),
        cell(p && p.inspNext), cell(p && p.inspResult)
      ];
    });
    return { sheetName: 'psv_maximo', headers: PSV_MAX_HEADERS, rows: rows };
  }

  // --------------------------------------------------------------- ISO 14224

  var ISO_EVENT_HEADERS = ['NUM_EVENTO', 'FECHA_HORA_CAT1', 'NIVEL1_SISTEMA',
    'NIVEL2_SUBSISTEMA', 'NIVEL3_ELEMENTO', 'NIVEL4_SUBELEMENTO', 'EQUIPO',
    'DESCRIPCION', 'FECHA_FIN', 'ACTIVIDAD_CAT', 'DURACION_PARADA_H',
    'MODO_FALLA', 'MECANISMO', 'CONSECUENCIA', 'ORDEN_TRABAJO',
    'METODO_DETECCION', 'CAUSA'];

  var ISO_NOTE = 'ISO 14224 con niveles 3-6 simplificados a los campos que ' +
    'existen en el modelo (sector/categoria/iso14224.failureMode del activo; ' +
    'subelemento y mecanismo no registrados). Niveles 3-6 simplificados = ' +
    'declaración, no dato. Los ' + '\u2014' + ' marcan campo ausente: nunca se inventa.';

  function isoEvents(apmEvents, apmAssetsById, categoryMap) {
    var byId = apmAssetsById || {};
    var cmap = categoryMap || null;
    var rows = list(apmEvents).map(function (e) {
      var a = e && byId[e.assetId] ? byId[e.assetId] : null;
      var iso = (a && a.iso14224) || {};
      var cat = str(a && a.category);
      if (cat && cmap && str(cmap[cat]) !== '') { cat = cmap[cat]; }
      return [
        dash(e && e.id),                       // 1 número de evento
        dash(e && e.start),                    // 2 fecha/hora categoría 1 (registro)
        dash(a && a.sector),                   // 3 nivel sistema    ← sector
        dash(cat),                             // 4 nivel subsistema ← category
        dash(iso.failureMode),                 // 5 nivel elemento   ← failureMode
        '—',                                   // 6 subelemento: no existe
        a && str(a.code) !== '' ? a.code : dash(e && e.assetId), // 7 equipo
        dash(e && e.description),              // descripción real si viene
        dash(e && e.end),                      // fin del evento (campo real, opcional)
        dash(e && e.type),                     // categoría/actividad del evento
        dash(e && e.downtimeH),                // 10-11 parada en horas
        dash(iso.failureMode || (e && e.type)), // 12 modo: activo, si no type (T-09)
        '—',                                   // 13 mecanismo: no registrado
        dash(iso.failureConsequence),          // 14 consecuencia del activo
        dash(e && e.workOrderRef),             // 15 acción: orden de trabajo local
        dash(e && e.detectionMethod),          // 16 verificado: no existe → '—'
        dash(e && e.cause)                     // 17 verificado: no existe → '—'
      ];
    });
    return { sheetName: 'eventos_iso14224', headers: ISO_EVENT_HEADERS, rows: rows, note: ISO_NOTE };
  }

  // --------------------------------------------------------- PHMSA / B31.8S

  var BUCKET_SIZE_KM = 10;
  var ANOMALY_BUCKET = { metalLoss: 'timeDependent', crack: 'timeDependent', dent: 'stable' };
  // Tercería/daño de terceros: ningún enum del modelo la representa → columna
  // a 0 por contrato (documentado en la cabecera y en la nota de la hoja).
  var THIRD_PARTY_TYPES = {};

  var MEDIDAS_HEADERS = ['SISTEMA', 'TRAMO_DESDE_KM', 'TRAMO_HASTA_KM',
    'ANOMALIAS', 'THREAT_TIME_DEPENDENT', 'THREAT_ESTABLE', 'THREAT_TERCEROS',
    'INSPECCIONES', 'EVIDENCIA_CORROSION_EXTERNA', 'MAX_PCT_METAL'];

  var HALLAZGOS_HEADERS = ['ID_ABNORMALIDAD', 'SISTEMA', 'KM', 'PCT_METAL',
    'TIPO', 'PRES_ADMISIBLE_B31G', 'SEVERIDAD', 'ACCION'];

  var MEDIDAS_NOTE = 'Categorías B31.8S desde los types reales del modelo: ' +
    'timeDependent=metalLoss+crack (corrosión interna/externa y grietas; el ' +
    'modelo no desglosa interna vs externa en anomalías), estable=dent, ' +
    'terceros=0 SIEMPRE (ningún type representa daño de terceros/geotecnia/' +
    'clima: cero evidencia no es cero amenaza). EVIDENCIA_CORROSION_EXTERNA = ' +
    'inspecciones externalCorrosion que cruzan el tramo; visual/repair/' +
    'replacement cuentan solo como inspección (método/acción, no amenaza).';

  var HALLAZGOS_NOTE = 'PRES_ADMISIBLE_B31G se rellena SOLO con ' +
    'opts.assessmentByAnomalyId precomputado por el llamador con ' +
    'IW.calc.pipelineAssessment: prohibido recalcular B31G en la plantilla; ' +
    'sin el mapa la columna va vacía. SEVERIDAD heredada de ' +
    'lineInspections.severity vía inspectionId (ausente → \u2018\u2019). ACCION ' +
    'derivada solo del booleano exceeds aportado: reparar|monitorear|\u2018\u2019.';

  function overlaps(f, t, desde, hasta) {
    return f !== null && t !== null && f <= t && f < hasta && t > desde;
  }

  function bucketIndex(km, from, nBuckets) {
    var i = Math.floor((km - from) / BUCKET_SIZE_KM);
    if (i < 0) { return -1; }
    if (i >= nBuckets) { i = nBuckets - 1; } // borde km == stationTo → último tramo
    return i;
  }

  function systemRange(sys, sysInsp, sysAnom) {
    var from = num(sys.stationFromKm);
    var to = num(sys.stationToKm);
    if (from !== null && to !== null && to >= from) { return { from: from, to: to }; }
    // Sin rango declarado: se deriva de los datos del propio sistema.
    var lo = null;
    var hi = null;
    sysAnom.forEach(function (a) {
      var k = num(a.stationKm);
      if (k === null) { return; }
      if (lo === null || k < lo) { lo = k; }
      if (hi === null || k > hi) { hi = k; }
    });
    sysInsp.forEach(function (i) {
      var f = num(i.fromKm);
      var t = num(i.toKm);
      if (f === null && t === null) { return; }
      if (f === null) { f = t; }
      if (t === null) { t = f; }
      if (lo === null || f < lo) { lo = f; }
      if (hi === null || t > hi) { hi = t; }
    });
    if (lo === null || hi === null || hi < lo) { return null; }
    return { from: lo, to: hi };
  }

  function phmsaPerformance(pipelineSystems, lineInspections, iliAnomalies, opts) {
    var options = opts || {};
    var assessments = options.assessmentByAnomalyId || null;
    var inspList = list(lineInspections);
    var anomList = list(iliAnomalies);

    // índice inspección→registro para heredar severidad (shape real: el anomalía
    // solo trae inspectionId; severidad vive en lineInspections).
    var inspById = {};
    inspList.forEach(function (i) {
      if (i && str(i.id) !== '') { inspById[i.id] = i; }
    });

    var medidasRows = [];
    list(pipelineSystems).forEach(function (sys) {
      if (!sys) { return; }
      var sid = str(sys.id);
      var sysInsp = inspList.filter(function (i) { return i && str(i.systemId) === sid; });
      var sysAnom = anomList.filter(function (a) { return a && str(a.systemId) === sid; });
      var range = systemRange(sys, sysInsp, sysAnom);
      if (!range) { return; } // sistema sin datos → sin tramos
      var from = range.from;
      var to = range.to;
      var n = Math.max(1, Math.ceil((to - from) / BUCKET_SIZE_KM));

      var buckets = [];
      for (var b = 0; b < n; b++) {
        buckets.push({ a: 0, td: 0, st: 0, tp: 0, insp: 0, ext: 0, maxDepth: null });
      }
      sysAnom.forEach(function (a) {
        var km = num(a.stationKm);
        if (km === null) { return; }
        var i = bucketIndex(km, from, n);
        if (i < 0) { return; }
        var bu = buckets[i];
        bu.a += 1;
        var btype = ANOMALY_BUCKET[a.type];
        if (btype === 'timeDependent') { bu.td += 1; }
        if (btype === 'stable') { bu.st += 1; }
        if (Object.prototype.hasOwnProperty.call(THIRD_PARTY_TYPES, a.type)) { bu.tp += 1; }
        var d = num(a.depthPct);
        if (d !== null && (bu.maxDepth === null || d > bu.maxDepth)) { bu.maxDepth = d; }
      });
      sysInsp.forEach(function (i) {
        var f = num(i.fromKm);
        var t = num(i.toKm);
        if (f === null && t === null) { return; }
        if (f === null) { f = t; }
        if (t === null) { t = f; }
        for (var k = 0; k < n; k++) {
          var desde = from + k * BUCKET_SIZE_KM;
          var hasta = Math.min(desde + BUCKET_SIZE_KM, to > desde ? to : desde + 1);
          if (!overlaps(f, t, desde, k === n - 1 ? hasta : desde + BUCKET_SIZE_KM)) { continue; }
          buckets[k].insp += 1;
          if (i.type === 'externalCorrosion') { buckets[k].ext += 1; }
        }
      });
      var sysName = str(sys.name) || sid;
      for (var j = 0; j < n; j++) {
        var d0 = from + j * BUCKET_SIZE_KM;
        var d1 = j === n - 1 ? to : d0 + BUCKET_SIZE_KM;
        var bu2 = buckets[j];
        medidasRows.push([
          sysName, cell(d0), cell(d1), bu2.a, bu2.td, bu2.st, bu2.tp,
          bu2.insp, bu2.ext, bu2.maxDepth === null ? '' : bu2.maxDepth
        ]);
      }
    });

    // Hallazgos ordenados por km ascendente (id estable en empates; sin km →
    // al final). Copia: nunca se muta la lista del llamador.
    var hallRows = anomList.slice().sort(function (x, y) {
      var kx = num(x && x.stationKm);
      var ky = num(y && y.stationKm);
      var vx = kx === null ? Infinity : kx;
      var vy = ky === null ? Infinity : ky;
      if (vx !== vy) { return vx - vy; }
      return str(x && x.id) < str(y && y.id) ? -1 : str(x && x.id) > str(y && y.id) ? 1 : 0;
    }).map(function (a) {
      var asmt = assessments && a ? assessments[a.id] : undefined;
      var pAllow = '';
      var accion = '';
      if (typeof asmt === 'number' && isFinite(asmt)) {
        pAllow = asmt;
      } else if (asmt && typeof asmt === 'object') {
        pAllow = cell(asmt.pAllow);
        if (asmt.exceeds === true) { accion = 'reparar'; }
        else if (asmt.exceeds === false) { accion = 'monitorear'; }
      }
      var insp = str(a.inspectionId) !== '' ? inspById[a.inspectionId] : null;
      return [
        cell(a.id), cell(a.systemId), cell(a.stationKm), cell(a.depthPct),
        cell(a.type), pAllow, cell(insp && insp.severity), accion
      ];
    });

    return {
      sheets: [
        { sheetName: 'medidas_desempeno', headers: MEDIDAS_HEADERS, rows: medidasRows, note: MEDIDAS_NOTE },
        { sheetName: 'hallazgos_ili', headers: HALLAZGOS_HEADERS, rows: hallRows, note: HALLAZGOS_NOTE }
      ]
    };
  }

  return {
    sapPm: { equipment: sapEquipment },
    maximo: { asset: maximoAsset },
    psv: { sapPm: psvSap, maximo: psvMaximo },
    iso14224: { events: isoEvents },
    phmsa: { performance: phmsaPerformance }
  };
});
