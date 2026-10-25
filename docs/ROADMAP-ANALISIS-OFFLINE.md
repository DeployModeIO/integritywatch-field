# Roadmap — Análisis offline de élite (Fase 1 en curso)

> **Visión:** que IntegrityWatch Field sea **la mejor herramienta offline del mundo para analizar datos de campo** (lecturas UT, cupones, inspecciones, tablas ILI) — sin sensores, sin telemetría, sin nube. El dato entra por humanos; la ingeniería la extrae la app, en el navegador, sin internet.

Estilo visual obligatorio de todo lo nuevo: **"Experion® PKS-inspired"** (ISA-101) — ver `docs/VISUAL-SPEC.md` §9: grises neutros, color solo para lo anómalo, faceplates planos, badges cuadrados con LED, numerales mono, sin gradientes, CSP sin estilos inline.

---

## Motores analíticos offline (el "plus")

| # | Motor | Norma/base | Estado |
|---|---|---|---|
| M1 | RBI cuantitativo dinámico (POF numérico por corriente de daño, riesgo recalculado con cada lectura) | API 581 | Fase 1 (base) |
| M2 | Vida remanente de pared (RUL) con banda de confianza | proyección CR vs T-min | **Fase 1** |
| M3 | Tendencias y SPC (regresión, outliers por z-score modificado, clasificación de tendencia) | ISO 17359 (estructura) | **Fase 1** |
| M4 | Taxonomía ISO 14224 en activos (modo de fallo / consecuencia) | ISO 14224 | **Fase 1** |
| M5 | Fitness-For-Service Nivel 1 (pérdida general/local, picadura) | API 579-1/ASME FFS-1 | Fase 2 |
| M6 | Ductos: importación de anomalías ILI + presión segura por tramo | ASME B31G/RSTRENG, DNV-RP-F101, API 1163 | Fase 2 |
| M7 | PSV: historial e inspección de dispositivos | API 576 | Fase 2 |
| M8 | Confiabilidad estadística (Weibull β/η, P(fallo) a 30/90/180 días, MTBF con IC) | ISO 14224 | ✅ Fase 3 (F3a) |
| M9 | Ingesta universal de campo (plantillas Excel multi-hoja, fotos con EXIF, firmas, croquis, expediente portátil `.iwf`) | — | ✅ F3b (fotos EXIF + firma + croquis en inspecciones de ducto) |
| M10 | Corrosión avanzada (NORSOK M-506, CUI API 583, MIC checklist) | NORSOK M-506, API 583 | Fase 4 |
| M11 | IA analítica local (RAG offline de normas propias + asistente de causa raíz y redacción; LLM en navegador o GPU local) | — | Fase 4 |

## Fase 1 (en curso) — alcance

1. **`src/calc/remainingLife.js`** — ajuste por mínimos cuadrados sobre lecturas, RUL en meses hasta T-min, clasificación de confianza (n, R²).
2. **`src/calc/spc.js`** — tendencia lineal con IC, outliers (z-score modificado/MAD), clasificación estable/aumenta/disminuye/insuficiente.
3. **Vista Corrosión** — faceplate "Vida remanente" (LED verde ≥24 m / ámbar 12–24 / rojo <12 / gris sin dato), chip de tendencia, lectura atípica marcada en la tabla, campo opcional `tMin` en el formulario del punto.
4. **Regla R15** — recomendación automática cuando RUL < 12 meses (se suma a R1–R14 → R1–R15).
5. **APM** — campos ISO 14224 (modo de fallo, consecuencia) en formulario/ficha.
6. **i18n** — claves nuevas en los 7 idiomas (paridad obligatoria).

## Reglas de oro (no negociables)

- Cero dependencias runtime; vanilla JS UMD-lite (compatible `file://` + tests Node).
- CSP `style-src 'self'`: prohibido estilos inline; todo en `assets/styles/*.css`.
- Cada fórmula con golden cases y tests (la misma disciplina que API 520).
- Determinismo: mismos datos → mismos resultados, sin relojes ocultos.
- Cada motor documenta sus supuestos y limitaciones en `docs/STANDARDS.md`.

## Roadmap temporal

| Fase | Horizonte | Contenido |
|---|---|---|
| F1 Análisis base | 0–3 meses | M2, M3, M4, M1 base (este documento) |
| F2 FFS + Ductos | 3–6 meses | M5, M6, M7 |
| F3 Estadística + ingesta | 4–9 meses | M8, M9 |
| F4 Corrosión avanzada + IA local | 9–12+ meses | M10, M11 |

*Fuente del análisis: informe técnico 24-10-2026 (comparativa Honeywell 2026 + estado del arte offline).*
