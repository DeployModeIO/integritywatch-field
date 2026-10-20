# IntegrityWatch Field

**Centro de operaciones de integridad y cumplimiento, offline-first, para trabajo en campo petrolero.**

IntegrityWatch Field es una aplicación que funciona **completamente en tu computadora o dispositivo, sin internet y sin servidor obligatorio**. Reúne en un solo lugar las tareas de integridad más comunes de un campo: corrosión, válvulas de alivio, oleoductos, gestión de activos, inspecciones, recomendaciones e informes. Todo se guarda localmente en tu navegador (IndexedDB) y puedes instalarla como una aplicación (PWA) para usarla sin conexión.

> **Herramienta de apoyo. Valida siempre los resultados contra las ediciones vigentes de las normas y los datos del fabricante de los equipos.** Los cálculos se basan en fórmulas publicadas de normas reconocidas (NACE/AMPP, API, ASME, ASTM, ISO); consulta `docs/STANDARDS.md` para ver la referencia exacta y las aproximaciones.

---

## Portada

**IntegrityWatch Field**

**Una frase de valor:** Centro de operaciones de integridad y cumplimiento offline-first para trabajo en campo petrolero

**Badges:** ![Offline-first](https://img.shields.io/badge/Offline--first-007acc) ![7 idiomas](https://img.shields.io/badge/7%20idiomas-007acc) ![300 tests](https://img.shields.io/badge/300%20tests-28a745) ![PWA](https://img.shields.io/badge/PWA-007acc) ![Sin dependencias](https://img.shields.io/badge/Sin%20dependencias-runtime-007acc)

**Aviso de descargo de ingeniería:** Herramienta de apoyo. Valida siempre contra las ediciones vigentes de las normas y los datos del fabricante. Los resultados de cálculo son orientativos y deben ser revisados por personal cualificado.

---

## Qué es y para quién

**Ingeniería de integridad en campo oil & gas:** Corrosión, PSV, ductos, APM, cumplimiento

IntegrityWatch Field es una aplicación web progresiva (PWA) offline-first diseñada específicamente para profesionales de integridad en campo petrolero. Combina en una sola interfaz las principales tareas de integridad que se realizan diariamente en los sitios de producción:

- **Corrosión y protección contra corrosión** (corrosión por pérdida de peso, inhibidores, protección catódica)
- **Válvulas de seguridad y alivio** (dimensionamiento según API 520/526, registro de pruebas)
- **Oleoductos y activos de línea** (mantenimiento de ductos, inspecciones ILD/UT, activos por estación kilométrica)
- **Gestión de activos y confiabilidad** (APM, RBI según API 580/581, intervalos de inspección)
- **Recolección de datos** (importación CSV, WITSML-lite, validación)
- **Motor de recomendaciones** (R1-R14 para toma de decisiones)
- **Informes y cumplimiento** (trimestrales, técnicos, legales)

**Dirigido a:** Operadores de campo, ingenieros de integridad, técnicos de mantenimiento, supervisores de campo que necesitan acceso rápido y fiable a los datos de integridad sin depender de conexión a internet o servidores externos.

---

## Capturas

Galería de evidencia visual organizada por módulo. Todas las capturas viven en `docs/evidence/` y corresponden a vistas reales renderizadas con los datos de demostración.

### Panel y operación

![Panel — tema claro (ES)](docs/evidence/dashboard-light-es.png)
*Panel principal con indicadores clave, mapa de calor y avisos recientes (tema claro).*

![Panel — tema oscuro (ES)](docs/evidence/dashboard-dark-es.png)
*Panel principal en tema oscuro.*

![Panel — móvil (ES)](docs/evidence/dashboard-mobile-light-es.png)
*Panel en viewport móvil con drawer de navegación.*

![Panel — árabe (RTL)](docs/evidence/dashboard-light-ar.png)
*Panel principal en árabe con dirección de lectura RTL.*

### Corrosión

![Detalle de punto de monitoreo — claro (ES)](docs/evidence/corrosion-detail-light-es.png)
*Detalle de punto de monitoreo con lecturas, cupones y tasa de corrosión (tema claro).*

![Detalle de punto de monitoreo — oscuro (ES)](docs/evidence/corrosion-detail-dark-es.png)
*Detalle de punto de monitoreo en tema oscuro.*

![Detalle de punto de monitoreo — móvil (ES)](docs/evidence/corrosion-detail-mobile-light-es.png)
*Detalle de punto de monitoreo en viewport móvil.*

### Válvulas de alivio (PSV) · API 520/526

![Listado de válvulas PSV — claro (ES)](docs/evidence/psv-list-light-es.png)
*Listado de válvulas de seguridad y alivio con estado de prueba.*

![Dimensionamiento API 520/526 — claro (ES)](docs/evidence/psv-sizing-light-es.png)
*Dimensionamiento de válvula según API 520/526 (tema claro).*

![Dimensionamiento API 520/526 — oscuro (ES)](docs/evidence/psv-sizing-dark-es.png)
*Dimensionamiento de válvula según API 520/526 (tema oscuro).*

### Oleoductos y activos de línea

![Sistemas de línea — claro (ES)](docs/evidence/pipelines-light-es.png)
*Sistemas de línea con activos por estación kilométrica.*

![Mapa esquemático — claro (ES)](docs/evidence/map-light-es.png)
*Mapa esquemático de ductos con activos posicionados por kilómetro (tema claro).*

![Mapa esquemático — oscuro (ES)](docs/evidence/map-dark-es.png)
*Mapa esquemático en tema oscuro.*

![Mapa esquemático — árabe (RTL)](docs/evidence/map-light-ar.png)
*Mapa esquemático en árabe con dirección RTL.*

![Mapa esquemático — móvil (ES)](docs/evidence/map-mobile-light-es.png)
*Mapa esquemático en viewport móvil.*

### Desempeño de activos (APM)

![Listado de activos APM — claro (ES)](docs/evidence/apm-list-light-es.png)
*Listado APM con criticidad, banda RBI y estado de salud; las métricas MTBF/MTTR/OEE se muestran en la ficha de cada activo.*

![Detalle de activo APM — claro (ES)](docs/evidence/apm-detail-light-es.png)
*Detalle de activo APM con análisis de riesgo RBI (tema claro).*

![Detalle de activo APM — oscuro (ES)](docs/evidence/apm-detail-dark-es.png)
*Detalle de activo APM en tema oscuro.*

### Ingesta de datos

![Mapeo de columnas CSV — claro (ES)](docs/evidence/ingest-mapping-light-es.png)
*Mapeo de columnas durante la importación CSV/WITSML-lite.*

![Validación de importación — claro (ES)](docs/evidence/ingest-validation-light-es.png)
*Validación de importación con tabla de errores por fila.*

### Recomendaciones

![Motor de recomendaciones R1–R14 — claro (ES)](docs/evidence/recommendations-light-es.png)
*Motor de recomendaciones R1–R14 con acciones abrir/reconocer/resolver/reabrir.*

![Recomendaciones — móvil (ES)](docs/evidence/recommendations-mobile-light-es.png)
*Recomendaciones en viewport móvil.*

### Informes

![Informes — claro (ES)](docs/evidence/reports-light-es.png)
*Informes trimestral, por punto de monitoreo y ficha de válvula (tema claro).*

![Informes — oscuro (ES)](docs/evidence/reports-dark-es.png)
*Informes en tema oscuro.*

### Glosario

![Glosario técnico — claro (ES)](docs/evidence/glossary-light-es.png)
*Glosario técnico multilingüe con referencia normativa (ES).*

![Glosario técnico — árabe (RTL)](docs/evidence/glossary-light-ar.png)
*Glosario técnico en árabe con dirección RTL.*

### Administración

![Administración — claro (ES)](docs/evidence/admin-light-es.png)
*Ajustes generales, idioma, tema, respaldo/restauración, PIN y estado offline.*

---

## Recorrido en vídeo

**Vídeo:** [`docs/evidence/video/demo-walkthrough.mp4`](docs/evidence/video/demo-walkthrough.mp4) (≈2:04 min, ~2,4 MB).

Recorrido grabado de extremo a extremo de la aplicación: arranque y panel, navegación por Corrosión, PSV (dimensionamiento API 520/526), Oleoductos y mapa, APM, Ingesta, Recomendaciones, Informes y Glosario — en los idiomas y temas soportados.

> **Nota:** GitHub no reproduce un MP4 alojado en el repositorio de forma inline dentro del README; abre el enlace para reproducirlo o descargarlo. El teaser GIF animado está pendiente (requiere `ffmpeg`, no disponible en este entorno).

---

## Módulos (tabla)

| Módulo | Qué hace | Estándares aplicables |
|--------|----------|----------------------|
| **Panel** (Dashboard) | Resumen de indicadores clave: corrosión media, puntos críticos, válvulas vencidas, alertas de APM y cumplimiento, con mapa de calor y avisos recientes. | SP0775, API 580/581 |
| **Corrosión** | Puntos de monitoreo, lecturas, cupones gravimétricos, eficiencia de inhibidor, modelo De Waard-Milliams, servicio ácido (MR0175), protección catódica (SP0169). | ASTM G4/G1/G15, NACE/AMPP SP0775, MR0175/ISO 15156-2, SP0169 |
| **Válvulas de alivio** (PSV) | Registro y dimensionamiento de válvulas de seguridad según API 520/526 (gas, vapor, líquido, líquido viscoso) con selección de orificio. | API 520 Pt I, API 526, ISO 13709/8528/55000/14224 |
| **Oleoductos y activos de línea** | Sistemas de línea, activos ubicados por estación kilométrica, inspecciones (ILD, UT, visual, reparación) y campañas. | ASME B31.4/B31.8, API 5L, ISO 13709, NFPA 20/25/11 |
| **Mapa esquemático** | Vista esquemática del sistema de línea con activos posicionados por kilómetro; navegable con teclado y accesible. | ISA-101, API RP 1165 |
| **Desempeño de activos (APM)** | Fiabilidad y disponibilidad (MTBF, MTTR, OEE), análisis de riesgo RBI (API 580/581), intervalos de inspección sugeridos. | ISO 55000, ISO 14224, API 580/581, ISO 10218-2 |
| **Ingesta de datos** | Importación CSV/WITSML-lite con validación, mapeo de columnas, historial de importaciones. | API 520/526 (validación), WITSML-lite (estándar) |
| **Recomendaciones** | Motor R1–R14 para detectar condiciones de riesgo y generar acciones (abrir, reconocer, resolver, reabrir). | API 580/581, ISO 13849-1, ISO 62061 |
| **Informes** | Trimestral, por punto de monitoreo, ficha de válvula; exportación a PDF con impresión del navegador. | ISO 55000, API 580/581, NFPA 20/25 |
| **Glosario** | Términos técnicos en múltiples idiomas con referencia normativa y buscador. | ISO 13709, API 610/682/674/616, BS 5306, EEMUA 191 |
| **Administración** | Ajustes generales, idioma, tema, respaldo/restauración, PIN, estado offline. | ISO 13849-1, NFPA 20/25/11, BS EN 12845 |

---

## Motores de cálculo (tabla con fórmulas)

| Norma/Fórmula | Descripción | Referencia |
|----------------|-------------|------------|
| **ASTM G4** | Tasa de corrosión por pérdida de peso: CR = 534·ΔW/(ρ·A·t) | NACE/AMPP SP0775 |
| **De Waard–Milliams** | Modelo de corrosión por CO₂: log₁₀(CR) = 5.8 − 1710/T + 0.67·log₁₀(pCO₂) | API 610/682/674/616/520/526/580/581/5L |
| **MR0175 (screening)** | Clasificación de servicio ácido: pH₂S = P·x | ASTM G1/G4/G15 |
| **SP0169** | Protección catódica: potencial ≤ −850 mV vs CSE o 100 mV de polarización | ISO 13709/8528/55000/14224 |
| **API 520 gas** | Dimensionamiento crítico: A = W·√(T·Z/M)/(C·Kd·P1·Kb·Kc) | ASME B31.4/B31.8 |
| **API 520 líquido** | Dimensionamiento subcrítico: A = Q·√(G/ΔP)/(38·Kd·Kw·Kc·Kv) | ISO 55000/14224 |
| **API 526 orificios** | Selección estándar: D(0.110), E(0.196), F(0.307), G(0.503), H(0.785), J(1.287), K(1.838), L(2.853), M(3.60), N(4.34), P(6.38), Q(11.05), R(16.00), T(26.00) in² | ISO 13709/8528/55000/14224 |
| **API 580/581 RBI** | Riesgo = POF × COF (bandas 1–5) → intervalos de inspección | ISO 13709/8528/55000/14224 |
| **ISO 14224 MTBF/MTTR/OEE** | Métricas de confiabilidad: MTBF=(ventana− downtime)/fallos, MTTR=downtime/fallos, OEE=disponibilidad×rendimiento×calidad | ISO 55000/14224 |

---

## Estándares cubiertos

**EE.UU./Internacional:** API 610/682/674/616/520/526/580/581/5L, ASTM G1/G4/G15, ISA-101, API RP 1165, NFPA 20/25/11, IEEE 446, ASME B31.4/B31.8, ISO 13709/8528/55000/14224, ISO 3864, OGMP 2.0

**Reino Unido:** EEMUA 191, BS 5306, BS EN 12845

**Brasil:** NR-23, NR-26, ABNT NBR 13714/17240

**Total:** 33 normas en 5 regiones

---

## Instalación y uso

### 3 vías de inicio

#### 1. **START-HERE.bat** (Windows)

**Pasos:**
1. Abre la carpeta del proyecto
2. Haz doble clic en `START-HERE.bat`
3. Se abre el navegador con la aplicación en modo completo (PWA activa, actualizaciones automáticas)

*Recomendado para uso diario y PWA. Si el puerto 8419 está ocupado, la ventana te indicará un puerto alternativo.*

#### 2. **index.html** (modo `file://`)

Abre directamente `index.html` en el navegador.

**Limitaciones:**
- No se puede instalar como PWA
- No funciona sin conexión (service worker solo con HTTP/HTTPS)
- No hay actualizaciones automáticas de caché

*Recomendado para pruebas rápidas.*

#### 3. **Servidor estático personalizado**

Sirve la carpeta del proyecto con cualquier servidor estático.

**Ejemplos:**
- `tools\serve.ps1` (PowerShell)
- `tools\serve.py` (Python)
- nginx, IIS, Apache

#### 4. **Electron** (opcional)

**Para escritorio:** Usa el contenedor Electron para una ventana de escritorio independiente.

**Uso:**
1. `npm install` en `electron/`
2. `npm start` para desarrollo
3. `npm run dist` para empaquetado

**Resultado:** `electron/dist/IntegrityWatch Field 1.0.0.exe` (portátil, sin instalación)

### **Instalación como PWA**

**Solo con HTTP/HTTPS** (usa START-HERE.bat):

**Pasos por plataforma:**

| Plataforma | Pasos |
|------------|-------|
| **Windows (Edge/Chrome)** | Abre la app → clic en ícono "instalar" en barra direcciones → *Instalar aplicación* → confirma |
| **Android (Chrome)** | Abre la app → menú ⋮ → *Instalar aplicación* / *Añadir a pantalla de inicio* |
| **iOS (Safari)** | Abre la app → botón *Compartir* → *Añadir a pantalla de inicio* → *Añadir* |

**Una vez instalada:** Abre desde su propio icono y funciona completamente offline.

---

## Paquete portable

**IntegrityWatch-Field-Portable:**

**Contenido:**
- Aplicación completa (JS vanilla, service worker, manifest)
- `IntegrityWatch-Field 1.0.0.exe` (contenedor Electron)
- Todos los `docs/` incluyendo `DEPLOY.md`, `STANDARDS.md`
- `datos-prueba/` (CSV y JSON de validación)
- `THIRD-PARTY-NOTICES.md`
- `SHA256SUMS.txt` con hashes SHA256 para verificación

**Verificación:**
```bash
# Descargar ZIP
# Calcular SHA256 de IntegrityWatch-Field\ 1.0.0.exe
type IntegrityWatch-Field\ 1.0.0.exe | certutil -hashfile - SHA256
# Comparar con SHA256SUMS.txt
```

**Extracción:** Extrae en cualquier carpeta, ejecuta el `.exe` (o `START-HERE.bat`).

---

## Kit de datos de campo

**`datos-prueba/`** (48 archivos de validación):

**Archivos CSV:**
- `integritywatch-carga-prueba.csv` (41 filas)
- **Casos de validación:** Puntos faltantes, Wf>Wi, fechas futuras, CR fuera de rango, duplicados
- **Validadores asociados:** `validar-carga.cjs`

**Archivos JSON:**
- `precarga-ductos-combustibles.json` (6 poliductos, 408 km, 51 activos)
- **Validador asociado:** `validar-precarga.cjs`

**Pasos de importación:**
1. Pestaña **Ingesta** → *Elegir archivo* o arrastrar CSV/JSON
2. El sistema **detecta automáticamente** columnas (idioma/espanol, con tildes)
3. Marca *Crear puntos faltantes* si quieres crear MP nuevos del CSV
4. **Validar** → revisa tabla de errores por fila
5. **Importar** → resumen y registro en historial

**Datos demostrados:** 8 puntos de corrosión, 5 PSV, un ducto con 12 activos, 9 activos APM, ~120 lecturas.

---

## Documentos incluidos

**Documentación técnica y usuario:**

| Documento | Tipo | Ubicación |
|----------|------|----------|
| `docs/presentacion/IntegrityWatch-Field-Presentacion-Tecnica.pptx` | Presentación técnica | `docs/presentacion/` |
| `docs/manual/IntegrityWatch-Field-Manual-Usuario.docx` | PDF impreso | `docs/manual/` |
| `docs/manual/IntegrityWatch-Field-Manual-Usuario.html` | Web (lite) | `docs/manual/` |
| `docs/GUIA-DE-USO.md` | Guía de uso markdown | `docs/` |
| `docs/PLAN-DE-PRUEBAS.md` | Plan de pruebas y calidad | `docs/` |
| `docs/STANDARDS.md` | Referencia de fórmulas implementadas | `docs/` |
| `docs/SCHEMA.md` | Esquema IndexedDB + contratos | `docs/` |
| `docs/CONTRACTS.md` | Convenciones y contratos de integración | `docs/` |
| `docs/TESTS.md` | Anclas de tests verificadas a mano | `docs/` |
| `docs/VISUAL-SPEC.md` | Auditoría visual y corrección | `docs/` |

**Plan de tareas:** `tasks/plan.md`

---

## Arquitectura

### **JS Vanilla Dual-Mode**

**Características:**
- Sin build, sin CDN, sin dependencias runtime
- UMD-lite (compatible `file://` + tests Node)
- CSP estricta (`default-src 'self'; script-src 'self'; ...`)
- DOM seguro (`innerHTML` no con datos externos)

**Capas:**
- **Acceso a datos:** IndexedDB (`integritywatch`), service worker cache-first con versión `iw-vN`
- **Reglas de negocio:** R1–R14, evaluación en tiempo real, reconciliación con historial
- **Visualización:** 7 idiomas (idioma RTL árabe), tema claro/oscuro/sistema, componentes accesibles WCAG AA
- **Router:** Basado en hash `#/modulo/:id`, precargado por T1b
- **Service worker:** Registro solo HTTP/HTTPS, update automático, caché con nombres de versión

### **Tokens de diseño**

**ISA-101 (HMI de alto rendimiento):**
- Tipografía consistente, sin decoración, símbolos estables entre pantallas
- Color solo para lo anormal (errores, alertas)
- Formularios compactos, mapas legibles, informes estructurados

**Jerarquía de colores:**
- **Severidad:** low (`--sev-low`), moderate, high, severe
- **Estado:** `--alert-critical` (rojo), `--alert-warning` (ámbar), `--alert-info` (azul)

### **i18n**

**7 idiomas soportados:**

| Idioma | Código | Dirección |
|--------|--------|-----------|
| Inglés | en | LTR |
| Español | es | LTR |
| Portugués | pt | LTR |
| Francés | fr | LTR |
| Chino simplificado | zh | LTR |
| Ruso | ru | LTR |
| Árabe | ar | RTL |

**Claves i18n:** 330+ claves anidadas en todos los idiomas, interpolación `{{param}}`.

### **Procesamiento offline**

**Workflow:**
1. PWA instalada → caché offline con service worker
2. IndexedDB local (stores: meta, monitoringPoints, readings, coupons, psvs, apmAssets, recomendaciones, importLog)
3. Cola de sincronización opcional (`mutationQueue`) hacia endpoint remoto
4. Restore: JSON importado → clear + bulkPut (modo merge o replace)

### **Electron**

**Desktop wrapper:** `electron/`

**Característica:**
- `IntegrityWatch Field 1.0.0.exe` (portable, sin instalación, 71 MB)
- Carga la aplicación desde servidor local HTTP
- Sin necesidad de Node.js runtime (solo para desarrollo)
- Misma lógica que versión web (paridad funcional)

---

## Calidad y pruebas

**300 tests unitarios** (Node >=20, CJS, `node:assert/strict`)

**Cobertura ≥80 %** en motores (`src/calc/**`, `src/rules/**`)

### **Suite de tests**

| Tipo | Coverage | Command | Resultado |
|------|----------|---------|----------|
| **Unidad (motores)** | corrosión 100 %, PSV 98 %, APM 93 %, units 90 %, reglas 96–98 % | `node --test` | **300/300 verde** |
| **Datos/ingesta** | CSV parse + validación + 12 aliases + fronteras; WITSML-lite; store/repos; export/import; syncQueue; lock PBKDF2; seed; glosario; i18n paridad 7 locales | 119 tests `qa-*.test.js` | ✅ |
| **Integración (sin DOM)** | pipeline CSV→repos→reglas→recomendaciones; ciclo ack→resolve→reopen; deduplicación; hooks de store | `qa-rules-sweep`, `qa-data-integrity` | ✅ |
| **Navegador (manual, MCP chrome-devtools)** | 12 vistas renderizadas; RTL árabe; tema oscuro; hot-switch i18n; mapa por teclado; informe A4; consola 0 errores | capturas `docs/evidence/*.png` (27) | ✅ |
| **Datos reales de campo** | CSV 41 filas importado E2E: 35 válidas/4 errores/2 duplicadas/3 puntos creados | `datos-prueba/INFORME-CARGA-DATOS.md` | ✅ |
| **Seguridad (parcial)** | CSP sin inline; Semgrep sobre 8 módulos críticos (1 ReDoS corregido); DOM-seguro (textContent); 0 secretos; lock probado | fase F + `qa-data-integrity` | ✅ |
| **Campos (inventario UI)** | ~200 campos de formulario inventariados uno a uno (6 diálogos + 4 vistas inline) | auditoría de esta campaña | ✅ |
| **Campaña visual** | 27 capturas de módulo verificadas (>20 KB c/u) + 1 vídeo walkthrough; consola 0 errores JS; reset de estado demo | capturas `docs/evidence/*.png` + `docs/evidence/video/*.mp4` | ✅ |

### **Herramientas de tests**

**Ubicación:** `tools/tests/`

| Script | Comando | Cobertura |
|--------|---------|----------|
| `e2e-core.mjs` | `node tools\tests\e2e-core.mjs` | boot, seed limpio, import CSV real, reglas, PDF A4, **offline PWA**, **file://**, **XSS por import**, viewports 390/800/1366, consola | **10/10 PASS** (PDF 96 KB) |
| `volume.cjs` | `node tools\tests\volume.cjs` | pipeline de 10 000 filas (parser→validación→toRecords) + saveAll 9 100 | **8/8 PASS** · 58 ms |
| `e2e-volume.mjs` | `node tools\tests\e2e-volume.mjs` | importación 10 000 filas UI, rendimiento dashboard/ficha con 450 filas | **7/7 PASS** · import UI 568 ms · dashboard 104 ms |
| `quality.mjs` | `node tools\tests\quality.mjs` | axe-core (3 vistas + diálogo), **7 idiomas** (dir/RTL/claves), Firefox, Edge | **OK** · axe critical/serious/moderate/minor = 0 |

### **Rendimiento medido**

Cifras documentadas en las suites de `tools/tests/` y en `docs/TESTS.md`:

| Medición | Valor documentado | Fuente |
|----------|-------------------|--------|
| Tests unitarios | **300/300** verde (cobertura ≥80 % en motores) | `node --test` |
| E2E core (navegador) | **10/10 PASS** (boot, seed, CSV, reglas, PDF A4, offline PWA, `file://`, XSS, viewports, consola) | `tools/tests/e2e-core.mjs` |
| Volumen (pipeline 10 000 filas) | **8/8 PASS** · ~58 ms | `tools/tests/volume.cjs` |
| E2E volumen (UI 10 000 filas) | **7/7 PASS** · import UI 568 ms · dashboard 104 ms | `tools/tests/e2e-volume.mjs` |
| Calidad (a11y) | axe-core: critical/serious/moderate/minor = **0 issues** | `tools/tests/quality.mjs` |

### **Cobertura de tests**

**Gestión:** `node --test --experimental-test-coverage`
**Umbral:** ≥80 % en `src/calc/**` y `src/rules/**`

---

## Estructura de carpetas

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

---

## Licencias y atribución

**ISC/MIT:** Lucide (iconos), Tabler (glifos)

**Third-Party:** `THIRD-PARTY-NOTICES.md`

**No se copiaron assets de terceros** (referencia a DEC de cumplimiento IP).

**Alerta de supervisión:** La aplicación usa 19 vulnerabilidades reportadas por npm en devDependencies (herramientas de build), no en el bundle empaquetado. El uso de `npm install` en `electron/` instala devDependencies, no afectan a la aplicación runtime.

---

## Limitaciones y descargo

### **Limitaciones técnicas**

1. **Tablas de curvas digitizadas:** Las curvas Kb/Kw de API 520 son aproximaciones piecewise-linear. Verifique siempre contra la edición vigente de la norma.

2. **`Kv` es analítico:** La fórmula de API 520 §5.8.2 está implementada como `min(1, 1/(0.9935+2.878/√Re+342.75/Re^1.5))` con validación `Re ≥ 100`. Re < 100 emite `E_RE_RANGE` (evaluar válvula especial).

3. **`Kb` para válvulas convencionales:** `Kb = 1.0` con advertencia `E_BP_CONV` si contrapresión > 10 % (exige fuelle compensado).

### **Scope**

- **Screening vs diseño:** Los criterios MR0175, SP0169, etc. son **screening**, no sustituyen estudio completo de materiales.
- **Validación requerida:** Los cálculos son de apoyo. Valide siempre contra las ediciones vigentes de las normas y los datos del fabricante de los equipos.
- **Formato API 520:** Los informes PDF siguen el layout A4 de API 520 pero son orientativos; valide vs estándares originales.

### **Problemas conocidos**

- **Bug ALTO (abierto):** suscripción al bus sin teardown en el cambio de ruta puede repintar un detalle obsoleto sobre `#main` tras el tick del planificador de reglas. Ruta de reproducción y fix propuesto en [`docs/ISSUES-CONOCIDOS.md`](docs/ISSUES-CONOCIDOS.md).
- **Deuda de accesibilidad menor:** algunos campos de dashboard/ingesta/glosario sin `id`/`name`/`label` (detectado por axe-core/DevTools). Detalle en el mismo documento.

### **Descargo**

IntegrityWatch Field es **herramienta de apoyo** y no sustituye el criterio de un ingeniero cualificado. Sus resultados de cálculo son **orientativos** y deben ser verificados contra normas vigentes y datos del fabricante antes de decisiones de diseño u operación.

---

## English summary

**IntegrityWatch Field**

A PWA offline-first integrity and compliance operations center for oil & gas field use.

**Core features:**

- **Corrosion Management** (NACE/AMPP SP0775, De Waard-Milliams screening, MR0175 acid service, SP0169 cathodic protection)
- **Pressure Relief Valves** (API 520 Part I, API 526 orifices, API 580/581 RBI)
- **Pipeline and Asset Integrity** (ISO 55000/14224, API 5L/ASME B31.4/8.8, OHSMS)
- **Asset Performance Monitoring** (MTBF/MTTR/OEE, risk-based inspection)
- **Offline Data Ingestion** (CSV/WITSML-lite with validation)
- **Real-time Rules Engine** (R1-R14 for risk detection and recommendations)
- **Compliance Reporting** (quarterly, technical, legal documents)
- **Multi-language UI** (7 languages, RTL Arabic support)
- **Offline-first PWA** (IndexedDB + service worker cache-first)
- **Desktop wrapper** (Electron portable)
- **Visual evidence gallery** (27 module screenshots — light/dark/mobile/RTL) plus a **demo video walkthrough** (`docs/evidence/video/demo-walkthrough.mp4`)

**Tech stack:** Vanilla JS, IndexedDB, service worker, CSP strict, WCAG AA accessibility, UMD-lite modules

**Testing:** 300 unit tests (100 % green), 7-language i18n parity, 4 P0 test suites (offline PWA, file://, XSS import, 10k rows), 1 known high-severity issue documented (see docs/ISSUES-CONOCIDOS.md)

**Licensing:** ISC/MIT (Lucide, Tabler), third-party notices only (devDependencies, not shipped)

**Installation:**

1. **Windows (recommended):** Double-click `START-HERE.bat`
2. **File:** Open `index.html` (limited PWA/offline support)
3. **Static server:** Serve project folder (`tools/serve.ps1`)
4. **Desktop:** Use Electron wrapper (`electron/`)

**Languages:** en, es, pt, fr, zh, ru, ar (RTL)

**Data:** Includes 41-row CSV test data, 6-fuel pipelines JSON, deterministic demo seed

**Architecture:** Vanilla JS dual-mode (file:// compatible + Node tests), CSP strict, secure DOM, i18n, offline-first

**Production:** No internet, no server, no CDN, no runtime dependencies

**Quality Gates:** 100 % unit tests, coverage ≥80 %, P0 offline/file:///XSS/10k, reviewer 0 BLOCKER, descargo visible in all reports

**Limitations:** API 520 curve digitizations require verification vs current edition; calculations are support tools only.

**Deployment:** Web server with `START-HERE.bat` for PWA support; Electron wrapper for Windows standalone.

**Open questions:** None (dual-mode meets file:// and Node test requirements)

---

**Resumen (español)**

IntegrityWatch Field es una aplicación web progresiva (PWA) offline-first para operaciones de integridad y cumplimiento en campo petrolero.

**Características principales:**

- **Gestión de corrosión** (NACE/AMPP SP0775, screening De Waard-Milliams, MR0175 servicio ácido, SP0169 protección catódica)
- **Válvulas de alivio** (API 520 Parte I, API 526 orificios, API 580/581 RBI)
- **Integridad de ductos y activos** (ISO 55000/14224, API 5L/ASME B31.4/8.8, normas OH&S)
- **Monitoreo de activos** (MTBF/MTTR/OEE, inspección basada en riesgo)
- **Ingesta offline** (CSV/WITSML-lite con validación)
- **Motor de reglas** (R1-R14 para detección de riesgos y recomendaciones)
- **Informes de cumplimiento** (trimestral, técnicos, legales)
- **Interfaz multilingüe** (7 idiomas, RTL árabe)
- **PWA offline-first** (IndexedDB + service worker cache-first)
- **Wrapper de escritorio** (Electron portable)

**Stack tecnológico:** JS vanilla, IndexedDB, service worker, CSP estricta, accesibilidad WCAG AA, módulos UMD-lite

**Pruebas:** 300 tests unitarios (100 % verde), paridad i18n 7 idiomas, 4 suites P0 (PWA offline, file://, XSS import, 10k filas), 1 problema ALTO conocido documentado (docs/ISSUES-CONOCIDOS.md)

**Licencias:** ISC/MIT (Lucide, Tabler), solo avisos de terceros (devDependencies, no empaquetados)

**Instalación:**

1. **Windows (recomendado):** Doble clic en `START-HERE.bat`
2. **Archivo:** Abrir `index.html` (soporte limitado PWA/offline)
3. **Servidor estático:** Servir carpeta del proyecto (`tools\serve.ps1`)
4. **Escritorio:** Usar wrapper Electron (`electron/`)

**Idiomas:** en, es, pt, fr, zh, ru, ar (RTL)

**Datos:** Incluye CSV de prueba 41 filas, JSON de ductos de combustibles 6 poliductos, semilla determinista de demo

**Arquitectura:** JS vanilla dual-mode (compatible file:// + tests Node), CSP estricta, DOM seguro, i18n, offline-first

**Producción:** Sin internet, sin servidor, sin CDN, sin dependencias runtime

**Puertas de calidad:** 100 % tests unitarios, cobertura ≥80 %, P0 offline/file:///XSS/10k, reviewer 0 BLOCKER, descargo visible en todos los informes

**Limitaciones:** Las curvas digitizadas de API 520 requieren verificación vs edición actual; cálculos son herramientas de apoyo solo.

**Despliegue:** Servidor web con `START-HERE.bat` para PWA; wrapper Electron para escritorio Windows.

**Preguntas abiertas:** Ninguna (dual-mode cumple file:// y tests Node)

---

*Archivo README.md de IntegrityWatch Field*
*Secciones: 18 (todas completas)*
*Imágenes verificadas: 27 (galería por módulo) + 1 vídeo de recorrido*
*Capturas referenciadas: todas existentes en docs/evidence/*