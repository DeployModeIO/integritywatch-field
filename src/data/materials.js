/* IntegrityWatch Field — materials
   Static material catalogue (density, family, sour-service notes). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.data = root.IW.data || {};
  root.IW.data.materials = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var CS_NOTE = 'Carbon steel: sour-service limits per MR0175/ISO 15156-2 (SSC/HIC); verify hardness and environment.';
  var SS_NOTE = 'Austenitic stainless: MR0175/ISO 15156-3 restricts use by chloride, H2S and temperature (SCC).';
  var DUPLEX_NOTE = 'Duplex stainless: good SSC resistance within MR0175/ISO 15156-3 hardness and pH limits.';

  var materials = [
    { id: 'api5l-gr-b', name: 'API 5L Grade B', densityGcm3: 7.85, family: 'carbonSteel', mr0175Note: CS_NOTE },
    { id: 'api5l-x52', name: 'API 5L X52', densityGcm3: 7.85, family: 'carbonSteel', mr0175Note: CS_NOTE },
    { id: 'api5l-x60', name: 'API 5L X60', densityGcm3: 7.85, family: 'carbonSteel', mr0175Note: CS_NOTE },
    { id: 'api5l-x70', name: 'API 5L X70', densityGcm3: 7.85, family: 'carbonSteel', mr0175Note: CS_NOTE },
    { id: 'a106-b', name: 'ASTM A106 Grade B', densityGcm3: 7.85, family: 'carbonSteel', mr0175Note: CS_NOTE },
    { id: 'a516-70', name: 'ASTM A516 Grade 70', densityGcm3: 7.85, family: 'carbonSteel', mr0175Note: CS_NOTE },
    { id: 'ss-316l', name: '316L Stainless Steel', densityGcm3: 8.00, family: 'stainless', mr0175Note: SS_NOTE },
    { id: 'ss-317l', name: '317L Stainless Steel', densityGcm3: 8.00, family: 'stainless', mr0175Note: SS_NOTE },
    { id: 'duplex-2205', name: 'Duplex 2205', densityGcm3: 7.80, family: 'duplex', mr0175Note: DUPLEX_NOTE },
    { id: 'super-duplex-2507', name: 'Super Duplex 2507', densityGcm3: 7.80, family: 'duplex', mr0175Note: DUPLEX_NOTE },
    { id: 'cs-coated', name: 'Carbon Steel (coated)', densityGcm3: 7.85, family: 'clad', mr0175Note: 'Coated carbon steel: coating is a barrier; base metal still subject to carbon-steel MR0175 limits if the coating fails.' },
    { id: 'cu-ni-90-10', name: 'Cu-Ni 90/10', densityGcm3: 8.90, family: 'clad', mr0175Note: 'Copper-nickel CRA: resistant to seawater and mild sour service; check MR0175/ISO 15156-3 limits.' },
    { id: 'alloy-c276', name: 'Alloy C-276', densityGcm3: 8.89, family: 'clad', mr0175Note: 'Nickel-chromium-molybdenum CRA: high resistance to sour service; per MR0175/ISO 15156-3.' }
  ];

  function byId(id) {
    for (var i = 0; i < materials.length; i++) {
      if (materials[i].id === id) { return materials[i]; }
    }
    return null;
  }

  function list() { return materials.slice(); }

  return { materials: materials, byId: byId, list: list };
});
