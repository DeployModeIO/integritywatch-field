/* IntegrityWatch Field — standards
   Referenced codes and standards catalogue (public data, 33 entries). */
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
    { id: 'ogmp-2-0', code: 'OGMP 2.0', title: 'Oil & Gas Methane Partnership 2.0 Framework', edition: '(2020) ' + VERIFY, usedIn: ['reports'] },

    // Rotating and static equipment (pumps, engines, turbines) — US / international.
    { id: 'api-610', code: 'API STD 610', title: 'Centrifugal Pumps for Petroleum, Petrochemical and Natural Gas Industries', edition: '(13th ed. 2026) ' + VERIFY, usedIn: ['apm', 'rotating'] },
    { id: 'api-682', code: 'API STD 682', title: 'Pumps—Shaft Sealing Systems for Centrifugal and Rotary Pumps', edition: '(2014) ' + VERIFY, usedIn: ['apm', 'rotating'] },
    { id: 'api-674', code: 'API STD 674', title: 'Positive Displacement Pumps—Reciprocating', edition: '(2010) ' + VERIFY, usedIn: ['apm', 'rotating'] },
    { id: 'api-616', code: 'API STD 616', title: 'Gas Turbines for the Petroleum, Chemical, and Gas Industry Services', edition: '(2011) ' + VERIFY, usedIn: ['apm', 'rotating'] },
    { id: 'iso-13709', code: 'ISO 13709', title: 'Centrifugal pumps for petroleum, petrochemical and natural gas industries', edition: '(2009) ' + VERIFY, usedIn: ['apm', 'rotating'] },
    { id: 'iso-8528', code: 'ISO 8528', title: 'Reciprocating internal combustion engine driven alternating current generating sets', edition: '(2018) ' + VERIFY, usedIn: ['apm'] },
    { id: 'ieee-446', code: 'IEEE 446', title: 'IEEE Recommended Practice for Emergency and Standby Power Systems for Industrial and Commercial Applications', edition: '(1995) ' + VERIFY, usedIn: ['apm'] },

    // Fire protection — US / international.
    { id: 'nfpa-20', code: 'NFPA 20', title: 'Standard for the Installation of Stationary Pumps for Fire Protection', edition: '(2022) ' + VERIFY, usedIn: ['apm', 'fire'] },
    { id: 'nfpa-25', code: 'NFPA 25', title: 'Standard for the Inspection, Testing, and Maintenance of Water-Based Fire Protection Systems', edition: '(2023) ' + VERIFY, usedIn: ['apm', 'fire'] },
    { id: 'nfpa-11', code: 'NFPA 11', title: 'Standard for Low-, Medium-, and High-Expansion Foam', edition: '(2024) ' + VERIFY, usedIn: ['apm', 'fire'] },

    // Fire protection and alarm management — United Kingdom.
    { id: 'bs-5306', code: 'BS 5306', title: 'Fire extinguishing installations and equipment on premises', edition: '(parts, varies) ' + VERIFY, usedIn: ['apm', 'fire'] },
    { id: 'bs-en-12845', code: 'BS EN 12845', title: 'Fixed firefighting systems — Automatic sprinkler systems — Design, installation and maintenance', edition: '(2020) ' + VERIFY, usedIn: ['apm', 'fire'] },
    { id: 'eemua-191', code: 'EEMUA 191', title: 'Alarm Systems — A Guide to Design, Management and Procurement', edition: '(2013) ' + VERIFY, usedIn: ['apm', 'standards'] },

    // Fire protection and safety signalling — Brazil.
    { id: 'nr-23', code: 'NR-23', title: 'Proteção Contra Incêndios', edition: '(2022) ' + VERIFY, usedIn: ['apm', 'fire'] },
    { id: 'nbr-13714', code: 'ABNT NBR 13714', title: 'Sistemas de hidrantes e de mangotinhos para combate a incêndio', edition: '(2000) ' + VERIFY, usedIn: ['apm', 'fire'] },
    { id: 'nbr-17240', code: 'ABNT NBR 17240', title: 'Sistemas de detecção e alarme de incêndio — Projeto, instalação, comissionamento e manutenção', edition: '(2010) ' + VERIFY, usedIn: ['apm', 'fire'] },
    { id: 'nr-26', code: 'NR-26', title: 'Sinalização de Segurança — Cores de segurança', edition: '(2022) ' + VERIFY, usedIn: ['apm', 'standards'] }
  ];

  function list() { return standards.slice(); }

  return { standards: standards, list: list };
});
