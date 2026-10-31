// Category -> IFS symbol mapping (ISO 14224 categories used by the APM module).
// Falls back to a generic symbol so every asset always has a pictogram.
(function (root, factory) {
  var api = factory();
  root.IW = root.IW || {};
  root.IW.symbolMap = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  var BY_CATEGORY = {
    // upstream
    well: 'wellhead',
    platform: 'riser',
    fpso: 'drum',
    subsea: 'wellhead',
    esp: 'pump-centrifugal',
    suckerRod: 'pump-piston',
    gasLift: 'compressor-screw',
    wellheadCompression: 'compressor-piston',
    separator: 'separator-gravity',
    storageTank: 'tank-atmospheric',
    centrifugalPump: 'pump-centrifugal',
    reciprocatingPump: 'pump-piston',
    generator: 'generator',
    firePump: 'pump-centrifugal',
    fireSystem: 'flare',
    // midstream
    pipeline: 'pipeline',
    pumpStation: 'pump-centrifugal',
    compressorStation: 'compressor-centrifugal',
    loadingTerminal: 'barrel',
    gasPlant: 'column',
    substation: 'generator',
    // downstream
    refinery: 'column',
    distillationUnit: 'column',
    hydrodesulfurization: 'column',
    reformer: 'heater',
    heatExchanger: 'hx-tubes',
    pump: 'pump-centrifugal',
    compressor: 'compressor-centrifugal',
    column: 'column',
    furnace: 'furnace',
    utilitySteam: 'heater',
    utilityAir: 'blower',
    utilityNitrogen: 'drum'
  };

  var BY_SENSOR = {
    couponGravimetric: 'corrosion',
    couponUltrasonic: 'corrosion',
    erProbe: 'corrosion',
    manualUt: 'corrosion'
  };

  var BY_LINE_ASSET = {
    valve: 'valve-gate',
    riser: 'riser',
    pig: 'pig-trap',
    flange: 'pipeline-segment',
    tee: 'pipeline-segment',
    pipe: 'pipeline-segment'
  };

  function forCategory(category) {
    return BY_CATEGORY[category] || 'pipeline-segment';
  }

  // Monitoring point: CUI and MIC take precedence over the generic coupon glyph.
  function forPoint(mp) {
    if (!mp) { return 'corrosion'; }
    if (mp.cuiInsulated && mp.cuiRisk && mp.cuiRisk !== 'low') { return 'cui'; }
    if (mp.micRisk && mp.micRisk !== 'low') { return 'mic'; }
    return BY_SENSOR[mp.sensorType] || 'corrosion';
  }

  function forLineAsset(type) {
    return BY_LINE_ASSET[type] || 'pipeline-segment';
  }

  function forRecommendation(rec) {
    if (!rec) { return 'corrosion'; }
    if (rec.entityType === 'psv') { return 'psv'; }
    if (rec.entityType === 'apm') { return 'generator'; }
    if (rec.entityType === 'line') { return 'pipeline-segment'; }
    return 'corrosion';
  }

  function forPsv() { return 'psv'; }

  return {
    BY_CATEGORY: BY_CATEGORY,
    BY_SENSOR: BY_SENSOR,
    BY_LINE_ASSET: BY_LINE_ASSET,
    forCategory: forCategory,
    forPoint: forPoint,
    forLineAsset: forLineAsset,
    forRecommendation: forRecommendation,
    forPsv: forPsv
  };
});
