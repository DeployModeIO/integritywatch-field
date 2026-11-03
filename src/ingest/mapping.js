/* IntegrityWatch Field — ingest/mapping
   Motor PURO de asignacion columna->campo para la UI de importacion y el
   pipeline de commit. Sin DOM, sin IO, sin mutaciones: autoMap lee
   IW.ingest.schemas (fieldFor / SCHEMAS) y normaliza con IW.ingest.units
   (canonicalize / parseDate / normalizeNumber / UNITS), nunca reimplementa.
   Confianzas: exact (alias o nombre exacto, con o sin pista de unidad),
   alias (contencion con >=4 chars iniciales comunes), fuzzy (Jaccard de
   tokens >=0.5, o token distintivo comun + pista de unidad de la dimension
   que admite un campo numerico), none. Empates al mismo nivel -> field:null
   con reason 'ambiguous' para que decida el humano en la UI. */
(function (root, factory) {
  'use strict';
  if (typeof require === 'function' && !(root.IW && root.IW.ingest && root.IW.ingest.schemas)) {
    try { require('./schemas.js'); } catch (e) { /* ignore */ }
  }
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.ingest = root.IW.ingest || {};
  root.IW.ingest.mapping = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function U() { return root.IW && root.IW.ingest && root.IW.ingest.units; }
  function S() { return root.IW && root.IW.ingest && root.IW.ingest.schemas; }

  // '(psi)', '(°C)', '(bar)'... grupo 1 = texto de la pista de unidad.
  var UNIT_HINT_RE = /\(([^()]*)\)/g;

  // Pistas de unidad que NO son datos de columna y se ignoran al strip-exact
  // (no pertenecen a ninguna dimension de units.UNITS).
  var NON_UNIT_HINTS = { 'opcional': 1, 'opc': 1, 'requerido': 1, 'req': 1, 'required': 1, 'obligatorio': 1, 'texto': 1, 'text': 1, 'string': 1, 'number': 1, 'num': 1 };

  // Tokens vacios del espanol/ingles que no aportan identidad a un nombre.
  var STOPWORDS = {
    'de': 1, 'la': 1, 'el': 1, 'los': 1, 'las': 1, 'en': 1, 'y': 1, 'un': 1, 'una': 1,
    'que': 1, 'no': 1, 'del': 1, 'al': 1, 'the': 1, 'of': 1, 'and': 1, 'or': 1, 'for': 1, 'a': 1
  };

  // Vocabularios de valores de muestra que apuntan a enums concretos
  // (comparados en forma canonicalize). 'a'/'b'/'c' crudos ya entran por
  // field.enum; aqui van los sinonimos en palabras.
  var ENUM_VALUE_HINTS = {
    criticality: ['a', 'b', 'c', 'critica', 'critico', 'alta', 'media', 'baja', 'clasica', 'tier'],
    severity: ['low', 'moderate', 'high', 'severe', 'baja', 'media', 'alta', 'severa', 'moderada'],
    status: ['ok', 'due', 'overdue', 'activo', 'retirado', 'running', 'standby', 'down', 'maintenance'],
    source: ['manual', 'import', 'seed']
  };

  function canonical(s) { return U().canonicalize(s); }

  function normalizeHeader(h) { return canonical(h); }

  // headerOfRow(row): fila de xlsx/csv -> lista de cabeceras textuales.
  function headerOfRow(row) {
    if (Array.isArray(row)) {
      return row.map(function (c) { return c === null || c === undefined ? '' : String(c).trim(); });
    }
    if (row && typeof row === 'object') { return Object.keys(row); }
    return [];
  }

  function tokensOf(ck) {
    var out = [];
    String(ck).split('_').forEach(function (t) {
      if (t && !STOPWORDS[t]) { out.push(t); }
    });
    return out;
  }

  // Tokens de la cabecera ORIGINAL: separa camelCase antes de canonicalizar
  // para que 'assetCode' rinda {asset, code} y choque con alias 'asset_code'.
  function headerTokensOf(raw) {
    return tokensOf(canonical(String(raw).replace(/([a-z0-9])([A-Z])/g, '$1_$2')));
  }

  function lcp(a, b) {
    var n = Math.min(a.length, b.length), i = 0;
    while (i < n && a.charAt(i) === b.charAt(i)) { i++; }
    return i;
  }

  // Pista de unidad de un texto canonic: ultima token que es unidad conocida
  // (mismo criterio que unitFromHeader en schemas.js, via la tabla UNITS).
  function unitTokenOf(ck) {
    var found = null;
    String(ck).split('_').forEach(function (tk) {
      Object.keys(U().UNITS).forEach(function (dim) {
        if (Object.prototype.hasOwnProperty.call(U().UNITS[dim].units, tk)) { found = tk; }
      });
    });
    return found;
  }

  // Dims que cubre la cabecera via pistas entre parentesis: ['psi','bar'] etc.
  // Devuelve {units:[...canon], dims:{unit:dim}} ignorando hints no-unidad.
  function hintUnits(header) {
    var units = [], dims = {};
    var re = new RegExp(UNIT_HINT_RE.source, 'g');
    var m;
    while ((m = re.exec(String(header))) !== null) {
      var uc = canonical(m[1]);
      if (!uc || NON_UNIT_HINTS[uc]) { continue; }
      var dim = null;
      Object.keys(U().UNITS).forEach(function (d) {
        if (Object.prototype.hasOwnProperty.call(U().UNITS[d].units, uc)) { dim = d; }
      });
      if (dim) { units.push(uc); dims[uc] = dim; }
    }
    return { units: units, dims: dims };
  }

  // Cabecera sin las pistas de unidad: 'Temperatura (°C)' -> 'Temperatura'.
  function stripHints(header) {
    return String(header).replace(new RegExp(UNIT_HINT_RE.source, 'g'), ' ').replace(/\s+/g, ' ').trim();
  }

  function mappingFields(store) {
    var schema = S().SCHEMAS[store];
    if (!schema) { throw new Error('IW.ingest.mapping: store desconocido: ' + store); }
    return schema.fields.filter(function (f) { return !f.derived; });
  }

  function aliasNames(f) {
    // aliases ya canonicalizados + nombre camelCase troceado ('sensorType'
    // -> 'sensor_type' ademas de 'sensortype').
    return f.aliases.concat([
      canonical(f.name),
      canonical(String(f.name).replace(/([a-z0-9])([A-Z])/g, '$1_$2'))
    ]);
  }

  function jaccard(a, b) {
    if (!a.length || !b.length) { return 0; }
    var inter = 0;
    a.forEach(function (t) { if (b.indexOf(t) !== -1) { inter++; } });
    return inter / (a.length + b.length - inter);
  }

  function bestJaccard(ckTokens, f) {
    var best = 0;
    aliasNames(f).forEach(function (a) {
      var j = jaccard(ckTokens, tokensOf(a));
      if (j > best) { best = j; }
    });
    return best;
  }

  function aliasContain(ck, f) {
    var hit = null;
    aliasNames(f).forEach(function (a) {
      if (hit) { return; }
      if (a.length >= 2 && (ck.indexOf(a) !== -1 || a.indexOf(ck) !== -1) && lcp(ck, a) >= 4) { hit = a; }
    });
    return hit;
  }

  // Token distintivo comun (longitud >=4, no vacio) entre cabecera y campo.
  function sharedDistinctToken(ckTokens, f) {
    var found = null;
    aliasNames(f).forEach(function (a) {
      if (found) { return; }
      var at = tokensOf(a);
      ckTokens.forEach(function (t) {
        if (!found && t.length >= 4 && at.indexOf(t) !== -1) { found = t; }
      });
    });
    return found;
  }

  /* autoMap(store, headers) -> assignments[]
     {header, headerCanonical, field|null, confidence, reason} */
  function autoMap(store, headers) {
    var fields = mappingFields(store);
    return (headers || []).map(function (rawHeader) {
      var header = rawHeader === null || rawHeader === undefined ? '' : String(rawHeader);
      var ck = canonical(header);
      var base = { header: header, headerCanonical: ck, field: null, confidence: 'none', reason: null };
      if (ck === '') { base.reason = 'vacio'; return base; }

      var stripped = stripHints(header);
      var ck2 = canonical(stripped);
      var hints = hintUnits(header);

      // 1) exact: alias/nombre exacto sobre la cabecera completa.
      var f1 = S().fieldFor(store, header);
      if (f1) {
        base.field = f1.name; base.confidence = 'exact';
        base.reason = canonical(f1.name) === ck ? 'nombre exacto' : 'alias exacto';
        return base;
      }
      // 2) exact: alias/nombre exacto tras retirar la pista de unidad.
      if (ck2 && ck2 !== ck) {
        var f2 = S().fieldFor(store, stripped);
        if (f2) {
          base.field = f2.name; base.confidence = 'exact';
          base.reason = 'alias exacto tras retirar unidad (' + (hints.units.join(',') || ck2) + ')';
          return base;
        }
      }

      // Candidatos alias (contencion con >=4 iniciales comunes). Un campo con
      // varios aliases contenidos cuenta UNA vez; dos CAMPOS distintos al
      // mismo nivel empatan -> ambiguous (que decida el humano).
      var aliasByField = {};
      fields.forEach(function (f) {
        var a = aliasContain(ck, f) || (ck2 !== ck ? aliasContain(ck2, f) : null);
        if (a && !aliasByField[f.name]) { aliasByField[f.name] = a; }
      });
      var aliasFields = Object.keys(aliasByField);
      if (aliasFields.length === 1) {
        base.field = aliasFields[0]; base.confidence = 'alias';
        base.reason = 'alias similar "' + aliasByField[aliasFields[0]] + '"';
        return base;
      }
      if (aliasFields.length > 1) {
        base.confidence = 'alias'; base.reason = 'ambiguous';
        base.candidates = aliasFields;
        return base;
      }

      // Candidatos fuzzy (tokens camel-aware de la cabecera original).
      var ckTokens = headerTokensOf(header);
      var sTokens = ck2 !== ck ? headerTokensOf(stripped) : ckTokens;
      var fuzzyByField = {};
      fields.forEach(function (f) {
        if (fuzzyByField[f.name]) { return; }
        var j = Math.max(bestJaccard(ckTokens, f), ck2 !== ck ? bestJaccard(sTokens, f) : 0);
        if (j >= 0.5) { fuzzyByField[f.name] = 'jaccard'; return; }
        if (hints.units.length && f.type === 'number' && f.unit) {
          var dimOk = hints.units.some(function (u) { return hints.dims[u] === f.unit; });
          if (dimOk && sharedDistinctToken(ckTokens, f)) { fuzzyByField[f.name] = 'unidad+token'; }
        }
      });
      var fuzzyFields = Object.keys(fuzzyByField);
      if (fuzzyFields.length === 1) {
        base.field = fuzzyFields[0]; base.confidence = 'fuzzy';
        base.reason = 'semejanza por tokens (' + fuzzyByField[fuzzyFields[0]] + ')';
        return base;
      }
      if (fuzzyFields.length > 1) {
        base.confidence = 'fuzzy'; base.reason = 'ambiguous';
        base.candidates = fuzzyFields;
        return base;
      }

      base.reason = 'sin coincidencias';
      return base;
    });
  }

  /* applyOverrides(assignments, overrides) -> nueva lista sin mutar.
     overrides: mapa {header|headerCanonical: field|null} o array
     [{header|headerCanonical, field}]. La confianza pasa a 'manual'. */
  function applyOverrides(assignments, overrides) {
    var byKey = {};
    if (Array.isArray(overrides)) {
      overrides.forEach(function (o) {
        if (!o) { return; }
        var key = o.header !== undefined && o.header !== null ? canonical(o.header) : canonical(o.headerCanonical);
        if (key) { byKey[key] = (o.field === undefined ? null : o.field); }
      });
    } else if (overrides && typeof overrides === 'object') {
      Object.keys(overrides).forEach(function (k) { byKey[canonical(k)] = (overrides[k] === undefined ? null : overrides[k]); });
    }
    return (assignments || []).map(function (a) {
      var has = Object.prototype.hasOwnProperty.call(byKey, canonical(a.header)) ||
        Object.prototype.hasOwnProperty.call(byKey, a.headerCanonical);
      if (!has) {
        var clone = {};
        Object.keys(a).forEach(function (k) { clone[k] = a[k]; });
        return clone;
      }
      var field = Object.prototype.hasOwnProperty.call(byKey, canonical(a.header)) ? byKey[canonical(a.header)] : byKey[a.headerCanonical];
      var out = {};
      Object.keys(a).forEach(function (k) { out[k] = a[k]; });
      out.field = field === undefined ? null : field;
      out.confidence = 'manual';
      out.reason = 'override manual';
      delete out.candidates;
      return out;
    });
  }

  /* validateMapping(store, assignments) ->
     {ok, missingRequired[], unknown[], duplicates[{field,headers[]}], suggestions[]}
     required sin asignar o duplicates => ok:false. Duplicates son SIEMPRE
     error (sin opcion allowMulti). */
  function validateMapping(store, assignments) {
    var fields = mappingFields(store);
    var byName = {};
    fields.forEach(function (f) { byName[f.name] = f; });
    var required = fields.filter(function (f) { return f.required; });
    var assigned = {};
    var missingRequired = [];
    var unknown = [];
    var suggestions = [];
    var dupMap = {};

    (assignments || []).forEach(function (a) {
      if (a.field === null || a.field === undefined || a.field === '') { return; }
      if (!byName[a.field]) {
        if (unknown.indexOf(a.field) === -1) { unknown.push(a.field); }
        return;
      }
      if (!assigned[a.field]) { assigned[a.field] = []; }
      assigned[a.field].push(a.header);
    });

    required.forEach(function (f) {
      if (!assigned[f.name]) {
        missingRequired.push(f.name);
        (assignments || []).forEach(function (a) {
          if (a.field) { return; }
          var ck = canonical(a.header);
          var ck2 = canonical(stripHints(a.header));
          var sim = aliasContain(ck, f) || aliasContain(ck2, f) || bestJaccard(tokensOf(ck), f) >= 0.5 || sharedDistinctToken(tokensOf(ck), f);
          if (sim) { suggestions.push({ header: a.header, field: f.name }); }
        });
      }
    });

    Object.keys(assigned).forEach(function (fname) {
      if (assigned[fname].length > 1) {
        (dupMap[fname] = dupMap[fname] || []).push(assigned[fname]);
      }
    });
    var duplicates = [];
    fields.forEach(function (f) {
      if (dupMap[f.name]) {
        dupMap[f.name].forEach(function (hs) { duplicates.push({ field: f.name, headers: hs }); });
      }
    });

    return {
      ok: missingRequired.length === 0 && unknown.length === 0 && duplicates.length === 0,
      missingRequired: missingRequired,
      unknown: unknown,
      duplicates: duplicates,
      suggestions: suggestions
    };
  }

  /* suggestFromSample(store, headers, rowsPreview) -> propuestas
     [{header, field, confidence:'sample', reason}] solo para columnas que
     autoMap no resolvio con certeza (none, ambiguous o fuzzy): mira los
     valores reales y propone segun patron de fecha, vocabulario de enum
     (p.ej ['A','B','C'] o Critica/Alta/Baja/Media) o rango numerico de la
     dimension estacion. Si la columna ya tiene un campo NO contradictorio
     (exact/alias/manual) se omite. Determinista: mejor score, luego el
     solapamiento de tokens con la cabecera, luego orden del schema. */
  function suggestFromSample(store, headers, rowsPreview) {
    var fields = mappingFields(store);
    var auto = autoMap(store, headers);
    var rows = rowsPreview || [];
    var proposals = [];
    (headers || []).forEach(function (header, i) {
      var a = auto[i] || { confidence: 'none', field: null };
      if (a.confidence === 'exact' || a.confidence === 'manual') { return; }
      var values = [];
      rows.forEach(function (r) {
        var v = Array.isArray(r) ? r[i] : (r ? r[header] : null);
        if (v !== null && v !== undefined && String(v).trim() !== '') { values.push(v); }
      });
      if (values.length < 2) { return; }
      var ckH = tokensOf(canonical(header));

      var best = null;
      function consider(field, score, kind) {
        var sim = 0;
        var ft = tokensOf(canonical(field.name));
        field.aliases.forEach(function (al) { ft = ft.concat(tokensOf(al)); });
        ckH.forEach(function (t) { if (ft.indexOf(t) !== -1) { sim++; } });
        if (!best || score > best.score || (score === best.score && sim > best.sim) ||
          (score === best.score && sim === best.sim && field.name < best.field.name)) {
          best = { field: field, score: score, kind: kind, sim: sim };
        }
      }

      // 1) patron de fecha en >=60% de los valores. Los numericos solo cuentan
      // como serie Excel si caen en el rango util (20000-80000 ~ 1954-2067);
      // asi 65 grados no se confunde con una fecha.
      var dateLike = values.filter(function (v) {
        if (typeof v === 'number') { return v >= 20000 && v <= 80000; }
        if (typeof v === 'string' && /^\d+$/.test(v.trim())) { return false; }
        return !!U().parseDate(v).iso;
      }).length / values.length;
      if (dateLike >= 0.6) {
        fields.forEach(function (f) { if (f.type === 'date') { consider(f, 0.9, 'fecha'); } });
      }

      // 2) enum: >=60% de los valores son miembros del enum o de su vocabulario
      fields.forEach(function (f) {
        if (f.type !== 'enum' || !f.enum) { return; }
        var hintList = ENUM_VALUE_HINTS[f.name] || null;
        var enumCk = f.enum.map(canonical);
        var hit = values.filter(function (v) {
          var cv = canonical(v);
          return enumCk.indexOf(cv) !== -1 || (hintList && hintList.indexOf(cv) !== -1);
        }).length;
        if (hit / values.length >= 0.6) { consider(f, 0.95, 'enum'); }
      });

      // 3) numerico puro en rango de estacion (km 0-1500)
      var nums = values.map(function (v) { return typeof v === 'number' ? v : U().normalizeNumber(String(v)); });
      if (nums.every(function (n) { return n !== null && isFinite(n); })) {
        var estFields = fields.filter(function (f) { return f.type === 'number' && f.unit === 'estacion'; });
        if (estFields.length) {
          var inRange = nums.filter(function (n) { return n >= 0 && n <= 1500; }).length;
          if (inRange / nums.length >= 0.8) { estFields.forEach(function (f) { consider(f, 0.7, 'estacion'); }); }
        }
      }

      // contradiccion: si la columna ya tiene campo con tipo incompatible, la
      // propuesta manda; si tiene el MISMO campo, no hay nada que proponer.
      if (best && best.field.name !== a.field) {
        proposals.push({ header: header, field: best.field.name, confidence: 'sample', reason: 'valores de muestra (' + best.kind + ')' });
      }
    });
    return proposals;
  }

  /* toColumnPlan(assignments) -> [{col, field, unitFrom}]
     col = indice de la columna en el orden actual de assignments (si el
     usuario reordeno la tabla, reordena esta lista). unitFrom detectada de
     pistas '(psi)','(°C)' via UNIT_HINT_RE + tabla UNITS, o null. */
  function toColumnPlan(assignments) {
    var plan = [];
    (assignments || []).forEach(function (a, i) {
      if (a.field === null || a.field === undefined || a.field === '') { return; }
      var hints = hintUnits(a.header);
      var unitFrom = hints.units.length ? hints.units[hints.units.length - 1] : null;
      if (!unitFrom) {
        var ut = unitTokenOf(canonical(a.header));
        unitFrom = ut || null;
      }
      plan.push({ col: i, field: a.field, unitFrom: unitFrom });
    });
    return plan;
  }

  return {
    UNIT_HINT_RE: UNIT_HINT_RE,
    normalizeHeader: normalizeHeader,
    headerOfRow: headerOfRow,
    autoMap: autoMap,
    applyOverrides: applyOverrides,
    validateMapping: validateMapping,
    suggestFromSample: suggestFromSample,
    toColumnPlan: toColumnPlan
  };
});
