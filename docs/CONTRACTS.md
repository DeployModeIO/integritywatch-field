# CONTRACTS.md — Convenciones y contratos de integración (FUENTE DE VERDAD)

Todo subagente DEBE leer este archivo, `docs/SCHEMA.md` y `docs/TESTS.md` antes de escribir código.
Cualquier desviación debe listarse explícitamente en el reporte final de la tarea.

## 1. Convenciones globales

- Vanilla JS (sin build, sin dependencias, sin CDN). Comentarios de código **en inglés**. UI multilingüe vía i18n.
- **Patrón UMD-lite obligatorio** en TODO archivo `.js` de `src/` y locales:

```js
/* IntegrityWatch Field — <module name>
   <one-line English purpose comment> */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.<path> = api;                       // e.g. root.IW.calc.corrosion
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  // cross-module access ONLY at call time: root.IW.core.store … (never at load time)
  return { /* public API, exact signatures per §4 */ };
});
```

- En Node (tests): `const corrosion = require('../src/calc/corrosion.js');` — los archivos NO usan `import`/`export` ESM.
- Tests: `node:test` + `node:assert/strict`, archivos CJS `tests/*.test.js`. Cada test documenta su ancla (referencia a `docs/TESTS.md`).
- Cada archivo JS debe pasar `node --check <file>`.
- **CSP estricta**: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* ; manifest-src 'self'; worker-src 'self'; base-uri 'self'; form-action 'self'`.
  Consecuencias: CERO `<script>` inline, CERO atributos `style="…"` en HTML generado, CERO `eval`/`new Function`. Estilos dinámicos solo por CSSOM (`el.style.setProperty(…)`) o clases.
- **DOM seguro**: nunca `innerHTML` con datos de usuario/importados. Usar helpers de `IW.ui` (`el`, `txt`) o `textContent`. Plantillas estáticas propias del módulo sí pueden usar `innerHTML` con literales sin interpolación de datos externos.
- Sin emojis-ícono: solo SVG inline locales (`IW.ui.icons`).
- Sin secretos en código/docs. Logs nunca vuelcan credenciales.
- Fechas: almacenamiento ISO-8601 UTC (`new Date().toISOString()`); visualización con `Intl.DateTimeFormat(locale)`.
- Números canónicos: `number` sin formatear en DB; display con `Intl.NumberFormat(locale, {maximumFractionDigits})`. Valores de ingeniería en pantalla con clase `.num` (tabular-nums, fuente mono).
- Accesibilidad mínima por componente: foco visible global (`:focus-visible` outline 3px `--accent`), diálogos con foco atrapado + `aria-modal` + cierre Esc, tablas con `<caption>` + `scope`, toast en región `aria-live="polite"` (críticas: `assertive`), alarmas siempre color+icono+texto, objetivos táctiles ≥ 44×44 px, `lang`/`dir` gestionados por i18n.
- CSS: solo propiedades lógicas para direccionamiento (`margin-inline-start`, `padding-inline-end`, `border-inline-start`, `text-align: start|end`, `inset-inline-start`). Prohibido `left/right/margin-left/text-align:left` salvo en `print.css` de tablas A4 donde se justifique. Así RTL funciona sin duplicar hojas.

## 2. Árbol de archivos y PROPIEDAD por tarea

Ninguna tarea crea/modifica archivos fuera de su lista. Los stubs los crea T1b; las fases B/C/D **reemplazan** el contenido completo de sus archivos.

```
integritywatch-field/
├─ START-HERE.bat                          [T1a]
├─ index.html                              [T1a]
├─ manifest.webmanifest                    [T1a]
├─ sw.js                                   [T1a]
├─ package.json                            [T1a]  (solo name/private/scripts.test; SIN deps)
├─ README.md                               [D2]
├─ tasks/plan.md, tasks/todo.md            [orquestador]
├─ docs/CONTRACTS.md, SCHEMA.md, TESTS.md  [orquestador]
├─ docs/DEPLOY.md, docs/STANDARDS.md       [D2]
├─ assets/
│  ├─ icons/*.svg + *.png generados        [T1a]
│  └─ styles/
│     ├─ tokens.css base.css layout.css components.css print.css   [T1a]
│     ├─ views-a.css                       [T8]
│     ├─ views-b.css                       [T9]
│     └─ views-c.css                       [T10]
├─ src/
│  ├─ compat/file-guard.js                 [T1b]
│  ├─ app/main.js  app/shell.js  app/router.js  app/theme.js       [T1b]
│  ├─ components/ui.js  components/icons.js                        [T1b]
│  ├─ i18n/i18n.js                         [T2a]
│  ├─ i18n/locales/en.js es.js pt.js       [T2a]
│  ├─ i18n/locales/fr.js zh.js ru.js ar.js [T2b]
│  ├─ core/db.js dbMemory.js store.js exportImport.js syncQueue.js bus.js  [T5]
│  ├─ security/lock.js                     [T5]
│  ├─ calc/units.js                        [T1b, implementación real]
│  ├─ calc/corrosion.js                    [T3]
│  ├─ calc/psv.js                          [T4]
│  ├─ calc/apm.js                          [T5]
│  ├─ data/materials.js  data/fluids.js    [T3]
│  ├─ data/glossary.js  data/standards.js  data/seed.js            [D1]
│  ├─ rules/engine.js  rules/definitions.js                        [T6]
│  ├─ ingest/csv.js  ingest/witsmlLite.js  [T7]
│  ├─ reports/quarterly.js dossier.js datasheet.js                 [T10]
│  └─ views/dashboard.js corrosion.js psv.js                       [T8]
│     views/pipelines.js pipelineMap.js apm.js                     [T9]
│     views/ingest.js recommendations.js reports.js glossary.js admin.js [T10]
├─ tests/*.test.js + fixtures/            [cada tarea B escribe los suyos; D2 valida]
├─ tools/serve.ps1 serve.py make-icons.ps1 [T1a]
└─ electron/main.js preload.js package.json README.md              [D2]
```

Orden de `<script>` en index.html (T1a lo congela; todos `defer`, tipo clásico):
`src/compat/file-guard.js` → `src/core/bus.js` → `src/calc/units.js` → `src/data/materials.js` → `src/data/fluids.js` → `src/data/glossary.js` → `src/data/standards.js` → `src/i18n/locales/*.js` (en,es,fr,zh,ru,ar,pt) → `src/i18n/i18n.js` → `src/core/db.js` → `src/core/dbMemory.js` → `src/core/store.js` → `src/core/exportImport.js` → `src/core/syncQueue.js` → `src/security/lock.js` → `src/calc/corrosion.js` → `src/calc/psv.js` → `src/calc/apm.js` → `src/rules/engine.js` → `src/rules/definitions.js` → `src/ingest/csv.js` → `src/ingest/witsmlLite.js` → `src/components/icons.js` → `src/components/ui.js` → `src/reports/quarterly.js` → `src/reports/dossier.js` → `src/reports/datasheet.js` → `src/views/dashboard.js` → `src/views/corrosion.js` → `src/views/psv.js` → `src/views/pipelines.js` → `src/views/pipelineMap.js` → `src/views/apm.js` → `src/views/ingest.js` → `src/views/recommendations.js` → `src/views/reports.js` → `src/views/glossary.js` → `src/views/admin.js` → `src/app/theme.js` → `src/app/router.js` → `src/app/shell.js` → `src/app/main.js`.
CSS `<link>` en orden: tokens, base, layout, components, views-a, views-b, views-c, print.

## 3. Tokens CSS (`assets/styles/tokens.css`) — inventario congelado

`:root` (claro) y `[data-theme="dark"]` definen EXACTAMENTE estos nombres (valores verificados para contraste AA):

- Fondos/superficies: `--bg #f4f6f8 / #11161c`, `--surface #ffffff / #1a2129`, `--surface-2 #e9edf1 / #232c36`, `--border #c9d3dc / #33404d`.
- Texto: `--text #1a2430 / #e8edf2`, `--muted #5a6b7c / #9fb0bf`, `--accent #0b5cad / #5aa9e6`, `--accent-text #ffffff / #08131f`.
- Severidad (texto/gráfico sobre superficie, ≥4.5:1 claro, ≥3:1 gráfico oscuro): `--sev-low #1e7a34 / #57c97e`, `--sev-moderate #9a6700 / #e3b341`, `--sev-high #b35309 / #f0883e`, `--sev-severe #b42318 / #f26d6d`.
- Alertas: `--alert-critical` = paleta severe, `--alert-warning` = moderate, `--alert-info` = accent.
- Superficies tintadas para celdas/badges: `--sev-low-bg #e5f3e9 / #1c2f22`, `--sev-moderate-bg #fbf1d7 / #33290f`, `--sev-high-bg #fbe9dc / #38210f`, `--sev-severe-bg #fae3e1 / #3a1512`.
- Escala: espacio `--sp-1..6` = 4/8/12/16/24/32px; radio `--r-1 6px`, `--r-2 10px`; fuentes `--font-ui system-ui…`, `--font-mono ui-monospace, Consolas…`; sombras planas opcionales `--shadow-1` (sin gradientes decorativos).
- Forma redundante por severidad (daltonismo): low=círculo, moderate=cuadrado, high=triángulo, severe=X (aspa). Clase utilitaria `.shape-{low|moderate|high|severe}` + icono SVG equivalente en `IW.ui.icons.severity(level)`.

Clases utilitarias obligatorias en components.css: `.card .grid-bento .badge .badge-{sev} .btn .btn-primary .btn-ghost .btn-danger .field .field-label .input .select .table-wrap table.data .num .stack .row .pill .kpi .tabs .dialog .toast .empty-state .skip-link .visually-hidden .touch` (min 44px).

## 4. Namespaces y firmas públicas congeladas

`root.IW` = namespace raíz. Acceso entre módulos SOLO en tiempo de llamada.

### 4.1 `IW.calc.units` (T1b, real)
`MPY_TO_MM_YEAR=0.0254`, `MPY_TO_UM_YEAR=25.4`, `mpyToMmYear(mpy)`, `mpyToUmYear(mpy)`, `mmYearToMpy(mmY)`, `cToF(c)`, `fToC(f)`, `cToR(c)`, `fToR(f)`, `kToC(k)`, `cToK(c)`, `psiToKpa(p)`, `kpaToPsi(k)`, `barToKpa(b)`, `kpaToBar(k)`, `in2ToCm2(a)`, `lbhToKgh(w)`, `gpmToM3h(q)`, `clamp(v,min,max)`, `round(v,dec)`, `mulberry32(seed) → () => float[0,1)`.

### 4.2 `IW.calc.corrosion` (T3)
- `crFromWeightLoss({ deltaWmg, densityGcm3, areaIn2, hours?, days? }) → { mpy, mmYear, umYear }` — ASTM G4: `mpy = 534·ΔW/(ρ·A·t_h)`; lanza `{code:'E_INPUT'}` si ρ≤0, A≤0, t≤0, ΔW<0.
- `classifySp0775(mpy) → 'low'|'moderate'|'high'|'severe'` — <1, 1–<5, 5–<10, ≥10.
- `inhibitorEfficiency({ crBlankMpy, crInhibitedMpy }) → pct|null` (null si blank≤0); `eiBand(pct) → 'poor'|'acceptable'|'good'|'excellent'` (<70 / 70–<85 / 85–<90 / ≥90).
- `deWaardMilliams({ tempC, pCo2Bar }) → { mmYear, mpy }` — `log10(mmY) = 5.8 − 1710/T_K + 0.67·log10(pCO2_bar)`; error si pCO2≤0.
- `partialPressureH2S({ totalPressureKpa?, totalPressurePsia?, h2sPpm }) → { kpa, psia }`.
- `classifyMr0175(ph2sKpa) → 'low'|'moderate'|'high'` — <0.3 kPa low; 0.3–100 moderate; >100 high (screening; regiones completas MR0175 requieren pH/cloruros — documentar en comentario).
- `inhibitorBalance({ targetPpm, residualPpm }) → { pct, band:'under'|'onTarget'|'over' }` — ventana 80–150 %.
- `cpEvaluate({ potentialMvCse?, polarizationMv? }) → { status:'pass'|'fail'|'insufficient', criteria:string[] }` — SP0169: −850 mV vs CSE (instant-off/−850 polarizado) o 100 mV de despolarización.
- `materialDensity(materialId) → g/cm³` delega a `IW.data.materials`.

### 4.3 `IW.calc.psv` (T4)
- `ORIFICES_526 = [{letter:'D',areaIn2:0.110},E:0.196,F:0.307,G:0.503,H:0.785,J:1.287,K:1.838,L:2.853,M:3.60,N:4.34,P:6.38,Q:11.05,R:16.00,T:26.00]`.
- `flowCoefficientC(k, units='usc'|'si')` — USC: `520·√(k·(2/(k+1))^((k+1)/(k−1)))`; SI: constante 0.03948. `k≤1` → error `{code:'E_K'}`.
- `criticalPressureRatio(k) → (2/(k+1))^(k/(k−1))`; `isCriticalFlow(P1psia,P2psia,k) → bool`.
- `sizeGasVapor({ Wlbh, P1psia, P2psia, TR, Z, M, k, Kd=0.975, Kb=1, Kc=1 }) → { AreqIn2, critical, C, F2?, inputs }` — crítico: `A = W·√(T·Z/M)/(C·Kd·P1·Kb·Kc)`; subcrítico: `A = W·√(T·Z/(M·P1·(P1−P2)))/(735·F2·Kd·Kc)` con `F2 = √((k/(k−1))·r^(2/k)·(1−r^((k−1)/k))/(1−r))`, r=P2/P1.
- `sizeLiquid({ Qgpm, G, P1psig, P2psig, Kd=0.65, Kw=1, Kc=1, viscCp? }) → { AreqIn2, Kv, Re, iterations, reRangeWarning?, inputs }` — `A = Q·√(G/ΔP)/(38·Kd·Kw·Kc·Kv)`; con `viscCp` presente: iteración (≤20 iter, |ΔA|<0.01 %): Re dimensional **en el orificio seleccionado** (API 520 §5.8.2): `Re = ρ·v·d/μ`, `v=Q/A_orif`, `d=√(4·A_orif/π)`, `ν_cSt = viscCp/G` (cálculo interno SI); Kv analítico: `Kv = min(1, 1/(0.9935 + 2.878/√Re + 342.75/Re^1.5))`; flujo: A(Kv=1) → selectOrifice → Re(orificio) → Kv → A → converger. `Re < 100` → `reRangeWarning:'E_RE_RANGE'` (fuera de validez API 520, evaluar válvula especial).
- `kbBackpressure({ valveType, backPressurePsig, setPressurePsig, overpressurePct=10 }) → number` — tabla piecewise KB_TABLE documentada (API 520 Fig. 30 digitizada); pilot → 1.0; conventional → 1.0 (nota: backpresión superpuesta>10 % exige fuelle — mensaje `E_BP_CONV`).
- `kwBackpressureLiquid({ backPressurePsig, setPressurePsig, valveType }) → number` — KW_TABLE (≤30 % → 1.0, luego derating); conventional → 1.0.
- `selectOrifice(AreqIn2) → { letter, areaIn2 }|{ letter:null, error:'E_OVER_T' }` — menor área ≥ requerida.
- `realCapacity({ orificeAreaIn2, AreqIn2, Wlbh?, Qgpm? }) → { WrealLbh?|QrealGpm?, marginPct }`.
- `validateInput(input) → [{ code, field, messageKey }]` — códigos: `E_EMPTY, E_Z, E_K, E_P1LEP2, E_NEG_FLOW, E_T, E_M, E_G, E_SET`.
- Tablas KB_TABLE/KW_TABLE: arrays `[[x,y],…]` con comentario "Digitized from API 520 Pt I (figure ref); VERIFY against current edition" + tests de propiedad (monótonas, extremos). Kv es analítico (sin tabla).

### 4.4 `IW.calc.apm` (T5)
`availability({windowH, downtimeH}) → pct` · `mtbf({windowH, downtimeH, failureCount}) → h` (0 fallos → null) · `mttr({downtimeH, failureCount}) → h` · `oee({a,p,q}) → pct` · `failureRate({failureCount, windowH}) → 1/h` · `rbiRisk({pof,cof}) → {score, band:'low'|'medium'|'high'|'veryHigh'}` (pof,cof ∈1..5; score=pof·cof; ≤4 low, 5–9 medium, 10–15 high, ≥16 veryHigh) · `inspectionIntervalMonths({band, baseMonths}) → n` (low=base, medium=0.75·base, high=0.5·base, veryHigh=0.25·base, redondeo 0.5) · `nextInspectionDate({fromISO, months}) → ISO`.

### 4.5 `IW.core.bus` (T1b stub funcional mínimo; T5 completa)
`on(evt,fn) → off`, `off(evt,fn)`, `emit(evt,payload)`. Eventos reservados: `locale:changed`, `theme:changed`, `data:changed:{store}`, `rules:run`, `recs:new`, `toast`, `queue:flushed`, `sw:update`.

### 4.6 `IW.core.db` / `IW.core.dbMemory` (T5)
Adaptador: `open() → Promise`, `getAll(store) → Promise<rec[]>`, `get(store,id)`, `put(store,rec)`, `bulkPut(store,recs)`, `remove(store,id)`, `clear(store)`, `query(store,index,value)`, `count(store)`. DB `integritywatch` v1; stores e índices EXACTOS en SCHEMA.md §1. `dbMemory` = mismo contrato en Map (para Node/tests). `IW.core.db.factory(adapter)` no existe: los repos reciben adaptador por inyección → `IW.core.store.create(adapter) → repos`.

### 4.7 `IW.core.store` (T5)
`create(adapter)` → `{ meta, monitoringPoints, readings, coupons, psvs, pipelineSystems, lineAssets, lineInspections, apmAssets, apmEvents, recommendations, importLog, mutationQueue }`. Cada repo: `list(), get(id), save(rec) (upsert + updatedAt + emite data:changed:{store}), saveAll(recs), remove(id), clear()`. `meta.get(key), meta.set(key,value)`. Mutaciones también encolan en `mutationQueue` vía `IW.core.syncQueue.wrap(store)` cuando hay endpoint configurado.

### 4.8 `IW.core.exportImport` (T5)
`exportAll(store) → {app:'integritywatch-field',version:1,exportedAt,data:{<store>:recs[]}}` · `importAll(store,payload,{mode:'merge'|'replace', dryRun:false}) → {created,updated,deleted,errors[]}` (replace = clear+bulkPut por store presente).

### 4.9 `IW.core.syncQueue` (T5)
`init({bus, adapter, getEndpoint})`, `enqueue(op)`, `flush() → Promise<{sent,failed}>` (POST JSON al endpoint si `navigator.onLine`; reintentos con backoff 1s/5s/30s; máximo 5 intentos → `dead:true`), `pending() → n`, listener `online` auto-flush.

### 4.10 `IW.security.lock` (T5)
`isEnabled(meta)`, `enable({pin, role}, meta)`, `disable(pin, meta)`, `verify(pin, meta) → {ok, role}|{ok:false, lockoutSec?}`, `changePin(oldPin,newPin,meta)`, `currentRole()`. PBKDF2-SHA256 210k, salt 16B, pepper 32B (meta `lock.*`); rate-limit: 5 fallos → 30 s (contador en memoria + meta `lock.lockedUntil`). WebCrypto: usar `crypto.subtle` si existe; en Node (tests) aceptar inyección `lock.__setCrypto(cryptoWeb)` — tests usan `globalThis.crypto` de Node ≥ 19.

### 4.11 `IW.i18n` (T2a)
`init({locales:root.IW_LOCALES, bus, storage:localStorage}) → Promise` · `t(key, params?) → string` (fallback en → clave cruda; params `{{name}}` escapado como texto) · `setLocale(code)` (persiste `iw.locale`, aplica `document.documentElement.lang/dir`, emite `locale:changed`) · `getLocale()`, `listLocales() → [{code,name,nativeName,dir}]`, `formatNumber(v,opts)`, `formatDate(iso,opts)` (Intl con locale actual). Locales = objetos planos anidados; cada archivo de locale registra `root.IW_LOCALES.<code> = {__meta:{code,name,nativeName,dir}, …keys}` y `module.exports` lo mismo.

### 4.12 `IW.rules.engine` / `IW.rules.definitions` (T6)
`definitions.rules → [{id:'R1'..'R14', evaluate(state) → findings[]}]` puro. `state = {nowISO, monitoringPoints[], readings[], coupons[], psvs[], apmAssets[], apmEvents[], recommendations[], settings{residualBandPct:20, availabilityThresholdPct:90, stuckSensorCount:10, zScoreThreshold:3}}`. `finding = {ruleId, severity:'critical'|'warning'|'info', entityStore, entityId, messageKey, params{}, fingerprint}` donde `fingerprint = ruleId + ':' + entityStore + ':' + entityId` (estable). `engine.evaluate(state) → findings[]` · `engine.reconcile(findings, existingRecs, {nowISO, actor}) → {toCreate[], toUpdate[], toReopen[]}` (dedupe por fingerprint; reabrir resueltas cuyo fingerprint reaparece, con entrada `history {action:'reopened'}`) · `engine.sweep(repos, settings, actor) → Promise<summary>` (carga estado, evalúa, reconcilia, persiste, emite `recs:new` + `rules:run`). Scheduler en shell: `setInterval` con `meta.rulesIntervalSec` (default 60).

### 4.13 `IW.ingest.csv` (T7)
`detectDelimiter(text) → ','|';'|'\t'` (mayoría de votos en primeras 5 líneas no vacías) · `parse(text,{delimiter?}) → {headers[], rows[][]}` (soporta comillas dobles y escapes `""`) · `mapColumns(headers) → {mapping:{fileHeader→canonicalField}, unmapped[]}` con alias según SCHEMA.md §6 · `validateRows({rows, mapping, existingPointIds, nowISO, autoCreatePoints:false}) → {valid[], invalid:[{rowNum, code, field, message}], duplicates[], newPoints[]}` códigos: `E_ID,E_DATE_FORMAT,E_DATE_FUTURE,E_WF,E_MP_UNKNOWN,E_RANGE,E_EMPTY` · `toRecords(validRows, mapping) → {readings[], coupons[]}` (una fila con wi/wf/area/days → cupón derivando CR por `IW.calc.corrosion.crFromWeightLoss`; una fila con tasa/cr → lectura).
`IW.ingest.witsmlLite`: `parse(xmlText) → {wells[], trajectoryStations[], channels[], errors[]}` (DOMParser en browser; en Node aceptar inyección `__setParser(fn)`; subset documentado en SCHEMA.md §7).

### 4.14 `IW.ui` (T1b)
`el(tag, attrs?, children?) → HTMLElement` (attrs: class, text, attrs{}, on{}, dataset; `text` usa textContent) · `txt(s)` · `icon(name,sizePx)` (clona SVG de `IW.ui.icons`) · `table({columns:[{key,labelKey,align,render?}], rows, captionKey, emptyKey}) → HTMLElement` (render devuelve NODOS, no HTML) · `dialog({titleKey, bodyNode, actions:[{labelKey,kind,onClick}], onClose}) → {close}` (foco atrapado, Esc, `aria-modal`, devuelve foco al lanzador) · `toast(messageKey|text, {severity, timeoutMs})` · `confirmDialog({titleKey, bodyKey, danger}) → Promise<bool>` · `form(fields,[values]) → {node, getValues(), validate()}` con tipos text/number/select/date/textarea/checkbox; validación reactiva inline (mensaje bajo campo, `aria-invalid`) · `keyValueTable(pairs)` · `severityBadge(level)` (color+forma+texto) · `tabs([{id,labelKey,render}])` · `pager`. `IW.ui.icons`: set SVG inline 24px stroke (`dashboard, corrosion, valve, pipeline, apm, ingest, recs, reports, glossary, admin, alert-critical, alert-warning, alert-info, shape-low, shape-moderate, shape-high, shape-severe, sun, moon, monitor, check, x, plus, search, filter, download, upload, printer, clipboard, refresh, chevron-down, chevron-right, lock, unlock, keyboard, close, edit, trash, play`).

### 4.15 Vistas y router (T1b define interfaz; C implementa)
Cada vista: `IW.views.<name> = { id, titleKey, icon, render(container, ctx) }` donde `ctx = { store, repos, bus, i18n:t, navigate(hash), sector, params }`. `render` puede ser async. Router: hash `#/ruta[/param]`; rutas congeladas:
`#/dashboard` · `#/corrosion` · `#/corrosion/mp/:id` · `#/psv` · `#/psv/:id` · `#/pipelines` · `#/pipelines/:id` (ficha+mapa) · `#/apm` · `#/apm/:id` · `#/ingest` · `#/recommendations` · `#/reports` · `#/reports/dossier/:mpId` · `#/reports/datasheet/:psvId` · `#/glossary` · `#/admin`.
`IW.app.router.navigate(hash)`, `start()`, registro `router.register(routePattern, viewId)` ya precargado por T1b con la tabla anterior. Shell: header (nombre+selector sector+locale select+theme toggle+badge recs+estado reglas), sidebar vertical única columna (nav con iconos SVG+texto; en <900px colapsa a rail de iconos con `aria-expanded` drawer), main, footer monolínea: descargo visible `common.disclaimer` + chips de normas. `main.js`: boot = db.open → store.create → i18n.init → theme.init → seed si vacío Y `meta.demoLoaded` ausente → shell.mount → router.start → rules scheduler → syncQueue.init → registro SW (solo http/https).

### 4.16 `IW.reports` (T10)
`quarterly.build({store, period:{fromISO,toISO}, t}) → HTMLElement` (A4: portada, KPIs, gráfico SVG vectorial CR media semanal con `<title>/<desc>` + tabla alternativa, top críticos, EI por par, tabla campañas, recs open/acked/resolved, normas aplicadas con versión+fecha desde `IW.data.standards`, nota metodológica + descargo) · `dossier.build({store, mpId, t}) → HTMLElement` · `datasheet.build({store, psvId, t}) → HTMLElement` + `datasheet.toClipboardText(psv) → string`. Botones de acción: `window.print()` con `body.print-mode` (print.css aísla `.print-root`, oculta chrome; `@page {size:A4; margin:18mm}`).

### 4.17 `IW.data` (T3 materiales/fluidos; D1 glossary/standards/seed)
Formas exactas en SCHEMA.md §8. `seed.demo(store) → Promise<{counts}>` determinista (mulberry32(42)).

## 5. Reglas de integración para fases C/D

1. Antes de escribir, LEER el código real ya implementado de los módulos que consumes (motores, i18n, ui).
2. Usar SOLO claves del inventario SCHEMA.md §5; si falta una: usar la más cercana o clave nueva en tu namespace y **reportarla** en la sección "i18n gaps" del reporte final (D1 las traduce a los 7).
3. No editar archivos de otra tarea (incluidos ui.js, tokens.css, index.html). CSS propio → `views-{a,b,c}.css`.
4. Todo texto visible pasa por `t()`; nada de texto duro.
5. Manejar estados vacíos, de carga y de error en cada vista (`empty-state`, spinner CSS, banner de error).
6. `node --check` a cada archivo escrito; abrir la app no es obligatorio en C (lo verifica fase H), pero la lógica de vista pura (formateo, mapeos) debe ir acompañada de pruebas ligeras cuando aplique dentro del propio archivo de test existente o nuevo `tests/views-<x>.test.js` (solo lógica pura, sin DOM).

## 6. Criterio de reporte final por tarea

Lista de archivos escritos · resultado de `node --test tests/<propios>` y `node --check` · desviaciones del contrato (si las hay, con motivo) · claves i18n nuevas usadas (gaps) · notas de integración para la siguiente fase.
