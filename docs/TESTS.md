# TESTS.md — Anclas numéricas verificadas a mano y convenciones

Suite: `node --test` (Node ≥ 20, CJS, `node:assert/strict`; en Node 24 Windows NO usar `node --test tests/` — resuelve el directorio como módulo). Cobertura: `node --test --experimental-test-coverage` → gate ≥ 80 % líneas en `src/calc/**` y `src/rules/**`.
Cada test cita su sección aquí. Tolerancias: ±0.5 % relativo salvo indicación. **Ningún test usa red ni DOM** (inyección donde aplique).

## 1. ASTM G4 / SP0775 (corrosion)

- A1.1 `crFromWeightLoss({deltaWmg:220, densityGcm3:7.87, areaIn2:2.0, hours:720})` → `534·220/(7.87·2·720) = 117480/11332.8 = 10.366 mpy`; mmYear `0.2633`; umYear `263.3`.
- A1.2 Con `days:30` (→720 h) mismo resultado que A1.1.
- A1.3 Errores: `densityGcm3:0`, `areaIn2:-1`, `hours:0`, `deltaWmg:-5` → throw `E_INPUT`.
- A1.4 Fronteras SP0775: 0.999→low; 1→moderate; 4.99→moderate; 5→high; 9.99→high; 10→severe; 25→severe.

## 2. Eficiencia de inhibidor

- A2.1 blank 8.0, inh 2.0 → EI 75.0 % → banda `acceptable`.
- A2.2 blank 12.4, inh 0.62 → EI 95.0 % → `excellent`.
- A2.3 blank 10, inh 1.5 → 85 → `good` (frontera: 85∈[85,90)); blank 10, inh 3 → 70 → `acceptable` (frontera 70∈[70,85)); blank 10 inh 3.1 → 69 → `poor`; blank 0 → null.

## 3. De Waard & Milliams (screening)

`log10(mmY) = 5.8 − 1710/T_K + 0.67·log10(pCO2_bar)`
- A3.1 T=60 °C, pCO2=1.0 bar: 1710/333.15=5.13282 → 10^0.66718 = **4.647 mm/y** → **183.0 mpy** (×39.3701).
- A3.2 T=25 °C, pCO2=0.5 bar: 5.8−5.73537−0.20169 = −0.13706 → **0.7292 mm/y** → **28.71 mpy**.
- A3.3 pCO2=0 → throw `E_INPUT`.

## 4. Sour service MR0175/ISO 15156 (screening)

- A4.1 P=1000 psia, H2S=2000 ppm → pH2S=2.0 psia = **13.789 kPa** → `moderate`.
- A4.2 P=517 kPa, H2S=30 ppm → pH2S=0.01551 kPa → `low`.
- A4.3 P=10000 kPa, H2S=30000 ppm → pH2S=300 kPa → `high`.
- A4.4 Frontera 0.3 kPa → `moderate` (≥0.3).

## 5. Balance de inhibidor / CP

- A5.1 target 20, residual 24 → 120 % `onTarget`; residual 12 → 60 % `under`; residual 40 → 200 % `over`; frontera 80→onTarget, 79.99→under, 150→onTarget, 150.01→over.
- A5.2 CP: potentialMvCse −900 → `pass` (criterio −850 CSE); −800 sin polarización → `fail`; polarizationMv 120 → `pass` (100 mV); sin datos → `insufficient`.

## 6. API 520 — coeficiente C y flujo crítico

`C_usc = 520·√(k·(2/(k+1))^((k+1)/(k−1)))` ; `C_si = 0.03948·√(…)`.
- A6.1 k=1.40: (2/2.4)^6=0.334898 → ·1.4=0.468857 → √=0.684732 → **C_usc=356.06**, **C_si=0.027033**.
- A6.2 k=1.001 → **C_usc≈315.43** (límite k→1 = 520·e^(−1/2)=315.2, comprobar ±0.5).
- A6.3 k=1.0 y k=0.9 → throw `E_K` (validación).
- A6.4 `criticalPressureRatio(1.4)=0.5283`; `(1.31)=0.5439`; `(1.13)=0.5774?` → calcular exacto en implementación y anclar con ±0.001 contra fórmula (test derivado de la misma expresión, documentar paso a paso en comentario).
- A6.5 P1=124.7, P2=14.7, k=1.31 → ratio 0.1179 < 0.5439 → crítico `true`; P1=100, P2=60, k=1.4 → 0.6 > 0.5283 → `false`.

## 7. Dimensionamiento gas/vapor (ejemplo trabajado)

W=50 000 lb/h; metano M=16.04, k=1.31; T=600 °R; Z=0.95; set 100 psig @10 % → P1=124.7 psia; P2=14.7; Kd=0.975; Kb=Kc=1.
- C(1.31)=347.93 (paso A6.4: (2/2.31)^(2.31/0.31)=0.34175; ·1.31=0.44769; √=0.66910; ·520).
- √(T·Z/M)=√(570/16.04)=√35.536=5.9612.
- A = 50000·5.9612/(347.93·0.975·124.7) = 298 060/42 302 = **7.046 in²** → orificio **Q (11.05)**; margen **56.8 %**; W_real = 50000·11.05/7.046 = **78 413 lb/h**.
- A7.sub: mismo caso con P2=90 psia (r=0.7217>0.5439) → subcrítico: usar F2; anclar `A_sub > A_crit` y F2∈(0.6,0.9) con cálculo documentado en el test.

## 8. Dimensionamiento líquido + Kv (viscosidad analítica, API 520 §5.8.2)

Método CORREGIDO (verificado contra fuentes técnicas tras el hallazgo de T4 — la forma `Re=Q·G^0.25·70870/(A·√ΔP)` es inerte en viscosidad y queda OBSOLETA): Re dimensional **en el orificio seleccionado**: `Re = ρ·v·d/μ` con `v=Q/A_orif`, `d=√(4·A_orif/π)` (cálculo interno SI; `ν_cSt = viscCp/G`; atajo USC de verificación: `Re ≈ 2803·Q_gpm/(√A_in²·ν_cSt)`). **Kv analítico**: `Kv = min(1, 1/(0.9935 + 2.878/√Re + 342.75/Re^1.5))`. Iteración: A(Kv=1) → orificio API 526 → Re(orificio) → Kv → A → converger (<0.01 %, ≤20 iter). Validez Re ≥ 100 (menor → `reRangeWarning`).
Convención ΔP: `ΔP = P1−P2` con `P1 = set·(1+op) + 14.7` psia y `P2 = backpressure + 14.7` psia.

- A8.water: Q=300 gpm; G=0.85; visc≈1 cP (ν=1.176 cSt); set 100 psig liq @10 % → ΔP=110 psi; Kd=0.65 → A=(300/(38·0.65))·√(0.85/110)=12.1457·0.087905=**1.0677 in²** → orificio **J (1.287)**; Re_orif ≈ 2803·300/(√1.287·1.176) ≈ **6.3e5** → **Kv=1** (cap); margen **20.5 %**; Q_real **361.9 gpm**.
- A8.visc (ancla viscosa): Q=100 gpm; G=0.9; visc=1000 cP → ν=1111 cSt; ΔP=100 psi; Kd=0.65 → A0=(100/24.7)·√(0.9/100)=4.0486·0.09487=**0.3841 in²** → orificio **G (0.503)**; Re_orif ≈ 2803·100/(√0.503·1111) ≈ **356**; Kv = 1/(0.9935+2.878/18.87+342.75/6727) ≈ **0.8355**; A_final = A0/Kv ≈ **0.4597 in²** (sigue en orificio G, convergido); A_con_Kv ≥ A_sin_Kv; iteraciones < 20.
- A8.props: Kv(Re) monótono no-decreciente en Re y capped a 1 (Re≥~2e5 → Kv=1); viscCp ausente/≤0 → Kv=1 exacto sin iterar; Re<100 → reRangeWarning presente.
- A8.tablas: KB_TABLE/KW_TABLE monótonas no-crecientes en el rango derating; Kb(balanced, ratio 0 %)=1; Kb(pilot,·)=1; Kw(conventional,·)=1; interpolación lineal entre nudos (anclar 2 nudos de cada tabla).

## 9. Selección de orificio API 526

- A9.1 0.100→D; 0.110→D (frontera exacta); 0.111→E; 1.287→J; 1.29→K; 26.0→T; 26.1→`E_OVER_T`.
- A9.2 `realCapacity` margen: Areq 5.726 → P(6.38): margen 11.4 % (ancla §CONTRACTS 4.3).

## 10. APM / RBI

- A10.1 availability: window 720, downtime 36 → **95.0 %**.
- A10.2 mtbf: window 2160, downtime 60, fallos 3 → (2160−60)/3 = **700 h**; fallos 0 → null.
- A10.3 mttr: 60/3 = **20 h**.
- A10.4 oee: 0.95·0.90·0.98 = **0.8379**.
- A10.5 rbiRisk: (4,5)→score 20 `veryHigh`; (2,2)→4 `low`; (3,2)→6 `medium`; (3,4)→12 `high`; fronteras 4/5, 9/10, 15/16.
- A10.6 inspectionIntervalMonths base 24: low 24, medium 18, high 12, veryHigh 6; nextInspectionDate(from 2026-01-15, 6) → 2026-07-15.

## 11. Motor de reglas (fixtures planas, ver §3 SCHEMA)

- R1: lectura 12 mpy hace 12 h → 1 finding critical; 9.9 mpy → 0; lectura 12 mpy hace 30 h → 0.
- R2: condición `avg7 ≥ 2×avg30` con ≥5 lecturas por ventana: fixture avg7=5.0 / avg30=1.875 → ratio 2.67 → warning; avg7=5.0 / avg30=2.63 → ratio 1.90 → 0. (Corregido: el ancla original 6.0/2.9 era inalcanzable con ≥5 lecturas y CR≥0.)
- R3: par (blank CR 8, inh CR 2.8 → EI 65) → warning; EI 72 → 0.
- R4: target 25, residual 15 → 60 % → warning; residual 21 → 84 % → 0; residual 45 → 180 % → warning; residual 19 (76 %, dentro de [80−20,80)) → info temprano.
- R5: propiedad estadística — el z-score poblacional de un único outlier está acotado por (n−1)/√n ⇒ z>3 exige n≥11 lecturas en ventana. Fixtures: [2.00×11, 4.00] (n=12) → z≈3.32 dispara; [2.00×7, 3.50] (n=8, z≈2.65, cota 2.47-2.65) → no dispara. Stuck: 10 idénticas → dispara; 9 → no.
- R6: endDate now−91d → info; now−181d → warning; retired → 0.
- R7: modelo DWM 100 mpy (fijar tempC/pCO2 del MP), media7d 250 → ratio 2.5 critical; 25 → 0.25 info; 150 → 0.
- R8: pH2S 300 kPa → critical; 13.8 kPa → warning; 0.015 kPa → 0.
- R9: next −10 d → warning; −100 d → critical; +5 d → 0.
- R10: MTBF 90 d actual 300 vs previo 700 → ratio 0.43 → warning; 400 vs 700 (0.57) → 0.
- R11: disponibilidad 85 < 90 → warning; override 80 → 0.
- R12: 3 fallos/90 d → warning; 2 → 0.
- R13: nextTest −5 d → warning; −40 d → critical. R14: margin −8 % → critical.
- reconcile: finding nuevo → toCreate (status open, history created, actor, fingerprint); mismo fingerprint open → toUpdate (triggerCount++); mismo fingerprint resolved → toReopen (history reopened, status open); fingerprint ausente → sin cambios (NO auto-resolver).
- sweep integration (dbMemory): seed mínimo → recs persistidas, `meta.lastRulesRunISO` actualizado, evento `rules:run` emitido con conteos.

## 12. CSV / WITSML

- Fixtures: `tests/fixtures/sample-comma.csv` (5 filas: 3 válidas, 1 fecha futura, 1 duplicada de fila válida), `sample-semi.csv` (delim `;`), `sample-tab.tsv`, `sample-bad.csv` (Wf>Wi, mp inexistente sin autoCreate, CR=−3, fecha `31/31/2026`).
- detectDelimiter correcto en los 3; parse con comillas (`"nota, con coma"` intacto); mapColumns resuelve alias `Código Punto→mpCode`, `Tasa (mpy)→crMpy`? (alias exactos §6 SCHEMA), unmapped listado; validateRows: counts exactos por fixture; autoCreatePoints true → newPoints con ids `MP-IMP-###`; toRecords: fila con wi/wf/area/days → cupón con crMpy calculado (anclar con §1); fila con cr → lectura.
- WITSML: fixture `sample-witsml.xml` (2 wells, 3 stations, 1 canal×4 puntos, 1 elemento malformado) → counts + errors[0].code `E_WITSML_*`; canal con mpCode → 4 readings mapeadas.

## 13. i18n / store / export

- Paridad: para cada locale ≠ en: conjunto profundo de claves idéntico a `en` (recursivo); `__meta.dir` de `ar` = 'rtl', resto 'ltr'.
- t: clave ausente en es pero presente en en → devuelve en; ausente en ambos → devuelve la clave; params interpolados; sin params no rompe.
- store (dbMemory): put/get/list/query por índice (readings[mpId], lineAssets[systemId+stationKm]); save añade updatedAt y emite `data:changed:readings`; remove; clear.
- exportImport: round-trip export→clear→import(merge) ⇒ datos idénticos (deep equal salvo updatedAt); mode replace borra stores ausentes? NO: replace solo afecta stores presentes en payload; dryRun no muta.
- lock (con crypto de Node): enable→verify ok; pin malo 5× → lockoutSec>0; rol persistido.

## 14. Convenciones de código de test

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const corrosion = require('../src/calc/corrosion.js');
test('A1.1 ASTM G4 hand calc: 220 mg, 7.87 g/cm3, 2 in2, 720 h -> 10.366 mpy', () => {
  const r = corrosion.crFromWeightLoss({ deltaWmg: 220, densityGcm3: 7.87, areaIn2: 2.0, hours: 720 });
  assert.ok(Math.abs(r.mpy - 10.366) / 10.366 < 0.005);
});
```
Nombres de test comienzan con el id de ancla (A1.1, R5…). Fixtures en `tests/fixtures/`. Tiempo: fixtures de reglas usan `nowISO` fijo inyectado, nunca `Date.now()` dentro del motor (se pasa por `state.nowISO`).
