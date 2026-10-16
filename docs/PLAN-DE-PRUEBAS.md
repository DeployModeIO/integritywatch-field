# PLAN DE PRUEBAS Y ANÁLISIS DE COBERTURA — IntegrityWatch Field

**Fecha:** 2026-10-16 · **Estado del proyecto:** commit `027ca8a` · **Suite actual: 281/281 verde**

---

## 1. Qué está probado HOY (inventario real)

| Capa | Cobertura actual | Evidencia |
|---|---|---|
| **Unidad (motores)** | corrosión 100 %, PSV gas+líquido 98 %, APM 93 %, units 90 %, reglas 96-98 % | 281 tests `node --test`; cobertura ≥90 % en `src/calc` y `src/rules` |
| **Unidad (datos/ingesta)** | CSV parse + validación + 12 aliases + fronteras; WITSML-lite; store/repos; export/import; syncQueue; lock PBKDF2; seed; glosario; i18n paridad 7 locales | 119 tests de campaña QA (9 suites `qa-*.test.js`) |
| **Integración (sin DOM)** | pipeline CSV→repos→reglas→recomendaciones; ciclo ack→resolve→reopen; deduplicación; hooks de store | `qa-rules-sweep`, `qa-data-integrity` |
| **Navegador (manual, MCP chrome-devtools)** | 12 vistas renderizadas; RTL árabe; tema oscuro; hot-switch i18n; mapa por teclado; informe A4; consola 0 errores | capturas `docs/evidence/*.png` (13) |
| **Campos (inventario UI)** | ~200 campos de formulario inventariados uno a uno (6 diálogos + 4 vistas inline) | auditoría de esta campaña |
| **Datos reales de campo** | CSV de 41 filas (anclado en fuentes públicas) importado E2E: 35 válidas/4 errores/2 duplicadas/3 puntos creados | `datos-prueba/INFORME-CARGA-DATOS.md` |
| **Seguridad (parcial)** | CSP sin inline; Semgrep sobre 8 módulos críticos (1 ReDoS corregido); DOM-seguro (textContent); 0 secretos; lock probado | fase F + `qa-data-integrity` |
| **Independiente** | Tester externo (PASS) · Reviewer (0 BLOCKER) · Semgrep · sandbox Podman | fases E/F del proyecto |

## 2. Análisis de brechas (lo que NO está probado)

| # | Área sin cubrir | Riesgo | Impacto si falla | Probabilidad |
|---|---|---|---|---|
| G1 | **Modo `file://`** (doble clic en index.html) | Alto | El flujo más simple del usuario no abre o carga a medias | Media |
| G2 | **Offline real de la PWA** (desconectar red → recargar) | Alto | Promesa offline-first no verificada | Media |
| G3 | **Impresión/PDF real** (paginación A4, saltos, colores) | Medio | Informes de cumplimiento mal paginados | Media |
| G4 | **Render con XSS desde import** (nota con `<script>` o `<img onerror>`) | Alto (seguridad) | Inyección en un equipo de campo | Baja (helpers DOM-seguros) pero crítica |
| G5 | **Volumen de datos** (10 000 lecturas, 5 años, CSV grande) | Medio | Tablas/gráficos lentos o congelados | Media |
| G6 | **Respaldo/restauración E2E por UI** | Medio | Pérdida de datos si el respaldo falla | Baja |
| G7 | **Compatibilidad Firefox/Safari/iOS y resoluciones 800/360** | Medio | No abre en el equipo del cliente | Media |
| G8 | **Electron** (arranque real y build .exe) | Bajo | La vía opcional de escritorio no funciona | Media |
| G9 | **Accesibilidad automatizada** (axe/Lighthouse) | Medio | Incumplir WCAG en licitaciones | Media |
| G10 | **7 locales visualmente** (desbordes de texto, fechas/números por locale) | Bajo | Textos cortados en ruso/árabe | Media |
| G11 | **Concurrencia multi-pestaña** y cuota de almacenamiento llena | Bajo | Pérdida de una edición simultánea | Baja |
| G12 | **Flujo de actualización** SW (v2 publicada → aviso → recarga) | Bajo | Usuarios con versión vieja | Media |
| G13 | **Carga de rendimiento** (Lighthouse, arranque en frío) | Bajo | Percepción de lentitud | Media |
| G14 | **UAT con usuario real** (tú y tus operadores) | Alto | Funcionalidad correcta que no encaja con el trabajo real | Media |

## 3. Veredicto: ¿hacen falta más pruebas?

- **Para demo, formación y validación funcional:** NO. El motor de cálculo, la ingesta, las reglas y la
  interfaz están cubiertos con 281 tests automatizados y verificación real en navegador; 0 bugs de
  aplicación encontrados en la campaña.
- **Para uso diario en campo (recomendado):** SÍ, un **pase P0 corto** (6 pruebas, ~1 día de trabajo
  delegado): `file://`, offline PWA, impresión/PDF, XSS por import, volumen 10k, y compatibilidad
  Firefox+800px. Son las únicas brechas con impacto operativo real.
- **Para despliegue en equipo/organización:** añadir **P1** (E2E automatizado, axe, 7 locales, backup E2E,
  Electron) antes del rollout.

## 4. Plan completo de pruebas (por tipo)

### T1 — Unidad y regresión (continuo)
Ejecutar `node --test` (281) antes de cada entrega + `node --test --experimental-test-coverage`.
**Criterio:** 100 % verde, cobertura ≥80 % en motores. **Estado:** ✅ funcionando.

### T2 — Integración sin navegador (continuo)
Pipelines CSV→BD→reglas→informes con `dbMemory`. Ampliar con: importación doble simultánea, payload JSON
de 5 MB, store con 50k registros. **Criterio:** sin excepciones no capturadas, <2 s por pipeline.

### T3 — End-to-End en navegador (P0/P1)
- **P0 manual guiado** (chrome-devtools MCP o humano): 20 pasos críticos — arranque, importar CSV,
  emparejar cupones, ver EI, ejecutar reglas, resolver una recomendación, generar informe e imprimir.
- **P1 automatizado**: Playwright (devDependency) sobre los mismos 20 pasos + capturas por paso.
  **Criterio:** los 20 pasos en verde en Chrome y Firefox.

### T4 — Pruebas de datos y volumen (P0)
Generar CSV de 10 000 filas (90 % lecturas válidas, 10 % errores sembrados) y 6 puntos con 5 años de
lecturas; medir: tiempo de importación, tiempo de render del Panel, memoria, y que los KPIs sigan correctos.
**Criterio:** importación <10 s, Panel <2 s, sin bloqueo de UI.

### T5 — Offline / PWA (P0)
Con `START-HERE.bat`: instalar PWA → DevTools → Network → Offline → recargar → navegar por 5 vistas →
importar un CSV. **Criterio:** todo funciona sin red; el aviso de actualización aparece al volver online.

### T6 — Modo archivo `file://` (P0)
Abrir `index.html` con doble clic en Chrome/Edge/Firefox: verificar franja informativa, navegación,
importación CSV, persistencia (IndexedDB en file://) y que NO se registra service worker.
**Criterio:** funcionalidad completa excepto PWA, con aviso claro.

### T7 — Impresión y PDF (P0)
Generar informe trimestral y expediente → `window.print()`/`Page.printToPDF` → revisar: tamaño A4,
saltos de página correctos, encabezados de tabla repetidos, gráfico vectorial nítido, paginación del pie.
**Criterio:** PDF de N páginas sin cortes ni elementos flotantes.

### T8 — Seguridad (P0/P1)
- **P0**: importar CSV con `<script>alert(1)</script>`, `"><img src=x onerror=...>` en nota y en nombre de punto;
  verificar que se renderiza como texto en todas las vistas (Panel, corrosión, informes).
- **P1**: repasar Semgrep sobre `src/views/*` y `src/reports/*`; verificar CSP sin violaciones en consola;
  probar lock con 5 intentos (bloqueo) y PIN correcto tras expirar; confirmar que el respaldo JSON no
  contiene secretos. **Criterio:** 0 hallazgos críticos, 0 ejecuciones de script.

### T9 — Accesibilidad (P1)
Lighthouse/axe sobre Panel, Corrosión y formularios; recorrido completo solo con teclado (skip-link,
diálogos con foco atrapado, mapa, tablas); lector de pantalla (NVDA) en el flujo de importación.
**Criterio:** axe 0 errores críticos; flujo de importación completo sin ratón.

### T10 — i18n y RTL (P1)
Recorrer las 12 vistas en los 7 idiomas (capturas), verificando desbordes en ruso/árabe/chino, formato de
fechas/números por locale y dirección RTL en diálogos, tablas y mapa. **Criterio:** 0 textos cortados,
0 claves crudas visibles.

### T11 — Compatibilidad (P0 parcial)
Matriz: Chrome/Edge (P0), Firefox (P0), Safari/iPadOS (P1), 1366×768 / 800×700 / 390×844 (móvil).
**Criterio:** todas las vistas operables y legibles en cada combinación; sin scroll horizontal accidental.

### T12 — UAT con usuario real (P0/P1)
Sesión guiada contigo (u operador) con 6 guiones: cargar campaña mensual, registrar válvula y dimensionarla,
programar inspección RBI, resolver una alerta, generar informe trimestral, respaldar/restaurar.
Registrar fricciones (clics extra, textos confusos) y priorizarlas. **Criterio:** 6/6 guiones completados
sin ayuda técnica.

### T13 — Electron (P2)
`npm install` en `electron/` → `npm start` → repetir el guion T3 dentro de Electron → `npm run dist` y
probar el ejecutable en un equipo limpio. **Criterio:** paridad funcional con el navegador.

### T14 — Humo antes de cada entrega (continuo)
Checklist de 15 min: suite verde, app abre (HTTP y file://), importar el CSV de prueba, ejecutar reglas,
generar informe, consola limpia, RTL + tema oscuro. **Criterio:** 7/7 ítems.

### T15 — Confiabilidad y estado (P2)
Dos pestañas abiertas editando el mismo punto (¿última escritura gana?), cuota de almacenamiento llena
(simular), IndexedDB bloqueado en modo privado (debe caer al adaptador en memoria con aviso), reloj del
equipo desfasado (fechas futuras → validaciones). **Criterio:** degradación limpia, sin pérdida silenciosa.

## 5. Priorización

| Prioridad | Pruebas | Cuándo | Estimación |
|---|---|---|---|
| **P0 — antes de uso diario** | T4, T5, T6, T7, T8(P0), T11(Chrome/Edge/Firefox), T12 (guiones 1-3) | Ya | ~1 día delegado (4-6 tareas cortas) |
| **P1 — antes de equipo/rollout** | T3 automatizado, T8(P1), T9, T10, T11(Safari/móvil), T12 (6 guiones), backup E2E (G6) | Próxima iteración | ~2 días |
| **P2 — opcional** | T13 Electron, T15, T13 build .exe, G12 update flow | Cuando se necesite | ~1 día |
| **Continuo** | T1 + T14 en cada entrega | Siempre | minutos |

## 6. Cómo se ejecutará

- Pruebas de código/datos (T2, T4, T7-print via PDF, T8): **agentes `tester`/`coder` con DeepSeek V4.1
  Flash (pago)** en tareas cortas de 1 archivo; los resultados entran a la suite como `tests/qa-*`.
- Pruebas de navegador (T3 manual, T5, T6, T9, T10, T11, T12): **orquestador con chrome-devtools MCP**
  (capturas como evidencia) + tu participación en T12/UAT.
- Revisión final: **subagente `reviewer`** + Semgrep.

## 7. Riesgos del plan

| Riesgo | Mitigación |
|---|---|
| Playwright añade dependencia (rompe «cero deps») | Se instala como devDependency opcional; el runtime sigue sin dependencias |
| file:// bloquea ES modules en Chrome | Ya resuelto por diseño dual-mode (D-01); la prueba T6 lo confirma |
| Volumen 10k puede revelar renderizado no virtualizado | Presupuestado como hallazgo esperable: si aparece, se pagina la tabla (fix corto) |
| UAT tarda en agendarse | Los guiones están listos en esta guía para ejecutarlos tú mismo cuando quieras |

> **Recomendación del arquitecto:** ejecutar solo el bloque **P0** ahora (6 pruebas, día y medio de
> trabajo delegado) y dejar el resto planificado. La aplicación está lista para demostración y validación
> funcional desde hace varias entregas; el P0 cierra las brechas que sí afectan el trabajo diario en campo.
