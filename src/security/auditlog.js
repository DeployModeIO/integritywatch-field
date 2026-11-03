/* IntegrityWatch Field — security.auditlog
   Bitácora de auditoría con cadena de hash (blockchain-lite local): cada
   entrada encadena sha256 del payload canónico del anterior. Trabaja SOLO
   contra repos inyectados (auditRepo = store 'auditLog', metaRepo = clave/valor
   'meta'); nunca toca IndexedDB directamente. API toda async, sin DOM, sin
   console.log. Errores tipados con código EAL_* en err.code.

   Decisiones documentadas:
   - COLA FIFO interna: record() encadena su trabajo sobre la promesa previa
     (_chain). Sin esto, dos writes simultáneos leerían el mismo head y pisarían
     seq/hash. REQUERIDO: imports y vistas pueden lanzar Promise.all de records;
       la serialización garantiza seq únicos 1..N y cadena válida. Un record que
       falla NO rompe la cola (se captura en _chain; el reject viaja solo al
       llamador de ese record).
   - HASH SOBRE LISTA BLANDA DE CAMPOS (HASH_FIELDS), NO sobre el documento
     completo: el repo genérico de src/core/store.js añade createdAt/updatedAt
     al guardar. Si el hash cubriera el doc entero, verifyChain recomputaría con
     esos campos extra y daría falso positivo de tamper. La lista blanca hace el
       hash estable frente a metadatos del repo.
   - canonicalize: recursivo, claves ORDENADAS lexicográficamente (arrays
     conservan orden), undefined se omite. Mismo objeto en cualquier orden de
     claves → mismo JSON → mismo hash. Clave 'hash' nunca entra al payload.
   - Campo 'store' (spec del módulo) se duplica como 'entityStore' en el doc
       persistido porque el schema de IndexedDB (src/core/db.js, v3) declara el
       índice 'entityStore'. Ambos campos entran al hash: borrar/alterar
     cualquiera rompe la cadena.
   - Actor: actorFn() → {user, role} o null; se resuelve AL MOMENTO de escribir
       (no en init). null/throw/campos ausentes → user='?', role='?'. Cableado
     sugerido con lock: () => IW.security.lock.currentSession(meta).then(s =>
     s ? { user: s.username || s.role, role: s.role } : null) — nota que lock
     expone 'username', no 'user'.
   - IMPORTS MASIVOS: record() es UNA entrada. Un lote de 500k lecturas NO
     genera 500k records: la Vista que llama decide y escribe una sola entrada
     {action:'import', store:'readings', count:N, importId}. La granularidad es
     decisión del llamador, no de este módulo.
   - verifyChain sin side-effects: solo lee. Kind 'missing' = seq en 1..head.seq
     sin documento. Si un predecesor está missing, el siguiente no puede
     verificarse por enlace → kind 'prevchain' con expected 'no verificable'.
   - exportTabular: ANTES/DESPUES = JSON.stringify truncado a 2000 chars de
     CElDA TOTAL (incluido el sufijo '…trunc'): celdas >2000 → slice(0,1993) +
     '…trunc' (exactamente 2000). Sin truncar si <=2000.
   - Claves meta exclusivas: 'audit.head' ({hash, seq, lastAt}) y
     'audit.lastExport'. NO invade users.* ni lock.*.
    - sha256Hex: mismo patrón que export.evidencePack — globalThis.crypto.subtle
      (Node >= 19 y navegador en contexto seguro). Sin fallback JS: si falta,
      EAL_NO_CRYPTO, nunca un hash falso. Hex siempre minúsculas, 64 dígitos.
    - MULTI-PESTAÑA (bug real 2026-11-03): la cola FIFO de record() es POR
      PÁGINA. Dos pestañas de la app leían 'audit.head' a la vez, calculaban el
      mismo seq y un aud-N pisaba al otro → verifyChain 'CADENA ROTA'. Capa 1:
      la sección crítica (leer head → calcular seq/prevHash → escribir doc →
      actualizar meta) se envuelve en navigator.locks.request('iwf-audit-head',
      {mode:'exclusive'}) cuando Web Locks existe (navegadores). La FIFO interna
      queda como capa 2 (mismo documento) y como camino cuando no hay Web Locks
      (Node/dbMemory/tests, navegadores viejos). Si locks RECHAZA o lanza, el
      error propaga al llamador de record() como con cualquier fallo de repo:
      este módulo es best-effort, no silencia.
    - REPARACIÓN DEFENSIVA (cierra el hueco aunque falte/falle Web Locks):
      'audit.head' en meta es solo CACHÉ — los docs son la cadena autoritativa.
      Antes de calcular seq, repairHead() (a) re-lee el doc aud-<head.seq> y, si
      existe con hash válido distinto, ADOPTA el del doc (el caché quedó
      obsoleto por una escritura rival); (b) avanza mientras exista
      aud-<head.seq+1> (otra pestaña escribió y su meta set se perdió o llegó
      después), con tope MAX_HEAD_ADVANCE para no recorrer una colección huérfana.
      record() además hace read-check justo antes de persistir (sin pedir locks
      de nuevo — re-entrante deadlockaría): si el head se movió durante el
      digest, reintenta hasta EAL_HEAD_CAS_TRIES y entonces persiste de todas
      formas (best-effort, igual que antes del fix). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.security = root.IW.security || {};
  root.IW.security.auditlog = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var CODE_NO_CRYPTO = 'EAL_NO_CRYPTO';
  var CODE_NOT_INIT = 'EAL_NOT_INIT';
  var CODE_BAD_INPUT = 'EAL_BAD_INPUT';

  var HEAD_KEY = 'audit.head';
  var LAST_EXPORT_KEY = 'audit.lastExport';
  var GENESIS = 'GENESIS';
  var PAD_LEN = 6;
  var CELL_MAX = 2000;
  var TRUNC_MARK = '…trunc';
  // Web Locks (multi-pestaña): una sola sección crítica global en la app.
  var HEAD_LOCK_NAME = 'iwf-audit-head';
  // Re-chequeo del head antes de persistir cuando NO hay Web Locks (ver cabecera).
  var MAX_HEAD_CAS_TRIES = 60;
  // Tope del sondeo de docs tras un head rezagado (no recorrer una colección huérfana).
  var MAX_HEAD_ADVANCE = 500;

  // Campos que entran al hash canónico (excluyendo 'hash' del propio doc).
  var HASH_FIELDS = ['action', 'after', 'at', 'count', 'entityId', 'entityStore',
    'importId', 'prevHash', 'role', 'seq', 'store', 'user'];

  var _deps = null;      // {auditRepo, metaRepo, actorFn}
  var _chain = Promise.resolve(); // cola FIFO de records en orden de llamada

  function ealError(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function cryptoApi() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) { return globalThis.crypto; }
    return null;
  }

  function digestHex(u8) {
    var c = cryptoApi();
    if (!c) { return Promise.reject(ealError(CODE_NO_CRYPTO, 'globalThis.crypto.subtle no disponible: requiere Node >= 19 o navegador en contexto seguro')); }
    return c.subtle.digest('SHA-256', u8).then(function (buf) {
      var b = new Uint8Array(buf);
      var hex = '';
      for (var i = 0; i < b.length; i++) {
        if (b[i] < 16) { hex += '0'; }
        hex += b[i].toString(16);
      }
      return hex;
    });
  }

  // sha256Hex(content) → hex minúsculas. content: string | Uint8Array.
  function sha256Hex(content) {
    var u8;
    if (typeof content === 'string') { u8 = new TextEncoder().encode(content); }
    else if (content instanceof Uint8Array) { u8 = content; }
    else if (content instanceof ArrayBuffer) { u8 = new Uint8Array(content); }
    else { return Promise.reject(ealError(CODE_BAD_INPUT, 'content debe ser string o Uint8Array')); }
    return digestHex(u8);
  }

  // Orden de claves estable (lexicográfico). 'undefined' se omite; null se
  // conserva (JSON.stringify lo emite como null). Arrays conservan el orden.
  function canonicalize(value) {
    if (Array.isArray(value)) {
      return value.map(function (v) {
        var c = canonicalize(v);
        return c === undefined ? null : c;
      });
    }
    if (value !== null && typeof value === 'object') {
      var keys = Object.keys(value).sort();
      var out = {};
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = canonicalize(value[k]);
        if (v !== undefined) { out[k] = v; }
      }
      return out;
    }
    if (value === undefined) { return undefined; }
    return value;
  }

  // Payload canónico del doc: solo HASH_FIELDS presentes → JSON estable.
  function hashPayload(doc) {
    var picked = {};
    for (var i = 0; i < HASH_FIELDS.length; i++) {
      var f = HASH_FIELDS[i];
      if (doc[f] !== undefined) { picked[f] = doc[f]; }
    }
    return JSON.stringify(canonicalize(picked));
  }

  function padSeq(n) {
    var s = String(n);
    while (s.length < PAD_LEN) { s = '0' + s; }
    return s;
  }

  function entryId(seq) {
    return 'aud-' + padSeq(seq);
  }

  function normalizeHead(raw) {
    if (!raw || typeof raw !== 'object' ||
        typeof raw.hash !== 'string' || raw.hash === '' ||
        typeof raw.seq !== 'number' || !isFinite(raw.seq) || raw.seq < 0) {
      return { hash: GENESIS, seq: 0 };
    }
    return { hash: raw.hash, seq: raw.seq };
  }

  function resolveActor() {
    var fn = _deps && _deps.actorFn;
    var raw;
    try {
      raw = (typeof fn === 'function') ? fn() : null;
    } catch (e) {
      return Promise.resolve({ user: '?', role: '?' });
    }
    return Promise.resolve(raw).then(function (a) {
      if (!a || typeof a !== 'object') { return { user: '?', role: '?' }; }
      var user = (typeof a.user === 'string' && a.user !== '') ? a.user : '?';
      var role = (typeof a.role === 'string' && a.role !== '') ? a.role : '?';
      return { user: user, role: role };
    }, function () {
      return { user: '?', role: '?' };
    });
  }

  function requireDeps() {
    if (!_deps || !_deps.auditRepo || !_deps.metaRepo) {
      throw ealError(CODE_NOT_INIT, 'auditlog.init({auditRepo, metaRepo, actorFn}) debe llamarse antes de usar la API');
    }
  }

  // Web Locks solo cuando existe de verdad (navegador; Node 21+ expone un
  // Navigator sin locks → fallback). request() se llama CON optiones objeto:
  // mocks antiguos estilo callback devuelven undefined y rompen el then.
  function locksApi() {
    var nav = (typeof globalThis !== 'undefined') ? globalThis.navigator : null;
    if (nav && nav.locks && typeof nav.locks.request === 'function') { return nav.locks; }
    return null;
  }

  // Envuelve fn() (debe devolver promesa) en la sección crítica con lock
  // exclusivo 'iwf-audit-head'. Sin Web Locks → fn() directo: la cola FIFO
  // interna de record() es la que serializa, y repairHead() cubre el hueco
  // multi-origen. Si locks rechaza/lanza, el error propaga (best-effort del
  // llamador de record: la FIFO captura el fallo sin romper la cola).
  function withHeadLock(fn) {
    var locks = locksApi();
    if (locks) { return Promise.resolve(locks.request(HEAD_LOCK_NAME, { mode: 'exclusive' }, fn)); }
    return Promise.resolve().then(fn);
  }

  // Doc de cadena sano: seq coherente con su id (aud-<seq>) y hash presente.
  function isChainDoc(d, expectedSeq) {
    return !!d && typeof d === 'object' && d.seq === expectedSeq &&
      typeof d.hash === 'string' && d.hash !== '';
  }

  // Reparación defensiva del head contra los docs (meta es solo caché; los
  // docs son la cadena autoritativa). Dos pasos en TODO punto de lectura del
  // head: (a) si el doc aud-<head.seq> existe con hash válido, adoptar su hash
  // (otra pestaña pisó el doc tras nuestro set, o su set se perdió); (b)
  // avanzar mientras exista aud-<head.seq+1> — huecos = escrituras rivales con
  // meta rezagado — adoptando cada hash. Tope MAX_HEAD_ADVANCE de sondeos.
  // Solo lee; nunca escribe meta aquí (evita pisar un head rival más nuevo).
  function repairHead(head) {
    var auditRepo = _deps.auditRepo;
    function advancePast(h, probes) {
      if (probes >= MAX_HEAD_ADVANCE) { return Promise.resolve(h); }
      return auditRepo.get(entryId(h.seq + 1)).then(function (d) {
        if (!isChainDoc(d, h.seq + 1)) { return h; }
        return advancePast({ hash: d.hash, seq: d.seq }, probes + 1);
      });
    }
    if (head.seq <= 0) { return advancePast(head, 0); }
    return auditRepo.get(entryId(head.seq)).then(function (d) {
      var base = isChainDoc(d, head.seq) ? { hash: d.hash, seq: d.seq } : head;
      return advancePast(base, 0);
    });
  }

  // Doc sin hash a partir de head reparado + actor resuelto + entry validada.
  // Campos opcionales solo si presentes (undefined NO entra al payload).
  function buildDoc(entry, head, seq, actor) {
    var doc = {
      id: entryId(seq),
      seq: seq,
      at: (typeof entry.at === 'string' && entry.at !== '') ? entry.at : new Date().toISOString(),
      user: actor.user,
      role: actor.role,
      action: entry.action,
      store: entry.store,
      entityStore: entry.store,
      prevHash: head.hash
    };
    if (entry.entityId !== undefined) { doc.entityId = entry.entityId; }
    if (entry.before !== undefined) { doc.before = entry.before; }
    if (entry.after !== undefined) { doc.after = entry.after; }
    if (entry.count !== undefined) { doc.count = entry.count; }
    if (entry.importId !== undefined) { doc.importId = entry.importId; }
    return doc;
  }

  // Persistir el doc y actualizar el caché meta (último paso de la sección
  // crítica). set con doc.hash/doc.seq: lo que se acaba de escribir.
  function persistDoc(doc) {
    var auditRepo = _deps.auditRepo;
    var metaRepo = _deps.metaRepo;
    return auditRepo.save(doc).then(function () {
      return metaRepo.set(HEAD_KEY, { hash: doc.hash, seq: doc.seq, lastAt: doc.at });
    }).then(function () {
      return doc;
    });
  }

  // Un intento de escribir: leer+reparar head → construir doc → digest →
  // read-check (re-leer y reparar de nuevo) → persistir o reintentar. El
  // read-check cierra la ventana digest (el head se movió durante el hash).
  // repairHead NO pide locks (re-entrante deadlockaría con Web Locks real).
  // Tras MAX_HEAD_CAS_TRIES inconsistentes se persiste igual (best-effort).
  function recordAttempt(entry, actor, attempt) {
    var metaRepo = _deps.metaRepo;
    return metaRepo.get(HEAD_KEY).then(function (raw) {
      return repairHead(normalizeHead(raw)).then(function (head) {
        var doc = buildDoc(entry, head, head.seq + 1, actor);
        return sha256Hex(hashPayload(doc)).then(function (hash) {
          doc.hash = hash;
          if (attempt >= MAX_HEAD_CAS_TRIES) { return persistDoc(doc); }
          return metaRepo.get(HEAD_KEY).then(function (raw2) {
            return repairHead(normalizeHead(raw2)).then(function (fresh) {
              if (fresh.seq !== head.seq || fresh.hash !== head.hash) {
                return recordAttempt(entry, actor, attempt + 1);
              }
              return persistDoc(doc);
            });
          });
        });
      });
    });
  }

  function doRecord(entry) {
    requireDeps();
    if (!entry || typeof entry !== 'object') {
      return Promise.reject(ealError(CODE_BAD_INPUT, 'record(entry): entry debe ser un objeto'));
    }
    if (typeof entry.action !== 'string' || entry.action === '') {
      return Promise.reject(ealError(CODE_BAD_INPUT, 'record(entry): action debe ser cadena no vacía'));
    }
    if (typeof entry.store !== 'string' || entry.store === '') {
      return Promise.reject(ealError(CODE_BAD_INPUT, 'record(entry): store debe ser cadena no vacía'));
    }
    // El actor NO es parte de la sección crítica multi-página: se resuelve
    // antes de tomar el lock (sigue siendo "al momento de escribir", igual
    // que antes del fix).
    return resolveActor().then(function (actor) {
      return withHeadLock(function () { return recordAttempt(entry, actor, 0); });
    });
  }

  // record(entry) → Promise<doc persistido>. Serialización en DOS capas:
  // cola FIFO interna (orden de llamada en el documento actual) + lock
  // exclusivo 'iwf-audit-head' vía Web Locks cuando existe (entre pestañas),
  // con reparación defensiva del head contra los docs cuando no. Ver
  // Decisiones documentadas en la cabecera.
  function record(entry) {
    var run = _chain.then(function () { return doRecord(entry); });
    _chain = run.then(function () { return undefined; }, function () { return undefined; });
    return run;
  }

  function listAll() {
    requireDeps();
    return _deps.auditRepo.list().then(function (docs) {
      var out = [];
      (docs || []).forEach(function (d) {
        if (d && typeof d === 'object' && typeof d.seq === 'number' && isFinite(d.seq)) { out.push(d); }
      });
      return out;
    });
  }

  function bySeqDesc(a, b) { return b.seq - a.seq; }

  // listRecent(n) → últimas n por seq descendente. Sin n: todas.
  function listRecent(n) {
    return listAll().then(function (docs) {
      docs.sort(bySeqDesc);
      var limit = (typeof n === 'number' && isFinite(n) && n > 0) ? Math.floor(n) : docs.length;
      return docs.slice(0, limit);
    });
  }

  // range({fromISO,toISO,user?,action?,limit}) → filtro por fecha UTC ISO
  // (Date.parse; entradas no parseables se excluyen cuando hay ventana),
  // user/action exactos, orden seq descendente, recorte por limit.
  function range(opts) {
    opts = opts || {};
    return listAll().then(function (docs) {
      var fromMs = (typeof opts.fromISO === 'string' && opts.fromISO !== '') ? Date.parse(opts.fromISO) : NaN;
      var toMs = (typeof opts.toISO === 'string' && opts.toISO !== '') ? Date.parse(opts.toISO) : NaN;
      var filtered = docs.filter(function (d) {
        if (!isNaN(fromMs) || !isNaN(toMs)) {
          var atMs = Date.parse(d.at);
          if (isNaN(atMs)) { return false; }
          if (!isNaN(fromMs) && atMs < fromMs) { return false; }
          if (!isNaN(toMs) && atMs > toMs) { return false; }
        }
        if (opts.user !== undefined && d.user !== opts.user) { return false; }
        if (opts.action !== undefined && d.action !== opts.action) { return false; }
        return true;
      });
      filtered.sort(bySeqDesc);
      if (typeof opts.limit === 'number' && isFinite(opts.limit) && opts.limit >= 0) {
        filtered = filtered.slice(0, Math.floor(opts.limit));
      }
      return filtered;
    });
  }

  // verifyChain() → {ok, checked, breaks:[{id, expected, actual, kind}]}.
  // kind: 'hash' (payload ≠ hash declarado), 'prevchain' (prevHash ≠ hash del
  // anterior o anterior missing), 'missing' (seq en 1..head.seq sin doc).
  // Sin side-effects: solo lee auditRepo y head.
  function verifyChain() {
    requireDeps();
    var metaRepo = _deps.metaRepo;
    return Promise.all([listAll(), metaRepo.get(HEAD_KEY)]).then(function (res) {
      var docs = res[0];
      var head = normalizeHead(res[1]);
      var bySeq = {};
      docs.forEach(function (d) { bySeq[d.seq] = d; });
      var breaks = [];
      var checked = 0;
      var prevHash = GENESIS;
      var chain = Promise.resolve();
      for (var s = 1; s <= head.seq; s++) {
        (function (seq) {
          chain = chain.then(function () {
            var doc = bySeq[seq];
            var id = entryId(seq);
            if (!doc) {
              breaks.push({ id: id, expected: 'documento presente', actual: 'missing', kind: 'missing' });
              prevHash = null;
              return;
            }
            checked++;
            if (prevHash === null) {
              breaks.push({ id: id, expected: 'no verificable (predecesor ' + entryId(seq - 1) + ' missing)', actual: doc.prevHash, kind: 'prevchain' });
            } else if (doc.prevHash !== prevHash) {
              breaks.push({ id: id, expected: prevHash, actual: doc.prevHash, kind: 'prevchain' });
            }
            return sha256Hex(hashPayload(doc)).then(function (recomputed) {
              if (recomputed !== doc.hash) {
                breaks.push({ id: id, expected: recomputed, actual: doc.hash, kind: 'hash' });
              }
              prevHash = doc.hash;
            });
          });
        })(s);
      }
      return chain.then(function () {
        return { ok: breaks.length === 0, checked: checked, breaks: breaks };
      });
    });
  }

  // ANTES/DESPUES: JSON de la celda truncado a CELL_MAX total (corte en
  // CELL_MAX - sufijo + marca). Otros campos: cadena simple o ''.
  function cellText(value) {
    if (value === undefined || value === null) { return ''; }
    var s;
    if (typeof value === 'string') { s = value; }
    else {
      try { s = JSON.stringify(value); } catch (e) { s = String(value); }
      if (s === undefined) { s = String(value); }
    }
    if (s.length <= CELL_MAX) { return s; }
    return s.slice(0, CELL_MAX - TRUNC_MARK.length) + TRUNC_MARK;
  }

  function plainCell(value) {
    if (value === undefined || value === null) { return ''; }
    return typeof value === 'string' ? value : String(value);
  }

  // exportTabular(logs) → {sheetName, headers, rows} listo para
  // reportFormats/xlsxWriter (buildFromTable). 12 columnas estables.
  function exportTabular(logs) {
    var list = Array.isArray(logs) ? logs : [];
    var headers = ['FECHA_UTC', 'USUARIO', 'ROL', 'ACCION', 'ALMACEN', 'ENTIDAD',
      'ANTES', 'DESPUES', 'COUNT', 'IMPORT_ID', 'HASH', 'PREV_HASH'];
    var rows = list.map(function (d) {
      d = d || {};
      return [
        plainCell(d.at),
        plainCell(d.user),
        plainCell(d.role),
        plainCell(d.action),
        plainCell(d.store),
        plainCell(d.entityId),
        cellText(d.before),
        cellText(d.after),
        plainCell(d.count),
        plainCell(d.importId),
        plainCell(d.hash),
        plainCell(d.prevHash)
      ];
    });
    return { sheetName: 'bitacora_entrada', headers: headers, rows: rows };
  }

  // markExported(headHash) → meta 'audit.lastExport' con el hash del head
  // exportado + cuándo. Trazabilidad de qué versión de la cadena salió al mundo.
  function markExported(headHash) {
    requireDeps();
    if (typeof headHash !== 'string' || headHash === '') {
      return Promise.reject(ealError(CODE_BAD_INPUT, 'markExported(headHash): headHash debe ser cadena no vacía'));
    }
    var stamped = { hash: headHash, at: new Date().toISOString() };
    return _deps.metaRepo.set(LAST_EXPORT_KEY, stamped).then(function () {
      return stamped;
    });
  }

  // init({auditRepo, metaRepo, actorFn}) → guarda deps y reinicia la cola FIFO.
  // auditRepo: repo del store 'auditLog' ({get,save,remove,list}); metaRepo:
  // repo meta ({get,set}) como el de IW.core.store.
  function init(deps) {
    deps = deps || {};
    if (!deps.auditRepo || typeof deps.auditRepo.save !== 'function' ||
        typeof deps.auditRepo.get !== 'function' || typeof deps.auditRepo.list !== 'function') {
      return Promise.reject(ealError(CODE_BAD_INPUT, 'auditRepo debe exponer get/save/list (repo del store auditLog)'));
    }
    if (!deps.metaRepo || typeof deps.metaRepo.get !== 'function' || typeof deps.metaRepo.set !== 'function') {
      return Promise.reject(ealError(CODE_BAD_INPUT, 'metaRepo debe exponer get/set (repo meta)'));
    }
    _deps = {
      auditRepo: deps.auditRepo,
      metaRepo: deps.metaRepo,
      actorFn: (typeof deps.actorFn === 'function') ? deps.actorFn : null
    };
    _chain = Promise.resolve();
    return Promise.resolve(_deps);
  }

  return {
    NO_CRYPTO: CODE_NO_CRYPTO,
    NOT_INIT: CODE_NOT_INIT,
    BAD_INPUT: CODE_BAD_INPUT,
    HEAD_KEY: HEAD_KEY,
    LAST_EXPORT_KEY: LAST_EXPORT_KEY,
    GENESIS: GENESIS,
    EAL_LOCK_NAME: HEAD_LOCK_NAME,
    EAL_HEAD_CAS_TRIES: MAX_HEAD_CAS_TRIES,
    EAL_MAX_HEAD_ADVANCE: MAX_HEAD_ADVANCE,
    HASH_FIELDS: HASH_FIELDS,
    CELL_MAX: CELL_MAX,
    TRUNC_MARK: TRUNC_MARK,
    init: init,
    record: record,
    listRecent: listRecent,
    range: range,
    verifyChain: verifyChain,
    exportTabular: exportTabular,
    markExported: markExported,
    canonicalize: canonicalize,
    hashPayload: hashPayload,
    sha256Hex: sha256Hex
  };
});
