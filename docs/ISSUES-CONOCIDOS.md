# ISSUES-CONOCIDOS.md

Problemas conocidos de IntegrityWatch Field, con repro, mecanismo, estado y fix propuesto. Documento de referencia para la sección «Limitaciones y descargo → Problemas conocidos» del `README.md`.

## 1. Bug ALTO — repintado de detalle obsoleto sobre `#main` (suscripción al bus sin teardown)

- **Estado:** ABIERTO
- **Severidad:** ALTO

**Síntoma.** Tras navegar por varias vistas, el planificador periódico de reglas («tick scheduler») repinta el detalle de una vista anterior sobre el contenedor `#main`, superponiendo contenido obsoleto sobre la vista activa.

**Ruta de reproducción (exacta):**

```
#/apm/APM-MD-003  →  #/pipelines/SYS-NORTE-16  →  #/glossary
```

Esperar ~40 s (un ciclo del planificador de reglas) para observar el repintado obsoleto.

**Mecanismo.** `src/views/apm.js` se suscribe a los eventos de datos del bus con `reload` como callback (línea ~346: `subscribe(bus, ['data:changed:apmAssets', 'data:changed:apmEvents', 'data:changed:recommendations'], reload)`). La suscripción se registra al renderizar la vista, pero no se des-suscribe al cambiar de ruta (el `teardown()` solo se invoca cuando la misma vista se vuelve a renderizar). Cuando el planificador (`src/app/shell.js`, `setInterval` de `startScheduler()`) ejecuta `runRules(true)`, emite `data:changed:*` y el callback de APM vuelve a dibujar el detalle, aunque el usuario ya esté en otra vista.

**Recovery (manual):** `IW.app.router.render()`.

**Fix propuesto:** des-suscripción de los listeners del bus en el `teardown()` de la vista (o al cambiar de ruta) + guard de ruta/epoch en el callback para descartar eventos de una vista ya desmontada.

## 2. Deuda de accesibilidad menor — campos sin etiqueta programática

- **Estado:** ABIERTO (menor)
- **Severidad:** BAJA

Algunos campos de formulario en las vistas **dashboard**, **ingesta** y **glosario** no exponen `id`/`name`/`label` asociado, por lo que lectores de pantalla y validadores de accesibilidad (axe-core, DevTools) los reportan como sin etiqueta. No bloquea el uso con teclado, pero impide alcanzar una conformidad WCAG AA completa en esos puntos.

## 3. Nota de screencast — duración del MP4

- **Estado:** RESUELTO (parche de metadatos aplicado)

El vídeo `docs/evidence/video/demo-walkthrough.mp4` se grabó con el screencast MCP y sus cajas `mvhd`/`tkhd`/`mdhd` tenían `duration` incorrecta (`mvhd=0`, `tkhd`/`mdhd=32412` ticks), lo que hacía que algunos reproductores (p. ej. Windows Media Player) mostraran una duración errónea.

**Corrección aplicada:** se recalculó la duración real a partir de los fragmentos (`tfdt`/`trun`: 355 muestras) y se escribió en `mvhd` (timescale 1000), `tkhd` (movie timescale) y `mdhd` (timescale 30000):

- `mvhd.duration` = 124235 → **124,24 s** (≈2:04 min)
- `tkhd.duration` = 124235 → 124,24 s
- `mdhd.duration` = 3727058 → 124,24 s

El tamaño del archivo no cambió (2 428 972 bytes) y la estructura de cajas (`ftyp`/`moov`/6×`moof`+`mdat`) se conserva íntegra.
