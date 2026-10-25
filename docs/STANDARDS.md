# STANDARDS.md — Normas implementadas y fórmulas de cálculo

Este documento es la referencia de ingeniería de IntegrityWatch Field. Lista las normas citadas por la aplicación y las fórmulas exactas que usa el código, con la referencia bibliográfica de cada una. Las fórmulas se implementan en `src/calc/*.js` y sus anclas numéricas verificadas a mano están en `docs/TESTS.md`.

> **Descargo de ingeniería completo.** IntegrityWatch Field es una **herramienta de apoyo** y no sustituye el criterio de un ingeniero cualificado ni la consulta de las ediciones vigentes de las normas. Algunas constantes (curvas `Kb`/`Kw` de API 520) son **digitizaciones aproximadas** que deben verificarse contra la edición actual antes de su uso en un diseño o en una decisión de operación. Los datos del fabricante del equipo prevalecen siempre sobre los valores por defecto de la aplicación.

---

## 1. Normas implementadas

Catálogo completo de `src/data/standards.js` (33 normas):

| # | Código | Título | Edición típica | Uso en la app |
|---|--------|--------|----------------|---------------|
| 1 | NACE/AMPP SP0775 | Preparation, Installation, Analysis, and Interpretation of Corrosion Coupons in Oilfield Operations | (2018) — verificar edición vigente | Corrosión (clasificación de severidad), informes |
| 2 | MR0175 / ISO 15156-2 | Petroleum and natural gas industries — Materials for use in H2S-containing environments | Verificar edición vigente | Corrosión (screening de servicio ácido), informes |
| 3 | ASTM G4 | Standard Guide for Conducting Corrosion Tests in Field Applications | Verificar edición vigente | Corrosión (tasa por pérdida de peso), informes |
| 4 | ASTM G1 | Standard Practice for Preparing, Cleaning, and Evaluating Corrosion Test Specimens | Verificar edición vigente | Corrosión (preparación de cupones), informes |
| 5 | ASTM G15 | Standard Terminology Relating to Corrosion and Corrosion Testing | Verificar edición vigente | Corrosión, glosario |
| 6 | API 520 Pt I | Sizing, Selection, and Installation of Pressure-relieving Devices — Part I | Verificar edición vigente | PSV (dimensionamiento), informes |
| 7 | API 526 | Flanged Steel Pressure-relief Valves | Verificar edición vigente | PSV (orificios), informes |
| 8 | API 5L | Specification for Line Pipe | Verificar edición vigente | Oleoductos, informes |
| 9 | ASME B31.4 | Pipeline Transportation Systems for Liquids and Slurries | Verificar edición vigente | Oleoductos, informes |
| 10 | ASME B31.8 | Gas Transmission and Distribution Piping Systems | Verificar edición vigente | Oleoductos, informes |
| 11 | ISO 55000 | Asset management — Overview, principles and terminology | Verificar edición vigente | APM, informes |
| 12 | ISO 14224 | Petroleum, petrochemical and natural gas industries — Collection and exchange of reliability and maintenance data | Verificar edición vigente | APM (MTBF/MTTR), informes |
| 13 | API 580 | Risk-Based Inspection | Verificar edición vigente | APM/RBI, informes |
| 14 | API 581 | Risk-Based Inspection Methodology | Verificar edición vigente | APM/RBI (matriz de riesgo), informes |
| 15 | NACE SP0169 | Control of External Corrosion on Underground or Submerged Metallic Piping Systems | Verificar edición vigente | Corrosión (protección catódica), informes |
| 16 | OGMP 2.0 | Oil & Gas Methane Partnership 2.0 Framework | Verificar edición vigente | Informes |
| 34 | API 579-1 / ASME FFS-1 | Fitness-For-Service — Part 3: Assessment of Existing Equipment for Brittle Fracture | Verificar edición vigente | FFS Nivel 1 (pérdida general de metal, screening de picaduras) |
| 35 | ASME B31G | Manual for Determining the Remaining Strength of Corroded Pipelines | Verificar edición vigente | Ductos: evaluación de defectos por pérdida de metal (original + Modified) |
| 36 | API 576 | Inspection of Pressure-relieving Devices | Verificar edición vigente | PSV: historial e inspección de dispositivos de alivio |

### Equipos de proceso, potencia y protección — por región

Las normas 17–33 cubren los equipos O&G incorporados al catálogo APM (bombas centrífugas y de desplazamiento positivo, generadores de potencia/servicio, subestación y protección contra incendio).

**EE.UU./internacional — equipos rotativos**

| # | Código | Título | Edición típica | Uso en la app |
|---|--------|--------|----------------|---------------|
| 17 | API STD 610 | Centrifugal Pumps for Petroleum, Petrochemical and Natural Gas Industries | (13th ed. 2026) — verificar edición vigente | APM (bombas centrífugas), informes |
| 18 | API STD 682 | Pumps—Shaft Sealing Systems for Centrifugal and Rotary Pumps | (2014) — verificar edición vigente | APM (sellos de bomba), informes |
| 19 | API STD 674 | Positive Displacement Pumps—Reciprocating | (2010) — verificar edición vigente | APM (bombas de desplazamiento positivo), informes |
| 20 | API STD 616 | Gas Turbines for the Petroleum, Chemical, and Gas Industry Services | (2011) — verificar edición vigente | APM (turbinas de gas), informes |
| 21 | ISO 13709 | Centrifugal pumps for petroleum, petrochemical and natural gas industries | (2009) — verificar edición vigente | APM (equivalente ISO de API 610), informes |
| 22 | ISO 8528 | Reciprocating internal combustion engine driven alternating current generating sets | (2018) — verificar edición vigente | APM (generadores de potencia/servicio), informes |
| 23 | IEEE 446 | IEEE Recommended Practice for Emergency and Standby Power Systems for Industrial and Commercial Applications | (1995) — verificar edición vigente | APM (energía de emergencia y respaldo), informes |

**EE.UU./internacional — protección contra incendio**

| # | Código | Título | Edición típica | Uso en la app |
|---|--------|--------|----------------|---------------|
| 24 | NFPA 20 | Standard for the Installation of Stationary Pumps for Fire Protection | (2022) — verificar edición vigente | APM (bombas contra incendio), informes |
| 25 | NFPA 25 | Standard for the Inspection, Testing, and Maintenance of Water-Based Fire Protection Systems | (2023) — verificar edición vigente | APM (inspección/mantenimiento de sistemas), informes |
| 26 | NFPA 11 | Standard for Low-, Medium-, and High-Expansion Foam | (2024) — verificar edición vigente | APM (sistemas de espuma), informes |

**Reino Unido**

| # | Código | Título | Edición típica | Uso en la app |
|---|--------|--------|----------------|---------------|
| 27 | BS 5306 | Fire extinguishing installations and equipment on premises | (partes, varía) — verificar edición vigente | APM (extinción), informes |
| 28 | BS EN 12845 | Fixed firefighting systems — Automatic sprinkler systems — Design, installation and maintenance | (2020) — verificar edición vigente | APM (rociadores automáticos), informes |
| 29 | EEMUA 191 | Alarm Systems — A Guide to Design, Management and Procurement | (2013) — verificar edición vigente | APM (gestión de alarmas), informes |

**Brasil**

| # | Código | Título | Edición típica | Uso en la app |
|---|--------|--------|----------------|---------------|
| 30 | NR-23 | Proteção Contra Incêndios | (2022) — verificar edición vigente | APM (protección contra incendio), informes |
| 31 | ABNT NBR 13714 | Sistemas de hidrantes e de mangotinhos para combate a incêndio | (2000) — verificar edición vigente | APM (hidrantes y mangotinhos), informes |
| 32 | ABNT NBR 17240 | Sistemas de detecção e alarme de incêndio — Projeto, instalação, comissionamento e manutenção | (2010) — verificar edición vigente | APM (detección y alarma), informes |
| 33 | NR-26 | Sinalização de Segurança — Cores de segurança | (2022) — verificar edición vigente | APM (colores de seguridad), informes |

---

## 2. Fórmulas implementadas

### 2.1 Tasa de corrosión por pérdida de peso — ASTM G4

```
CR = 534 · ΔW / (ρ · A · t)
```

| Símbolo | Significado | Unidades (USC) |
|---------|-------------|----------------|
| CR | Corrosion rate (tasa de corrosión) | mpy (mils/año) |
| ΔW | Pérdida de peso (weight loss) | mg |
| ρ | Densidad del material (density) | g/cm³ |
| A | Área expuesta (exposed area) | in² |
| t | Tiempo de exposición (exposure time) | horas |

Equivalencias de salida: `mm/año = mpy × 0.0254`; `µm/año = mpy × 25.4`.

### 2.2 Clasificación de severidad — NACE SP0775

Bandas sobre la tasa en mpy:

| Banda | Rango (mpy) | Nivel |
|-------|-------------|-------|
| low | CR < 1 | Bajo |
| moderate | 1 ≤ CR < 5 | Moderado |
| high | 5 ≤ CR < 10 | Alto |
| severe | CR ≥ 10 | Severo |

### 2.3 Eficiencia de inhibidor

```
EI = (CRb − CRi) / CRb · 100
```

donde `CRb` = tasa del cupón *blank* (sin inhibidor) e `CRi` = tasa del cupón inhibido.

| Banda | Rango EI (%) | Nivel |
|-------|--------------|-------|
| poor | EI < 70 | Deficiente |
| acceptable | 70 ≤ EI < 85 | Aceptable |
| good | 85 ≤ EI < 90 | Buena |
| excellent | EI ≥ 90 | Excelente |

### 2.4 Modelo de corrosión por CO₂ — De Waard & Milliams (1991)

Fórmula de **screening** (temperatura en Kelvin, pCO₂ en bar):

```
log10(CR_mm/año) = 5.8 − 1710/T + 0.67 · log10(pCO2)
```

`T` en Kelvin; `pCO2` en bar. El resultado se convierte a mpy (× 39.3701). Es un modelo predictivo simplificado: no sustituye mediciones ni cupones reales.

### 2.5 Servicio ácido — presión parcial de H₂S y MR0175/ISO 15156 (screening)

```
pH2S = P · x
```

`P` = presión total (kPa o psia); `x` = fracción molar de H₂S (≈ ppm / 10⁶).

Umbrales de **screening** (MR0175):

| Nivel | Rango pH₂S |
|-------|------------|
| low | pH₂S < 0.3 kPa |
| moderate | 0.3 kPa ≤ pH₂S ≤ 100 kPa |
| high | pH₂S > 100 kPa |

> **Nota**: estos umbrales son un screening preliminar. Las **regiones completas** de MR0175/ISO 15156 exigen además **pH y cloruros** del fluido para clasificar el ambiente. Consulte la edición vigente de la norma para un análisis definitivo de materiales.

### 2.6 Criterios de protección catódica — NACE SP0169

| Criterio | Condición de cumplimiento |
|----------|---------------------------|
| Potencial −850 mV vs CSE | Potencial medido ≤ −850 mV vs electrodo de cobre/sulfato de cobre (Cu/CuSO₄, CSE), con la corriente aplicada (polarizado / instant-off). |
| 100 mV de polarización | Al menos 100 mV de despolarización catódica respecto al potencial natural. |

Si no hay datos suficientes, el estado es `insufficient`.

### 2.7 Dimensionamiento de gas/vapor — API 520 Parte I

Flujo **crítico**:

```
A = W · √(T · Z / M) / (C · Kd · P1 · Kb · Kc)
```

Coeficiente de flujo `C`:

```
C = 520 · √( k · (2/(k+1))^((k+1)/(k−1)) )
```

(SI: `C = 0.03948 · √( k · (2/(k+1))^((k+1)/(k−1)) )`.)

Flujo **subcrítico** (cuando `P2/P1 > (2/(k+1))^(k/(k−1))`):

```
A = W · √( T · Z / (M · P1 · (P1−P2)) ) / (735 · F2 · Kd · Kc)
F2 = √( (k/(k−1)) · r^(2/k) · (1 − r^((k−1)/k)) / (1 − r) ),   r = P2/P1
```

| Símbolo | Significado |
|---------|-------------|
| W | Caudal másico (lb/h) |
| T | Temperatura absoluta de alivio (°R) |
| Z | Factor de compresibilidad |
| M | Masa molar (lb/lbmol) |
| k | Relación de calores específicos (cp/cv) |
| P1 | Presión de alivio absoluta (psia) = set × (1 + sobrepresión) + 14.7 |
| P2 | Contrapresión absoluta (psia) |
| Kd | Coeficiente de descarga (def. 0.975 para gas) |
| Kb | Factor de corrección por contrapresión |
| Kc | Factor de combinación con disco de ruptura (def. 1) |

### 2.8 Dimensionamiento de líquido — API 520 Parte I

```
A = Q · √(G / ΔP) / (38 · Kd · Kw · Kc · Kv)
```

| Símbolo | Significado |
|---------|-------------|
| Q | Caudal volumétrico (gpm) |
| G | Gravedad específica del líquido |
| ΔP | P1 − P2 (psia), con P1 = set × (1 + sobrepresión) + 14.7 y P2 = contrapresión + 14.7 |
| Kd | Coeficiente de descarga (def. 0.65 para líquido) |
| Kw | Factor de corrección por contrapresión en líquido |
| Kc | Factor de combinación (def. 1) |
| Kv | Factor de corrección por viscosidad (analítico) |

**Kv analítico** (API 520 §5.8.2):

```
Kv = min(1, 1 / (0.9935 + 2.878/√Re + 342.75/Re^1.5))
```

El número de Reynolds `Re` se calcula **en el orificio seleccionado** (dimensional):

```
Re = ρ · v · d / μ
v = Q / A_orificio
d = √(4 · A_orificio / π)
```

con `ν_cSt = viscCp / G` (cálculo interno en SI). Iteración: A(Kv=1) → orificio API 526 → Re(orificio) → Kv → A → converger (< 0.01 %, ≤ 20 iteraciones). **Validez**: `Re ≥ 100`; por debajo, la aplicación avisa `E_RE_RANGE` (fuera del rango de validez de API 520, evaluar una válvula especial).

### 2.9 Orificios estándar — API 526

Áreas de orificio (in²) por letra:

| Orificio | D | E | F | G | H | J | K | L | M | N | P | Q | R | T |
|----------|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Área (in²) | 0.110 | 0.196 | 0.307 | 0.503 | 0.785 | 1.287 | 1.838 | 2.853 | 3.60 | 4.34 | 6.38 | 11.05 | 16.00 | 26.00 |

La selección toma el **menor orificio cuya área ≥ área requerida**. Si el área requerida supera 26.00 in² (orificio T), se devuelve `E_OVER_T`.

### 2.10 Riesgo RBI — API 580 / API 581

```
Riesgo = POF × COF
```

`POF` (Probability Of Failure) y `COF` (Consequence Of Failure) en escala 1–5. Bandas:

| Banda | Score (POF×COF) | Intervalo de inspección sugerido (respecto a la base) |
|-------|-----------------|-------------------------------------------------------|
| low | ≤ 4 | base |
| medium | 5 – 9 | 0.75 × base |
| high | 10 – 15 | 0.5 × base |
| veryHigh | ≥ 16 | 0.25 × base |

Los umbrales de banda son **4 / 9 / 15**. El intervalo se redondea a 0.5 meses.

### 2.11 Fiabilidad y disponibilidad — ISO 14224

```
Disponibilidad (%) = (ventana − tiempo_no_disponible) / ventana · 100
MTBF = (ventana − tiempo_no_disponible) / nº_fallos        (h; null si 0 fallos)
MTTR = tiempo_no_disponible / nº_fallos                     (h)
OEE  = disponibilidad × rendimiento × calidad
```

Estas métricas alimentan las reglas APM (R9–R12) y los KPIs del panel.

### 2.12 Espesor requerido y MAWP — API 579-1/ASME FFS-1 Parte 3 Nivel 1

```
t_req = P · Ri / (S · E − 0.6 · P) + CA
```

| Símbolo | Significado | Unidades |
|---------|-------------|----------|
| t_req | Espesor mínimo requerido (required minimum thickness) | mm |
| P | Presión de diseño (design pressure) | MPa |
| Ri | Radio interno (inside radius) | mm |
| S | Esfuerzo permisible del material (allowable stress) | MPa |
| E | Eficiencia de junta soldada (joint efficiency) | 0..1 |
| CA | Margen de corrosión (corrosion allowance) | mm |

MAWP evaluado (pared adelgazada):

```
MAWP = S · E · (t − CA) / (Ri + 0.6 · (t − CA))
```

donde `t` es el espesor medido (mm). Si `t − CA ≤ 0`, MAWP = 0.

**Criterio de aceptación:** `t_medido ≥ t_req` → pasa.

**Screening de picaduras L1 (conservador):** `pitDepth ≤ t_medido − t_req`. 
El screening completo API 579 L2/L3 requiere reglas de interacción de LTAs, 
RSF y tensión de referencia, que no están implementados en este nivel.

**Supuestos y limitaciones (regla de oro):**
- Fórmula de tensión circunferencial para cascarones cilíndricos (aproximación de pared delgada).
- Nivel 1 solamente: pérdida general uniforme de metal, sin interacción de picaduras ni 
  eficiencia de junta para metales disímiles.
- El margen de corrosión (CA) reduce el espesor efectivo para la evaluación del MAWP.

### 2.13 Presión de fallo de ducto — ASME B31G (original) y Modified B31G

**B31G original:**

```
Sf = 1.25 · SMYS
Q = sqrt(1 + 0.628 · L² / (D · t))
Pf = (2/3) · Sf · t · [1 − (a/t)] / [1 − (a/t) / Q] / D
```

**Modified B31G:**

```
Sf = SMYS + 68.95 MPa     (SMYS + 10 000 psi)
b = 2 · sqrt(D · t)
L'_mod = min(L, b · 0.85)
Q = sqrt(1 + 0.628 · L'_mod² / (D · t))
Pf = (2/3) · Sf · t · [1 − (a/t)] / [1 − (a/t) / Q] / D
```

| Símbolo | Significado | Unidades |
|---------|-------------|----------|
| D | Diámetro exterior del ducto (outside diameter) | mm |
| t | Espesor nominal de pared (nominal wall thickness) | mm |
| SMYS | Límite elástico mínimo especificado (specified minimum yield strength) | MPa |
| a | Profundidad máxima de la pérdida de metal (depth = depthPct/100 · t) | mm |
| L | Longitud axial del defecto (axial length) | mm |
| Q | Factor de abultamiento (bulging factor) | — |
| Pf | Presión de fallo predicha (predicted failure pressure) | MPa |

**Presión de operación permisible:**

```
pAllow = Pf / (1.43 · DF)
```

donde `DF` es el factor de diseño (típicamente 0.72 para gasoductos en zona rural clase 1).

**Supuestos y limitaciones (regla de oro):**
- Defecto aislado único de pérdida de metal en tubería recta.
- No modela defectos interactuantes (RSTRENG), grietas ni abolladuras.
- No considera cargas axiales ni de flexión.
- La forma métrica de Q (`0.628 · L² / (D · t)`) es la equivalente de la forma 
  original en unidades USC (`67 · L² / (D · t)` con L en pulgadas y D, t en pulgadas).
- Modified B31G usa un flow stress más conservador (`SMYS + 10 000 psi`) que 
  el original (`1.25 · SMYS`) y optimiza la longitud efectiva con el parámetro `b`.
- Modified ≤ original en el mismo defecto (es más conservador).

### 2.14 Inspección de dispositivos de alivio — API 576

Campos de historial de inspección en la ficha de cada PSV:

| Campo | Significado |
|-------|-------------|
| inspLast | Fecha de la última inspección (API 576) |
| inspNext | Fecha de la próxima inspección programada |
| inspResult | Resultado de la última inspección: pass / fail / na |

**Regla R16:** PSV con `inspNext < hoy` → severidad **high** (inspección vencida per API 576).

**Regla R17:** Anomalía ILI evaluada contra la presión de operación del line system: 
si pAllow < opPressure con los parámetros SMYS/D/t del ducto → severidad **high**.

**Supuestos (regla de oro):**
- API 576 no prescribe intervalos fijos: la fecha `inspNext` la define el operador según 
  su programa de inspección.
- La regla R17 usa B31G original para evaluar cada anomalía contra la presión de operación 
  del ducto (no Modified).
- SMYS por defecto = 414 MPa (API 5L X52) si el material no está en el catálogo.

---

## 3. Digitizaciones y aproximaciones

- **Curvas `Kb` (contrapresión, gas) y `Kw` (contrapresión, líquido)**: se implementan como **tablas piecewise-lineales digitizadas** a partir de las figuras de API 520 Parte I, con interpolación lineal entre nudos. Son **aproximaciones**: verificar siempre contra la edición vigente de la norma. Los tests anclan propiedades (monotonicidad, extremos) y no los valores exactos de la figura.
- **`Kv` es analítico** (no digitizado): la fórmula de §2.8 está publicada en API 520 §5.8.2 y se verificó contra fuentes técnicas.
- **Zonas de validez**: el `Kv` analítico y el método de dimensionamiento de líquido asumen **`Re ≥ 100`** en el orificio. Fuera de ese rango la aplicación emite `E_RE_RANGE`.
- **`Kb` para válvulas convencionales**: la aplicación usa `Kb = 1.0` y advierte (`E_BP_CONV`) cuando la contrapresión superpuesta supera el 10 %, caso en el que se exige fuelle de compensación.
- **Unidades**: corrosión en mpy (con equivalencias mm/año y µm/año); PSV en USC (psig/psia, °F/°R, lb/h, gpm, in²) con equivalencias SI mostradas en pantalla.

---

## 2.15 Confiabilidad estadística (Weibull — ISO 14224)

**Motor:** `src/calc/reliability.js`

**Método de estimación:**
- **Median ranks (Bernard):** F_i = (i − 0.3) / (n + 0.4) para i = 1..n
- **Estimación de parámetros:** regresión por mínimos cuadrados sobre x = ln(t), y = ln(−ln(1 − F_i)) (RRX)
- **CDF de Weibull:** F(t) = 1 − exp(−(t/η)^β)
- **B10 life:** t_B10 = η · (−ln 0.9)^(1/β)
- **Clasificación del patrón de fallo (β):** early-life (β < 0.8), random (0.8 ≤ β ≤ 1.2), wear-out (β > 1.2), insufficient (n < 2)
- **MTBF con intervalo de confianza:** método chi-cuadrado (supuesto exponencial), cuantiles chi-cuadrado vía aproximación Wilson-Hilferty: χ² ≈ df·(1 − 2/(9df) + z_p·√(2/(9df)))³. Los valores z usados: z_0.90 = 1.2816, z_0.95 = 1.6449, z_0.05 = −1.6449, z_0.10 = −1.2816.
- **Horas operativas (supuesto para MTBF):** totalHours = diferencia temporal entre el momento actual y la fecha del primer evento de fallo registrado para el activo. Este es un supuesto documentado; en producción, las horas operativas deben obtenerse del sistema de control del equipo.

**Limitaciones:**
- El método RRX supone que los tiempos de fallo son independientes e idénticamente distribuidos según una Weibull de 2 parámetros.
- El IC del MTBF asume distribución exponencial de los tiempos de fallo (caso particular β = 1.0 de la Weibull) y es válido solo para datos de campo sin censura (todos los equipos fallan durante la observación).
- La aproximación Wilson-Hilferty pierde precisión para df < 10 (pocos fallos) o p extremas (fuera de [0.05, 0.95]).
- Los tiempos de fallo nulos, negativos o no finitos se descartan automáticamente del ajuste.
- El análisis requiere al menos 2 eventos de fallo con intervalos de tiempo entre fallos (TBF) medibles; con menos de 2 TBF, el resultado es insuficiente.

---

## 2.16 Formato de expediente portátil .iwf

**Motor:** `src/core/caseFile.js`

**Especificación del envelope:**
```json
{
  "format": "iwf",
  "version": 1,
  "sector": "midstream",
  "exportedAt": "2026-10-24T00:00:00.000Z",
  "app": "1.0.0",
  "checksum": "a82fb4a1",
  "data": { "apmAssets": [...], "apmEvents": [...], ... }
}
```

**Integridad criptográfica:**
- **Checksum:** FNV-1a de 32 bits sobre `canonicalStringify(data)`. La función `canonicalStringify` serializa el objeto data con claves ordenadas lexicográficamente (recursivo) y sin espacios, produciendo una representación canónica determinista.
- **Verificación en importación:** `parseCaseFile(text)`:
  1. `JSON.parse` — fallo → `E_BAD_JSON`
  2. `obj.format === 'iwf'` — fallo → `E_BAD_FORMAT`
  3. `obj.version === 1` — versión futura → `E_VERSION`
  4. `fnv1a(canonicalStringify(obj.data)) === obj.checksum` — fallo → `E_CHECKSUM` (archivo manipulado)

**Uso:** el botón «Exportar expediente (.iwf)» en la vista Admin genera un archivo con extensión `.iwf` que contiene el envelope completo. El botón «Importar expediente (.iwf)» valida el envelope y restaura los stores usando la misma ruta de importación que el respaldo JSON estándar.

---

## 2.17 Formato de evidencia de campo en inspecciones

**Motor:** `src/components/signaturePad.js`, `src/components/inspectionEvidence.js`, `src/calc/exif.js`

**Campos en el registro `lineInspection`:**

- **`signature`** (opcional): `data:` URL PNG de firma manuscrita capturada con canvas (fondo blanco, línea negra 2px, escalado por `devicePixelRatio`).
- **`photos`** (opcional): array de objetos `{ dataUrl, capturedAt, gps }`. Máximo 6. `dataUrl` es JPEG reescalado a ≤1024px en el lado mayor (calidad 0.85). `capturedAt` es ISO 8601 derivado de EXIF `DateTimeOriginal` (tag 0x9003). `gps` es `{ lat, lon, alt }` en grados decimales con signo N/E positivo, derivado de EXIF GPS IFD (tags 1-6).
- **`sketch`** (opcional): `data:` URL PNG de croquis/boceto capturado con el mismo componente `createSignaturePad`.

**Parser EXIF:** `src/calc/exif.js` implementa un parser JPEG mínimo que busca el marcador APP1 con cabecera `Exif\0\0`, parsea TIFF little/big-endian, extrae Make/Model de IFD0, DateTimeOriginal de ExifIFD (vía puntero 0x8769) y coordenadas GPS de GPS IFD (vía puntero 0x8825). No lanza nunca: JPEG sin EXIF devuelve todos los campos como `null`.

**Límites y validación:**
- Máximo 6 fotos por inspección (validado en cliente con toast).
- Las fotos se reescalan siempre a ≤1024px para no inflar IndexedDB.
- La firma y el croquis son PNG (pocos KB en la práctica).
- El checksum FNV-1a del expediente `.iwf` (sección 2.16) maneja los dataURLs grandes mediante `canonicalStringify` (serialización canónica con claves ordenadas).

---

## 4. Descargo de ingeniería completo

IntegrityWatch Field es una **herramienta de apoyo a la decisión**. Sus resultados de cálculo (tasas de corrosión, dimensionamiento de válvulas, eficiencia de inhibidor, análisis de riesgo, intervalos de inspección) son **orientativos** y deben ser:

1. **Verificados** contra las ediciones vigentes de las normas citadas (los códigos y ediciones indicados pueden estar desactualizados).
2. **Validados** contra los datos del fabricante de los equipos (válvulas, cupones, materiales), que prevalecen sobre los valores por defecto.
3. **Revisados** por personal de ingeniería cualificado antes de tomar decisiones de diseño u operación.

Ningún valor generado por la aplicación constituye una certificación ni una recomendación de diseño vinculante.

---

## 5. Referencias bibliográficas públicas

- NACE SP0775-2018, *Preparation, Installation, Analysis, and Interpretation of Corrosion Coupons in Oilfield Operations*, NACE International / AMPP.
- ANSI/NACE MR0175 / ISO 15156-2, *Petroleum and natural gas industries — Materials for use in H2S-containing environments in oil and gas production*.
- ASTM G4, *Standard Guide for Conducting Corrosion Tests in Field Applications*, ASTM International.
- ASTM G1, *Standard Practice for Preparing, Cleaning, and Evaluating Corrosion Test Specimens*, ASTM International.
- ASTM G15, *Standard Terminology Relating to Corrosion and Corrosion Testing*, ASTM International.
- API Standard 520 Part I, *Sizing, Selection, and Installation of Pressure-relieving Devices*, American Petroleum Institute.
- API Standard 526, *Flanged Steel Pressure-relief Valves*, American Petroleum Institute.
- API Specification 5L, *Specification for Line Pipe*, American Petroleum Institute.
- ASME B31.4, *Pipeline Transportation Systems for Liquids and Slurries*, ASME.
- ASME B31.8, *Gas Transmission and Distribution Piping Systems*, ASME.
- ISO 55000, *Asset management — Overview, principles and terminology*, ISO.
- ISO 14224, *Petroleum, petrochemical and natural gas industries — Collection and exchange of reliability and maintenance data for equipment*, ISO.
- API RP 580, *Risk-Based Inspection*, American Petroleum Institute.
- API RP 581, *Risk-Based Inspection Methodology*, American Petroleum Institute.
- NACE SP0169, *Control of External Corrosion on Underground or Submerged Metallic Piping Systems*, NACE International / AMPP.
- De Waard, C. & Milliams, D. E., *Carbonic acid corrosion of steel*, Corrosion, 31(5):177–181, 1975; y revisión de 1991 para el modelo de CO₂.
- OGMP 2.0, *Oil & Gas Methane Partnership 2.0 Framework*, United Nations Environment Programme (UNEP).

### Equipos de proceso, potencia y protección contra incendio (normas 17–33)

- API STD 610, *Centrifugal Pumps for Petroleum, Petrochemical and Natural Gas Industries*, American Petroleum Institute.
- API STD 682, *Pumps—Shaft Sealing Systems for Centrifugal and Rotary Pumps*, American Petroleum Institute.
- API STD 674, *Positive Displacement Pumps—Reciprocating*, American Petroleum Institute.
- API STD 616, *Gas Turbines for the Petroleum, Chemical, and Gas Industry Services*, American Petroleum Institute.
- ISO 13709, *Centrifugal pumps for petroleum, petrochemical and natural gas industries*, ISO.
- ISO 8528, *Reciprocating internal combustion engine driven alternating current generating sets*, ISO.
- IEEE 446, *IEEE Recommended Practice for Emergency and Standby Power Systems for Industrial and Commercial Applications*, IEEE.
- NFPA 20, *Standard for the Installation of Stationary Pumps for Fire Protection*, National Fire Protection Association.
- NFPA 25, *Standard for the Inspection, Testing, and Maintenance of Water-Based Fire Protection Systems*, National Fire Protection Association.
- NFPA 11, *Standard for Low-, Medium-, and High-Expansion Foam*, National Fire Protection Association.
- BS 5306, *Fire extinguishing installations and equipment on premises*, British Standards Institution.
- BS EN 12845, *Fixed firefighting systems — Automatic sprinkler systems — Design, installation and maintenance*, British Standards Institution / CEN.
- EEMUA 191, *Alarm Systems — A Guide to Design, Management and Procurement*, Engineering Equipment and Materials Users Association.
- NR-23, *Proteção Contra Incêndios*, Ministério do Trabalho e Emprego (Brasil).
- ABNT NBR 13714, *Sistemas de hidrantes e de mangotinhos para combate a incêndio*, ABNT.
- ABNT NBR 17240, *Sistemas de detecção e alarme de incêndio*, ABNT.
- NR-26, *Sinalização de Segurança — Cores de segurança*, Ministério do Trabalho e Emprego (Brasil).
