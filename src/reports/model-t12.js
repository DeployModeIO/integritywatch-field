/* IntegrityWatch Field — T-12 cierre de turno / handover offline report model
   Pure (no DOM, no window, no crypto, no locale formatting) model builder for
   the T-12 "Paquete de cierre y entrega (handover)" report
   (docs/REPORTING-BLUEPRINT.md §T-12). This is the SUMMARY MODEL of the
   closing package: the real file bundle (PDF + JSON + CSV + photos + manifest
   + SHA-256 signing) is produced by the separate "Empaquetar" action (P3-zip),
   never here. Sections:
     cover      — shift close / handover generated at opts.now (period echoed).
     kpiRow     — rows imported in the period, open recommendations, line
                  inspection coverage, .iwf case-file integrity.
     table      — import sessions straight out of IW.ingest.commit.importSessions
                  (the EXACT aggregation commit.js performs over the per-batch
                  journal docs it writes: {importId, storeName, batches,
                  inserts, updates, rolledBack, startedAt, lastAt, status}).
     list       — checklist of what the "Empaquetar" action will generate
                  (labelKeys only).
     text       — sync-queue state: pending/dead counts over repos.mutationQueue
                  with the same predicate syncQueue.isPending uses
                  (!sentISO && !dead) plus the endpoint note.
     standards  — ISO 55000 asset information (catalog id 'iso-55000').
     disclaimer — the shared reports disclaimer.

    Journal docs do NOT carry the original file name (verified in commit.js
    flushBatch: {id, at, importId, storeName, batchNo, actor, inserts, changes,
    rolledBack}); the session id travels under the existing 'ingest.fileName'
    column label and the table note says so — nothing is invented.

    Rules (documented, deterministic):
    - Period window: opts.period {fromISO, toISO} is half-open [from, to) for
      BOTH sessions and inspections (T-09 convention). WITHOUT a period every
      record counts (the closing report of a shift covers the whole log up to
      the moment Empaquetar runs).
    - Session anchor = lastAt, else startedAt; a session with no parseable
      date is only included when no period is set.
    - Rows imported KPI = sum(inserts + updates) over the in-period sessions,
      INCLUDING rolled-back ones (the table shows rolledBack=yes so the reader
      can discount them; the note states this explicitly).
    - Open recommendations = recommendations with status === 'open' (the status
      the rules engine creates and the view filters on).
    - Inspection coverage = lineInspections dated in the window as a percentage
      of the lineAssets on record. "Elegible" has no schema flag anywhere, so
      the denominator assumption is documented in the note; when the repo is
      missing or holds zero assets the KPI is null and the renderer prints '—'
      (honest absent data, never a fabricated 0 %).
    - Case-file integrity reads ONE existing meta key: 'caseFile.lastISO' —
      the ISO stamp the P3-zip "Empaquetar" action is expected to write after
      signing the .iwf envelope (contract TODO for that task). Absent → null
      ('—' = sin expediente). This model never builds or signs a case file.

    Integration: index.html must load registry.js (and the ingest modules
    commit/schemas, which importSessions needs) BEFORE this file, same as the
    T-01..T-09 sisters; without IW.ingest.commit the session table degrades to
    the honest empty state (emptyKey reports.noData). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.modelT12 = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var CASE_FILE_META_KEY = 'caseFile.lastISO';
  var ENDPOINT_META_KEY = 'syncEndpoint';

  // Checklist of the future .zip: every item is a pure labelKey.
  var PACKAGE_ITEMS = [
    'reports.t12PkgPdf',
    'reports.t12PkgJson',
    'reports.t12PkgCsv',
    'reports.t12PkgPhotos',
    'reports.t12PkgManifest',
    'reports.t12PkgSha256'
  ];

  function model() { return root.IW && root.IW.reports ? root.IW.reports.model : null; }
  function registry() { return root.IW && root.IW.reports ? root.IW.reports.registry : null; }
  function standardsData() { return root.IW && root.IW.data ? root.IW.data.standards : null; }
  function commitApi() { return root.IW && root.IW.ingest ? root.IW.ingest.commit : null; }

  function nowMsOf(opts) {
    if (typeof opts.now === 'number' || typeof opts.now === 'string') {
      var ms = Date.parse(opts.now);
      if (!isNaN(ms)) { return ms; }
    }
    return Date.now();
  }

  function generatedAtISO(opts) { return new Date(nowMsOf(opts)).toISOString(); }

  // Half-open [from, to); a missing or unparseable bound never filters.
  function windowOf(opts) {
    var from = -Infinity;
    var to = Infinity;
    var p = opts.period;
    if (p && typeof p === 'object') {
      if (typeof p.fromISO === 'string' && !isNaN(Date.parse(p.fromISO))) { from = Date.parse(p.fromISO); }
      if (typeof p.toISO === 'string' && !isNaN(Date.parse(p.toISO))) { to = Date.parse(p.toISO); }
    }
    return { from: from, to: to };
  }

  function list(repo) {
    return (repo && typeof repo.list === 'function') ? Promise.resolve(repo.list()) : Promise.resolve([]);
  }

  function metaGet(store, key) {
    var meta = store.meta;
    if (!meta || typeof meta.get !== 'function') { return Promise.resolve(undefined); }
    try {
      return Promise.resolve(meta.get(key)).catch(function () { return undefined; });
    } catch (e) {
      return Promise.resolve(undefined);
    }
  }

  function parseMs(v) {
    return (typeof v === 'string' || typeof v === 'number') && !isNaN(Date.parse(v)) ? Date.parse(v) : null;
  }

  // importSessions already sorts lastAt DESC and returns the real shape; any
  // failure (module absent, empty journal, adapter error) degrades to [].
  function sessionsOf(store) {
    var cm = commitApi();
    if (!cm || typeof cm.importSessions !== 'function' || !store.importLog) {
      return Promise.resolve([]);
    }
    try {
      return Promise.resolve(cm.importSessions({ importLogRepo: store.importLog, metaRepo: store.meta }))
        .catch(function () { return []; });
    } catch (e) {
      return Promise.resolve([]);
    }
  }

  function sessionInWindow(s, win) {
    var ms = parseMs(s.lastAt) !== null ? parseMs(s.lastAt) : parseMs(s.startedAt);
    if (ms === null) { return win.from === -Infinity && win.to === Infinity; }
    return ms >= win.from && ms < win.to;
  }

  function buildSessionsTable(sessions) {
    var rows = sessions.map(function (s) {
      return {
        date: s.startedAt || s.lastAt || null,
        file: s.importId,
        entity: s.storeName || null,
        inserts: s.inserts,
        updates: s.updates,
        // status and rolledBack travel as raw ids ('done' | 'partial' |
        // 'rolled-back' | 'unknown'; 'yes' | 'no') — T-03/T-07 precedent: the
        // visual layer maps them to labels.
        status: s.status,
        rolledBack: s.rolledBack === true ? 'yes' : 'no'
      };
    });
    var sec = model().table({
      titleKey: 'reports.t12SessionsTitle',
      emptyKey: 'reports.noData',
      columns: [
        { key: 'date', labelKey: 'common.date' },
        { key: 'file', labelKey: 'ingest.fileName' },
        { key: 'entity', labelKey: 'reports.t12ColEntity' },
        { key: 'inserts', labelKey: 'reports.t12ColInserts', align: true },
        { key: 'updates', labelKey: 'reports.t12ColUpdates', align: true },
        { key: 'status', labelKey: 'reports.t12ColStatus' },
        { key: 'rolledBack', labelKey: 'reports.t12ColRolledBack' }
      ],
      rows: rows
    });
    sec.noteKey = 'reports.t12SessionsNote';
    return sec;
  }

  function buildPackageList() {
    return model().list({
      titleKey: 'reports.t12PackageTitle',
      items: PACKAGE_ITEMS.map(function (k) { return { textKey: k }; })
    });
  }

  // Same predicate as syncQueue.isPending: !sentISO && !dead.
  function queueCounts(rows) {
    var pending = 0;
    var dead = 0;
    (rows || []).forEach(function (r) {
      if (!r) { return; }
      if (r.dead === true) { dead += 1; return; }
      if (!r.sentISO) { pending += 1; }
    });
    return { pending: pending, dead: dead };
  }

  function buildQueueSection(tt, counts, hasEndpoint) {
    var body = tt('ingest.queuePending') + ': ' + counts.pending +
      ' \u00b7 ' + tt('ingest.deadCount') + ': ' + counts.dead +
      ' \u00b7 ' + tt('ingest.syncEndpoint') + ': ' +
      (hasEndpoint ? tt('reports.t12EndpointSet') : tt('reports.t12EndpointMissing'));
    return model().text({ titleKey: 'ingest.queueTitle', body: body, noteKey: 'ingest.endpointNote' });
  }

  function pickStandard(catalogId, fallbackCode, fallbackTitle) {
    var src = standardsData();
    var lst = (src && src.standards) || [];
    for (var i = 0; i < lst.length; i++) {
      if (lst[i].id === catalogId) {
        return { id: lst[i].code || lst[i].id, title: lst[i].title || '' };
      }
    }
    return { id: fallbackCode, title: fallbackTitle };
  }

  function buildStandards() {
    var items = [pickStandard('iso-55000', 'ISO 55000', 'Asset management — Overview, principles and terminology')];
    return model().standards({ titleKey: 'reports.standardsApplied', items: items });
  }

  function registerSelf() {
    var reg = registry();
    if (!reg || typeof reg.register !== 'function') { return; }
    try {
      reg.register({ id: 'T-12', titleKey: 'reports.t12Title', needs: [], buildModel: buildT12Model });
    } catch (e) {
      // Idempotent load: the only tolerable failure is a duplicate template
      // (e.g. the module was evaluated twice); anything else must surface.
      if (String((e && e.message) || '').indexOf('duplicate') === -1) { throw e; }
    }
  }

  function buildT12Model(opts) {
    opts = opts || {};
    var store = opts.repos || opts.store || {};
    var tt = typeof opts.t === 'function' ? opts.t : function (k) { return k; };
    registerSelf();
    var win = windowOf(opts);
    var generatedAtISOStr = generatedAtISO(opts);

    return Promise.all([
      sessionsOf(store),
      list(store.lineInspections),
      list(store.lineAssets),
      list(store.recommendations),
      list(store.mutationQueue),
      metaGet(store, CASE_FILE_META_KEY),
      metaGet(store, ENDPOINT_META_KEY)
    ]).then(function (r) {
      var sessions = (Array.isArray(r[0]) ? r[0] : []).filter(function (s) { return s && s.importId; });
      var inWindow = sessions.filter(function (s) { return sessionInWindow(s, win); });
      var rowsImported = 0;
      inWindow.forEach(function (s) {
        rowsImported += (typeof s.inserts === 'number' ? s.inserts : 0) +
          (typeof s.updates === 'number' ? s.updates : 0);
      });

      var inspections = (Array.isArray(r[1]) ? r[1] : []).filter(function (insp) {
        var ms = parseMs(insp && insp.date);
        return ms !== null && ms >= win.from && ms < win.to;
      }).length;
      var assets = (Array.isArray(r[2]) ? r[2] : []).length;
      // Honest absent data: no denominator, no percentage.
      var coveragePct = assets > 0 ? inspections / assets * 100 : null;

      var recsOpen = (Array.isArray(r[3]) ? r[3] : []).filter(function (rc) {
        return rc && rc.status === 'open';
      }).length;

      var counts = queueCounts(r[4]);
      var caseFileISO = typeof r[5] === 'string' && r[5] !== '' ? r[5] : null;
      var hasEndpoint = typeof r[6] === 'string' && r[6] !== '';

      var m = model();
      var coverMeta = { generatedAtISO: generatedAtISOStr };
      if (opts.period && typeof opts.period === 'object') { coverMeta.period = opts.period; }

      var sections = [
        m.cover({ titleKey: 'reports.t12Title', subtitleKey: 'reports.t12Subtitle', meta: coverMeta }),
        m.kpiRow({
          titleKey: 'reports.kpis',
          items: [
            { labelKey: 'reports.t12KpiRows', value: rowsImported },
            { labelKey: 'reports.t12KpiRecs', value: recsOpen },
            { labelKey: 'reports.t12KpiCoverage', value: coveragePct, unit: 'units.pct' },
            { labelKey: 'reports.t12KpiIntegrity', value: caseFileISO }
          ]
        }),
        buildSessionsTable(inWindow),
        buildPackageList(),
        buildQueueSection(tt, counts, hasEndpoint),
        buildStandards()
      ];

      return {
        id: 'T-12',
        meta: { titleKey: 'reports.t12Title', generatedAtISO: generatedAtISOStr, footer: { textKey: 'reports.pageFooter', generatedKey: 'reports.generatedAt' } },
        sections: sections,
        // Mirrors the top-level report-disclaimer element of the sisters.
        disclaimer: m.disclaimer({ labelKey: 'reports.disclaimer' })
      };
    });
  }

  registerSelf();

  return { buildT12Model: buildT12Model };
});
