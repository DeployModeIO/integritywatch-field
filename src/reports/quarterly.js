/* IntegrityWatch Field — quarterly report
   Print-first A4 quarterly integrity report builder (async over repositories). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.reports = root.IW.reports || {};
  root.IW.reports.quarterly = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function build(opts) {
    var m = root.IW && root.IW.reports ? root.IW.reports.modelQuarterly : null;
    var r = root.IW && root.IW.reports ? root.IW.reports.renderer : null;
    if (!m || !r) { return Promise.reject(new Error('report engine not loaded')); }
    return m.buildQuarterlyModel(opts).then(function (model) { return r.render(model, opts.t); });
  }

  return { build: build };
});
