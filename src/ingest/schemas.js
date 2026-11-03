/* IntegrityWatch Field — ingest/schemas
   Catalogo de esquemas de import para las 9 entidades persistibles. Los nombres
   de campo, enums y unidades canonicas se copiaron de src/data/seed.js y de los
   payloads de guardado de src/views/{corrosion,psv,pipelines,apm}.js; los campos
   recalculados por store.js/src/calc* van marcados derived:true (no son destino
   de mapeo). Aliases en forma canonicalize() para que mapping.js los compare
   igual que src/ingest/units.js. */
(function (root, factory) {
  'use strict';
  if (typeof require === 'function' && !(root.IW && root.IW.ingest && root.IW.ingest.units)) {
    try { require('./units.js'); } catch (e) { /* ignore */ }
  }
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.ingest = root.IW.ingest || {};
  root.IW.ingest.schemas = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function U() { return root.IW && root.IW.ingest && root.IW.ingest.units; }

  function F(name, aliases, type, required, opts) {
    var f = { name: name, aliases: aliases, type: type, required: !!required };
    if (opts) {
      Object.keys(opts).forEach(function (k) { f[k] = opts[k]; });
    }
    return f;
  }

  var SECTORS = ['upstream', 'midstream', 'downstream'];
  var SENSOR_TYPES = ['couponGravimetric', 'erProbe', 'lprProbe', 'h2Probe', 'utInspection', 'visual'];
  var COUPON_ROLES = ['blank', 'inhibited'];
  var COUPON_STATUS = ['active', 'retired'];
  var READING_SOURCES = ['manual', 'import', 'seed'];
  var VALVE_TYPES = ['conventional', 'balanced', 'pilot'];
  var FLUID_PHASES = ['gas', 'liquid'];
  var INSP_RESULTS = ['pass', 'fail', 'na'];
  var PSV_STATUSES = ['ok', 'due', 'overdue'];
  var PRODUCTS = ['crude', 'gas', 'products', 'water'];
  var LINE_ASSET_TYPES = ['sectionValve', 'blockValve', 'flange', 'fitting', 'pumpStation', 'compressorStation', 'tank', 'sump', 'valveChamber', 'crossing', 'row', 'meteringStation'];
  var LINE_SIDES = ['left', 'right', 'center'];
  var INSP_TYPES = ['ild', 'externalCorrosion', 'visual', 'ut', 'repair', 'replacement'];
  var SEVERITIES = ['low', 'moderate', 'high', 'severe'];
  var EVENT_TYPES = ['failure', 'maintenance', 'unplannedOutage', 'workOrder', 'inspection'];
  var ASSET_STATUSES = ['running', 'standby', 'down', 'maintenance'];
  var CRITICALITIES = ['A', 'B', 'C'];
  var ISO_FAILURE_MODES = ['mechanical', 'wear', 'fatigue', 'corrosion', 'electrical', 'instrumentation', 'other'];
  var ISO_FAILURE_CONSEQUENCES = ['none', 'personal', 'environment', 'costs'];
  // Union de apm.js SECTOR_CATEGORIES + 'sensor' (seed APM-DN-005 lo usa; el
  // select del formulario es por sector, el catalogo de import es plano).
  var APM_CATEGORIES = ['well', 'platform', 'fpso', 'subsea', 'esp', 'suckerRod', 'gasLift', 'wellheadCompression', 'separator', 'storageTank', 'centrifugalPump', 'generator', 'firePump', 'fireSystem', 'pipeline', 'pumpStation', 'compressorStation', 'loadingTerminal', 'gasPlant', 'reciprocatingPump', 'substation', 'refinery', 'distillationUnit', 'hydrodesulfurization', 'reformer', 'heatExchanger', 'pump', 'compressor', 'column', 'furnace', 'utilitySteam', 'utilityAir', 'utilityNitrogen', 'sensor'];

  var MP_ID_ALIASES = ['mpid', 'mp_id', 'punto', 'punto_de_monitoreo', 'code', 'codigo', 'tag', 'mp', 'point', 'monitoring_point', 'id_punto', 'point_code'];

  var SCHEMAS = {
    monitoringPoints: {
      store: 'monitoringPoints',
      labelEs: 'Puntos de monitoreo',
      // corrosion.js openMpForm valida unicidad de `code` (codeDuplicate).
      naturalKey: ['code'],
      fields: [
        F('code', ['codigo', 'tag', 'point_code', 'mp_code', 'codigo_punto', 'punto', 'mp', 'monitoring_point'], 'string', true, { maxLen: 64 }),
        F('name', ['name', 'nombre', 'point_name', 'nombre_punto', 'designation'], 'string', false, { maxLen: 160 }),
        F('sector', ['sector', 'tramo', 'segment', 'area_operacion'], 'enum', true, { enum: SECTORS }),
        F('systemId', ['system_id', 'sistema', 'line_system', 'id_sistema'], 'string', false, { maxLen: 64 }),
        F('line', ['linea', 'line', 'tramo_linea', 'pipeline_name', 'route'], 'string', false, { maxLen: 160 }),
        F('material', ['material', 'acero', 'steel_grade', 'steel', 'grado_material'], 'string', true, { maxLen: 48 }),
        F('sensorType', ['sensor_type', 'tipo_sensor', 'sensor', 'tecnologia', 'technology', 'measurement_type'], 'enum', true, { enum: SENSOR_TYPES }),
        F('tNom', ['t_nom', 'tnom', 'espesor_nominal', 'nominal_thickness', 'espesor_nominal_mm', 'wall_nominal'], 'number', false, { unit: 'longitud', toUnit: 'mm', min: 0 }),
        F('tMin', ['t_min', 'tmin', 'espesor_minimo', 'minimum_thickness', 't_min_mm', 'wall_min'], 'number', false, { unit: 'longitud', toUnit: 'mm', min: 0 }),
        F('stationKm', ['estacion_km', 'station_km', 'estacion', 'station', 'pk', 'km_punto'], 'number', false, { unit: 'estacion', toUnit: 'km', min: 0 }),
        F('location', ['ubicacion', 'location', 'sitio', 'site', 'localizacion'], 'string', false, { maxLen: 200 }),
        F('notes', ['notes', 'notas', 'observaciones', 'comment', 'comments'], 'string', false, { maxLen: 4000 }),
        F('process.h2sPpm', ['h2s', 'h2s_ppm', 'sulfuro_hidrogeno', 'h2s_concentration', 'ph2s'], 'number', false, { min: 0 }),
        F('process.co2Ppm', ['co2', 'co2_ppm', 'dioxido_carbono', 'co2_concentration', 'pco2'], 'number', false, { min: 0 }),
        F('process.totalPressureKpa', ['total_pressure_kpa', 'presion_total', 'total_pressure', 'presion', 'pressure_kpa', 'presion_kpa', 'presion_psi', 'total_press'], 'number', false, { unit: 'presion', toUnit: 'kpa', gt: 0 }),
        F('process.tempC', ['temp_c', 'temperatura', 'temperature', 'temperature_c', 'temp', 'process_temperature', 'temperatura_proceso'], 'number', false, { unit: 'temperatura', toUnit: 'c' }),
        F('process.bswPct', ['bsw', 'bsw_pct', 'agua_y_sedimentos', 'bsw_percent', 'bs_w', 'agua_sedimentos'], 'number', false, { min: 0, max: 100 }),
        F('process.velocityMs', ['velocity', 'velocidad', 'velocity_ms', 'velocidad_m_s', 'flow_velocity', 'velocidad_flux'], 'number', false, { min: 0 }),
        F('process.inhibitorTargetPpm', ['inhibitor_target', 'target_ppm', 'inhibidor_objetivo', 'meta_inhibidor', 'inhibitor_target_ppm', 'target_inhibitor'], 'number', false, { min: 0 }),
        F('process.inhibitorResidualPpm', ['residual', 'residual_ppm', 'inhibidor_residual', 'inhibitor_residual_ppm', 'residual_inhibitor', 'residual_inhibidor'], 'number', false, { min: 0 }),
        F('cp.enabled', ['cp_enabled', 'cathodic_protection', 'proteccion_catodica', 'cp', 'catodica'], 'bool', false),
        F('cp.potentialMvCse', ['cp_potential', 'potential_mv_cse', 'potential_cse', 'potencial_cp', 'potencial_cse', 'pipe_to_soil'], 'number', false),
        F('cp.polarizationMv', ['cp_polarization', 'polarization_mv', 'polarizacion_cp', 'polarizacion', 'instant_off'], 'number', false),
        F('cui.insulated', ['insulated', 'aislado', 'aislamiento', 'cui_insulated', 'bajo_abrigo'], 'bool', false),
        F('cui.jacketType', ['jacket_type', 'tipo_chaqueta', 'chaqueta', 'jacket', 'tipo_de_chaqueta'], 'string', false, { maxLen: 60 }),
        F('cui.lastInspISO', ['last_cui_inspection', 'ultima_inspeccion_cui', 'cui_last', 'last_cui_insp', 'cui_inspection_date'], 'date', false)
      ]
    },
    readings: {
      store: 'readings',
      labelEs: 'Lecturas de corrosión',
      // seed/csv.js: la unicidad de negocio es mpId+fecha (id lo asigna el sistema).
      naturalKey: ['mpId', 'date'],
      fields: [
        F('mpId', MP_ID_ALIASES, 'string', true, { maxLen: 64 }),
        F('date', ['fecha', 'date', 'reading_date', 'fecha_lectura', 'fecha_de_lectura', 'datetime', 'measure_date'], 'date', true),
        F('crMpy', ['valor', 'cr', 'mpy', 'rate', 'crmpy', 'cr_mpy', 'tasa', 'tasa_corrosion', 'tasa_de_corrosion', 'corrosion_rate', 'corrosionrate', 'lectura', 'reading', 'measurement'], 'number', true, { unit: 'tasaCorrosion', toUnit: 'mpy', min: 0, max: 1000 }),
        F('source', ['source', 'origen', 'procedencia', 'data_source', 'src'], 'enum', false, { enum: READING_SOURCES, default: 'import' }),
        F('note', ['note', 'nota', 'comentario', 'remarks', 'comment'], 'string', false, { maxLen: 1000 })
      ]
    },
    coupons: {
      store: 'coupons',
      labelEs: 'Coupons gravimétricos',
      // El "codigo del coupon" real es el id asignado por la vista (CP-<pair>-<role>);
      // la fecha de extraccion (endDate) es OPCIONAL en el formulario, asi que la
      // identidad de negocio estable es mpId+pairId+role (par dentro del punto).
      naturalKey: ['mpId', 'pairId', 'role'],
      fields: [
        F('mpId', MP_ID_ALIASES, 'string', true, { maxLen: 64 }),
        F('pairId', ['pair', 'pair_id', 'par', 'cupon_par', 'group', 'serie'], 'string', false, { maxLen: 32 }),
        F('role', ['role', 'rol', 'tipo_cupon', 'coupon_role', 'coupon_type'], 'enum', true, { enum: COUPON_ROLES }),
        F('material', ['material', 'acero', 'steel', 'steel_grade', 'grado'], 'string', true, { maxLen: 48 }),
        F('densityGcm3', ['density', 'densidad', 'density_gcm3', 'densidad_g_cm3', 'specific_density', 'density_gr_cm3'], 'number', true, { gt: 0 }),
        F('wiMg', ['wi', 'w_i', 'wi_mg', 'peso_inicial', 'initial_weight', 'initial_mass'], 'number', true, { unit: 'masa', toUnit: 'mg', min: 0 }),
        F('wfMg', ['wf', 'w_f', 'wf_mg', 'peso_final', 'final_weight', 'final_mass'], 'number', true, { unit: 'masa', toUnit: 'mg', min: 0 }),
        F('areaIn2', ['area', 'a', 'a_in2', 'exposed_area', 'exposed_area_in2', 'exposure_area', 'area_exposicion'], 'number', true, { gt: 0 }),
        F('days', ['days', 'dias', 'exposure_days', 'dias_de_exposicion', 'exposed_days', 'duration', 'duracion'], 'number', true, { gt: 0 }),
        F('startDate', ['install_date', 'start_date', 'fecha_instalacion', 'fecha_inicio', 'exposure_start', 'inicio_exposicion'], 'date', false),
        F('endDate', ['retrieval_date', 'end_date', 'fecha_extraccion', 'fecha_fin', 'pull_date', 'extraction_date', 'retiro'], 'date', false),
        F('status', ['status', 'estado', 'coupon_status'], 'enum', false, { enum: COUPON_STATUS, default: 'active' }),
        F('crMpy', ['crmpy', 'corrosion_rate', 'tasa_corrosion', 'mpy_derived', 'final_rate'], 'number', false, { derived: true }),
        F('exposedHours', ['exposed_hours', 'horas_expuestas', 'hours', 'exposure_hours', 'tiempo_expuesto'], 'number', false, { derived: true })
      ]
    },
    psvs: {
      store: 'psvs',
      labelEs: 'Válvulas de seguridad (PSV)',
      // psv.js: rec.id = rec.tag y la unicidad se valida sobre `tag`.
      naturalKey: ['tag'],
      fields: [
        F('tag', ['tag', 'psv', 'psv_tag', 'etiqueta', 'asset_tag', 'codigo_psv', 'number'], 'string', true, { maxLen: 64 }),
        F('assetId', ['asset_id', 'activo', 'equipment_ref', 'id_activo', 'train'], 'string', false, { maxLen: 64 }),
        F('location', ['location', 'ubicacion', 'installed_location', 'service_location', 'posicion'], 'string', false, { maxLen: 200 }),
        F('valveType', ['valve_type', 'tipo_valvula', 'valve', 'type_valve', 'construccion'], 'enum', false, { enum: VALVE_TYPES, default: 'conventional' }),
        F('fluidId', ['fluid_id', 'fluido', 'fluid', 'service_fluid_id'], 'string', false, { maxLen: 48 }),
        F('fluid.name', ['fluid_name', 'nombre_fluido', 'fluido_nombre', 'fluid_description', 'name_fluid'], 'string', false, { maxLen: 60 }),
        F('fluid.phase', ['phase', 'fase', 'fluid_phase', 'state', 'servicio'], 'enum', false, { enum: FLUID_PHASES }),
        F('fluid.M', ['m', 'molar_mass', 'masa_molar', 'mw', 'molecular_weight', 'weight_molecular'], 'number', false, { gt: 0 }),
        F('fluid.Z', ['z', 'compressibility', 'compresibilidad', 'z_factor', 'super_compressibility'], 'number', false, { gt: 0 }),
        F('fluid.k', ['k', 'isentropic', 'gamma', 'specific_heat_ratio', 'relacion_calores', 'isentropic_coefficient'], 'number', false, { gt: 0 }),
        F('fluid.G', ['g', 'specific_gravity', 'gravedad_especifica', 'sg', 'liquid_gravity'], 'number', false, { gt: 0 }),
        F('fluid.viscCp', ['visc', 'viscosity', 'viscosidad', 'absolute_viscosity', 'viscosity_cp', 'visc_cp'], 'number', false, { min: 0 }),
        F('setPressurePsig', ['set_pressure', 'set_pressure_psig', 'design_pressure_psi', 'design_pressure', 'presion_set', 'presion_de_set', 'psv_set_pressure', 'preset', 'setpoint', 'presion_fijada', 'design_pressure_psig'], 'number', true, { unit: 'presion', toUnit: 'psig', gt: 0 }),
        F('operatingTempF', ['operating_temp_f', 'temperature_f', 'temperature', 'temp_f', 'operating_temperature', 'temperatura_operacion', 'relieving_temperature'], 'number', false, { unit: 'temperatura', toUnit: 'f' }),
        // backPressure admite 0: los PSV del seed descargan a atmosfera (0 psig).
        F('backPressurePsig', ['back_pressure', 'back_pressure_psig', 'contrapresion', 'built_up_backpressure', 'backpressure', 'superimposed_backpressure'], 'number', false, { unit: 'presion', toUnit: 'psig', min: 0 }),
        F('Wlbh', ['wlbh', 'required_flow_lb_h', 'capacity_lb_h', 'flow_rate_lbh', 'flujo_masa_lbh', 'required_capacity_lbh'], 'number', false, { min: 0 }),
        F('Qgpm', ['qgpm', 'required_flow_gpm', 'flow_rate_gpm', 'flujo_gpm', 'required_capacity_gpm', 'capacity_gpm'], 'number', false, { min: 0 }),
        F('Kd', ['kd', 'discharge_coefficient', 'coeficiente_descarga', 'derated_kd', 'kd_coefficient'], 'number', false, { min: 0, max: 1 }),
        F('Kc', ['kc', 'combination_factor', 'factor_combinacion', 'backpressure_combination', 'kc_coefficient'], 'number', false, { min: 0, max: 1 }),
        F('certifiedCapacity', ['certified', 'certified_capacity', 'certified_area', 'area_certificada', 'capacity_certificada', 'cert_area_in2'], 'number', false, { gt: 0 }),
        F('lastTestDate', ['last_test', 'last_test_date', 'ultima_prueba', 'test_date_last', 'fecha_ultima_prueba', 'previous_test'], 'date', false),
        F('nextTestDate', ['next_test', 'next_test_date', 'proxima_prueba', 'test_date_next', 'fecha_proxima_prueba', 'scheduled_test'], 'date', false),
        F('inspLast', ['last_insp', 'insp_last', 'ultima_inspeccion', 'last_inspection', 'api576_last', 'inspection_last'], 'date', false),
        F('inspNext', ['next_insp', 'insp_next', 'proxima_inspeccion', 'next_inspection', 'api576_next', 'inspection_due'], 'date', false),
        F('inspResult', ['insp_result', 'inspection_result', 'resultado_inspeccion', 'result', 'api576_result'], 'enum', false, { enum: INSP_RESULTS }),
        F('notes', ['notes', 'notas', 'observations', 'comentarios', 'remark'], 'string', false, { maxLen: 4000 }),
        F('orificeLetter', ['orifice', 'orifice_letter', 'orificio', 'selected_orifice', 'letter'], 'string', false, { derived: true }),
        F('sizing', ['sizing', 'dimensionamiento', 'calculation', 'results', 'sizing_result'], 'string', false, { derived: true }),
        F('status', ['psv_status', 'test_status', 'overdue_status', 'computed_status'], 'enum', false, { enum: PSV_STATUSES, derived: true })
      ]
    },
    pipelineSystems: {
      store: 'pipelineSystems',
      labelEs: 'Sistemas de línea (ductos)',
      // id es aleatorio (newId('sys')); el par negocio name+operator es el
      // identificador estable (criterio del cliente).
      naturalKey: ['name', 'operator'],
      fields: [
        F('name', ['name', 'nombre', 'system_name', 'nombre_sistema', 'pipeline_name', 'line_name'], 'string', true, { maxLen: 160 }),
        F('operator', ['operator', 'operador', 'company', 'operadora', 'licensee', 'compania'], 'string', true, { maxLen: 120 }),
        F('product', ['product', 'producto', 'service', 'commodity', 'fluido_linea'], 'enum', false, { enum: PRODUCTS, default: 'crude' }),
        F('dnIn', ['dn', 'dn_in', 'diameter', 'diametro', 'nominal_diameter', 'diametro_nominal', 'size_in', 'diameter_in'], 'number', true, { unit: 'longitud', toUnit: 'in', gt: 0 }),
        F('wallThicknessMm', ['wall_thickness', 'wall_thickness_mm', 'espesor', 'espesor_pared', 'espesor_mm', 'wall'], 'number', true, { unit: 'longitud', toUnit: 'mm', gt: 0 }),
        F('material', ['material', 'steel', 'steel_grade', 'acero_pipe', 'pipe_material', 'grado_acero'], 'string', false, { maxLen: 48 }),
        F('coating', ['coating', 'recubrimiento', 'revestimiento', 'cover_coating', 'applied_coating', 'external_coating'], 'string', false, { maxLen: 60 }),
        F('lengthKm', ['length', 'length_km', 'longitud', 'longitud_km', 'route_length', 'pipeline_length', 'total_km'], 'number', true, { unit: 'estacion', toUnit: 'km', gt: 0 }),
        F('stationFromKm', ['station_from_km', 'from_km', 'km_inicial', 'start_km', 'pk_from', 'estacion_inicial'], 'number', true, { unit: 'estacion', toUnit: 'km', min: 0 }),
        F('stationToKm', ['station_to_km', 'to_km', 'km_final', 'end_km', 'pk_to', 'estacion_final'], 'number', true, { unit: 'estacion', toUnit: 'km', min: 0 }),
        F('opPressureMpa', ['op_pressure', 'operating_pressure', 'op_pressure_mpa', 'presion_operativa', 'maop', 'maop_bar', 'presion_diseno_linea'], 'number', false, { unit: 'presion', toUnit: 'mpa', gt: 0 }),
        F('notes', ['notes', 'notas', 'comment', 'observaciones', 'remark'], 'string', false, { maxLen: 4000 })
      ]
    },
    lineAssets: {
      store: 'lineAssets',
      labelEs: 'Activos de línea',
      // pipelines.js exige `code` requerido dentro del sistema (en el seed el id
      // ES el codigo); tipo+estacion son descriptivos, no identificadores.
      naturalKey: ['systemId', 'code'],
      fields: [
        F('systemId', ['system_id', 'sistema', 'line_system', 'system', 'id_sistema'], 'string', true, { maxLen: 64 }),
        F('code', ['code', 'codigo', 'asset_code', 'tag', 'nro', 'equipment_id', 'numero_activo'], 'string', true, { maxLen: 64 }),
        F('name', ['name', 'nombre', 'asset_name', 'descripcion', 'description'], 'string', false, { maxLen: 160 }),
        F('type', ['type', 'asset_type', 'tipo', 'tipo_activo', 'category', 'equipment_type'], 'enum', false, { enum: LINE_ASSET_TYPES, default: 'sectionValve' }),
        F('stationKm', ['station_km', 'estacion_km', 'estacion', 'station', 'pk', 'km'], 'number', true, { unit: 'estacion', toUnit: 'km', min: 0 }),
        F('side', ['side', 'lado', 'position', 'orientacion', 'ubicacion_lado'], 'enum', false, { enum: LINE_SIDES, default: 'center' }),
        F('certExpiryISO', ['cert_expiry', 'cert_expiry_iso', 'vencimiento_certificado', 'expiry', 'cert_expiry_date', 'fecha_vencimiento', 'cert_due'], 'date', false),
        F('lastInspectionISO', ['last_inspection', 'ultima_inspeccion', 'last_inspection_iso', 'fecha_ultima_inspeccion', 'previous_inspection'], 'date', false),
        F('notes', ['notes', 'notas', 'comment', 'observaciones', 'remark'], 'string', false, { maxLen: 4000 })
      ]
    },
    lineInspections: {
      store: 'lineInspections',
      labelEs: 'Inspecciones de línea',
      // campaigns = tipo+mes por sistema; id es aleatorio. lineAssetId es
      // opcional (el seed lo omitio en la visual del tanque), asi que la clave
      // negocio es systemId+date+type (criterio del cliente adaptado).
      // signature/photos/sketch se EXCLUYEN del import: evidencia binaria
      // (dataURL) capturada en el formulario, no columnas CSV/XLSX.
      naturalKey: ['systemId', 'date', 'type'],
      fields: [
        F('systemId', ['system_id', 'sistema', 'line_system', 'system', 'id_sistema'], 'string', true, { maxLen: 64 }),
        F('date', ['date', 'fecha', 'inspection_date', 'fecha_inspeccion', 'insp_date', 'executed_on'], 'date', true),
        F('type', ['type', 'insp_type', 'inspection_type', 'tipo', 'tipo_inspeccion', 'metodo'], 'enum', true, { enum: INSP_TYPES, default: 'visual' }),
        F('lineAssetId', ['line_asset_id', 'asset_id', 'activo', 'id_activo', 'asset_ref', 'equipment_id'], 'string', false, { maxLen: 64 }),
        F('fromKm', ['from_km', 'desde_km', 'km_inicial', 'start_km', 'from', 'chainage_from'], 'number', false, { unit: 'estacion', toUnit: 'km', min: 0 }),
        F('toKm', ['to_km', 'hasta_km', 'km_final', 'end_km', 'to', 'chainage_to'], 'number', false, { unit: 'estacion', toUnit: 'km', min: 0 }),
        F('severity', ['severity', 'severidad', 'nivel', 'finding_severity', 'impact'], 'enum', false, { enum: SEVERITIES }),
        F('findings', ['findings', 'hallazgos', 'observation', 'observations', 'detalle_hallazgo', 'resultado'], 'string', false, { maxLen: 4000 }),
        F('reportRef', ['report_ref', 'report', 'referencia', 'informe', 'report_id', 'source_report'], 'string', false, { maxLen: 120 })
      ]
    },
    apmAssets: {
      store: 'apmAssets',
      labelEs: 'Activos APM',
      // apm.js no valida duplicados: `code` es el tag de negocio del activo (id
      // es aleatorio via newId('apm')), se usa code como clave natural.
      naturalKey: ['code'],
      fields: [
        F('code', ['code', 'codigo', 'asset_code', 'tag', 'equipment_id', 'nro', 'kks'], 'string', true, { maxLen: 64 }),
        F('name', ['name', 'nombre', 'asset_name', 'equipo', 'equipment_name', 'descripcion'], 'string', true, { maxLen: 160 }),
        F('sector', ['sector', 'tramo', 'segment', 'area', 'etapa'], 'enum', false, { enum: SECTORS, default: 'upstream' }),
        F('category', ['category', 'categoria', 'equipment_category', 'tipo', 'asset_type', 'clase'], 'enum', false, { enum: APM_CATEGORIES }),
        F('criticality', ['criticality', 'criticidad', 'clase_critica', 'critical_class', 'tier', 'clave'], 'enum', false, { enum: CRITICALITIES, default: 'C' }),
        F('status', ['status', 'estado', 'asset_status', 'operating_status', 'condicion'], 'enum', false, { enum: ASSET_STATUSES, default: 'running' }),
        F('iso14224.failureMode', ['failure_mode', 'modo_falla', 'iso_failure_mode', 'modo_de_falla', 'fmea_mode'], 'enum', false, { enum: ISO_FAILURE_MODES }),
        F('iso14224.failureConsequence', ['failure_consequence', 'consecuencia_falla', 'iso_failure_consequence', 'consecuencia', 'impact_type'], 'enum', false, { enum: ISO_FAILURE_CONSEQUENCES }),
        F('rbi.pof', ['pof', 'probability_of_failure', 'probabilidad_falla', 'probabilidad', 'p_of_f', 'occurrence'], 'number', false, { min: 1, max: 5, default: 1 }),
        F('rbi.cof', ['cof', 'consequence_of_failure', 'consecuencia_rbi', 'consecuencia_de_falla', 'c_of_f', 'severity_rbi'], 'number', false, { min: 1, max: 5, default: 1 }),
        F('rbi.inspectionBaseMonths', ['inspection_base_months', 'inspection_base', 'base_meses', 'meses_base', 'base_interval', 'interval_months'], 'number', false, { min: 1, default: 24 }),
        F('rbi.nextInspectionISO', ['next_inspection', 'next_inspection_iso', 'proxima_inspeccion', 'inspection_due', 'fecha_proxima_inspeccion', 'due_date'], 'date', false),
        F('availabilityOverridePct', ['availability_override', 'availability_override_pct', 'availability_pct', 'disponibilidad', 'availability_manual', 'override_availability'], 'number', false, { min: 0, max: 100 }),
        F('notes', ['notes', 'notas', 'comment', 'observaciones', 'remark'], 'string', false, { maxLen: 4000 }),
        F('rbi.band', ['risk_band', 'banda_riesgo', 'band', 'risk_matrix_band', 'band_riesgo'], 'string', false, { derived: true }),
        F('rbi.score', ['risk_score', 'score', 'riesgo_score', 'band_score', 'risk_value'], 'number', false, { derived: true })
      ]
    },
    apmEvents: {
      store: 'apmEvents',
      labelEs: 'Eventos APM',
      // id aleatorio; la identidad de negocio es activo+inicio+tipo (el "modo"
      // ISO 14224 vive en apmAssets; el evento lo llama `type`).
      naturalKey: ['assetId', 'start', 'type'],
      fields: [
        F('assetId', ['asset_id', 'activo', 'asset', 'equipment', 'id_activo', 'tag_activo'], 'string', true, { maxLen: 64 }),
        F('type', ['type', 'event_type', 'tipo', 'tipo_evento', 'actividad', 'event'], 'enum', true, { enum: EVENT_TYPES, default: 'failure' }),
        F('start', ['start', 'start_date', 'fecha_inicio', 'inicio', 'event_date', 'date'], 'date', true),
        F('end', ['end', 'end_date', 'fecha_fin', 'fin', 'stop_date', 'event_end'], 'date', false),
        F('downtimeH', ['downtime', 'downtime_h', 'downtime_hours', 'horas_parada', 'parada', 'outage_hours'], 'number', false, { min: 0 }),
        F('description', ['description', 'descripcion', 'detalle', 'notes', 'observacion', 'comment'], 'string', false, { maxLen: 4000 }),
        F('workOrderRef', ['work_order', 'work_order_ref', 'ot', 'orden_trabajo', 'wo_ref', 'mo_ref', 'maintenance_order'], 'string', false, { maxLen: 64 })
      ]
    }
  };

  var ENTITY_ORDER = ['monitoringPoints', 'readings', 'coupons', 'psvs', 'pipelineSystems', 'lineAssets', 'lineInspections', 'apmAssets', 'apmEvents'];

  var NATURAL_KEYS = {};
  ENTITY_ORDER.forEach(function (k) { NATURAL_KEYS[k] = SCHEMAS[k].naturalKey; });

  function fieldByName(store, name) {
    var found = null;
    SCHEMAS[store].fields.some(function (f) { if (f.name === name) { found = f; return true; } return false; });
    return found;
  }

  var indexCache = {};
  function getIndex(store) {
    if (indexCache[store]) { return indexCache[store]; }
    if (!SCHEMAS[store]) { return null; }
    var byHeader = {};
    var byName = {};
    SCHEMAS[store].fields.forEach(function (f) {
      var cn = U().canonicalize(f.name);
      byName[cn] = f;
      if (f.derived) { return; }
      f.aliases.forEach(function (a) { byHeader[a] = f; });
      if (!byHeader[cn]) { byHeader[cn] = f; }
    });
    indexCache[store] = { byHeader: byHeader, byName: byName };
    return indexCache[store];
  }

  function entityList() {
    return ENTITY_ORDER.map(function (k) {
      var s = SCHEMAS[k];
      return { store: s.store, labelEs: s.labelEs, naturalKey: s.naturalKey, fieldCount: s.fields.length };
    });
  }

  function fieldFor(store, headerText) {
    var idx = getIndex(store);
    if (!idx) { return null; }
    var ck = U().canonicalize(headerText);
    if (ck === '') { return null; }
    return idx.byHeader[ck] || null;
  }

  function setPath(obj, path, val) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] === undefined || cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') {
        cur[parts[i]] = {};
      }
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }

  // ultima unidad de la cabecera que resuelve en la dimension del campo
  // ('design_pressure_psi' -> 'psi', 'estacion_km' -> 'km').
  function unitFromHeader(ck, dim) {
    var tokens = String(ck).split('_');
    var unitsTable = U().UNITS[dim].units;
    var found = null;
    tokens.forEach(function (tk) {
      if (Object.prototype.hasOwnProperty.call(unitsTable, tk)) { found = tk; }
    });
    return found;
  }

  // fecha -> 'YYYY-MM-DD' (medianoche UTC recortada) o ISO con hora, o {reason}.
  // Admite serie Excel; full-ISO con milisegundos ('...T00:00:00.000Z') que
  // units.parseDate no cubre entra por el fallback Date.parse.
  function parseDateToIso(raw, preferDMY) {
    var res = U().parseDate(raw, { preferDMY: !!preferDMY });
    if (res.iso) { return res; }
    if (typeof raw === 'string') {
      var ms = Date.parse(raw);
      if (!isNaN(ms)) {
        var isoFull = new Date(ms).toISOString();
        return {
          iso: (ms % 86400000 === 0) ? isoFull.slice(0, 10) : isoFull,
          ambiguous: false, format: 'fallbackISO', reason: null
        };
      }
    }
    return res;
  }

  function coerceDate(field, raw, opts, quality) {
    var res = parseDateToIso(raw, opts.preferDMY);
    if (!res.iso) {
      return { error: { code: 'INVALID_DATE', message: field.name + ': fecha no interpretable (' + (res.reason || 'UNPARSEABLE') + '): ' + JSON.stringify(raw) } };
    }
    if (res.ambiguous) {
      quality.ambiguousDates = quality.ambiguousDates || [];
      quality.ambiguousDates.push({ field: field.name, raw: raw, assumed: res.iso });
    }
    return { value: res.iso };
  }

  var TRUE_TOKENS = { '1': 1, 'si': 1, 'yes': 1, 'y': 1, 'true': 1, 'verdadero': 1 };
  var FALSE_TOKENS = { '0': 1, 'no': 1, 'n': 1, 'false': 1, 'falso': 1 };

  function coerceBool(field, raw) {
    if (raw === true || raw === false) { return { value: raw }; }
    var k = U().canonicalize(raw);
    if (Object.prototype.hasOwnProperty.call(TRUE_TOKENS, k)) { return { value: true }; }
    if (Object.prototype.hasOwnProperty.call(FALSE_TOKENS, k)) { return { value: false }; }
    return { error: { code: 'INVALID_BOOL', message: field.name + ': booleano no reconocible: ' + JSON.stringify(raw) } };
  }

  function rangeError(field, value) {
    if (field.min !== undefined && value < field.min) {
      return { code: 'OUT_OF_RANGE', message: field.name + ' = ' + value + ' por debajo del minimo ' + field.min };
    }
    if (field.max !== undefined && value > field.max) {
      return { code: 'OUT_OF_RANGE', message: field.name + ' = ' + value + ' por encima del maximo ' + field.max };
    }
    if (field.gt !== undefined && !(value > field.gt)) {
      return { code: 'OUT_OF_RANGE', message: field.name + ' = ' + value + ' debe ser > ' + field.gt };
    }
    if (field.lt !== undefined && !(value < field.lt)) {
      return { code: 'OUT_OF_RANGE', message: field.name + ' = ' + value + ' debe ser < ' + field.lt };
    }
    return null;
  }

  function finishNumber(field, value) {
    var e = rangeError(field, value);
    if (e) { return { error: e }; }
    return { value: value };
  }

  /* coerceNumber: normalizeNumber/stripUnit + convert a la UNIDAD EMBUTIDA en
     el nombre del campo real (totalPressureKpa guarda kPa, setPressurePsig
     guarda psig — convertirlos a bar romperia views/calc). La equivalencia en
     la unidad CANONICA de la dimension (bar para presion) queda registrada en
     __quality.conversions con su basis gauge/abs, como exige la spec. */
  function coerceNumber(field, raw, ck, unitHint) {
    var value = null;
    var srcUnit = null;
    if (typeof raw === 'number') {
      if (!isFinite(raw)) { return { error: { code: 'INVALID_NUMBER', message: field.name + ': numero no finito' } }; }
      value = raw;
    } else if (typeof raw === 'boolean') {
      return { error: { code: 'INVALID_NUMBER', message: field.name + ': se esperaba numero: ' + JSON.stringify(raw) } };
    } else {
      var s = String(raw).trim();
      if (s === '') { return { missing: true }; }
      var st = U().stripUnit(s);
      if (st.value !== null) {
        value = st.value;
        if (st.unit) {
          if (!field.unit) {
            return { error: { code: 'UNIT_ERROR', message: field.name + ': trae unidad "' + st.unit + '" pero el campo no convierte unidades' } };
          }
          var probe = U().convert(st.value, st.unit, field.toUnit, field.unit);
          if (probe.code) {
            return { error: { code: 'UNIT_ERROR', message: field.name + ': unidad no reconocida "' + st.unit + '"' } };
          }
          srcUnit = st.unit;
        }
      } else {
        value = U().normalizeNumber(s);
        if (value === null) {
          return { error: { code: 'INVALID_NUMBER', message: field.name + ': numero no interpretable: ' + JSON.stringify(raw) } };
        }
      }
    }

    if (!field.unit) { return finishNumber(field, value); }
    if (!srcUnit) { srcUnit = unitFromHeader(ck, field.unit) || unitHint || field.toUnit; }
    var conv = U().convert(value, srcUnit, field.toUnit, field.unit);
    if (conv.code) {
      return { error: { code: 'UNIT_ERROR', message: field.name + ': ' + conv.message + ' (' + srcUnit + ' -> ' + field.toUnit + ')' } };
    }
    var ranged = finishNumber(field, conv.value);
    if (ranged.error) { return ranged; }

    var srcCk = U().canonicalize(srcUnit);
    var toCk = U().canonicalize(conv.to);
    var canonicalUnit = U().UNITS[field.unit].canonical;
    var hasBasis = conv.basis && conv.basis !== 'unknown';
    if (srcCk === toCk && !hasBasis && U().canonicalize(canonicalUnit) === toCk) {
      return ranged;
    }
    var entry = { field: field.name, from: conv.from, to: conv.to };
    if (hasBasis) { entry.basis = conv.basis; }
    if (U().canonicalize(canonicalUnit) !== toCk) {
      var canon = U().convert(value, srcUnit, canonicalUnit, field.unit);
      if (!canon.code) {
        entry.canonical = { unit: canonicalUnit, value: canon.value };
        if (!entry.basis && canon.basis && canon.basis !== 'unknown') { entry.basis = canon.basis; }
      }
    }
    if (conv.warnings && conv.warnings.length) { entry.warnings = conv.warnings; }
    return { value: conv.value, conversion: entry };
  }

  /* draftRecord(store, valuesByFieldName, opts) -> {record, errors, __quality}
     - claves: nombre real del campo, nombre canonicalizado o CUALQUIER alias
       del catalogo (mapping.js entrega cabeceras ya canonicalizadas).
     - 'unidad'/'unit' es columna-pista de unidad (no es un campo).
     - NO pone id/createdAt/updatedAt: store.stamp los anade en commit.
     - __quality viaja FUERA del record (los views no conocen campos raiz
       nuevos); readings SI tiene 'source' real y se usa. */
  function draftRecord(store, valuesByFieldName, opts) {
    opts = opts || {};
    var schema = SCHEMAS[store];
    if (!schema) {
      return { record: {}, errors: [{ field: '*', code: 'UNKNOWN_STORE', message: 'entidad desconocida: ' + store }] };
    }
    var idx = getIndex(store);
    var inputs = {};
    var unitHint = null;
    Object.keys(valuesByFieldName || {}).forEach(function (k) {
      var ck = U().canonicalize(k);
      if (ck === '') { return; }
      if (ck === 'unidad' || ck === 'unit') { unitHint = valuesByFieldName[k]; return; }
      var f = idx.byHeader[ck] || idx.byName[ck] || null;
      if (!f || f.derived) { return; }
      inputs[f.name] = { raw: valuesByFieldName[k], ck: ck };
    });

    var record = {};
    var errors = [];
    var conversions = [];
    var warnings = [];
    var quality = { mark: opts.qualityMark || 'medido', sourceFile: opts.sourceFile || null };

    schema.fields.forEach(function (f) {
      var input = inputs[f.name];
      if (input && (input.raw === null || input.raw === undefined ||
          (typeof input.raw === 'string' && input.raw.trim() === ''))) {
        input = null;
      }
      if (!input) {
        if (f.required) {
          errors.push({ field: f.name, code: 'REQUIRED', message: f.name + ' es obligatorio y no vino en la fila' });
        } else if (f.default !== undefined) {
          setPath(record, f.name, f.default);
        }
        return;
      }
      var raw = input.raw;
      var res;
      if (f.type === 'date') {
        res = coerceDate(f, raw, opts, quality);
      } else if (f.type === 'bool') {
        res = coerceBool(f, raw);
      } else if (f.type === 'number') {
        res = coerceNumber(f, raw, input.ck, unitHint);
      } else {
        var str = String(raw).trim();
        if (f.enum) {
          if (f.enum.indexOf(str) === -1) {
            res = { error: { code: 'INVALID_ENUM', message: f.name + ' = "' + str + '" no es un valor valido; validos: ' + f.enum.join(', ') } };
          } else {
            res = { value: str };
          }
        } else if (f.maxLen && str.length > f.maxLen) {
          res = { error: { code: 'TOO_LONG', message: f.name + ' excede ' + f.maxLen + ' caracteres (' + str.length + ')' } };
        } else {
          res = { value: str };
        }
      }
      if (res.error) { errors.push({ field: f.name, code: res.error.code, message: res.error.message }); return; }
      if (res.conversion) {
        if (res.conversion.warnings && res.conversion.warnings.length) {
          warnings.push({ field: f.name, warnings: res.conversion.warnings });
          delete res.conversion.warnings;
        }
        conversions.push(res.conversion);
      }
      setPath(record, f.name, res.value);
    });

    if (conversions.length) { quality.conversions = conversions; }
    if (warnings.length) { quality.warnings = warnings; }
    var draft = { record: record, errors: errors };
    draft.__quality = quality;
    return draft;
  }

  function resolveKeyValue(store, fieldName, obj) {
    if (Object.prototype.hasOwnProperty.call(obj, fieldName)) { return obj[fieldName]; }
    var f = fieldByName(store, fieldName);
    var ck = U().canonicalize(fieldName);
    var candidates = [ck];
    if (f) { candidates = candidates.concat(f.aliases); }
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      if (candidates.indexOf(U().canonicalize(keys[i])) !== -1) { return obj[keys[i]]; }
    }
    return '';
  }

  function keyDateValue(raw) {
    if (raw === null || raw === undefined || raw === '') { return ''; }
    var res = parseDateToIso(raw, false);
    return res.iso ? res.iso : String(raw);
  }

  /* naturalKeyOf(store, recordOrValues) -> 'campo=valor|campo=valor'
     Acepta registros reales del store o un mapa con nombres/alias. Fechas en
     forma ISO normalizada (serie Excel y medianoche UTC se recortan a
     'YYYY-MM-DD' para que la clave sea estable entre formatos). */
  function naturalKeyOf(store, recordOrValues) {
    if (!SCHEMAS[store]) { return ''; }
    var src = recordOrValues || {};
    return SCHEMAS[store].naturalKey.map(function (nf) {
      var raw = resolveKeyValue(store, nf, src);
      var f = fieldByName(store, nf);
      var val;
      if (f && f.type === 'date') {
        val = keyDateValue(raw);
      } else if (raw === null || raw === undefined) {
        val = '';
      } else {
        val = typeof raw === 'string' ? raw.trim() : String(raw);
      }
      return nf + '=' + val;
    }).join('|');
  }

  return {
    SCHEMAS: SCHEMAS,
    ENTITIES: ENTITY_ORDER,
    NATURAL_KEYS: NATURAL_KEYS,
    entityList: entityList,
    fieldFor: fieldFor,
    draftRecord: draftRecord,
    naturalKeyOf: naturalKeyOf,
    fieldByName: fieldByName
  };
});
