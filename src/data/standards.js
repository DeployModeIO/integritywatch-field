/* IntegrityWatch Field — standards
   Referenced codes and standards catalogue (public data, 16 entries). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.data = root.IW.data || {};
  root.IW.data.standards = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var VERIFY = '— verify current edition';

  var standards = [
    { id: 'sp0775', code: 'NACE/AMPP SP0775', title: 'Preparation, Installation, Analysis, and Interpretation of Corrosion Coupons in Oilfield Operations', edition: '(2018) ' + VERIFY, usedIn: ['corrosion', 'reports'] },
    { id: 'mr0175', code: 'MR0175/ISO 15156-2', title: 'Petroleum and natural gas industries — Materials for use in H2S-containing environments', edition: '(2015) ' + VERIFY, usedIn: ['corrosion', 'reports'] },
    { id: 'astm-g4', code: 'ASTM G4', title: 'Standard Guide for Conducting Corrosion Tests in Field Applications', edition: '(2014) ' + VERIFY, usedIn: ['corrosion', 'reports'] },
    { id: 'astm-g1', code: 'ASTM G1', title: 'Standard Practice for Preparing, Cleaning, and Evaluating Corrosion Test Specimens', edition: '(2017) ' + VERIFY, usedIn: ['corrosion', 'reports'] },
    { id: 'astm-g15', code: 'ASTM G15', title: 'Standard Terminology Relating to Corrosion and Corrosion Testing', edition: '(2022) ' + VERIFY, usedIn: ['corrosion', 'reports'] },
    { id: 'api-520-1', code: 'API 520 Pt I', title: 'Sizing, Selection, and Installation of Pressure-relieving Devices — Part I', edition: '(2020) ' + VERIFY, usedIn: ['psv', 'reports'] },
    { id: 'api-526', code: 'API 526', title: 'Flanged Steel Pressure-relief Valves', edition: '(2017) ' + VERIFY, usedIn: ['psv', 'reports'] },
    { id: 'api-5l', code: 'API 5L', title: 'Specification for Line Pipe', edition: '(2018) ' + VERIFY, usedIn: ['pipelines', 'reports'] },
    { id: 'asme-b31-4', code: 'ASME B31.4', title: 'Pipeline Transportation Systems for Liquids and Slurries', edition: '(2019) ' + VERIFY, usedIn: ['pipelines', 'reports'] },
    { id: 'asme-b31-8', code: 'ASME B31.8', title: 'Gas Transmission and Distribution Piping Systems', edition: '(2020) ' + VERIFY, usedIn: ['pipelines', 'reports'] },
    { id: 'iso-55000', code: 'ISO 55000', title: 'Asset management — Overview, principles and terminology', edition: '(2014) ' + VERIFY, usedIn: ['apm', 'reports'] },
    { id: 'iso-14224', code: 'ISO 14224', title: 'Petroleum, petrochemical and natural gas industries — Collection and exchange of reliability and maintenance data', edition: '(2016) ' + VERIFY, usedIn: ['apm', 'reports'] },
    { id: 'api-580', code: 'API 580', title: 'Risk-Based Inspection', edition: '(2016) ' + VERIFY, usedIn: ['apm', 'reports'] },
    { id: 'api-581', code: 'API 581', title: 'Risk-Based Inspection Methodology', edition: '(2016) ' + VERIFY, usedIn: ['apm', 'reports'] },
    { id: 'nace-sp0169', code: 'NACE SP0169', title: 'Control of External Corrosion on Underground or Submerged Metallic Piping Systems', edition: '(2013) ' + VERIFY, usedIn: ['corrosion', 'reports'] },
    { id: 'ogmp-2-0', code: 'OGMP 2.0', title: 'Oil & Gas Methane Partnership 2.0 Framework', edition: '(2020) ' + VERIFY, usedIn: ['reports'] }
  ];

  function list() { return standards.slice(); }

  return { standards: standards, list: list };
});
