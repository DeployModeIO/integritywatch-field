/* IntegrityWatch Field — report template registry
   Central registry of report templates (quarterly / dossier / datasheet).
   Resolves the pure model builder for a template id, awaits it, and renders
   the model through root.IW.reports.renderer. No direct DOM access, no data
   access. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.registry = api;
  root.IW.reports.buildReport = function (id, opts) { return api.build(id, opts); };
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var TEMPLATES = [
    { id: 'quarterly', titleKey: 'reports.quarterly', needs: ['period'] },
    { id: 'dossier', titleKey: 'reports.dossier', needs: ['mpId'] },
    { id: 'datasheet', titleKey: 'reports.datasheet', needs: ['psvId'] }
  ];

  var BUILTIN = {
    quarterly: { ns: 'modelQuarterly', method: 'buildQuarterlyModel' },
    dossier: { ns: 'modelDossier', method: 'buildDossierModel' },
    datasheet: { ns: 'modelDatasheet', method: 'buildDatasheetModel' }
  };

  function findTemplate(id) {
    for (var i = 0; i < TEMPLATES.length; i++) {
      if (TEMPLATES[i].id === id) { return TEMPLATES[i]; }
    }
    return null;
  }

  function renderer() {
    return root.IW && root.IW.reports ? root.IW.reports.renderer : null;
  }

  function resolveBuilder(entry) {
    if (entry.buildModel && typeof entry.buildModel === 'function') {
      return entry.buildModel;
    }
    var spec = BUILTIN[entry.id];
    if (!spec) { return null; }
    var reports = root.IW && root.IW.reports;
    var ns = reports ? reports[spec.ns] : null;
    return (ns && typeof ns[spec.method] === 'function') ? ns[spec.method] : null;
  }

  function list() {
    return TEMPLATES.slice();
  }

  function get(id) {
    return findTemplate(id);
  }

  function register(def) {
    def = def || {};
    if (typeof def.id !== 'string' || def.id === '') {
      throw new Error('register: template id is required');
    }
    if (findTemplate(def.id)) {
      throw new Error('duplicate report template: ' + def.id);
    }
    if (typeof def.buildModel !== 'function') {
      throw new Error('register: buildModel must be a function for ' + def.id);
    }
    var entry = {
      id: def.id,
      titleKey: def.titleKey,
      needs: Array.isArray(def.needs) ? def.needs.slice() : []
    };
    entry.buildModel = def.buildModel;
    TEMPLATES.push(entry);
    return entry;
  }

  function build(id, opts) {
    opts = opts || {};
    var entry = findTemplate(id);
    if (!entry) {
      return Promise.reject(new Error('unknown report: ' + id));
    }
    var buildModel = resolveBuilder(entry);
    if (typeof buildModel !== 'function') {
      return Promise.reject(new Error('report model missing: ' + id));
    }
    var rend = renderer();
    if (!rend || typeof rend.render !== 'function') {
      return Promise.reject(new Error('report renderer missing'));
    }
    return Promise.resolve().then(function () {
      return buildModel(opts);
    }).then(function (model) {
      return rend.render(model, opts.t);
    });
  }

  return {
    TEMPLATES: TEMPLATES,
    list: list,
    get: get,
    build: build,
    register: register
  };
});
