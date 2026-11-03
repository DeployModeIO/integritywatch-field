/* IntegrityWatch Field — manufacturers
   Static factual catalogue of OEMs and model families for rotating equipment
   and pressure relief valves (API 610 / API 526 / API 618 / API 617).
   Names and model/series identifiers are factual engineering references only:
   no logos, brand marks or graphical assets. Where a concrete commercial
   series is uncertain, the API 610 type designation (OH/BB/VS...) is used.
   API: list(scope), find(id), byModel(query), SCOPES, manufacturers. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.data = root.IW.data || {};
  root.IW.data.manufacturers = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var SCOPES = ['bomba-api610', 'psv-api526', 'compresor-api618', 'turbo-expansor'];

  /* families[].model are canonical engineering aliases (API 610 type codes
     OH1..OH8 / BB1..BB5 / VS1..VS6, API 526 valve classes, API 618 recip
     series, API 617 expander trains) so byModel() can match short queries. */
  var manufacturers = [
    {
      id: 'sulzer', name: 'Sulzer', country: 'Switzerland',
      scopes: ['bomba-api610'],
      families: [
        { model: 'OH1', standard: 'API 610', notes: 'Overhung single-stage centrifugal pump.' },
        { model: 'OH6', standard: 'API 610', notes: 'Vertical inline overhung pump.' },
        { model: 'BB3', standard: 'API 610', notes: 'Horizontal split-case multistage pump.' },
        { model: 'BB5', standard: 'API 610', notes: 'Between-corners barrel pump (high head).' },
        { model: 'VS6', standard: 'API 610', notes: 'Vertical can-type pump.' }
      ]
    },
    {
      id: 'flowserve', name: 'Flowserve', country: 'United States',
      scopes: ['bomba-api610', 'psv-api526'],
      families: [
        { model: 'OH2', standard: 'API 610', notes: 'In-line single-stage overhung pump (Bolton Sursalan multistage type).' },
        { model: 'BB2', standard: 'API 610', notes: 'Axially split barrel multistage pump.' },
        { model: 'BB5', standard: 'API 610', notes: 'Between-corners barrel pump (Worthington SI).' },
        { model: 'VS1', standard: 'API 610', notes: 'Vertical suspended pump (Durco).' },
        { model: 'API 526', standard: 'API 526', notes: 'Cast iron/steel spring-loaded PSV valve classes (Durco).' }
      ]
    },
    {
      id: 'nuovo-pignone', name: 'Nuovo Pignone (Baker Hughes)', country: 'Italy',
      scopes: ['bomba-api610', 'compresor-api618'],
      families: [
        { model: 'OH2', standard: 'API 610', notes: 'Vertical inline overhung pump.' },
        { model: 'BB3', standard: 'API 610', notes: 'Horizontal split-case multistage pump.' },
        { model: 'BB5', standard: 'API 610', notes: 'Between-corners barrel pump.' },
        { model: 'API 618', standard: 'API 618', notes: 'Reciprocating process compressor (LNG/hydrogen).' }
      ]
    },
    {
      id: 'ksb', name: 'KSB', country: 'Germany',
      scopes: ['bomba-api610'],
      families: [
        { model: 'OH2', standard: 'API 610', notes: 'In-line multistage pump (MLTA).' },
        { model: 'OH6', standard: 'API 610', notes: 'Vertical inline overhung pump (Etanorm type).' },
        { model: 'BB3', standard: 'API 610', notes: 'Horizontal split-case multistage pump (HSD/RH).' },
        { model: 'VS6', standard: 'API 610', notes: 'Vertical can-type pump (RPH).' }
      ]
    },
    {
      id: 'itt-goulds', name: 'ITT Goulds Pumps', country: 'United States',
      scopes: ['bomba-api610'],
      families: [
        { model: 'OH2', standard: 'API 610', notes: 'Overhung pump (IT/ABI).' },
        { model: 'BB3', standard: 'API 610', notes: 'Horizontal split-case multistage pump (MVP).' },
        { model: 'BB5', standard: 'API 610', notes: 'Between-corners barrel pump.' },
        { model: 'VS6', standard: 'API 610', notes: 'Vertical can-type pump (RVS).' }
      ]
    },
    {
      id: 'aurora-ingersoll-rand', name: 'Aurora (Ingersoll Rand)', country: 'United States',
      scopes: ['bomba-api610'],
      families: [
        { model: 'OH2', standard: 'API 610', notes: 'Overhung pump (CET type).' },
        { model: 'BB2', standard: 'API 610', notes: 'Axially split barrel multistage pump (CET).' },
        { model: 'BB3', standard: 'API 610', notes: 'Horizontal split-case multistage pump (CET).' },
        { model: 'BB5', standard: 'API 610', notes: 'Between-corners barrel pump (CET).' }
      ]
    },
    {
      id: 'ebara', name: 'Ebara', country: 'Japan',
      scopes: ['bomba-api610'],
      families: [
        { model: 'BB3', standard: 'API 610', notes: 'Horizontal split-case multistage pump.' },
        { model: 'BB5', standard: 'API 610', notes: 'Between-corners barrel pump (SNH).' },
        { model: 'VS6', standard: 'API 610', notes: 'Vertical can-type sump pump.' }
      ]
    },
    {
      id: 'nikkiso', name: 'Nikkiso', country: 'Japan',
      scopes: ['bomba-api610'],
      families: [
        { model: 'VS6', standard: 'API 610', notes: 'Vertical cryogenic pump (LNG/LPG).' },
        { model: 'VS7', standard: 'API 610', notes: 'Submerged cryogenic barrel pump.' },
        { model: 'BB5', standard: 'API 610', notes: 'High-pressure barrel pump (refinery).' }
      ]
    },
    {
      id: 'kobe-steel', name: 'KOBE STEEL (Kobelco)', country: 'Japan',
      scopes: ['bomba-api610'],
      families: [
        { model: 'OH2', standard: 'API 610', notes: 'Overhung process pump.' },
        { model: 'BB3', standard: 'API 610', notes: 'Horizontal split-case multistage pump.' },
        { model: 'BB5', standard: 'API 610', notes: 'Between-corners barrel pump.' }
      ]
    },
    {
      id: 'hmd-kontro', name: 'HMD Kontro', country: 'Denmark',
      scopes: ['bomba-api610'],
      families: [
        { model: 'OH', standard: 'API 610', notes: 'Seal-less overhung pump (canned/magnetic drive).' },
        { model: 'VS', standard: 'API 610', notes: 'Vertical seal-less pump for low-NPSH duty.' }
      ]
    },
    {
      id: 'weir-slurry', name: 'The Weir Group', country: 'United Kingdom',
      scopes: ['bomba-api610'],
      families: [
        { model: 'VS', standard: 'API 610', notes: 'Vertical wet-pit slurry/refractory pump.' },
        { model: 'OH', standard: 'API 610', notes: 'Overhung duty pump (Warman/Grindex).' }
      ]
    },
    {
      id: 'sundyne-farris', name: 'Sundyne', country: 'United States',
      scopes: ['bomba-api610'],
      families: [
        { model: 'VS6', standard: 'API 610', notes: 'Seal-less vertical canned/refrigerant pump.' },
        { model: 'BB5', standard: 'API 610', notes: 'Seal-less integrally geared barrel pump (HLP).' },
        { model: 'OH', standard: 'API 610', notes: 'Seal-less overhung pump (API 685 canned type).' }
      ]
    },
    {
      id: 'consolidated-baker-hughes', name: 'Consolidated Safety Valves (Baker Hughes)', country: 'United States',
      scopes: ['psv-api526'],
      families: [
        { model: 'API 526', standard: 'API 526', notes: 'Spring-loaded conventional and balanced-bellows PSV valve classes.' },
        { model: 'API 527', standard: 'API 527', notes: 'High-pressure pilot-operated relief valve classes.' }
      ]
    },
    {
      id: 'anderson-greenwood', name: 'Anderson Greenwood (Emerson)', country: 'United States',
      scopes: ['psv-api526'],
      families: [
        { model: 'API 526', standard: 'API 526', notes: 'Spring-loaded and bellows PSV valve classes.' },
        { model: 'API 527', standard: 'API 527', notes: 'Pilot-operated safety relief valve.' }
      ]
    },
    {
      id: 'leser', name: 'LESER GmbH', country: 'Germany',
      scopes: ['psv-api526'],
      families: [
        { model: 'API 526', standard: 'API 526', notes: 'Spring-loaded safety valve types 526 series.' },
        { model: 'API 527', standard: 'API 527', notes: 'Pilot-operated safety valve.' }
      ]
    },
    {
      id: 'omb-valves', name: 'OMB Valves', country: 'Italy',
      scopes: ['psv-api526'],
      families: [
        { model: 'API 526', standard: 'API 526', notes: 'Flanged spring-loaded safety valve.' },
        { model: 'API 527', standard: 'API 527', notes: 'Pilot-operated safety relief valve.' }
      ]
    },
    {
      id: 'sart-von-loewenstein', name: 'Sart von Loewenstein', country: 'Italy',
      scopes: ['psv-api526'],
      families: [
        { model: 'API 526', standard: 'API 526', notes: 'Standard spring-loaded safety valve.' },
        { model: 'API 527', standard: 'API 527', notes: 'Pilot-operated safety valve.' }
      ]
    },
    {
      id: 'atlas-copco', name: 'Atlas Copco', country: 'Sweden',
      scopes: ['compresor-api618', 'turbo-expansor'],
      families: [
        { model: 'API 618', standard: 'API 618', notes: 'Process gas reciprocating compressor.' },
        { model: 'API 617', standard: 'API 617', notes: 'Centrifugal/radial-inflow gas expansion turbine.' },
        { model: 'OH', standard: 'API 610', notes: 'Centrifugal pump (HDS/akm).' }
      ]
    },
    {
      id: 'howden', name: 'Howden', country: 'United Kingdom',
      scopes: ['compresor-api618', 'turbo-expansor'],
      families: [
        { model: 'API 618', standard: 'API 618', notes: 'Reciprocating compressor (ACI).' },
        { model: 'API 617', standard: 'API 617', notes: 'Centrifugal axial-flow expander train.' }
      ]
    },
    {
      id: 'burckhardt-compression', name: 'Burckhardt Compression', country: 'Switzerland',
      scopes: ['compresor-api618'],
      families: [
        { model: 'API 618', standard: 'API 618', notes: 'Reciprocating compressor (Laby/M-series).' }
      ]
    },
    {
      id: 'siemens-energy', name: 'Siemens Energy', country: 'Germany',
      scopes: ['turbo-expansor', 'compresor-api618'],
      families: [
        { model: 'API 617', standard: 'API 617', notes: 'Centrifugal gas expander train (NGL/cryogenic).' },
        { model: 'API 618', standard: 'API 618', notes: 'Reciprocating compressor (formerly Dresser-Rand).' }
      ]
    }
  ];

  function find(id) {
    for (var i = 0; i < manufacturers.length; i++) {
      if (manufacturers[i].id === id) { return manufacturers[i]; }
    }
    return null;
  }

  function list(scope) {
    if (scope === undefined || scope === null) { return manufacturers.slice(); }
    var out = [];
    for (var i = 0; i < manufacturers.length; i++) {
      if (manufacturers[i].scopes.indexOf(scope) !== -1) { out.push(manufacturers[i]); }
    }
    return out;
  }

  /* Canonical alias normalisation: lowercase, strip accents, keep alphanumerics. */
  function normalize(s) {
    return String(s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  /* Simple canonical search by family model alias across all manufacturers. */
  function byModel(query) {
    var key = normalize(query);
    var out = [];
    if (key === '') { return out; }
    for (var i = 0; i < manufacturers.length; i++) {
      var m = manufacturers[i];
      for (var j = 0; j < m.families.length; j++) {
        if (normalize(m.families[j].model).indexOf(key) !== -1) {
          out.push(m);
          break;
        }
      }
    }
    return out;
  }

  return {
    manufacturers: manufacturers,
    SCOPES: SCOPES.slice(),
    list: list,
    find: find,
    byModel: byModel
  };
});
