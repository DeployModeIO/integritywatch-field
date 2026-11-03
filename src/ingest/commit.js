/* IntegrityWatch Field — ingest/commit
   Motor de PREVISUALIZACION, UPSERT por clave natural, ROLLBACK por diario y
   REANUDE sobre los repos inyectados (IW.core.store). Todo por lotes de 5000 y
   cooperativo (cesa el loop entre lotes); sin DOM, sin consola, sin estado
   global. Errres tipados COMMIT_* en .code.

   Conceptos:
   - Clave natural: IW.ingest.schemas.naturalKeyOf(storeName, record) — el
     mismo evaluador sobre filas del borrador y registros existentes.
   - Diario (journal): un doc por lote en importLog, id `${journalId}-b${n}`,
     con inserts:[ids] y changes:[{id, before:{campo:valor}}] (diff minimo,
     no snapshot). rollback() los lee por importId en batchNo DESC e invierte.
   - Checkpoint: doc meta `ingest.resume.${fingerprint}` con {journalId,
     rowsDone, storeName, at, status:'partial'|'done'}. 'Borrar' checkpoint =
       set(key, null) (makeMeta no expone delete).
   - LIMIT_ROWS: al superar limits.maxRows con el siguiente paso del iterable
     SE LIMPIA AUTOMATICAMENTE lo hecho en ESE run (rollback del diario propio,
     docs marcados rolledBack, checkpoint borrado) y se rechaza con
     COMMIT_LIMIT_ROWS. Para conservar el parcial use isCanceled en su lugar.
    - Rendimiento del rollback: repo.remove es O(1) en IndexedDB pero O(n) en
      dbMemory; con mas de REMOVE_BULK_THRESHOLD inserts el rollback usa la via
      rapida list+filter+clear+saveAll (los registros conservados se re-sellan
      con updatedAt nuevo; createdAt/autorias intactas).
    - Concurrencia (G2, mutex por store): los lotes de escritura de run() y el
      rollback COMPLETO se serializan por nombre de store con una cola de
      promesas (withStoreLock). Sin ella, dos operaciones masivas
      list→clear→saveAll concurrentes interleavean y resucitan/perdian
      registros ajenos. Los diarios con rolledBack:true quedan fuera de
      journalDocsFor: revertir el mismo journal dos veces es NO-OP con
      COMMIT_NO_JOURNAL. Consecuencia: importaciones concurrentes al MISMO
      store se serializan por lote (correcto; algo mas lento por espera).
   - quality ADITIVO en inserts: {...calidad del draft, mark, sourceFile,
     importId}. Los updates NO tocan quality ni campos fuera del plan.
   - store.stamp solo pone createdAt/updatedAt: commit escribe
     createdBy/updatedBy explicitamente cuando hay actor (convencion
     IW.security.permissions.stamp). */
(function (root, factory) {
  'use strict';
  if (typeof require === 'function') {
    try { require('./units.js'); } catch (e) { /* ignore */ }
    try { if (!(root.IW && root.IW.ingest && root.IW.ingest.schemas)) { require('./schemas.js'); } } catch (e) { /* ignore */ }
    try { if (!(root.IW && root.IW.ingest && root.IW.ingest.formats)) { require('./formats.js'); } } catch (e) { /* ignore */ }
  }
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.ingest = root.IW.ingest || {};
  root.IW.ingest.commit = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // --- codigos tipados ------------------------------------------------------
  var CODE_BAD_OPTS = 'COMMIT_BAD_OPTS';
  var CODE_BAD_SOURCE = 'COMMIT_BAD_SOURCE';
  var CODE_BAD_REPO = 'COMMIT_BAD_REPO';
  var CODE_BAD_PLAN = 'COMMIT_BAD_PLAN';
  var CODE_UNKNOWN_STORE = 'COMMIT_UNKNOWN_STORE';
  var CODE_LIMIT_ROWS = 'COMMIT_LIMIT_ROWS';
  var CODE_LIMIT_BYTES = 'COMMIT_LIMIT_BYTES';
  var CODE_NO_JOURNAL = 'COMMIT_NO_JOURNAL';

  var DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
  var DEFAULT_MAX_ROWS = 500000;
  var DEFAULT_BATCH_SIZE = 5000;
  var MAX_LIST_ITEMS = 200;   // techo de errores/advertencias en resultados
  var MAX_MUESTRAS = 20;
  var REMOVE_BULK_THRESHOLD = 500;
  var RESUME_PREFIX = 'ingest.resume.';
  var MAP_PREFIX = 'ingest.map.';
  var KEEP_MAPS_KEY = 'ingest.keepMaps';

  var ID_PREFIXES = {
    readings: 'RD', coupons: 'CP', monitoringPoints: 'MP', psvs: 'PSV',
    pipelineSystems: 'SYS', lineAssets: 'LA', lineInspections: 'INS',
    apmAssets: 'APM', apmEvents: 'EVT'
  };

  function S() { return root.IW.ingest.schemas; }
  function F() { return root.IW.ingest.formats; }

  function iwError(code, message, extra) {
    var e = new Error(message);
    e.code = code;
    if (extra) {
      Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    }
    return e;
  }

  function yieldLoop() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  // --- mutex cooperativo por store (G2) ---------------------------------------
  /* Cola de promesas por nombre de store, sin librerias externas (~20 lineas):
     serializa los LOTES de escritura de run() con el ROLLBACK COMPLETO del
     MISMO store. Sin ella, dos operaciones masivas list→filter→clear→saveAll
     concurrentes toman su snapshot ANTES del clear rival y al re-salvar
     resucitan registros ya revertidos o pierden los que el rival re-salvo
     (perdida de 120 seeds del demo reproducida en navegador). Consecuencia
     aceptada: importaciones concurrentes al mismo store se serializan por
     lote (correcto; algo mas lento por espera). NO es reentrante: fn nunca
     debe adquirir el lock del mismo store dentro de si. La cola vive en el
     MODULO (no por instancia de repo) porque los dos rollbacks comparten el
     storeName pero cada llamador trae su propio repo. */
  var storeLocks = new Map();
  var UNKNOWN_STORE_LOCK = 'commit:store-desconocido';

  function withStoreLock(storeName, fn) {
    var key = String(storeName);
    var prev = storeLocks.get(key) || Promise.resolve();
    var result = prev.then(fn);
    // tail: nunca rechaza, asi un fallo ajeno no rompe la cola.
    var tail = result.then(function () { return null; }, function () { return null; });
    storeLocks.set(key, tail);
    // liberar el mapa cuando este pedido es el ultimo de la cola.
    tail.then(function () {
      if (storeLocks.get(key) === tail) { storeLocks.delete(key); }
    });
    return result;
  }

  function copy(rec) {
    var out = {};
    for (var k in rec) {
      if (Object.prototype.hasOwnProperty.call(rec, k)) { out[k] = rec[k]; }
    }
    return out;
  }

  function getPath(obj, path) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length && cur !== null && cur !== undefined; i++) { cur = cur[parts[i]]; }
    return cur;
  }

  function setPath(obj, path, val) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === undefined || cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') {
        cur[parts[i]] = {};
      }
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }

  // Mismo mecanismo de id que views/ingest.js makeId (los repos no generan id).
  function makeId(prefix, seq) {
    var rnd = Math.random().toString(36).slice(2, 6);
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + String(seq) + '-' + rnd;
  }

  function idPrefixOf(storeName) {
    return ID_PREFIXES[storeName] || String(storeName).slice(0, 3).toUpperCase();
  }

  function rowNoOf(rec, fallback) {
    if (rec && typeof rec.rowNo === 'number') { return rec.rowNo; }
    if (rec && typeof rec.lineNo === 'number') { return rec.lineNo; }
    return fallback;
  }

  function rowCells(rec) {
    if (rec && Array.isArray(rec.row)) { return rec.row; }
    if (Array.isArray(rec)) { return rec; }
    return [];
  }

  function isIterable(x) {
    return !!x && (typeof x[Symbol.asyncIterator] === 'function' || typeof x[Symbol.iterator] === 'function');
  }

  async function toAsyncIterator(iterable) {
    if (typeof iterable[Symbol.asyncIterator] === 'function') { return iterable[Symbol.asyncIterator](); }
    var it = iterable[Symbol.iterator]();
    return {
      next: async function () { return it.next(); },
      return: async function () { if (typeof it.return === 'function') { it.return(); } return { done: true }; }
    };
  }

  // --- plan -----------------------------------------------------------------
  function preparePlan(storeName, columnPlan) {
    var schema = S().SCHEMAS[storeName];
    if (!schema) {
      throw iwError(CODE_UNKNOWN_STORE, 'commit: store desconocido: ' + JSON.stringify(storeName) +
        ' (validos: ' + S().ENTITIES.join(', ') + ')');
    }
    if (!Array.isArray(columnPlan) || columnPlan.length === 0) {
      throw iwError(CODE_BAD_PLAN, 'commit: columnPlan debe ser un array no vacio de {col, field, unitFrom?}');
    }
    return columnPlan.map(function (p, i) {
      if (!p || typeof p.field !== 'string' || p.field === '' ||
          typeof p.col !== 'number' || !isFinite(p.col) || p.col < 0) {
        throw iwError(CODE_BAD_PLAN, 'commit: columnPlan[' + i + '] invalido: se requiere {col:int, field:nombre}');
      }
      var def = S().fieldByName(storeName, p.field);
      if (!def || def.derived) {
        throw iwError(CODE_BAD_PLAN, 'commit: columnPlan[' + i + ']: campo "' + p.field +
          '" inexistente o derivado en "' + storeName + '"');
      }
      return { col: p.col, field: def.name, unitFrom: p.unitFrom || null };
    });
  }

  function valuesFromPlan(cells, plan) {
    var values = {};
    for (var i = 0; i < plan.length; i++) {
      var p = plan[i];
      var raw = cells[p.col];
      if (raw === undefined) { raw = null; }
      if (p.unitFrom && p.unitFrom !== '' && raw !== null && raw !== '') {
        var s = String(raw).trim();
        if (typeof raw !== 'string' || /^-?[\d.,\s]+$/.test(s)) {
          // el valor viene 'limpio': se le pega la unidad pista para que
          // schemas.coerceNumber la resuelva via stripUnit.
          raw = s + ' ' + p.unitFrom;
        }
      }
      values[p.field] = raw;
    }
    return values;
  }

  function projectValues(rec, plan) {
    var v = {};
    for (var i = 0; i < plan.length; i++) {
      var val = getPath(rec, plan[i].field);
      if (val !== undefined) { v[plan[i].field] = val; }
    }
    return v;
  }

  function eqVal(a, b) {
    if (a === b) { return true; }
    if ((a === undefined || a === null) && (b === undefined || b === null)) { return true; }
    return false;
  }

  // diff SOLO campos del plan presentes en el borrador (undefined = "no dice
  // nada sobre ese campo": se preserva el valor existente).
  function diffFields(oldValues, draftRecord, plan) {
    var changed = [];
    for (var i = 0; i < plan.length; i++) {
      var f = plan[i].field;
      var newVal = getPath(draftRecord, f);
      if (newVal === undefined) { continue; }
      var oldVal = oldValues ? oldValues[f] : undefined;
      if (!eqVal(oldVal, newVal)) { changed.push({ field: f, oldVal: oldVal, newVal: newVal }); }
    }
    return changed;
  }

  function toPairs(obj) {
    return Object.keys(obj).map(function (k) { return [k, obj[k]]; });
  }

  // --- repos / meta -----------------------------------------------------------
  function requireRepo(repo, name) {
    var need = ['list', 'get', 'save', 'saveAll'];
    if (!repo || need.some(function (fn) { return typeof repo[fn] !== 'function'; })) {
      throw iwError(CODE_BAD_REPO, 'commit: ' + name + ' debe ser un repo IW (list/get/save/saveAll)');
    }
    return repo;
  }

  function requireRemoverRepo(repo, name) {
    requireRepo(repo, name);
    if (typeof repo.remove !== 'function') {
      throw iwError(CODE_BAD_REPO, 'commit: ' + name + ' debe exponer remove()');
    }
    return repo;
  }

  // Acepta el meta de IW.core.store ({get,set,list}) o un repo crudo del store
  // 'meta' ({get,save,list}): normaliza a get(key)/set(key,value)/listDocs().
  function metaApi(metaRepo) {
    if (!metaRepo) { return null; }
    if (typeof metaRepo.set === 'function' && typeof metaRepo.get === 'function') {
      return {
        get: function (k) { return Promise.resolve(metaRepo.get(k)); },
        set: function (k, v) { return Promise.resolve(metaRepo.set(k, v)); },
        listDocs: function () {
          return typeof metaRepo.list === 'function' ? Promise.resolve(metaRepo.list()) : Promise.resolve([]);
        }
      };
    }
    if (typeof metaRepo.save === 'function' && typeof metaRepo.get === 'function') {
      return {
        get: function (k) { return metaRepo.get(k).then(function (r) { return r ? r.value : undefined; }); },
        set: function (k, v) { return metaRepo.save({ key: k, value: v }); },
        listDocs: function () { return metaRepo.list(); }
      };
    }
    return null;
  }

  async function buildMap(storeName, plan, repo, meta, useSaved) {
    var keep = false;
    if (meta) {
      keep = !!(await meta.get(KEEP_MAPS_KEY));
      if (keep && useSaved) {
        var saved = await meta.get(MAP_PREFIX + storeName);
        if (Array.isArray(saved)) { return { map: new Map(saved), keep: true }; }
      }
    }
    var map = new Map();
    var all = await repo.list();
    for (var i = 0; i < all.length; i++) {
      var rec = all[i];
      var key = S().naturalKeyOf(storeName, rec);
      if (!key) { continue; }
      map.set(key, { id: rec.id, values: projectValues(rec, plan) });
    }
    return { map: map, keep: keep };
  }

  async function persistMap(meta, storeName, map, keep) {
    if (!meta || !keep) { return; }
    var entries = [];
    map.forEach(function (v, k) { entries.push([k, v]); });
    await meta.set(MAP_PREFIX + storeName, entries);
  }

  function listDocs(docs) {
    return Promise.resolve(docs).then(function (d) { return Array.isArray(d) ? d : []; });
  }

  /* Docs VIGENTES del diario de un journal: batchNo numerico y rolledBack !==
     true (rollbackCore marca los docs tras revertir; la marca sobrevive el
     round-trip por importLogRepo.saveAll→list/get, verificado en tests). Con
     esto, revertir el MISMO journal dos veces es NO-OP: el segundo rollback
     ve 0 docs y lanza COMMIT_NO_JOURNAL (o tolerance 0). clearSession pasa
     includeRolledBack=true para purgar tambien la historia ya revertida. */
  async function journalDocsFor(importLogRepo, journalId, includeRolledBack) {
    var all = await listDocs(await importLogRepo.list());
    return all
      .filter(function (d) {
        if (!d || d.importId !== journalId || typeof d.batchNo !== 'number') { return false; }
        return includeRolledBack || d.rolledBack !== true;
      })
      .sort(function (a, b) { return a.batchNo - b.batchNo; });
  }

  // --- preview -----------------------------------------------------------------
  /* preview({storeName, columnPlan, rowIterable|rows, repo?, limits?, sourceFile?, preferDMY?})
     NO escribe nada. Con repo clasifica nuevos/cambios/sinCambios contra el
     estado actual; sin repo todo lo valido cuenta como nuevo. Duplicados EN el
     archivo: gana el ultimo y se cuentan en dupEnArchivo (1 sola operacion). */
  async function preview(opts) {
    opts = opts || {};
    var storeName = opts.storeName;
    var plan = preparePlan(storeName, opts.columnPlan);
    var iterable = opts.rowIterable !== undefined ? opts.rowIterable : opts.rows;
    if (!isIterable(iterable)) {
      throw iwError(CODE_BAD_SOURCE, 'preview: requiere rowIterable (async iterable o array de {row,rowNo})');
    }
    var limits = opts.limits || {};
    var maxRows = typeof limits.maxRows === 'number' && isFinite(limits.maxRows) && limits.maxRows >= 0
      ? Math.floor(limits.maxRows) : DEFAULT_MAX_ROWS;

    var existing = null;
    if (opts.repo) {
      requireRepo(opts.repo, 'repo');
      existing = (await buildMap(storeName, plan, opts.repo, null, false)).map;
    }

    var counts = { total: 0, valid: 0, invalid: 0, dupEnArchivo: 0, nuevos: 0, cambios: 0, sinCambios: 0 };
    var errores = [];
    var advertencias = [];
    var muestras = [];
    var entries = new Map();
    var truncado = false;
    var it = await toAsyncIterator(iterable);

    for (;;) {
      var step = await it.next();
      if (step.done) { break; }
      if (counts.total >= maxRows) { truncado = true; break; }
      counts.total += 1;
      var rowNo = rowNoOf(step.value, counts.total + 1);
      var draft = S().draftRecord(storeName, valuesFromPlan(rowCells(step.value), plan),
        { sourceFile: opts.sourceFile || null, preferDMY: !!opts.preferDMY });
      if (draft.errors && draft.errors.length) {
        counts.invalid += 1;
        if (errores.length < MAX_LIST_ITEMS) {
          errores.push({ rowNo: rowNo, code: draft.errors[0].code, message: draft.errors[0].message });
        }
        if (muestras.length < MAX_MUESTRAS) {
          muestras.push({ rowNo: rowNo, errores: draft.errors.map(function (e) { return { field: e.field, code: e.code, message: e.message }; }) });
        }
        continue;
      }
      counts.valid += 1;
      var key = S().naturalKeyOf(storeName, draft.record);
      if (entries.has(key)) {
        counts.dupEnArchivo += 1;
        if (advertencias.length < MAX_LIST_ITEMS) {
          advertencias.push({ rowNo: rowNo, code: 'DUP_IN_FILE', message: 'clave natural "' + key + '" repetida en el archivo; gana la ultima fila' });
        }
      }
      entries.set(key, { rowNo: rowNo, record: draft.record });
      if (muestras.length < MAX_MUESTRAS) { muestras.push({ rowNo: rowNo, record: draft.record }); }
    }

    entries.forEach(function (e, key) {
      if (!existing || !existing.has(key)) { counts.nuevos += 1; return; }
      var changed = diffFields(existing.get(key).values, e.record, plan);
      if (changed.length === 0) { counts.sinCambios += 1; } else { counts.cambios += 1; }
    });

    return { counts: counts, muestras: muestras, errores: errores, advertencias: advertencias, truncado: truncado };
  }

  // --- run -----------------------------------------------------------------------
  /* run(opts) — UPSERT por lote con diario y checkpoint. opts:
     {storeName, columnPlan, source?|rows?|rowIterable?, sourceFile?, repo,
      metaRepo?, importLogRepo, actor?{user,role}, fingerprint?, journalId?,
      resume?, limits?{maxBytes,maxRows,batchSize}, rowsTotal?, isCanceled?,
      onProgress?({rowsDone,rowsTotal,inserts,updates,unchanged,batches})} */
  async function run(opts) {
    opts = opts || {};
    var storeName = opts.storeName;
    var plan = preparePlan(storeName, opts.columnPlan);
    var repo = requireRepo(opts.repo, 'repo');
    var importLogRepo = requireRepo(opts.importLogRepo, 'importLogRepo');
    var meta = metaApi(opts.metaRepo);

    var limits = opts.limits || {};
    var maxBytes = typeof limits.maxBytes === 'number' && isFinite(limits.maxBytes) && limits.maxBytes >= 0
      ? Math.floor(limits.maxBytes) : DEFAULT_MAX_BYTES;
    var maxRows = typeof limits.maxRows === 'number' && isFinite(limits.maxRows) && limits.maxRows >= 0
      ? Math.floor(limits.maxRows) : DEFAULT_MAX_ROWS;
    var batchSize = typeof limits.batchSize === 'number' && isFinite(limits.batchSize) && limits.batchSize >= 1
      ? Math.floor(limits.batchSize) : DEFAULT_BATCH_SIZE;

    var isCanceled = typeof opts.isCanceled === 'function' ? opts.isCanceled : null;
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    var actorUser = opts.actor && opts.actor.user ? String(opts.actor.user) : null;
    var prefix = idPrefixOf(storeName);

    // fuente de filas
    var rowsIterable;
    var sourceFile = opts.sourceFile || null;
    if (opts.source && typeof opts.source.slice === 'function') {
      if (isFinite(opts.source.size) && opts.source.size > maxBytes) {
        throw iwError(CODE_LIMIT_BYTES, 'commit: archivo de ' + opts.source.size + ' bytes excede el limite de ' +
          maxBytes + ' (limits.maxBytes); no se proceso ninguna fila', { size: opts.source.size, maxBytes: maxBytes });
      }
      var fr = await F().readRows(opts.source, {
        format: opts.format, sheet: opts.sheet, delimiter: opts.delimiter,
        blockSize: opts.blockSize
      });
      rowsIterable = fr.rows;
      if (!sourceFile) { sourceFile = opts.source.name || opts.fingerprint || null; }
    } else if (isIterable(opts.rows !== undefined ? opts.rows : opts.rowIterable)) {
      rowsIterable = opts.rows !== undefined ? opts.rows : opts.rowIterable;
    } else {
      throw iwError(CODE_BAD_SOURCE, 'commit.run: requiere opts.source ({name?,size,slice}) u opts.rows (async iterable {row,rowNo})');
    }

    // diario / checkpoint / reanudacion
    var journalId = opts.journalId ? String(opts.journalId) :
      'J-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    var cpKey = opts.fingerprint ? RESUME_PREFIX + opts.fingerprint : null;
    var cp = cpKey && meta ? await meta.get(cpKey) : null;
    var resumeFrom = 0;
    if (opts.resume) {
      if (cp && cp.status === 'partial' && cp.journalId && cp.storeName === storeName) {
        journalId = String(opts.journalId || cp.journalId);
        resumeFrom = typeof cp.rowsDone === 'number' && isFinite(cp.rowsDone) && cp.rowsDone > 0 ? Math.floor(cp.rowsDone) : 0;
        if (resumeFrom > maxRows) {
          throw iwError(CODE_LIMIT_ROWS, 'commit: el checkpoint pide saltar ' + resumeFrom + ' filas, ya por encima del limite ' +
            maxRows + '; nada hecho en este run', { rowsDone: 0, maxRows: maxRows, journalId: journalId });
        }
      } else if (opts.journalId) {
        journalId = String(opts.journalId);
      }
    }

    var built = await buildMap(storeName, plan, repo, meta, resumeFrom > 0);
    var map = built.map;

    var prior = await journalDocsFor(importLogRepo, journalId);
    var batchNo = 1;
    prior.forEach(function (d) { if (d.batchNo >= batchNo) { batchNo = d.batchNo + 1; } });

    var idSeq = 0;
    var stats = { rowsDone: 0, inserts: 0, updates: 0, unchanged: 0, invalid: 0, dupEnArchivo: 0, batches: prior.length };
    var errores = [];
    var advertencias = [];
    var ops = [];
    var batchIdx = new Map();
    var fileSeen = new Set();
    var canceled = false;
    var limitHit = false;

    function warnDup(rowNo, key) {
      stats.dupEnArchivo += 1;
      if (advertencias.length < MAX_LIST_ITEMS) {
        advertencias.push({ rowNo: rowNo, code: 'DUP_IN_FILE', message: 'clave natural "' + key + '" repetida en el archivo; gana la ultima fila' });
      }
    }

    function buildInsert(draft, id) {
      var rec = copy(draft.record);
      rec.id = id;
      var q = copy(draft.__quality || {});
      q.mark = 'medido';
      q.sourceFile = sourceFile;
      q.importId = journalId;
      rec.quality = q;
      if (actorUser) { rec.createdBy = actorUser; rec.updatedBy = actorUser; }
      return rec;
    }

    function processRow(rec) {
      var rowNo = rowNoOf(rec, stats.rowsDone + 1);
      var draft = S().draftRecord(storeName, valuesFromPlan(rowCells(rec), plan),
        { sourceFile: sourceFile, qualityMark: 'medido', preferDMY: !!opts.preferDMY });
      if (draft.errors && draft.errors.length) {
        stats.invalid += 1;
        if (errores.length < MAX_LIST_ITEMS) {
          errores.push({ rowNo: rowNo, code: draft.errors[0].code, message: draft.errors[0].message });
        }
        return;
      }
      var key = S().naturalKeyOf(storeName, draft.record);
      var pendIdx = batchIdx.get(key);
      var isDup = pendIdx !== undefined || fileSeen.has(key);
      if (isDup) { warnDup(rowNo, key); }
      if (pendIdx !== undefined) {
        // duplicado dentro del lote pendiente: gana el ultimo, misma operacion.
        var op = ops[pendIdx];
        if (op.kind === 'insert') {
          op.rec = buildInsert(draft, op.rec.id);
        } else {
          var rebuilt = diffFields(op.oldValues, draft.record, plan);
          if (rebuilt.length === 0) {
            // el ganador del archivo coincide con el estado actual: la
            // operacion pendiente se vuelve no-op y la fila cuenta sin cambios.
            if (!op.dead) { op.dead = true; stats.unchanged += 1; }
          } else {
            if (op.dead) { op.dead = false; stats.unchanged -= 1; }
            op.set = {};
            op.before = {};
            rebuilt.forEach(function (c) { op.set[c.field] = c.newVal; op.before[c.field] = c.oldVal; });
          }
        }
        return;
      }
      fileSeen.add(key);
      var old = map.get(key);
      if (!old) {
        ops.push({ kind: 'insert', key: key, rec: buildInsert(draft, makeId(prefix, ++idSeq)) });
        batchIdx.set(key, ops.length - 1);
        return;
      }
      var changed = diffFields(old.values, draft.record, plan);
      if (changed.length === 0) {
        if (!isDup) { stats.unchanged += 1; }
        return;
      }
      var uop = { kind: 'update', key: key, id: old.id, oldValues: old.values, set: {}, before: {} };
      changed.forEach(function (c) { uop.set[c.field] = c.newVal; uop.before[c.field] = c.oldVal; });
      ops.push(uop);
      batchIdx.set(key, ops.length - 1);
    }

    async function writeCheckpoint(status) {
      if (!cpKey || !meta) { return; }
      await meta.set(cpKey, {
        journalId: journalId, rowsDone: stats.rowsDone, storeName: storeName,
        at: new Date().toISOString(), status: status,
        counts: { inserts: stats.inserts, updates: stats.updates, unchanged: stats.unchanged, invalid: stats.invalid, batches: stats.batches }
      });
    }

    async function flushBatch() {
      ops = ops.filter(function (o) { return !o.dead; });
      if (ops.length === 0) { return; }
      // El lote completo (datos + diario + checkpoint) dentro del mutex del
      // store: un rollback concurrente no puede interleavear su clear+saveAll
      // entre mitades del lote. Run ya era secuencial por lote POR DISENO; el
      // lock ademas serializa IMPORTS concurrentes al mismo store entre si.
      await withStoreLock(storeName, flushBatchLocked);
    }

    async function flushBatchLocked() {
      var newRecs = [];
      var changeDocs = [];
      var updateOps = [];
      ops.forEach(function (op) {
        if (op.kind === 'insert') { newRecs.push(op.rec); }
        else { updateOps.push(op); }
      });
      if (newRecs.length) { await repo.saveAll(newRecs); stats.inserts += newRecs.length; }
      var survivors = [];
      for (var i = 0; i < updateOps.length; i += 250) {
        var chunk = updateOps.slice(i, i + 250);
        var results = await Promise.all(chunk.map(async function (op) {
          var full = await repo.get(op.id);
          if (!full) { return null; }
          var merged = copy(full);
          Object.keys(op.set).forEach(function (f) { setPath(merged, f, op.set[f]); });
          if (actorUser) {
            merged.updatedBy = actorUser;
            if (!merged.createdBy) { merged.createdBy = actorUser; }
          }
          await repo.save(merged);
          return op;
        }));
        results.forEach(function (op, k) {
          if (op) { survivors.push(op); }
          else if (advertencias.length < MAX_LIST_ITEMS) {
            advertencias.push({ rowNo: null, code: 'GONE', id: chunk[k].id, message: 'registro ' + chunk[k].id + ' desaparecido antes de actualizar' });
          }
        });
      }
      survivors.forEach(function (op) {
        var beforeDoc = {};
        Object.keys(op.before).forEach(function (f) { beforeDoc[f] = op.before[f]; });
        changeDocs.push({ id: op.id, before: beforeDoc });
        stats.updates += 1;
      });

      // diario parcial del lote
      var doc = {
        id: journalId + '-b' + batchNo,
        at: new Date().toISOString(),
        importId: journalId,
        storeName: storeName,
        batchNo: batchNo,
        actor: actorUser || null,
        inserts: newRecs.map(function (r) { return r.id; }),
        changes: changeDocs,
        rolledBack: false
      };
      await importLogRepo.save(doc);
      batchNo += 1;
      stats.batches += 1;

      // mapa en vivo
      ops.forEach(function (op) {
        if (op.kind === 'insert') {
          map.set(op.key, { id: op.rec.id, values: projectValues(op.rec, plan) });
        } else if (survivors.indexOf(op) !== -1) {
          var vals = {};
          Object.keys(op.oldValues).forEach(function (f) { vals[f] = op.oldValues[f]; });
          Object.keys(op.set).forEach(function (f) { vals[f] = op.set[f]; });
          map.set(op.key, { id: op.id, values: vals });
        }
      });

      ops = [];
      batchIdx.clear();
      await writeCheckpoint('partial');
      if (onProgress) {
        onProgress({
          rowsDone: stats.rowsDone, rowsTotal: typeof opts.rowsTotal === 'number' ? opts.rowsTotal : null,
          inserts: stats.inserts, updates: stats.updates, unchanged: stats.unchanged, batches: stats.batches
        });
      }
      await yieldLoop();
    }

    var it = await toAsyncIterator(rowsIterable);
    // fase de reanudacion: consumir (sin procesar) las primeras resumeFrom filas
    while (stats.rowsDone < resumeFrom) {
      if (isCanceled && isCanceled()) { canceled = true; break; }
      var skipStep = await it.next();
      if (skipStep.done) { break; }
      stats.rowsDone += 1;
      if (stats.rowsDone % 5000 === 0) { await yieldLoop(); }
    }
    if (canceled) {
      return finishResult('partial');
    }

    for (;;) {
      if (isCanceled && isCanceled()) { canceled = true; break; }
      var step = await it.next();
      if (step.done) { break; }
      if (stats.rowsDone >= maxRows) { limitHit = true; break; }
      stats.rowsDone += 1;
      processRow(step.value);
      if (ops.length >= batchSize) { await flushBatch(); }
    }
    await flushBatch();

    if (limitHit) {
      // comportamiento documentado: el run que excede maxRows se auto-revierte
      await rollbackCore({ journalId: journalId, importLogRepo: importLogRepo, repo: repo, metaRepo: opts.metaRepo, tolerance: true });
      throw iwError(CODE_LIMIT_ROWS, 'commit: el archivo supera limits.maxRows (' + maxRows +
        '); lo insertado/actualizado en este run fue reviertido automaticamente (rollback del diario ' +
        journalId + '). Para conservar el parcial cancele con isCanceled en lugar de usar limites.',
        { maxRows: maxRows, rowsDone: stats.rowsDone, journalId: journalId, rolledBack: true });
    }

    var status = canceled ? 'partial' : 'done';
    await writeCheckpoint(status);
    await persistMap(meta, storeName, map, built.keep);
    return finishResult(status);

    function finishResult(st) {
      return {
        journalId: journalId,
        fingerprint: opts.fingerprint || null,
        storeName: storeName,
        status: st,
        resumedFrom: resumeFrom,
        rowsTotal: typeof opts.rowsTotal === 'number' ? opts.rowsTotal : null,
        counts: {
          rowsDone: stats.rowsDone, inserts: stats.inserts, updates: stats.updates,
          unchanged: stats.unchanged, invalid: stats.invalid, dupEnArchivo: stats.dupEnArchivo, batches: stats.batches
        },
        errores: errores,
        advertencias: advertencias
      };
    }
  }

  // --- rollback ----------------------------------------------------------------
  /* rollbackCore corre COMPLETO dentro del mutex del store (G2): la via rapida
     list+filter+clear+saveAll deja de ser segura si dos rollbacks del mismo
     store interleavean, y el diario re-leido DENTRO del lock ve las marcas
     rolledBack que haya escrito un rollback concurrente (doble rollback del
     mismo journal = NO-OP con COMMIT_NO_JOURNAL). El store se descubre con una
     pre-lectura fuera del lock SOLO para elegir la llave: si no hay docs
     vigentes no hay nada que proteger y el NO-OP/NO_JOURNAL se decide igual
     dentro del lock con la re-lectura. */
  async function rollbackCore(opts) {
    var repo = requireRemoverRepo(opts.repo, 'repo');
    var importLogRepo = requireRemoverRepo(opts.importLogRepo, 'importLogRepo');
    var journalId = opts.journalId ? String(opts.journalId) : null;
    if (!journalId) { throw iwError(CODE_BAD_OPTS, 'commit.rollback: requiere journalId'); }

    var probe = await journalDocsFor(importLogRepo, journalId);
    var lockKey = (probe[0] && probe[0].storeName) || UNKNOWN_STORE_LOCK;
    return withStoreLock(lockKey, function () {
      return rollbackLocked(opts, repo, importLogRepo, journalId);
    });
  }

  async function rollbackLocked(opts, repo, importLogRepo, journalId) {
    var meta = metaApi(opts.metaRepo);
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

    var docs = await journalDocsFor(importLogRepo, journalId);
    if (docs.length === 0) {
      if (opts.tolerance) { return { rolled: { inserts: 0, updates: 0 }, warnings: [], journalDocs: 0 }; }
      throw iwError(CODE_NO_JOURNAL, 'commit.rollback: no hay documentos de diario para el journalId ' + JSON.stringify(journalId));
    }
    docs.sort(function (a, b) { return b.batchNo - a.batchNo; }); // LIFO por lote

    var rolled = { inserts: 0, updates: 0 };
    var warnings = [];

    // 1) revertir updates con los `before` del diario (recarga el actual;
    //    solo revierte los campos del diff; campos fuera del diff intactos).
    for (var d = 0; d < docs.length; d++) {
      var changes = docs[d].changes || [];
      for (var c = 0; c < changes.length; c++) {
        var ch = changes[c];
        var full = await repo.get(ch.id);
        if (!full) {
          warnings.push({ code: 'GONE', id: ch.id, batchNo: docs[d].batchNo, message: 'registro ' + ch.id + ' ya no existe (update no revertido)' });
          continue;
        }
        var merged = copy(full);
        Object.keys(ch.before || {}).forEach(function (f) { setPath(merged, f, ch.before[f]); });
        await repo.save(merged);
        rolled.updates += 1;
      }
      if (onProgress) { onProgress({ batchDone: docs[d].batchNo, rolled: rolled }); }
    }

    // 2) quitar los inserts del diario
    var allIds = [];
    docs.forEach(function (doc) { (doc.inserts || []).forEach(function (id) { allIds.push(id); }); });
    var storeNameOfDocs = (docs[0] && docs[0].storeName) || null;
    if (allIds.length > REMOVE_BULK_THRESHOLD) {
      // via rapida para dbMemory (remove es O(n) ahi): reconstruir el store sin
      // los ids del diario. Nota: saveAll re-sella updatedAt de los conservados.
      // SEGURA: corre DENTRO del mutex del store (rollbackLocked) — ningun otro
      // clear/saveAll o lote de run puede interleavear entre list y saveAll.
      // El umbral se mantiene igual.
      var idSet = new Set(allIds);
      var all = await repo.list();
      var kept = all.filter(function (r) { return !idSet.has(r.id); });
      var removedCount = all.length - kept.length;
      await repo.clear();
      if (kept.length) { await repo.saveAll(kept); }
      rolled.inserts = removedCount;
      var goneBulk = allIds.length - removedCount;
      if (goneBulk > 0) {
        warnings.push({ code: 'GONE', count: goneBulk, message: goneBulk + ' ids del diario ya no existian (via bulk)' });
      }
    } else {
      for (var i = 0; i < allIds.length; i += 250) {
        var chunk = allIds.slice(i, i + 250);
        var results = await Promise.all(chunk.map(async function (id) {
          var rec = await repo.get(id);
          if (!rec) { return false; }
          await repo.remove(id);
          return true;
        }));
        results.forEach(function (ok, k) {
          if (ok) { rolled.inserts += 1; }
          else { warnings.push({ code: 'GONE', id: chunk[k], message: 'registro ' + chunk[k] + ' ya no existe (insert no borrable)' }); }
        });
      }
    }

    // 3) marcar el diario y limpiar checkpoint/mapa guardado
    await importLogRepo.saveAll(docs.map(function (doc) {
      var marked = copy(doc);
      marked.rolledBack = true;
      return marked;
    }));
    if (meta) {
      var metaDocs = await listDocs(await meta.listDocs());
      for (var m = 0; m < metaDocs.length; m++) {
        var md = metaDocs[m];
        if (md && typeof md.key === 'string' && md.key.indexOf(RESUME_PREFIX) === 0 && md.value && md.value.journalId === journalId) {
          await meta.set(md.key, null);
        }
      }
      if (storeNameOfDocs) { await meta.set(MAP_PREFIX + storeNameOfDocs, null); }
    }
    return { rolled: rolled, warnings: warnings, journalDocs: docs.length };
  }

  /* rollback({journalId, importLogRepo, repo, metaRepo?, onProgress?})
     batchNo DESC: revierte updates con `before` y elimina inserts. Marca los
     docs del diario {rolledBack:true} y borra checkpoints. GONE si el registro
     ya no existe (warning, no error). */
  async function rollback(opts) {
    opts = opts || {};
    return rollbackCore(Object.assign({}, opts, { tolerance: false }));
  }

  // --- sesiones ----------------------------------------------------------------
  /* importSessions({importLogRepo, metaRepo?}) — agrupado por importId para la
     UI: counts, batches, rolledBack y status (del checkpoint si hay metaRepo). */
  async function importSessions(opts) {
    opts = opts || {};
    var importLogRepo = requireRepo(opts.importLogRepo, 'importLogRepo');
    var meta = metaApi(opts.metaRepo);
    var all = await listDocs(await importLogRepo.list());
    var byId = new Map();
    all.forEach(function (d) {
      if (!d || typeof d.batchNo !== 'number' || !d.importId) { return; }
      var s = byId.get(d.importId);
      if (!s) {
        s = { importId: d.importId, storeName: d.storeName || null, batches: 0, inserts: 0, updates: 0, rolledBack: true, startedAt: null, lastAt: null };
        byId.set(d.importId, s);
      }
      s.batches += 1;
      s.inserts += (d.inserts || []).length;
      s.updates += (d.changes || []).length;
      if (d.rolledBack !== true) { s.rolledBack = false; }
      var t = d.at ? Date.parse(d.at) : NaN;
      if (!isNaN(t)) {
        if (s.startedAt === null || t < Date.parse(s.startedAt)) { s.startedAt = d.at; }
        if (s.lastAt === null || t > Date.parse(s.lastAt)) { s.lastAt = d.at; }
      }
    });
    var cpStatus = null;
    if (meta) {
      var metaDocs = await listDocs(await meta.listDocs());
      cpStatus = new Map();
      metaDocs.forEach(function (md) {
        if (md && typeof md.key === 'string' && md.key.indexOf(RESUME_PREFIX) === 0 && md.value && md.value.journalId) {
          cpStatus.set(md.value.journalId, md.value.status);
        }
      });
    }
    var out = [];
    byId.forEach(function (s) {
      s.status = cpStatus ? (cpStatus.get(s.importId) || (s.rolledBack ? 'rolled-back' : 'unknown')) : (s.rolledBack ? 'rolled-back' : 'unknown');
      out.push(s);
    });
    out.sort(function (a, b) {
      var ta = a.lastAt ? Date.parse(a.lastAt) : 0;
      var tb = b.lastAt ? Date.parse(b.lastAt) : 0;
      return tb - ta;
    });
    return out;
  }

  /* clearSession({journalId, importLogRepo, metaRepo?}) — borra los docs del
     diario y los checkpoints que apuntan a ese journalId. */
  async function clearSession(opts) {
    opts = opts || {};
    var importLogRepo = requireRemoverRepo(opts.importLogRepo, 'importLogRepo');
    var meta = metaApi(opts.metaRepo);
    var journalId = opts.journalId ? String(opts.journalId) : null;
    if (!journalId) { throw iwError(CODE_BAD_OPTS, 'commit.clearSession: requiere journalId'); }
    // includeRolledBack=true: clearSession purga TAMBIEN la historia ya
    // revertida (journalDocsFor ahora solo devuelve docs vigentes).
    var docs = await journalDocsFor(importLogRepo, journalId, true);
    var removedDocs = 0;
    for (var i = 0; i < docs.length; i += 250) {
      var chunk = docs.slice(i, i + 250);
      await Promise.all(chunk.map(function (d) { return importLogRepo.remove(d.id); }));
      removedDocs += chunk.length;
    }
    var checkpoints = 0;
    if (meta) {
      var metaDocs = await listDocs(await meta.listDocs());
      for (var m = 0; m < metaDocs.length; m++) {
        var md = metaDocs[m];
        if (md && typeof md.key === 'string' && md.key.indexOf(RESUME_PREFIX) === 0 && md.value && md.value.journalId === journalId) {
          await meta.set(md.key, null);
          checkpoints += 1;
        }
      }
    }
    return { journalId: journalId, docs: removedDocs, checkpoints: checkpoints };
  }

  return {
    // codigos tipados
    BAD_OPTS: CODE_BAD_OPTS,
    BAD_SOURCE: CODE_BAD_SOURCE,
    BAD_REPO: CODE_BAD_REPO,
    BAD_PLAN: CODE_BAD_PLAN,
    UNKNOWN_STORE: CODE_UNKNOWN_STORE,
    LIMIT_ROWS: CODE_LIMIT_ROWS,
    LIMIT_BYTES: CODE_LIMIT_BYTES,
    NO_JOURNAL: CODE_NO_JOURNAL,
    // constantes operativas
    DEFAULT_MAX_BYTES: DEFAULT_MAX_BYTES,
    DEFAULT_MAX_ROWS: DEFAULT_MAX_ROWS,
    BATCH_SIZE: DEFAULT_BATCH_SIZE,
    RESUME_PREFIX: RESUME_PREFIX,
    // API
    preview: preview,
    run: run,
    rollback: rollback,
    importSessions: importSessions,
    clearSession: clearSession
  };
});
