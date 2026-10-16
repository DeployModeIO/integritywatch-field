# STANDARDS.md — Normas implementadas y fórmulas de cálculo

Este documento es la referencia de ingeniería de IntegrityWatch Field. Lista las normas citadas por la aplicación y las fórmulas exactas que usa el código, con la referencia bibliográfica de cada una. Las fórmulas se implementan en `src/calc/*.js` y sus anclas numéricas verificadas a mano están en `docs/TESTS.md`.

> **Descargo de ingeniería completo.** IntegrityWatch Field es una **herramienta de apoyo** y no sustituye el criterio de un ingeniero cualificado ni la consulta de las ediciones vigentes de las normas. Algunas constantes (curvas `Kb`/`Kw` de API 520) son **digitizaciones aproximadas** que deben verificarse contra la edición actual antes de su uso en un diseño o en una decisión de operación. Los datos del fabricante del equipo prevalecen siempre sobre los valores por defecto de la aplicación.

---

## 1. Normas implementadas

Catálogo completo de `src/data/standards.js` (16 normas):

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

---

## 3. Digitizaciones y aproximaciones

- **Curvas `Kb` (contrapresión, gas) y `Kw` (contrapresión, líquido)**: se implementan como **tablas piecewise-lineales digitizadas** a partir de las figuras de API 520 Parte I, con interpolación lineal entre nudos. Son **aproximaciones**: verificar siempre contra la edición vigente de la norma. Los tests anclan propiedades (monotonicidad, extremos) y no los valores exactos de la figura.
- **`Kv` es analítico** (no digitizado): la fórmula de §2.8 está publicada en API 520 §5.8.2 y se verificó contra fuentes técnicas.
- **Zonas de validez**: el `Kv` analítico y el método de dimensionamiento de líquido asumen **`Re ≥ 100`** en el orificio. Fuera de ese rango la aplicación emite `E_RE_RANGE`.
- **`Kb` para válvulas convencionales**: la aplicación usa `Kb = 1.0` y advierte (`E_BP_CONV`) cuando la contrapresión superpuesta supera el 10 %, caso en el que se exige fuelle de compensación.
- **Unidades**: corrosión en mpy (con equivalencias mm/año y µm/año); PSV en USC (psig/psia, °F/°R, lb/h, gpm, in²) con equivalencias SI mostradas en pantalla.

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
