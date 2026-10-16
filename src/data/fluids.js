/* IntegrityWatch Field — fluids
   Editable fluid reference catalogue for PSV sizing (SCHEMA §8.2). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.data = root.IW.data || {};
  root.IW.data.fluids = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var fluids = [
    { id: 'methane', nameKey: 'fluids.methane', phase: 'gas', M: 16.04, k: 1.31, editable: true },
    { id: 'ethane', nameKey: 'fluids.ethane', phase: 'gas', M: 30.07, k: 1.19, editable: true },
    { id: 'propane', nameKey: 'fluids.propane', phase: 'gas', M: 44.10, k: 1.13, editable: true },
    { id: 'butane', nameKey: 'fluids.butane', phase: 'gas', M: 58.12, k: 1.09, editable: true },
    { id: 'natural-gas', nameKey: 'fluids.natural-gas', phase: 'gas', M: 19.0, k: 1.30, Z: 0.95, editable: true },
    { id: 'hydrogen', nameKey: 'fluids.hydrogen', phase: 'gas', M: 2.016, k: 1.41, editable: true },
    { id: 'nitrogen', nameKey: 'fluids.nitrogen', phase: 'gas', M: 28.01, k: 1.40, editable: true },
    { id: 'steam', nameKey: 'fluids.steam', phase: 'gas', M: 18.02, k: 1.31, Z: 1.0, editable: true },
    { id: 'water', nameKey: 'fluids.water', phase: 'liquid', G: 1.00, viscCp: 1, editable: true },
    { id: 'crude-oil', nameKey: 'fluids.crude-oil', phase: 'liquid', G: 0.85, viscCp: 15, editable: true },
    { id: 'diesel', nameKey: 'fluids.diesel', phase: 'liquid', G: 0.84, viscCp: 3, editable: true }
  ];

  function byId(id) {
    for (var i = 0; i < fluids.length; i++) {
      if (fluids[i].id === id) { return fluids[i]; }
    }
    return null;
  }

  function list() { return fluids.slice(); }

  return { fluids: fluids, byId: byId, list: list };
});
