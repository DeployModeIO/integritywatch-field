# Implementation Plan: IntegrityWatch Field

**Clasificación (brainstorming):** architectural — aplicación nueva multi-módulo, offline-first, 7 idiomas.
**Fecha:** 2026-10-15 · **Arquitecto:** Arquitecto Supremo (orquestador) · **Implementación:** delegada a subagentes `coder` / `tester` / `reviewer`.
**Ruta de entrega:** `D:\ArquitectoSupremo\integritywatch-field` (repo git autónomo).

## Overview

PWA offline-first (opcional Electron) para operaciones de integridad y cumplimiento en campo petrolero:
corrosión (NACE/AMPP), válvulas de alivio (API 520/526), oleoductos y activos de línea (midstream),
APM multi-sector (API 580/581, ISO 55000/14224), ingesta CSV/WITSML-lite, motor de reglas R1–R14,
informes PDF (print-first), glosario multilingüe y administración offline. 100 % local: IndexedDB +
service worker; sin backend obligatorio, sin CDN, sin dependencias runtime.

## Fuera de alcance

- SCADA real / protocolo Modbus-OPC en vivo.
- WITSML/ETP certificado (solo subconjunto ligero documentado).
- Backend obligatorio, autenticación federada, multi-tenant.
- Referencia o reutilización de código de proyectos existentes del usuario
  (`api520-calculator`, `corrosion-hmi`, `corrtrack-nace`, `BibliotecaDePromps`) — solo se usan las
  normas/fórmulas como referencia técnica pública.

## Architecture Decisions

| ID | Decisión | Justificación |
|----|----------|---------------|
| D-01 | **JavaScript vanilla "dual-mode" (UMD-lite, scripts clásicos)** en lugar de ES modules puros | Los navegadores modernos (Chrome/Edge/Firefox/Safari) **bloquean ES modules bajo `file://`** (CORS). El criterio de calidad exige que la app funcione abriendo `index.html`. UMD-lite (`globalThis.IW` + `module.exports`) cumple ambos: runtime sin servidor **y** tests Node (`node --test`). Sigue siendo vanilla JS sin build. |
| D-02 | **PDF print-first**: vistas A4 optimizadas + `@media print` (Ctrl+P → PDF). No se vende jsPDF (librería externa de ~350 KB imposible de incluir sin CDN/repositorio binario) | Cumple "export PDF desde el cliente sin servidor" con cero dependencias; documentado en DEPLOY.md. |
| D-03 | **Mapa schemático SVG inline** (no Leaflet) | Cero dependencias, nodos posicionados por estación kilométrica (km) del sistema de línea; teclado/ARIA/contraste controlados al 100 %. |
| D-04 | **Bloqueo local opcional con PBKDF2-SHA256 (WebCrypto, 210 000 it) + pepper aleatorio local**, roles admin/operador, rate-limit 5 intentos → 30 s | WebCrypto no expone scrypt en navegador; sin backend no hay cookies/CSRF aplicables. Desviación documentada; secretos nunca en código. |
| D-05 | **Datos de demostración deterministas** (PRNG mulberry32, seed 42) cargables desde Admin | Dashboard/mapa/reglas demostrables en el primer arranque; tests estables. |
| D-06 | **Curvas Kb/Kw de API 520 como tablas piecewise-linear digitizadas** (comentario de fuente + aviso "verificar contra edición vigente"); **Kv analítico**: `min(1, 1/(0.9935+2.878/√Re+342.75/Re^1.5))` con Re dimensional en el orificio seleccionado (API 520 §5.8.2) | Las cifras exactas de figuras API no son reproducibles sin la norma; la fórmula analítica de Kv SÍ está publicada y se verificó contra fuentes técnicas (corrección post-T4). Tests anclan propiedades (monotonía, extremos, convergencia) + ejemplos trabajados. |
| D-07 | Unidades canónicas: corrosión en **mpy** (+mm/año, µm/año derivados), proceso en °C/ppm/bar-kPa; PSV en **USC** (psig/psia, °F/°R, lb/h, gpm, in²) con equivalencias SI mostradas | Coincide con las fórmulas de API 520 Parte I y SP0775; evita un framework de unidades completo. |
| D-08 | `node:test` + `node:assert` (Node ≥ 20) como suite; cobertura con `--experimental-test-coverage`; gate ≥ 80 % en `src/calc` y `src/rules` | Cero dependencias, TDD real, medible. |
| D-09 | START-HERE.bat + `tools/serve.ps1`/`serve.py` (HttpListener/ThreadingHTTPServer) para modo PWA/HTTP; `file-guard.js` muestra instrucciones localizadas si se abre por `file://` en navegador que bloquee algo | Doble clic = funciona (file:// completo salvo SW); PWA instalable con un clic en START-HERE. |

## Documentación contractual (fuente de verdad para todos los subagentes)

- `docs/CONTRACTS.md` — convenciones, árbol de archivos con propiedad por fase, patrón UMD-lite, namespaces y firmas públicas, tokens CSS, reglas A11y/CSP, interfaz de vistas y rutas.
- `docs/SCHEMA.md` — esquema IndexedDB, API del adaptador de almacén, forma de recomendaciones, catálogo de reglas R1–R14, inventario completo de claves i18n, formas de datos (materiales, fluidos, glosario, normas, seed).
- `docs/TESTS.md` — convenciones de test y **anclas numéricas verificadas a mano** (ASTM G4, SP0775, EI, De Waard-Milliams, pH₂S, C(k), área gas/líquido, orificios API 526, APM/RBI, reglas, CSV, i18n).

## Task List (fases con propiedad estricta de archivos)

### Phase A: Foundation (paralela: T1a + T1b)
- [x] T1a — Plataforma estática: `index.html` (CSP, zero inline, orden de scripts), `assets/styles/*` (tokens/base/layout/components/print), `assets/icons/*.svg`, `sw.js`, `manifest.webmanifest`, `tools/serve.ps1`, `tools/serve.py`, `tools/make-icons.ps1` (+PNGs generados), `START-HERE.bat`, `package.json` (solo scripts de test).
- [x] T1b — Núcleo de app + stubs: `src/app/{main,shell,router,theme}.js`, `src/components/{ui,icons}.js`, `src/compat/file-guard.js`, `src/calc/units.js` (**implementación real**, es pequeña) y **stubs conformes a contrato** de todos los demás archivos `src/**` + `tests/` vacíos con runner.

### Checkpoint A
- [x] `node --test tests/` corre (stubs verdes), app abre por `file://` (shell visible, i18n stub en), `node --check` pasa en todos los JS.

### Phase B: Motores (paralela, 7 tareas, archivos disjuntos)
- [x] T2a — i18n motor (`src/i18n/i18n.js`) + locales `en`, `es`, `pt` (inventario completo de SCHEMA.md).
- [x] T2b — locales `fr`, `zh`, `ru`, `ar` (mismo inventario; `ar` con `dir:"rtl"`).
- [x] T3 — Motor corrosión (`src/calc/corrosion.js`) + `src/data/materials.js` + `src/data/fluids.js` + `tests/corrosion.test.js` (TDD, anclas de TESTS.md).
- [x] T4 — Motor PSV (`src/calc/psv.js`) + `tests/psv.test.js` (TDD, anclas + tablas Kb/Kw/Kv D-06).
- [x] T5 — Capa datos (`src/core/{db,dbMemory,store,exportImport,syncQueue,bus}.js`) + `src/calc/apm.js` + `src/security/lock.js` + `tests/{apm,store,exportImport}.test.js`.
- [x] T6 — Motor reglas (`src/rules/{engine,definitions}.js`) + `tests/rules.test.js` (R1–R14, reopen, dedupe, auditoría).
- [x] T7 — Ingesta (`src/ingest/{csv,witsmlLite}.js`) + `tests/{csv,witsml}.test.js` + fixtures.

### Checkpoint B
- [x] Suite completa verde; cobertura ≥ 80 % en `src/calc` y `src/rules`; paridad de claves en 7 locales (test i18n).

### Phase C: UI (paralela, 3 tareas, archivos disjuntos; leen el código real de B)
- [x] T8 (UI-A) — `src/views/{dashboard,corrosion,psv}.js` + `assets/styles/views-a.css`.
- [x] T9 (UI-B) — `src/views/{pipelines,pipelineMap,apm}.js` + `assets/styles/views-b.css`.
- [x] T10 (UI-C) — `src/views/{ingest,recommendations,reports,glossary,admin}.js` + `src/reports/{quarterly,dossier,datasheet}.js` + `assets/styles/views-c.css`.
- Regla: claves i18n faltantes se **reportan** (no se editan locales en C); fallback en→clave mantiene la app funcional.

### Checkpoint C
- [x] Navegación completa por hash sin errores de consola; estados vacíos correctos; accesibilidad (foco, ARIA, 44 px).

### Phase D: Datos + Docs (paralela: D1 + D2)
- [x] D1 — `src/data/{glossary,standards,seed}.js` (36+ términos × 7 idiomas; seed determinista que dispara R1/R5/R13 de demo) + **barrido de huecos i18n** consolidado de reportes de fase C (único dueño de locales en D).
- [x] D2 — `README.md` (ES, no-programador), `docs/DEPLOY.md`, `docs/STANDARDS.md` (normas+fórmulas+referencias), `electron/{main.js,preload.js,package.json,README.md}` (servidor http interno + loadURL), verificación final `node --test` y `node --check`.

### Phase E/F: Verificación (paralela)
- [x] E — `tester`: suite completa + cobertura (sandbox Podman con imagen node; fallback local), humo HTTP (serve + todos los archivos referenciados existen, 200), reporte tabla.
- [x] F — `reviewer`: revisión integral vs especificación (seguridad CSP/DOM-seguro/secretos, a11y, contratos, spot-check de cálculos vs TESTS.md, paridad i18n) → lista BLOCKER/MAJOR/MINOR con archivo:línea.

### Phase G: Correcciones
- [x] G — `coder`: resolver BLOCKER+MAJOR (MINOR baratos), re-verdear suite.

### Phase H: Verificación en navegador (orquestador, chrome-devtools MCP)
- [x] Servir con `tools/serve.ps1`; recorrer dashboard/corrosión/PSV/mapa/APM/informe; hot-switch es→ar (RTL) y claro→oscuro; 0 errores de consola; capturas como evidencia.

### Phase I: Cierre
- [x] `git init` + commit inicial; memoria (qdrant-store, etiqueta `DEC-20261015-integritywatch`); informe final con árbol, instrucciones y lista de normas.

## Quality Gates (Definition of Done)

1. Todos los cálculos con tests unitarios y anclas verificadas a mano (TESTS.md).
2. `node --test` 100 % verde; cobertura ≥ 80 % en motores de cálculo y reglas.
3. App funcional por `file://` (salvo SW) y por `START-HERE.bat`; PWA instalable en modo HTTP.
4. Hot-switch de idioma (7) y tema (claro/oscuro/sistema) sin recarga, persistidos en localStorage.
5. RTL completo para árabe (propiedades lógicas CSS + `dir`).
6. WCAG 2.1 AA: contraste ≥ 4.5:1 texto / ≥ 3:1 UI, foco visible, objetivos ≥ 44×44, alarmas color+icono+texto, skip-link, mapa navegable por teclado.
7. Informes PDF desde cliente (print), mapa SVG, cero CDN, cero emojis-ícono, cero secretos.
8. Reviewer sin BLOCKER abiertos; descargo de ingeniería visible en cada informe y en el pie global.

## Risks and Mitigations

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Brechas de claves i18n entre fases B/C | Medio | Inventario cerrado en SCHEMA.md; fallback en→clave; barrido D1 con lista consolidada de reportes C. |
| Constantes de curvas API 520 (Kb/Kw/Kv) sin acceso a la norma | Medio | D-06: tablas digitizadas documentadas + tests de propiedades + descargo visible "validar contra edición vigente". |
| Colisiones de escritura entre subagentes paralelos | Alto | Propiedad estricta de archivos por tarea (CONTRACTS.md §2); fases secuenciales A→B→C→D; UI-CSS por tarea (`views-{a,b,c}.css`); index.html solo lo toca T1a. |
| Deriva de contratos entre motor y UI | Alto | Firmas públicas congeladas en CONTRACTS.md; fase C lee código real de B antes de escribir. |
| `file://` vs service worker | Bajo | SW solo se registra bajo http(s); file-guard explica el modo; START-HERE.bat para PWA. |

## Open Questions

- Ninguna bloqueante. D-01 (dual-mode vs ES modules puros) se somete a aprobación del usuario junto con el plan.
