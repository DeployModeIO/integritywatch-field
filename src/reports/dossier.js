/* IntegrityWatch Field — dossier report
   Thin adapter: delegates to IW.reports.modelDossier + IW.reports.renderer. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.dossier = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function build(opts) {
    var m = root.IW && root.IW.reports ? root.IW.reports.modelDossier : null;
    var r = root.IW && root.IW.reports ? root.IW.reports.renderer : null;
    if (!m || !r) { return Promise.reject(new Error('report engine not loaded')); }
    return m.buildDossierModel(opts).then(function (model) { return r.render(model, opts.t); });
  }

  return { build: build };
});
