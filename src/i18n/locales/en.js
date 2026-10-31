/* IntegrityWatch Field — locale en
   Full i18n inventory per SCHEMA.md §5 plus ingest.canonical.* (SCHEMA §6)
   and fluids.* (SCHEMA §8.2). This file is the reference key set. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW_LOCALES = root.IW_LOCALES || {};
  root.IW_LOCALES.en = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  return {

    __meta: { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },

    ffs: {title:"Fitness-for-service (API 579 L1)",mawpAllowed:"Allowable MAWP",mawpAssessed:"Assessed MAWP",pass:"Assessment passed",fail:"Assessment failed",tRequired:"Required thickness",corrosionAllowance:"Corrosion allowance",jointEfficiency:"Joint efficiency",allowableStress:"Allowable stress",utilization:"Utilization",needFields:"Enter D, t, P, and material to assess"},

    common: {
      appName: 'IntegrityWatch Field',
      tagline: 'Offline integrity and compliance operations center',
      disclaimer: 'Support tool. Always validate against current editions of standards and manufacturer data.',
      save: 'Save', cancel: 'Cancel', delete: 'Delete', edit: 'Edit', add: 'Add', new: 'New',
      close: 'Close', search: 'Search', filter: 'Filter', clear: 'Clear',
      export: 'Export', import: 'Import', print: 'Print', copy: 'Copy', copied: 'Copied',
      refresh: 'Refresh', run: 'Run', back: 'Back', next: 'Next', yes: 'Yes', no: 'No',
      confirm: 'Confirm', required: 'Required', optional: 'Optional', none: 'None', all: 'All',
      actions: 'Actions', status: 'Status', severity: 'Severity', date: 'Date', notes: 'Notes',
      note: 'Note', value: 'Value', min: 'Min', max: 'Max', avg: 'Avg', total: 'Total',
      ok: 'OK', error: 'Error', warning: 'Warning', info: 'Info', critical: 'Critical',
      loading: 'Loading…', empty: 'No data', apply: 'Apply', reset: 'Reset',
      language: 'Language', theme: 'Theme', light: 'Light', dark: 'Dark', system: 'System',
      sector: 'Sector', upstream: 'Upstream', midstream: 'Midstream', downstream: 'Downstream',
      asset: 'Asset', assets: 'Assets', active: 'Active', due: 'Due', overdue: 'Overdue',
      days: 'days', hours: 'hours', months: 'months', createdAt: 'Created', updatedAt: 'Updated',
      unknown: 'Unknown', keyboardHint: 'Keyboard navigation available',
      updateAvailable: 'Update available', reload: 'Reload', confidence: 'Confidence',
      bootError: 'Boot error', viewError: 'View error',
      moduleLoading: 'module loading…',
      inMemoryNotice: 'IndexedDB unavailable; running with in-memory storage. Changes may not persist.',


      pass: 'Pass', fail: 'Fail', na: 'N/A', saved: 'Saved'
    },

    nav: {
      dashboard: 'Dashboard', corrosion: 'Corrosion', psv: 'Relief valves', pipelines: 'Pipelines',
      apm: 'Asset performance', ingest: 'Data ingest', recommendations: 'Recommendations',
      reports: 'Reports', glossary: 'Glossary', admin: 'Admin',
      groupOps: 'Operations', groupIntegrity: 'Integrity & assets', groupData: 'Data & system'
    },

    severity: {
      low: 'Low', moderate: 'Moderate', high: 'High', severe: 'Severe',
      critical: 'Critical', warning: 'Warning', info: 'Info',
      shapeHint: 'Severity is also encoded by shape'
    },

    units: {
      mpy: 'mpy', mmYear: 'mm/y', umYear: 'µm/y', degC: '°C', degF: '°F',
      psia: 'psia', psig: 'psig', bar: 'bar', kPa: 'kPa', ppm: 'ppm', pct: '%',
      lbH: 'lb/h', gpm: 'gpm', in2: 'in²', cm2: 'cm²', km: 'km', mg: 'mg',
      cm2Area: 'cm² area'
    },

    dashboard: {
      title: 'Dashboard', kpiAvgCr: 'Avg corrosion rate', kpiSeverePoints: 'Severe points',
      kpiPsvOverdue: 'PSVs overdue', kpiApmAlerts: 'APM alerts', kpiPendingCompliance: 'Pending compliance',
      heatmapTitle: 'Corrosion heatmap', heatmapHint: 'Average corrosion rate by point',
      alertsFeed: 'Alerts feed', noAlerts: 'No active alerts', lastRulesRun: 'Last rules run',
      runRules: 'Run rules', topPoints: 'Top critical points', viewAll: 'View all',
      sectorView: 'Sector view', criticalCount: 'Critical', warningCount: 'Warnings', infoCount: 'Info',
      ctxCr: 'Reference: <5 mpy acceptable', ctxSevere: 'SP0775 threshold: ≥10 mpy',
      ctxPsv: '{{n}} of {{total}} valves overdue', ctxApm: '{{n}} of {{total}} assets with alerts',
      ctxCompliance: '{{n}} of {{total}} open'
    },

    corrosion: {
      title: 'Corrosion', points: 'Monitoring points', newPoint: 'New point', editPoint: 'Edit point',
      pointCode: 'Point code', line: 'Line', material: 'Material', sensorType: 'Sensor type',
      processParams: 'Process parameters', h2s: 'H₂S', co2: 'CO₂', totalPressure: 'Total pressure',
      temperature: 'Temperature', bsw: 'BS&W', velocity: 'Velocity',
      inhibitorTarget: 'Inhibitor target', inhibitorResidual: 'Inhibitor residual',
      readings: 'Readings', newReading: 'New reading', noReadings: 'No readings yet', trend: 'Trend',
      coupons: 'Coupons', newCoupon: 'New coupon', couponRole: 'Coupon role', blank: 'Blank',
      inhibited: 'Inhibited', pair: 'Pair', initialWeight: 'Initial weight', finalWeight: 'Final weight',
      area: 'Area', exposureDays: 'Exposure days', exposureHours: 'Exposure hours', density: 'Density',
      crResult: 'Corrosion rate result', classification: 'Classification', sp0775Ref: 'SP0775 severity classification',
      inhibitorEfficiency: 'Inhibitor efficiency', eiPoorestNote: 'Lowest efficiency pair',
      inhibitorBalance: 'Inhibitor balance', balanceResult: 'Balance result',
      dwmTitle: 'De Waard–Milliams model', dwmResult: 'Model result', dwmNote: 'Sweet corrosion prediction',
      modelRatio: 'Model ratio', sourScreening: 'Sour service screening', ph2s: 'pH₂S',
      mr0175Ref: 'MR0175/ISO 15156 screening', cpTitle: 'Cathodic protection',
      cpPotential: 'Potential', cpPolarization: 'Polarization', cpResult: 'CP result',
      cuiTitle: 'Corrosion under insulation', insulated: 'Insulated', jacketType: 'Jacket type',
      lastCuiInspection: 'Last CUI inspection', pointDossier: 'Point dossier',
      deletePointConfirm: 'Delete this monitoring point and all its data?',
      pointName: 'Point name', system: 'System', stationKm: "Station (km)", location: 'Location',
      crMpy: 'Corrosion rate (mpy)', startDate: 'Start date', endDate: 'End date',
      codeDuplicate: 'A point with this code already exists',
      wfGtWi: 'Final weight cannot exceed initial weight',
      deleteDisabled: 'Cannot delete: this point has associated data (readings or coupons)',
      screeningNote: 'Screening estimate — always validate against the current edition of the referenced standard',
      sensorTypes: {
        couponGravimetric: 'Coupon (gravimetric)', erProbe: 'ER probe', lprProbe: 'LPR probe',
        h2Probe: 'Hydrogen probe', utInspection: 'UT inspection', visual: 'Visual'
      },
      eiBands: { poor: 'Poor', acceptable: 'Acceptable', good: 'Good', excellent: 'Excellent' },
      balanceBands: { under: 'Under', onTarget: 'On target', over: 'Over' },
      mr0175: { low: 'Low', moderate: 'Moderate', high: 'High' },
      cpStatus: { pass: 'Pass', fail: 'Fail', insufficient: 'Insufficient data' },
      remainingLife: 'Remaining life', tNom: 'T-nom (mm)', tMin: 'T-min (mm)', tMinHint: 'Set T-nom and T-min (mm) to calculate remaining life',
      outlier: 'Outlier', rulingMethod: 'Method',
      trendLabels: { increasing: 'Increasing', decreasing: 'Decreasing', stable: 'Stable', insufficient: 'Insufficient' },
      advancedTitle: 'Advanced corrosion'
    },

    norsok: {
      error: {
        E_MISSING_INPUT: 'Missing required inputs for the calculation.',
        E_TEMP_RANGE: 'Temperature outside the model range (5–150 °C).',
        E_PH_RANGE: 'pH outside the model range (3.5–6.5).',
        E_SHEAR_INPUT: 'Invalid shear stress or velocity inputs.'
      },
      title: 'NORSOK M-506 — CO₂ corrosion',
      cr: 'Corrosion rate',
      results: 'Results',
      inputs: {
        temp: 'Temperature (°C)', pressure: 'Total pressure (bar)', co2: 'CO₂ mole %',
        ph: 'pH', shear: 'Wall shear (Pa)', velocity: 'Flow velocity (m/s)',
        diameter: 'Pipe ID (mm)', density: 'Liquid density (kg/m³)',
        viscosity: 'Viscosity (mPa·s)', glycol: 'Glycol wt %',
        inhibitor: 'Inhibitor eff. %', calculate: 'Calculate', save: 'Save inputs'
      },
      breakdown: {
        kt: 'Kt', fph: 'f(pH)', fco2: 'fCO₂', shear: 'Shear (S)',
        exponent: 'Exponent', reduction: 'Reduction'
      },
      warn: {
        W_ORGANIC_ACIDS: 'Model does not cover organic acids >100 ppm',
        W_NO_H2S_O2: 'Not applicable for sour/oxygenated service',
        W_PCO2_LOW: 'pCO₂ <0.5 bar may underestimate',
        W_OUT_OF_ENVELOPE: 'fCO₂ outside 0.1–10 bar envelope',
        W_SHEAR_RANGE: 'Shear stress outside 1–150 Pa range'
      }
    },

    cui: {
      title: 'CUI screening (API RP 583/571)',
      inputs: {
        material: 'Material class', temp: 'Operating temp (°C)',
        insulation: 'Insulation type', coating: 'Coating condition',
        environment: 'Environment', penetrating: 'Penetrating features',
        cyclic: 'Cyclic service', steam: 'Steam traced'
      },
      risk: { low: 'Low', moderate: 'Moderate', high: 'High', critical: 'Critical' },
      method: {
        visual: 'Visual inspection', thermo: 'Thermography',
        pec: 'Pulsed eddy current', rt: 'Radiography (RT)',
        gw: 'Guided wave UT', utSpot: 'Spot UT',
        utProgram: 'Programmed UT'
      },
      note: { pt: 'PT recommended for stainless steel (ECSCC)' }
    },

    mic: {
      title: 'MIC screening (NACE TM0194 / API 571)',
      factor: {
        freeWater: 'Free water present',
        stagnant: 'Stagnant water', temperature: 'Temperature 20–50 °C',
        sulfate: 'Sulfate present', deposits: 'Deposits',
        nearNeutralPh: 'Near-neutral pH', sulfideSigns: 'Sulfide signs',
        historyMic: 'MIC history', highCounts: 'High bacterial counts'
      },
      driver: {
        stagnant: 'Stagnant conditions', temperature: 'Mesophilic range (20–50 °C)',
        sulfate: 'Sulfate-reducing bacteria', deposits: 'Under-deposit',
        nearNeutralPh: 'Neutral pH', sulfideSigns: 'Sulfide indicators',
        historyMic: 'Prior MIC events', highCounts: 'Elevated counts'
      },
      score: 'Score',
      risk: { low: 'Low', moderate: 'Moderate', high: 'High' }
    },

    psv: {
      title: 'Relief valves', registry: 'PSV registry', newPsv: 'New PSV', tag: 'Tag',
      location: 'Location', valveType: 'Valve type', fluid: 'Fluid', phase: 'Phase',
      gasVapor: 'Gas / vapor', liquid: 'Liquid', setPressure: 'Set pressure', temperature: 'Temperature',
      backPressure: 'Back pressure', flowW: 'Flow rate (W)', flowQ: 'Flow rate (Q)',
      k: 'Specific heat ratio (k)', molarMass: 'Molar mass', compressibility: 'Compressibility factor',
      specificGravity: 'Specific gravity', viscosity: 'Viscosity', kd: 'Discharge coefficient (Kd)',
      kb: 'Back pressure factor (Kb)', kw: 'Liquid back pressure factor (Kw)',
      kc: 'Rupture disc factor (Kc)', kv: 'Viscosity factor (Kv)',
      sizingTitle: 'Sizing', gasSizing: 'Gas / vapor sizing', liquidSizing: 'Liquid sizing',
      flowCritical: 'Critical flow', flowSubcritical: 'Subcritical flow', requiredArea: 'Required area',
      selectedOrifice: 'Selected orifice', selectedArea: 'Selected area', realCapacity: 'Real capacity',
      margin: 'Margin', usage: 'Usage', exceedsT: 'Exceeds orifice T', recalculate: 'Recalculate',
      datasheet: 'Datasheet', copyDatasheet: 'Copy datasheet', printDatasheet: 'Print datasheet',
      fluidsEditor: 'Fluids', newFluid: 'New fluid', editFluid: 'Edit fluid',
      lastTest: 'Last test', nextTest: 'Next test', statusOk: 'Status',
      certified: 'Certified capacity', validationHeader: 'Validation',
      deletePsvConfirm: 'Delete this PSV and all its data?',
      overpressure: 'Overpressure (%)', fluidName: 'Fluid name', c: 'Flow coefficient (C)',
      f2: 'Subcritical factor (F2)', re: 'Reynolds number (Re)', iterations: 'Iterations',
      tagDuplicate: 'A PSV with this tag already exists',
      deleteDisabled: 'Cannot delete: this PSV has an associated asset or inspection record',
      types: { conventional: 'Conventional', balanced: 'Balanced bellows', pilot: 'Pilot operated' },
    inspHistory: "Inspection history (API 576)",
    lastInsp: "Last inspection",
    nextInspDue: "Next inspection due",
    inspResult: "Result",
    inspOverdue: "Inspection overdue",
    inspOk: "Inspection current",
    inspMissing: "No inspection records",
      err: {
        empty: 'Required field', set: 'Set pressure must be greater than 0',
        z: 'Compressibility factor must be greater than 0', k: 'k (cp/cv) must be greater than 1',
        t: 'Temperature must be greater than 0', m: 'Molar mass must be greater than 0',
        g: 'Specific gravity must be greater than 0', negflow: 'Flow rate must be greater than 0',
        p1lep2: 'Upstream pressure must be greater than downstream pressure'
      },
      warn: { reRange: 'Reynolds number below 100: viscosity correction has limited validity' }
    },

    pipelines: {
      title: 'Pipelines', systems: 'Pipeline systems', newSystem: 'New system',
      systemName: 'System name', operator: 'Operator', product: 'Product', diameter: 'Diameter',
      wallThickness: 'Wall thickness', coating: 'Coating', length: 'Length', stationRange: 'Station range',
      lineAssets: 'Line assets', newLineAsset: 'New line asset', assetType: 'Asset type',
      stationKm: 'Station (km)', side: 'Side', inspections: 'Inspections', newInspection: 'New inspection',
      editInspection: 'Edit inspection',
      fromKm: 'From (km)', toKm: 'To (km)', findings: 'Findings', certExpiry: 'Certification expiry',
      campaigns: 'Inspection campaigns', mapView: 'Map view', mapLegend: 'Legend',
      mapNodeAria: 'Pipeline asset on map', noSystems: 'No pipeline systems',
      schematicHint: 'Schematic view of line assets by station',
      deleteSystemConfirm: 'Delete this pipeline system and all its assets?',
      editSystem: 'Edit system', editLineAsset: 'Edit line asset',
      stationFromKm: 'From (km)', stationToKm: 'To (km)',
      stationRangeError: 'Station range must have From < To',
      stationKmRangeError: 'Station (km) must be within the system station range',
      assetCode: 'Asset code', assetName: 'Asset name', inspectionType: 'Inspection type',
      lastInspection: 'Last inspection', certExpirySoon: 'Certification expiring',
      filterType: 'Filter by type', filterSeverity: 'Filter by severity',
      allTypes: 'All types', allSeverities: 'All severities',
      noAssets: 'No line assets', noInspections: 'No inspections',
      deleteLineAssetConfirm: 'Delete this line asset?', deleteInspectionConfirm: 'Delete this inspection?',
      openAsset: 'Open asset', reportRef: 'Report ref',
products: { crude: 'Crude', gas: 'Gas', products: 'Products', water: 'Water' },
    iliImport: 'Import ILI anomalies',
    iliAnomalies: "ILI anomalies",
    depthPct: "Depth (%)",
    lengthMm: "Length (mm)",
    widthMm: "Width (mm)",
    anomalyType: "Type",
    metalLoss: "Metal loss",
    crack: "Crack",
    dent: "Dent",
    failurePressure: "Failure pressure",
    safePressure: "Safe pressure",
    smys: "SMYS (MPa)",
    method: "Method",
    designFactor: "Design factor",
    exceeds: "Exceeds safe pressure",
imported: "Imported {{n}} anomalies ({{ok}} assessed)",
    noIli: "No ILI anomalies loaded",
    opPressure: "Operating pressure",
    types: {
        sectionValve: 'Section valve', blockValve: 'Block valve', flange: 'Flange', fitting: 'Fitting',
        pumpStation: 'Pump station', compressorStation: 'Compressor station', tank: 'Tank', sump: 'Sump',
        valveChamber: 'Valve chamber', crossing: 'Crossing', row: 'Right of way', meteringStation: 'Metering station'
      },
      sides: { left: 'Left', right: 'Right', center: 'Center' },
      inspTypes: {
        ild: 'Inline inspection (ILD)', externalCorrosion: 'External corrosion', visual: 'Visual',
        ut: 'UT thickness', repair: 'Repair', replacement: 'Replacement'
      }
    },

    apm: {
      title: 'Asset performance', assetsBySector: 'Assets by sector', newAsset: 'New asset',
      assetCode: 'Asset code', category: 'Category', criticality: 'Criticality', assetStatus: 'Status',
      metrics: 'Metrics', availability: 'Availability', mtbf: 'MTBF', mttr: 'MTTR', oee: 'OEE',
      failureRate: 'Failure rate', rbi: 'Risk-based inspection', pof: 'Probability of failure',
      cof: 'Consequence of failure', riskScore: 'Risk score', riskBand: 'Risk band',
      inspectionBase: 'Inspection base', nextInspection: 'Next inspection',
      suggestedInterval: 'Suggested interval', events: 'Events', newEvent: 'New event',
      start: 'Start', end: 'End', downtime: 'Downtime', workOrderRef: 'Work order ref',
      healthBySector: 'Health by sector', noAssets: 'No assets',
      deleteAssetConfirm: 'Delete this asset and all its events?',
      name: 'Name', eventType: 'Event type', reprogram: 'Reprogram inspection',
      reprogrammed: 'Inspection reprogrammed', noEvents: 'No events',
      openRecommendations: 'Open recommendations', deleteEventConfirm: 'Delete this event?',
      editAsset: 'Edit asset', availabilityOverride: 'Availability override (%)',
      window90d: 'Last 90 days', windowTotal: 'Total',
      oeePerformance: 'Performance (%)', oeeQuality: 'Quality (%)',
      endBeforeStart: 'End must be after start', riskMatrix: 'Risk matrix',
      riskMatrixDesc: 'Consequence of failure (COF) vs probability of failure (POF)',
      healthTitle: 'Health',
      health: { good: 'Healthy', warn: 'Degraded', bad: 'At risk' },
      crit: { A: 'A', B: 'B', C: 'C' },
      statuses: { running: 'Running', standby: 'Standby', down: 'Down', maintenance: 'Maintenance' },
      bands: { low: 'Low', medium: 'Medium', high: 'High', veryHigh: 'Very high' },
      eventTypes: {
        failure: 'Failure', maintenance: 'Maintenance', unplannedOutage: 'Unplanned outage',
        workOrder: 'Work order', inspection: 'Inspection'
      },
      categories: {
        well: 'Well', platform: 'Platform', fpso: 'FPSO', subsea: 'Subsea', esp: 'ESP',
        suckerRod: 'Sucker rod', gasLift: 'Gas lift', wellheadCompression: 'Wellhead compression',
        separator: 'Separator', storageTank: 'Storage tank', pipeline: 'Pipeline',
        pumpStation: 'Pump station', compressorStation: 'Compressor station', loadingTerminal: 'Loading terminal',
        gasPlant: 'Gas plant', refinery: 'Refinery', distillationUnit: 'Distillation unit',
        hydrodesulfurization: 'Hydrodesulfurization', reformer: 'Reformer', heatExchanger: 'Heat exchanger',
        pump: 'Pump', compressor: 'Compressor', column: 'Column', furnace: 'Furnace',
        utilitySteam: 'Utility — steam', utilityAir: 'Utility — air', utilityNitrogen: 'Utility — nitrogen',
        centrifugalPump: 'Centrifugal pump (API 610)', reciprocatingPump: 'Positive displacement pump',
        generator: 'Power generator (ISO 8528)', substation: 'Electrical substation',
        firePump: 'Fire pump (NFPA 20)', fireSystem: 'Fire protection system'
      },
      iso14224: {
        failureMode: 'Failure mode (ISO 14224)', failureConsequence: 'Consequence (ISO 14224)',
        failureModes: {
          mechanical: 'Mechanical', wear: 'Wear', fatigue: 'Fatigue',
          corrosion: 'Corrosion', electrical: 'Electrical', instrumentation: 'Instrumentation',
          other: 'Other'
        },
        consequences: { none: 'None', personal: 'Personal', environment: 'Environment', costs: 'Costs' }
      }
    },

    reliability: {
      title: 'Reliability (ISO 14224)',
      beta: 'β',
      eta: 'η',
      b10: 'B10',
      pattern: 'Pattern',
      patterns: {
        earlyLife: 'Early-life',
        random: 'Random',
        wearOut: 'Wear-out',
        insufficient: 'Insufficient'
      },
      mtbfCi: 'MTBF (CI 90%)',
      probFail: 'P(failure)',
      needEvents: 'Need at least 2 failure events with time-between-failure data for reliability analysis'
    },

    caseFile: {
      title: 'Expedient (.iwf)',
      exportBtn: 'Export expedient (.iwf)',
      importBtn: 'Import expedient (.iwf)',
      exported: 'Expedient exported',
      imported: 'Expedient imported',
      badJson: 'Invalid file format (not JSON)',
      badFormat: 'Not a valid .iwf expedition file',
      badVersion: 'Unsupported .iwf version',
      badChecksum: 'File has been tampered with (checksum mismatch)'
    },

    ingest: {
      title: 'Data ingest', csvImport: 'CSV import', chooseFile: 'Choose file', orDrop: 'or drop file here',
      delimiterDetected: 'Delimiter detected', columnMapping: 'Column mapping', mapTo: 'Map to',
      runValidation: 'Run validation', importBtn: 'Import', resultSummary: 'Result summary',
      rowsTotal: 'Total rows', rowsOk: 'Rows imported', rowsSkipped: 'Rows skipped',
      rowsError: 'Rows with errors', createMissing: 'Create missing points', duplicatesSkipped: 'Duplicates skipped',
      witsmlImport: 'WITSML import', witsmlNote: 'WITSML-lite subset supported',
      importHistory: 'Import history', queueTitle: 'Sync queue', queuePending: 'Pending operations',
      syncEndpoint: 'Sync endpoint', endpointNote: 'Configure a sync endpoint to enable offline queue flush',
      jsonExport: 'JSON export', jsonImport: 'JSON import', modeMerge: 'Merge', modeReplace: 'Replace',
      importConfirmReplace: 'Replace will clear existing data for the imported stores. Continue?',
      downloadBackup: 'Download backup',
      wells: 'Wells', stations: 'Stations', channels: 'Channels', witsmlErrors: 'Errors',
      fileName: 'File', flush: 'Flush queue', importDone: 'Import complete',
      jsonResult: 'Created {{created}}, updated {{updated}}, deleted {{deleted}}',
      deadCount: 'Dead operations',
      tooLarge: 'File too large (limit {{limit}} MB)',
      tooManyRows: 'Too many rows (limit {{limit}})',
      canonical: {
        mpCode: 'Monitoring point', date: 'Date', crMpy: 'Corrosion rate (mpy)',
        wiMg: 'Initial weight (mg)', wfMg: 'Final weight (mg)', areaIn2: 'Area (in²)', days: 'Days',
        inhibitorResidualPpm: 'Inhibitor residual (ppm)', tempC: 'Temperature (°C)', bswPct: 'BS&W (%)',
        category: 'Category', note: 'Note'
      },
      errorCodes: {
        E_ID: 'Missing or duplicate point id', E_DATE_FORMAT: 'Invalid date format',
        E_DATE_FUTURE: 'Date is in the future', E_WF: 'Final weight greater than initial',
        E_MP_UNKNOWN: 'Unknown monitoring point', E_RANGE: 'Value out of range', E_EMPTY: 'Empty required field',
        E_WITSML_POINT: 'Invalid WITSML point'
      }
    },

    rules: {
      title: 'Rules & recommendations', open: 'Open', acked: 'Acknowledged', resolved: 'Resolved',
      acknowledge: 'Acknowledge', resolve: 'Resolve', reopen: 'Reopen',
      autoReopenNote: 'Reopened automatically because the condition reappeared',
      entity: 'Entity', rule: 'Rule', condition: 'Condition', noRecs: 'No recommendations',
      filterStatus: 'Filter by status', sweepInterval: 'Sweep interval', runNow: 'Run now',
      lastRun: 'Last run', newCriticalToast: 'New critical recommendation',
alarmBannerCritical: '{{n}} critical alarms active · {{total}} open recommendations',
      alarmBannerWarning: '{{n}} warnings active · {{total}} open recommendations',
      resolveNotePlaceholder: 'Resolution note',
      actor: 'Actor', history: 'History', lastTriggered: 'Last triggered', triggerCount: 'Triggers',
      msg: {
        R1: '{{code}}: corrosion rate {{cr}} mpy exceeds 10 mpy in the last 24 h',
        R2: '{{code}}: 7-day average {{avg7}} mpy is {{ratio}}× the 30-day average ({{avg30}} mpy)',
        R3: '{{code}}: inhibitor efficiency {{ei}}% is below 70%',
        R4: '{{code}}: inhibitor residual at {{pct}}% of target (band: {{band}})',
        R5: '{{code}}: sensor anomaly detected (reason: {{reason}})',
        R6: '{{code}}: coupon has expired ({{days}} days since end date)',
        R7: '{{code}}: measured/model corrosion ratio {{ratio}} (measured {{measured}} mpy, model {{model}} mpy)',
        R8: '{{code}}: sour service pH₂S {{ph2sKpa}} kPa (level: {{level}})',
        R9: '{{name}}: RBI inspection overdue by {{days}} days',
        R10: '{{name}}: MTBF dropped from {{mtbfPrev}} h to {{mtbfNow}} h in the last 90 days',
        R11: '{{name}}: availability {{pct}}% below threshold {{threshold}}%',
        R12: '{{name}}: {{count}} failure events in the last 90 days',
        R13: '{{tag}}: PSV test overdue by {{days}} days',
        R14: '{{tag}}: installed capacity is below required (margin {{margin}}%)',
        R15: '{{code}}: estimated remaining life {{rulMonths}} months below 12 (confidence: {{confidence}})',
        R16: '{{tag}}: PSV inspection overdue (API 576)',
        R17: '{{code}}: ILI anomaly requires pressure above safe limit ({{required}} > {{safe}} bar)',
        R18: '{{code}}: CUI screening result — {{risk}} risk level',
        R19: '{{code}}: MIC screening score {{score}}/15 — high risk'
      },
      name: {
        R1: 'Critical corrosion rate', R2: 'Corrosion rate escalation', R3: 'Low inhibitor efficiency',
        R4: 'Inhibitor residual out of band', R5: 'Sensor anomaly', R6: 'Coupon expired',
        R7: 'Model deviation', R8: 'Sour service screening', R9: 'Inspection overdue',
        R10: 'MTBF degradation', R11: 'Availability below threshold', R12: 'Repeated failures',
        R13: 'PSV test overdue', R14: 'Undersized relief valve', R15: 'Critical remaining life',
        R16: 'PSV inspection overdue',
        R17: 'ILI anomaly exceeding safe pressure',
        R18: 'CUI high risk',
        R19: 'MIC high risk'
      },
      histActions: { created: 'Created', triggered: 'Triggered', acked: 'Acknowledged', resolved: 'Resolved', reopened: 'Reopened' }
    },

    reports: {
      title: 'Reports', quarterly: 'Quarterly report', dossier: 'Point dossier', datasheet: 'PSV datasheet',
      period: 'Period', periodFrom: 'From', periodTo: 'To', generate: 'Generate',
      cover: 'Quarterly integrity report', coverSubtitle: 'Corrosion and integrity KPIs',
      kpis: 'Key indicators', weeklyChartTitle: 'Average weekly corrosion rate',
      weeklyChartAlt: 'Chart of average weekly corrosion rate', topCritical: 'Top critical points',
      eiByPairs: 'Inhibitor efficiency by pair', campaignsTable: 'Inspection campaigns',
      recsSummary: 'Recommendations summary', recsOpen: 'Open', recsAcked: 'Acknowledged',
      recsResolved: 'Resolved', ruleName: 'Rule name', standardsApplied: 'Standards applied', methodology: 'Methodology',
      methodologyBody: 'Rates derived from coupon weight loss (ASTM G4) and process models (De Waard–Milliams).',
      disclaimer: 'Support tool. Always validate against current editions of standards and manufacturer data.',
      generatedAt: 'Generated', pageFooter: 'IntegrityWatch Field', noData: 'No data for this period',
      associatedPsvs: 'Associated PSVs', associationCriterion: 'No PSV is explicitly linked to this point; associated valves are matched by location and system',
      astmCalc: 'ASTM G4 weight-loss calculation', avgCr: 'Average corrosion rate', band: 'Band',
      coefficientC: 'Coefficient C', cr: 'Corrosion rate', datasheetFields: 'Datasheet fields',
      datasheetTitle: 'PSV datasheet', deltaW: 'Weight loss (ΔW)', dossierTitle: 'Point dossier',
      eiPct: 'Inhibitor efficiency (%)', f2: 'F2', kpiAvailability: 'Avg availability',
      kpiAvgCr: 'Avg corrosion rate', methodologySources: 'Sources: ASTM G4, NACE/AMPP SP0775, API 520 Part I, API 526, NACE MR0175/ISO 15156.',
      pointInfo: 'Point information', reynolds: 'Re', screening: 'Screening',
      selectPoint: 'Select point', selectPsv: 'Select PSV', source: 'Source', testDates: 'Test dates',
      week: 'Week'
    },

    glossary: {
      title: 'Glossary', term: 'Term', definition: 'Definition', category: 'Category', reference: 'Reference',
      searchPlaceholder: 'Search terms', noResults: 'No results', resultsCount: 'results',
      categories: {
        corrosion: 'Corrosion', psv: 'Relief valves', pipeline: 'Pipeline',
        apm: 'Asset performance', standards: 'Standards', data: 'Data'
      }
    },

    admin: {
      title: 'Admin', about: 'About', version: 'Version', appearance: 'Appearance', locale: 'Language',
      rulesConfig: 'Rules configuration', intervalSec: 'Sweep interval (s)', thresholds: 'Thresholds',
      residualBand: 'Residual band (%)', availabilityThreshold: 'Availability threshold (%)',
      stuckSensor: 'Stuck sensor count', zScore: 'Z-score threshold', dataManagement: 'Data management',
      exportAll: 'Export all', importAll: 'Import all', resetDemo: 'Reset demo data',
      resetDemoConfirm: 'Reset demo data to its initial state?', dangerZone: 'Danger zone',
      clearAll: 'Clear all data', clearAllConfirm: 'Delete ALL data permanently? This cannot be undone.',
      security: 'Security', lockTitle: 'Screen lock', enableLock: 'Enable lock', disableLock: 'Disable lock',
      changePin: 'Change PIN', pin: 'PIN', pinRepeat: 'Repeat PIN', pinMismatch: 'PINs do not match',
      role: 'Role', unlock: 'Unlock', wrongPin: 'Incorrect PIN',
      lockoutWait: 'Too many attempts. Try again later.', storageUsage: 'Storage usage',
      swStatus: 'Service worker', offlineReady: 'Ready for offline use', standardsRef: 'Referenced standards',
      demoLoaded: 'Demo data loaded', typeDelete: 'Type DELETE to confirm',
      forceUpdate: 'Force update', forceUpdateHint: 'Clears the offline cache and reloads the app. Use when an update does not appear.',
      syncInsecure: 'Insecure sync endpoint rejected (use HTTPS, or HTTP on localhost only)',
      syncToken: 'Sync token (Bearer)',
      roles: { admin: 'Admin', operator: 'Operator', engineer: 'Engineer' }
    },

    security: {
      forbidden: 'You do not have permission for this action'
    },

    a11y: {
      skipLink: 'Skip to content', openNav: 'Open navigation', closeNav: 'Close navigation',
      closeDialog: 'Close dialog', tableCaptionPrefix: 'Table:', chartDataTable: 'Chart data table',
      severityIconHint: 'Severity is also encoded by shape and color', dialogTitlePrefix: 'Dialog:'
    },

    fileguard: {
      title: 'Local file mode',
      body: 'You opened IntegrityWatch Field from a local file (file://). The app works, but PWA installation and automatic updates require a local server.',
      copyWin: 'On Windows, double-click START-HERE.bat or run tools/serve.ps1.',
      copyPy: 'Alternatively, run tools/serve.py from a terminal.',
      copyBat: 'This launcher script requires Windows.',
      dismiss: 'Dismiss'
    },

    fluids: {
      methane: 'Methane', ethane: 'Ethane', propane: 'Propane', butane: 'Butane',
      'natural-gas': 'Natural gas', hydrogen: 'Hydrogen', nitrogen: 'Nitrogen', steam: 'Steam',
      water: 'Water', 'crude-oil': 'Crude oil', diesel: 'Diesel'
    },

    evidence: {
      sectionTitle: 'Field evidence',
      signature: { label: 'Signature', hint: 'Draw your signature above', clear: 'Clear', empty: 'No signature' },
      photos: { label: 'Photos', hint: 'JPEG photos (max 6). EXIF date and GPS are extracted automatically.', tooMany: 'Maximum 6 photos allowed', noExif: 'No EXIF data' },
      sketch: { label: 'Sketch', hint: 'Draw a quick sketch above', clear: 'Clear' }
    }
  };
});
