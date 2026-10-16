# SCHEMA.md — Datos, reglas e i18n (FUENTE DE VERDAD)

Complementa `docs/CONTRACTS.md`. Cualquier campo/clave/clave-i18n usado por el código DEBE existir aquí.

## 1. IndexedDB — base `integritywatch`, versión 1

Stores (keyPath `id` salvo que se indique). Índices obligatorios listados entre `[]`.

| Store | Campos |
|---|---|
| `meta` | keyPath **`key`**: `{key, value}`. Claves: `appVersion, locale, theme, sector, demoLoaded, rulesIntervalSec, lastRulesRunISO, syncEndpoint, lock.enabled, lock.verifier{saltB64,hashB64,iterations}, lock.pepperB64, lock.role, lock.fails, lock.lockedUntilISO, residualBandPct(20), availabilityThresholdPct(90), stuckSensorCount(10), zScoreThreshold(3), autoBackupISO` |
| `monitoringPoints` | `[systemId, sector]` `{id:'MP-CORR-001', code, name, sector:'upstream\|midstream\|downstream', systemId?, line, material (id de IW.data.materials), sensorType:'couponGravimetric\|erProbe\|lprProbe\|h2Probe\|utInspection\|visual', process:{h2sPpm, co2Ppm, totalPressureKpa, tempC, bswPct, velocityMs, inhibitorTargetPpm, inhibitorResidualPpm}, cp:{enabled, potentialMvCse?, polarizationMv?, criteriaNote?}, cui:{insulated, jacketType?, lastInspISO?}, stationKm?, location?, notes?, createdAt, updatedAt}` |
| `readings` | `[mpId, date]` `{id, mpId, date(ISO), crMpy, source:'manual\|import\|seed', note?, createdAt}` |
| `coupons` | `[mpId, pairId]` `{id, mpId, pairId?, role:'blank\|inhibited', material, densityGcm3, wiMg, wfMg, areaIn2, days, exposedHours(=24·days), startDate, endDate, crMpy?, status:'active\|expired\|retired', note?, createdAt, updatedAt}` — CR/EI se calculan al vuelo con `IW.calc.corrosion`, no se persisten (salvo `crMpy` cacheado al guardar). |
| `psvs` | `[assetId, status]` `{id(=tag), tag, assetId?, location?, valveType:'conventional\|balanced\|pilot', fluidId?, fluid:{name, phase:'gas\|liquid', M?, Z?, k?, G?, viscCp?}, setPressurePsig, operatingTempF, backPressurePsig, Wlbh?, Qgpm?, Kd?, Kc?, certifiedCapacity?, orificeLetter?, sizing?:{AreqIn2, critical?, Kv?, Re?, Kb?, Kw?, selectedAreaIn2, WrealLbh?\|QrealGpm?, marginPct, computedAtISO}, lastTestDate?, nextTestDate?, status:'ok\|due\|overdue', notes?, createdAt, updatedAt}` |
| `pipelineSystems` | `[operator]` `{id, name, operator, product:'crude\|gas\|products\|water', dnIn, wallThicknessMm, material, coating?, lengthKm, stationFromKm, stationToKm, notes?, createdAt, updatedAt}` |
| `lineAssets` | `[systemId, stationKm, type]` `{id, systemId, code, name, type:'sectionValve\|blockValve\|flange\|fitting\|pumpStation\|compressorStation\|tank\|sump\|valveChamber\|crossing\|row\|meteringStation', stationKm, side:'left\|right\|center', integritySeverity?:'low\|moderate\|high\|severe', lastInspectionISO?, certExpiryISO?, notes?, createdAt, updatedAt}` |
| `lineInspections` | `[systemId, lineAssetId, date]` `{id, systemId?, lineAssetId?, type:'ild\|externalCorrosion\|visual\|ut\|repair\|replacement', date, fromKm?, toKm?, findings?, severity?:sev, reportRef?, createdAt}` |
| `apmAssets` | `[sector, category, criticality]` `{id, code, name, sector, category (ver §8.4), criticality:'A\|B\|C', status:'running\|standby\|down\|maintenance', rbi:{pof:1..5, cof:1..5, band?, score?, inspectionBaseMonths, nextInspectionISO?}, availabilityOverridePct?, notes?, createdAt, updatedAt}` |
| `apmEvents` | `[assetId, start]` `{id, assetId, type:'failure\|maintenance\|unplannedOutage\|workOrder\|inspection', start(ISO), end?(ISO), downtimeH?, description?, workOrderRef?, createdAt}` |
| `recommendations` | `[status, severity, fingerprint, entityStore]` forma completa en §2 |
| `importLog` | `[at]` `{id, fileName, at, kind:'csv\|witsml\|json', rowsTotal, rowsOk, rowsSkipped, rowsError, errors:[{rowNum, code, field, message}], createdPoints:[id]}` |
| `mutationQueue` | `[createdAt]` `{id, op:{type:'put\|delete', store, rec?|id?}, createdAt, attempts, lastAttemptISO?, sentISO?, dead?}` |

## 2. Recomendación (forma + ciclo de vida)

```
{ id, ruleId:'R1'..'R14', fingerprint:'R#:store:entityId', severity:'critical|warning|info',
  entityStore, entityId, entityLabel?, messageKey:'rules.msg.R1', params:{...},
  status:'open|acked|resolved', createdAt, lastTriggeredAt, triggerCount,
  ackedAt?, ackedBy?, resolvedAt?, resolvedBy?, resolveNote?,
  history:[{action:'created|triggered|acked|resolved|reopened', at(ISO), by, note?}] }
```

- `open → acked → resolved` (acciones manuales con actor = rol/usuario local o `'local'`).
- Si una rec `resolved` vuelve a dispararse (mismo fingerprint persiste en el sweep): → `open`, `history += {action:'reopened'}`, `triggerCount++`.
- Si existe `open|acked` y se re-dispara: solo `lastTriggeredAt`, `triggerCount++`, `history += {action:'triggered'}` (máx. 50 entradas, recortar antiguas).
- Actor por defecto `'local'`; si `lock` activo, rol actual.

## 3. Catálogo de reglas (evaluación pura sobre `state`)

Ventanas relativas a `state.nowISO`. Severidades y claves de mensaje congeladas:

| ID | Condición exacta | Severidad | messageKey / params |
|----|------------------|-----------|---------------------|
| R1 | lectura de cualquier MP con `crMpy ≥ 10` en las últimas 24 h | critical | `rules.msg.R1` {code, cr} |
| R2 | por MP con ≥5 lecturas: `avg7d ≥ 2 × avg30d` (y avg30d>0) | warning | `rules.msg.R2` {code, avg7, avg30, ratio} |
| R3 | par de cupones (mismo `pairId`) con EI calculada `< 70 %` | warning | `rules.msg.R3` {code, ei} |
| R4 | MP con `inhibitorTargetPpm>0`: residual fuera de banda ±`residualBandPct` (default 20 %) alrededor de objetivo ⇒ equivalente a ventana 80–150 % cuando band=20 no — **canónico**: `pct = residual/target·100`; fuera de [80,150] con banda configurable `residualBandPct` interpretada como desvío permitido sobre [100−band·?]** → se fija: fuera de `[100−bandPct, 100+bandPct·0.5+... ]` **NO**: regla definitiva = `pct < 80 || pct > 150` usando `inhibitorBalance` (banda 80–150 fija del spec); `residualBandPct` solo se usa para el aviso temprano `[80−x,80)∪(150,150+x]` → info | warning (fuera 80–150) / info (aviso temprano) | `rules.msg.R4` {code, pct, band} |
| R5 | sonda (sensorType er/lpr/h2): lecturas 24 h con `|z| > zScoreThreshold` (σ>0) **o** ≥ `stuckSensorCount` lecturas consecutivas idénticas (cualquier fecha) | warning | `rules.msg.R5` {code, reason:'zscore'|'stuck', value?} |
| R6 | cupón con `endDate + 90d < now` y status ≠ 'retired' | warning si >180d, si no info | `rules.msg.R6` {code, days} |
| R7 | por MP con `process.co2Ppm>0 && process.totalPressureKpa>0`: modelo DWM (pCO2=P·x) vs media 7 d de lecturas: `ratio>2` → critical; `ratio<0.3` → info | critical/info | `rules.msg.R7` {code, ratio, measured, model} |
| R8 | por MP con `process.h2sPpm>0 && totalPressureKpa>0`: `classifyMr0175(pH2S)` → high=critical, moderate=warning (low: sin rec) | critical/warning | `rules.msg.R8` {code, ph2sKpa, level} |
| R9 | apmAsset con `rbi.nextInspectionISO < now` | warning; si atraso >90 d → critical | `rules.msg.R9` {name, days} |
| R10 | apmAsset: MTBF últimos 90 d < 50 % × MTBF 90 d previos (ambos con ≥1 fallo) | warning | `rules.msg.R10` {name, mtbfNow, mtbfPrev} |
| R11 | apmAsset: disponibilidad últimos 90 d < `availabilityThresholdPct` (u override) | warning | `rules.msg.R11` {name, pct, threshold} |
| R12 | apmAsset: ≥3 eventos `failure` en 90 d | warning | `rules.msg.R12` {name, count} |
| R13 | psv con `nextTestDate < hoy` | warning; si atraso >30 d → critical | `rules.msg.R13` {tag, days} |
| R14 | psv con `sizing.marginPct < 0` (capacidad instalada menor que requerida) | critical | `rules.msg.R14` {tag, margin} |

`engine.sweep` actualiza además: `psvs.status` (ok/due/overdue según nextTestDate), `lineAssets.integritySeverity` (peor severidad de inspecciones/lecturas asociadas), `meta.lastRulesRunISO`, y emite `rules:run` con `{created, updated, reopened, criticals}`.

## 4. Claves de settings usadas por reglas

`residualBandPct` (aviso temprano R4, default 20), `availabilityThresholdPct` (90), `stuckSensorCount` (10), `zScoreThreshold` (3), `rulesIntervalSec` (60). Editables en Admin.

## 5. Inventario i18n (cerrado; ~330 claves)

Formato: `namespace: clave1, clave2…`. Todos los locales DEBEN tener exactamente el mismo conjunto que `en`. Interpolación `{{param}}`.

- `common: appName, tagline, disclaimer, save, cancel, delete, edit, add, new, close, search, filter, clear, export, import, print, copy, copied, refresh, run, back, next, yes, no, confirm, required, optional, none, all, actions, status, severity, date, notes, note, value, min, max, avg, total, ok, error, warning, info, critical, loading, empty, apply, reset, language, theme, light, dark, system, sector, upstream, midstream, downstream, asset, assets, active, due, overdue, days, hours, createdAt, updatedAt, unknown, keyboardHint, updateAvailable, reload`
- `nav: dashboard, corrosion, psv, pipelines, apm, ingest, recommendations, reports, glossary, admin`
- `severity: low, moderate, high, severe, shapeHint`
- `units: mpy, mmYear, umYear, degC, degF, psia, psig, bar, kPa, ppm, pct, lbH, gpm, in2, cm2, km, mg, cm2Area`
- `dashboard: title, kpiAvgCr, kpiSeverePoints, kpiPsvOverdue, kpiApmAlerts, kpiPendingCompliance, heatmapTitle, heatmapHint, alertsFeed, noAlerts, lastRulesRun, runRules, topPoints, viewAll, sectorView, criticalCount, warningCount, infoCount`
- `corrosion: title, points, newPoint, editPoint, pointCode, line, material, sensorType, processParams, h2s, co2, totalPressure, temperature, bsw, velocity, inhibitorTarget, inhibitorResidual, readings, newReading, noReadings, trend, coupons, newCoupon, couponRole, blank, inhibited, pair, initialWeight, finalWeight, area, exposureDays, exposureHours, density, crResult, classification, sp0775Ref, inhibitorEfficiency, eiPoorestNote, inhibitorBalance, balanceResult, dwmTitle, dwmResult, dwmNote, modelRatio, sourScreening, ph2s, mr0175Ref, cpTitle, cpPotential, cpPolarization, cpResult, cuiTitle, insulated, jacketType, lastCuiInspection, pointDossier, sensorTypes.couponGravimetric, sensorTypes.erProbe, sensorTypes.lprProbe, sensorTypes.h2Probe, sensorTypes.utInspection, sensorTypes.visual, eiBands.poor, eiBands.acceptable, eiBands.good, eiBands.excellent, balanceBands.under, balanceBands.onTarget, balanceBands.over, mr0175.low, mr0175.moderate, mr0175.high, cpStatus.pass, cpStatus.fail, cpStatus.insufficient, deletePointConfirm`
- `psv: title, registry, newPsv, tag, location, valveType, types.conventional, types.balanced, types.pilot, fluid, phase, gasVapor, liquid, setPressure, temperature, backPressure, flowW, flowQ, k, molarMass, compressibility, specificGravity, viscosity, kd, kb, kw, kc, kv, sizingTitle, gasSizing, liquidSizing, flowCritical, flowSubcritical, requiredArea, selectedOrifice, selectedArea, realCapacity, margin, usage, exceedsT, recalculate, datasheet, copyDatasheet, printDatasheet, fluidsEditor, newFluid, editFluid, lastTest, nextTest, statusOk, certified, validationHeader, deletePsvConfirm`
- `pipelines: title, systems, newSystem, systemName, operator, product, products.crude, products.gas, products.products, products.water, diameter, wallThickness, coating, length, stationRange, lineAssets, newLineAsset, assetType, types.sectionValve, types.blockValve, types.flange, types.fitting, types.pumpStation, types.compressorStation, types.tank, types.sump, types.valveChamber, types.crossing, types.row, types.meteringStation, stationKm, side, sides.left, sides.right, sides.center, inspections, newInspection, inspTypes.ild, inspTypes.externalCorrosion, inspTypes.visual, inspTypes.ut, inspTypes.repair, inspTypes.replacement, fromKm, toKm, findings, certExpiry, campaigns, mapView, mapLegend, mapNodeAria, noSystems, schematicHint, deleteSystemConfirm`
- `apm: title, assetsBySector, newAsset, assetCode, category, criticality, crit.A, crit.B, crit.C, assetStatus, statuses.running, statuses.standby, statuses.down, statuses.maintenance, metrics, availability, mtbf, mttr, oee, failureRate, rbi, pof, cof, riskScore, riskBand, bands.low, bands.medium, bands.high, bands.veryHigh, inspectionBase, nextInspection, suggestedInterval, events, newEvent, eventTypes.failure, eventTypes.maintenance, eventTypes.unplannedOutage, eventTypes.workOrder, eventTypes.inspection, start, end, downtime, workOrderRef, healthBySector, noAssets, categories.well, categories.platform, categories.fpso, categories.subsea, categories.esp, categories.suckerRod, categories.gasLift, categories.wellheadCompression, categories.separator, categories.storageTank, categories.pipeline, categories.pumpStation, categories.compressorStation, categories.loadingTerminal, categories.gasPlant, categories.refinery, categories.distillationUnit, categories.hydrodesulfurization, categories.reformer, categories.heatExchanger, categories.pump, categories.compressor, categories.column, categories.furnace, categories.utilitySteam, categories.utilityAir, categories.utilityNitrogen, deleteAssetConfirm`
- `ingest: title, csvImport, chooseFile, orDrop, delimiterDetected, columnMapping, mapTo, canonical.*, runValidation, importBtn, resultSummary, rowsTotal, rowsOk, rowsSkipped, rowsError, createMissing, duplicatesSkipped, errorCodes.E_ID, errorCodes.E_DATE_FORMAT, errorCodes.E_DATE_FUTURE, errorCodes.E_WF, errorCodes.E_MP_UNKNOWN, errorCodes.E_RANGE, errorCodes.E_EMPTY, witsmlImport, witsmlNote, importHistory, queueTitle, queuePending, syncEndpoint, endpointNote, jsonExport, jsonImport, modeMerge, modeReplace, importConfirmReplace, downloadBackup`
- `rules: title, open, acked, resolved, acknowledge, resolve, reopen, autoReopenNote, entity, rule, condition, noRecs, filterStatus, sweepInterval, runNow, lastRun, newCriticalToast, msg.R1, msg.R2, msg.R3, msg.R4, msg.R5, msg.R6, msg.R7, msg.R8, msg.R9, msg.R10, msg.R11, msg.R12, msg.R13, msg.R14, name.R1, name.R2, name.R3, name.R4, name.R5, name.R6, name.R7, name.R8, name.R9, name.R10, name.R11, name.R12, name.R13, name.R14, resolveNotePlaceholder`
- `reports: title, quarterly, dossier, datasheet, period, periodFrom, periodTo, generate, cover, coverSubtitle, kpis, weeklyChartTitle, weeklyChartAlt, topCritical, eiByPairs, campaignsTable, recsSummary, recsOpen, recsAcked, recsResolved, standardsApplied, methodology, methodologyBody, disclaimer, generatedAt, pageFooter, noData`
- `glossary: title, term, definition, category, reference, categories.corrosion, categories.psv, categories.pipeline, categories.apm, categories.standards, categories.data, searchPlaceholder, noResults, resultsCount`
- `admin: title, about, version, appearance, locale, rulesConfig, intervalSec, thresholds, residualBand, availabilityThreshold, stuckSensor, zScore, dataManagement, exportAll, importAll, resetDemo, resetDemoConfirm, dangerZone, clearAll, clearAllConfirm, security, lockTitle, enableLock, disableLock, changePin, pin, pinRepeat, pinMismatch, role, roles.admin, roles.operator, unlock, wrongPin, lockoutWait, storageUsage, swStatus, offlineReady, standardsRef, demoLoaded`
- `a11y: skipLink, openNav, closeNav, closeDialog, tableCaptionPrefix, chartDataTable, severityIconHint, dialogTitlePrefix`
- `fileguard: title, body, copyWin, copyPy, copyBat, dismiss`

### 5.1 Extensiones aprobadas (fases B–D)

Claves añadidas al inventario durante las fases B/C (gaps detectados en vistas y reportes) y D (D1b). Todos los locales mantienen paridad exacta con `en`.

- `common: months, bootError, inMemoryNotice, viewError, moduleLoading`
- `corrosion: pointName, system, stationKm, location, crMpy, startDate, endDate, codeDuplicate, wfGtWi, deleteDisabled, screeningNote`
- `psv: overpressure, fluidName, c, f2, re, iterations, tagDuplicate, deleteDisabled, err.empty, err.set, err.z, err.k, err.t, err.m, err.g, err.negflow, err.p1lep2, warn.reRange`
- `pipelines: editSystem, editLineAsset, stationFromKm, stationToKm, stationRangeError, stationKmRangeError, assetCode, assetName, inspectionType, lastInspection, certExpirySoon, filterType, filterSeverity, allTypes, allSeverities, noAssets, noInspections, deleteLineAssetConfirm, deleteInspectionConfirm, openAsset, reportRef`
- `apm: name, eventType, reprogram, reprogrammed, noEvents, openRecommendations, deleteEventConfirm, editAsset, availabilityOverride, window90d, windowTotal, oeePerformance, oeeQuality, endBeforeStart, riskMatrix, riskMatrixDesc, health.good, health.warn, health.bad, healthTitle`
- `ingest: wells, stations, channels, witsmlErrors, fileName, flush, importDone, jsonResult, deadCount, errorCodes.E_WITSML_POINT`
- `rules: actor, history, lastTriggered, triggerCount, histActions.created, histActions.triggered, histActions.acked, histActions.resolved, histActions.reopened`
- `reports: associatedPsvs, associationCriterion, astmCalc, avgCr, band, coefficientC, cr, datasheetFields, datasheetTitle, deltaW, dossierTitle, eiPct, f2, kpiAvailability, kpiAvgCr, methodologySources, pointInfo, reynolds, screening, selectPoint, selectPsv, source, testDates, week`
- `admin: typeDelete`
- `severity: critical, warning, info` (G2: severidades de recomendación `critical|warning|info`; complementan a `low|moderate|high|severe` usadas en inspecciones de línea)
- `reports: ruleName` (G2: columna de nombre de regla en la tabla de resumen de recomendaciones)

## 6. CSV — campos canónicos y alias de mapeo

Campos canónicos: `mpCode, date, crMpy, wiMg, wfMg, areaIn2, days, inhibitorResidualPpm, tempC, bswPct, category, note`.
Alias (normalizar: minúsculas, sin tildes, sin espacios/guión-bajo en bordes):
- `mpCode`: punto, code, código, codigo, mp, mp-code, point, tag, id punto, monitoring point
- `date`: fecha, date, reading date, fecha lectura
- `crMpy`: tasa, rate, cr, mpy, corrosion rate, tasa de corrosión, tasa corrosion
- `wiMg`: wi, w initial, peso inicial, initial weight, w_i
- `wfMg`: wf, w final, peso final, final weight, w_f
- `areaIn2`: área, area, a, area in2, exposición
- `days`: días, dias, days, exposición días, exposure days
- `inhibitorResidualPpm`: residual, inhibidor residual, inhibitor residual, residual ppm
- `tempC`: temperatura, temp, temperature, °c, temp c
- `bswPct`: bsw, %bsw, bs&w, agua y sedimentos
- `category`: categoría, categoria, category
- `note`: nota, note, comentarios, remarks
Validación de rangos: `crMpy ∈ [0, 1000]`, `tempC ∈ [−60, 200]`, `bswPct ∈ [0, 100]`, `days > 0`, `area > 0`, `wf ≤ wi` (si ambos presentes; si no → `E_WF`), `date` ISO o `YYYY-MM-DD`/`DD/MM/YYYY` válida y ≤ hoy+1d.
Duplicado: mismo `mpCode + date + crMpy` (o mismo cupón `mpCode+start+end+wi+wf`) ya existente → skip.

## 7. WITSML-lite (subset documentado, sin certificación ETP)

XML aceptado (namespace `iw-lite`, tolera prefijo `witsml:`):
```xml
<iw-lite>
  <wells><well uid="W-1" name="…" field="…" operator="…"/></wells>
  <trajectories><station wellUid="W-1" md="120.5" incl="12.3" azi="45.0"/></trajectories>
  <channels>
    <channel wellUid="W-1" name="CR_MPY" unit="mpy" mpCode="MP-CORR-001">
      <point time="2026-09-01T00:00:00Z" value="3.2"/>
    </channel>
  </channels>
</iw-lite>
```
Mapeo: `well` → apmAsset (category `well`, sector `upstream`); `station` → tabla de trayectoria en ficha (almacenada en `apmEvents` type `inspection` con `description` JSON **o** omitida con aviso — decisión: almacenar en `importLog.errors` solo si malformada; las stations se guardan como `lineInspections` NO — **decisión final**: se guardan en `apmAssets.notes` resumen + tabla efímera en UI de resultado); `channel[mpCode]` → `readings`. Errores por elemento con código `E_WITSML_*`.

## 8. Formas de datos estáticos

### 8.1 `IW.data.materials` (T3)
`materials → [{id, nameKey?, name, densityGcm3, family:'carbonSteel\|stainless\|duplex\|clad', mr0175Note?}]` con ids: `api5l-gr-b, api5l-x52, api5l-x60, api5l-x70, a106-b, a516-70, ss-316l, ss-317l, duplex-2205, super-duplex-2507, cs-coated, cu-ni-90-10, alloy-c276`. Densidades: aceros carbono 7.85, 316L/317L 8.00, 2205 7.80, 2507 7.80, CuNi 8.90, C276 8.89, cs-coated 7.85. `byId(id)`.

### 8.2 `IW.data.fluids` (T3)
`fluids → [{id, nameKey:'fluids.<id>' (traducible vía nombres en locales — usar `psv.fluids.*`? NO: nombres de fluido viven en el locale bajo `fluids.<id>`), phase, M, k?, Z?, G?, viscCp?, editable:true}]` ids: `methane, ethane, propane, butane, natural-gas, hydrogen, nitrogen, steam, water, crude-oil, diesel`. Valores de referencia editables en UI (Admin/PSV): methane M16.04 k1.31; ethane M30.07 k1.19; propane M44.10 k1.13; butane M58.12 k1.09; natural-gas M18.5? → **usar 19.0, k 1.30, Z 0.95**; hydrogen M2.016 k1.41; nitrogen M28.01 k1.40; steam M18.02 k1.31 (Z 1.0); water G1.00 visc 1 cP; crude-oil G0.85 visc 15 cP; diesel G0.84 visc 3 cP. Clave i18n `fluids.<id>` añadida al inventario (D1 traduce).

### 8.3 `IW.data.glossary` (D1)
`terms → [{id, category:'corrosion|psv|pipeline|apm|standards|data', standard:'NACE SP0775'|…, i18n:{<code>:{term, definition}}} × 7 idiomas]`. Mínimo 36 términos: corrosion rate (mpy), coupon gravimetric, ER probe, LPR, hydrogen probe, inhibitor efficiency, residual inhibitor, BSW, sweet corrosion, sour service, pH2S, partial pressure, De Waard-Milliams, cathodic protection, CUI, ILI/ILD, pitting, SP0775 severity, set pressure, backpressure, overpressure, accumulated pressure, orifice area (API 526), critical flow, Kd, Kb, Kw, Kc, Kv, PSV, PRV, POSRV, blowdown, MTBF, MTTR, availability, OEE, RBI, POF, COF, RBI band, ROW, station (km), ILD, UT thickness, coating, OGMP 2.0, ISO 55000 asset, API 581 risk matrix, work order. (≥36; cada uno con referencia normativa.)

### 8.4 `IW.data.standards` (D1)
`standards → [{id, code:'NACE/AMPP SP0775', title, edition:'(2018) — verify current edition', url?, usedIn:['corrosion','reports']}]` para: SP0775, MR0175/ISO 15156-2, ASTM G4, ASTM G1, ASTM G15, API 520 Pt I, API 526, API 5L, ASME B31.4, ASME B31.8, ISO 55000, ISO 14224, API 580, API 581, NACE SP0169, OGMP 2.0. `categories.apm` de apmAssets usa lista de §8.5.
Categorías APM válidas (id → clave `apm.categories.*`): upstream: well, platform, fpso, subsea, esp, suckerRod, gasLift, wellheadCompression, separator, storageTank; midstream: pipeline, pumpStation, compressorStation, loadingTerminal, storageTank, gasPlant; downstream: refinery, distillationUnit, hydrodesulfurization, reformer, heatExchanger, pump, compressor, column, furnace, utilitySteam, utilityAir, utilityNitrogen.

### 8.5 `IW.data.seed` (D1)
`demo(store)` determinista (mulberry32(42)) crea: 1 sistema `SYS-NORTE-16` (crudo, DN 16", 120 km, X52), 12 lineAssets (km 0–120: válvulas, estación de bombeo, tanque, cruces, ROW, medición); 8 MP (códigos MP-CORR-001..008, sectores mixtos, sensores variados, procesos con H2S/CO2 coherentes); ~120 lecturas (90 días, una serie con pico ≥10 mpy en MP-001 últimas 24 h → dispara R1; una serie "stuck" 12 lecturas idénticas en MP-003 → R5; ratios DWM variados); 4 cupones (2 pares: EI 92 % y EI 65 % → R3); 5 PSV (2 gas, 2 líquido, 1 pilotada; una con nextTestDate pasada 40 d → R13 critical; márgenes calculados con motores reales); 9 apmAssets (3 por sector) con eventos (fallos que disparan R12 en uno, disponibilidad baja en otro → R11, inspección vencida → R9); NO crea recomendaciones (las genera el primer sweep). Devuelve `{counts}`.

## 9. Cola offline / sincronización

- Todo `save/remove` de repos, si `meta.syncEndpoint` no vacío → `syncQueue.enqueue({type, store, rec|id})`.
- Flush: POST `{op}` JSON al endpoint (`fetch`, keepalive false); 200-299 → `sentISO`; fallo → attempts++ backoff [1s,5s,30s]; attempts≥5 → `dead:true` (visible en Admin, reintentable).
- `window.addEventListener('online', flush)`. Sin endpoint: la cola permanece latente (0 coste). Export JSON incluye `mutationQueue` solo en modo debug (checkbox Admin).
