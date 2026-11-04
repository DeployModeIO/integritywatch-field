# Changelog — IntegrityWatch Field

Historial de versiones. Antes de 1.3.0 el detalle vive en la historia de git (`git log`, tags `v1.0.1` y posterior).

## [1.4.1] — 2026-11-03 · release `v1.4.1-portable` (vigente)

- Ejecutable Electron: `IntegrityWatch Field 1.4.1.exe` · 74.762.520 B · SHA-256 `487921CFBCE37D54D828DBA84507E9EC23B15F19CD82E17A37022856A476A4CF` (mismo digest publicado por GitHub; release marcado Latest; v1.4.0 y v1.3.0 quedan disponibles como anteriores).
- **Retirada del sonido de alarma por solicitud del cliente**: eliminados `src/core/alarmSound.js` y sus 9 tests, la UI de Admin (activar/volumen/probar), las 5 claves i18n en los 7 idiomas, el script en `index.html` y la entrada de precache. Verificado dentro del exe: 0 osciladores, sin UI de sonido. **Se conservan íntegros todos los fixes antititileo de 1.4.0** (motor en bloque, debounce, filtro de meta, toast solo con alarmas nuevas, badge/banner instantáneos al reconocer).
- **Fix Admin**: «Acerca de → Versión» mostraba un número fijo desactualizado (`1.0.0` hardcodeado); ahora lee `APP_VERSION` del sello interno del expediente (1.4.1) y nunca volverá a desincronizarse.
- Tests: 997 → **987** en verde (−10 de la función de sonido retirada; la regresión antititileo conserva sus 4 tests).
- Caché del service worker: `iw-v27`.

## [1.4.0] — 2026-11-03 · release `v1.4.0-portable`

- Ejecutable Electron: `IntegrityWatch Field 1.4.0.exe` · 74.763.677 B · SHA-256 `D92403CA86663A3D13D4002215B424DDAEAE8CA55A34FCED62AEBE0C5BAEFB82` (mismo digest publicado en el release de GitHub, marcado Latest). `v1.3.0-portable` queda disponible como versión anterior.
- Tests: 982 → **997** en verde.

### Fix P1 — titileo de pantalla y pérdida de trabajo al llegar notificaciones (reportado por el usuario, medido en vivo dentro del exe)

El inspector automático de alarmas (cada 60 s) re-escribía las recomendaciones una por una; cada escritura vaciaba y reconstruía la pantalla completa: **≈97 repintados/tick y 48 eventos medidos en el exe 1.3.0**. Correcciones:

1. `engine.js`: guardado **en bloque** (`saveAll`) de recomendaciones/PSV/activos de línea → 1 evento por almacén.
2. `dashboard.js`, `apm.js`, `recommendations.js`: **debounce 250 ms** que coalesce la ráfaga en un ciclo de repintado (medido post-fix: 4 repintados/tick, 5 eventos).
3. `store.js` + `dashboard.js`: el evento de `meta` ahora lleva la **clave**; `lastRulesRunISO` actualiza solo su etiqueta y **no vacía el panel**.
4. `shell.js`: el toast automático salta **solo con alarmas realmente nuevas** (`created > 0`), no cada minuto con las mismas críticas abiertas.
5. `shell.js:730`: badge/banner/sonido se recalculan **al instante** al reconocer/aceptar/eliminar (antes esperaban al siguiente barrido).

### feat — sonido de alarma crítica (`src/core/alarmSound.js`, nuevo)

- Pitido doble 880/659 Hz cada 2,5 s **solo mientras haya alarmas críticas (rojas) abiertas**; se detiene al reconocer, aceptar o eliminar (verificado end-to-end con clic real).
- Admin: activar/desactivar, volumen 0-100 y botón Probar sonido; persiste en `meta` (`alarmSoundOn`, `alarmSoundVolume`).
- Web Audio puro, cero archivos ni dependencias; se desbloquea con el primer gesto (política de autoplay). i18n en los 7 idiomas (paridad verificada).
- Caché del service worker `iw-v25 → iw-v26` con el módulo en precache.

## [1.3.0] — 2026-11-03 · release `v1.3.0-portable`

- Ejecutable Electron: `IntegrityWatch Field 1.3.0.exe` · 74.760.829 B · SHA-256 `16A9BBF27C423EB15A5C2D5FFDD2DDAA14875ABE32766C3F136A8ED1D126638B` (mismo digest publicado en el release de GitHub).
- El release anterior 1.2.0 fue eliminado con autorización del cliente; `v1.3.0-portable` es el único release.
- Versión sincronizada en `package.json`, `src/core/caseFile.js` (`APP_VERSION`) y `electron/package.json` (lo exige el test `version-guards`).

### Correcciones de última hora (sesión 02–03 nov 2026)

Tres bugs reales encontrados al re-verificar y corregidos, con evidencia:

1. **P0 — Rollback concurrente de ingesta masiva** (commit `f36310e`). El `clear`/`saveAll` del rollback interleaveaba entre almacenes y podía borrar filas ajenas al lote; además los diarios ya marcados `rolledBack` se re-procesaban. Fix: mutex por store en `src/ingest/commit.js` y exclusión de diarios `rolledBack`. Test adversarial (2.700 filas vs 300) reproduce el bug y valida el fix.
2. **P1 — «Restablecer datos de demo»** (commit `7e35987`). Antes solo sobre-escribía los ids semilla y dejaba intactas las filas importadas. Fix: `DEMO_RESET_STORES` limpia los 11 almacenes antes de re-sembrar. Verificado en navegador real: 200.120 → 120 lecturas.
3. **P1 — Cadena inmutable de bitácora con múltiples pestañas** (commit `bc8ca73`). Dos pestañas competiendo por el encabezado produjeron 23 anomalías reales encadenadas. Fix: sección crítica bajo `navigator.locks('iwf-audit-head')`, `repairHead` desde documentos autoritativos y read-check CAS; +4 tests. La bitácora corrupta de la prueba fue purgada y la cadena nueva arrancó sana («Cadena íntegra: 46 entradas» post-estrés, verificado en navegador).

### Cifras de la sesión

- Tests: 583 → **982** en verde (`node --test`, suite ~32–36 s).
- 19 commits de sesión (`dc991f9..bc8ca73`).
- Informes: 15 plantillas (T-01…T-12 + los 3 previos) × 6 formatos (CSV, XLSX, DOCX, JSON, XML, ZIP).
- Tiempos medidos en navegador: CSV 200k lecturas 45,4 s · recarga del mismo archivo 18,1 s con 0 duplicados · XLSX 50k 7,8 s · rollback de 200k 303 ms · modo avión XLSX 3k 805 ms.

### Pauta operativa (volúmenes corporativos)

Para instalaciones con más de 1M de filas, usar carga selectiva por periodo/estación (los topes ya son configurables en la app) en lugar de copiar la base completa a la tablet.

### Decisiones registradas

- **T-13 OGMP (huella de emisiones): opcional, NO activado.** Requeriría un almacén de emisiones (IndexedDB v3→v4), ingesta y formulario nuevos.
- **Prueba física en tablet Android (cámara QR / GPS): pendiente de dispositivo real.** Todo lo demás quedó verificado en emulación offline (Chromium móvil).
- **exe sin firma de código:** la custodia de integridad es el SHA-256 publicado en el release de GitHub.

## Cobertura funcional de 1.3.0 (resumen)

- Ingesta masiva por archivos (cola multi-archivo + drag&drop): CSV / XLSX / JSON / JSONL / XML genérico / WITSML sobre las 9 entidades del caso.
- Lectura QR de placa en los 3 formularios (APM, PSV, tuberías) con fallback sin cámara; GPS + foto con EXIF en inspecciones.
- Exportación propia (sin librerías): ZIP determinista, XLSX, DOCX, CSV (BOM), XML simétrico con WITSML-lite, y paquete de evidencia con manifiesto SHA-256 verificable.
- Bitácora inmutable encadenada SHA-256 con verificación, consulta por rango y exportación (5 formatos) desde Admin.
- PWA offline-first (cache `iw-v25`, precache de 120 rutas auditadas 1:1 contra `index.html`, CSP estricta), 7 idiomas con paridad verificada.
