# VISUAL-SPEC.md — Auditoría e integración visual (fase V)

**Motivo:** el usuario reportó "integración visual desordenada". La auditoría con capturas reales
(`docs/evidence/01..11`) y diagnóstico en vivo (computed styles) confirma rotura de layout.
Este documento es la fuente de verdad del fix (tarea V1, dueño único) y de la verificación posterior.

## 0. Causa raíz (diagnóstico verificado en navegador)

1. **Desacople DOM↔CSS del shell.** `layout.css` define el grid sobre `body` con
   `grid-template-areas: header / sidebar main / footer` y selectores `.app-sidebar`,
   `.app-sidebar__item`, `.app-sidebar__label`, `.app-main`, `.app-header__controls`.
   El shell real (`src/app/shell.js`) construye: `nav.sidebar` (no `.app-sidebar`), items
   `a.nav-item` (no `.app-sidebar__item`), `main.main` (no `.app-main`), **y un wrapper
   `div.layout`** que no existe en el contrato. Consecuencia medida: `body` grid de 2 columnas
   coloca `div.layout` en la celda de 240 px → nav, main, cards y tablas quedan aplastados a
   ~240 px; los items de nav caen a enlaces azules por defecto con el icono encima del texto.
2. **Header sin wrapper de controles.** Los `<select class="select">` son hijos flex directos y
   `.select { width:100% }` (components.css:145) los estira a ancho completo → el header ocupa
   3 filas apiladas en vez de una barra.
3. **Overrides duplicados y dispersos.** `.dialog` posicionado en `views-b.css`; `.tabs*`
   corregido DOS veces (`views-a.css` y `views-c.css`); `.field-error/.field-hint` en `views-a.css`.
   Patrones canónicos que deberían vivir en `components.css`.
4. **Footer `white-space:nowrap`** recorta los chips de normas y el toast se superpone al footer
   (`.toast-region` sin offset/z-index claros).

## 1. Contrato DOM del shell (objetivo exacto)

```
body
├─ a.skip-link[href="#main"]
├─ header.app-header
│  ├─ button.btn.btn-ghost.hamburger[aria-expanded][aria-controls="app-nav"]   (oculto ≥900px)
│  ├─ a.app-brand[href="#/dashboard"] > svg.app-brand__mark + span.app-brand__name
│  └─ div.app-header__controls
│     ├─ select.select#sector-select        (width:auto)
│     ├─ select.select#locale-select        (width:auto)
│     ├─ button.btn.btn-ghost.touch#theme-toggle > span.theme-icon
│     ├─ button.btn.btn-ghost.touch.badge-recs > icon + span.badge-count
│     ├─ span.rules-status
│     └─ button.btn.btn-primary#run-rules
├─ nav.app-sidebar#app-nav[aria-label]
│  └─ div.nav-group ×3 > a.app-sidebar__item[href][data-view][aria-current?]
│        > span.icon(svg) + span.app-sidebar__label{texto}
├─ main.app-main#main[tabindex="-1"]
├─ footer.app-footer
│  ├─ p.disclaimer
│  └─ div.standard-chips > span.pill ×16
└─ div.toast-region#toast-region[aria-live]
```

Reglas: SIN `div.layout`; `refreshChrome()` de shell.js se actualiza a esta estructura
(mismas responsabilidades: textos nav, brand, disclaimer, aria, selects); el drawer usa
`nav.dataset.open` + `body.nav-open` (CSS clavea `.app-sidebar[data-open]`).

## 2. Cambios en layout.css

- Mantener grid de body y áreas; añadir `body.nav-open .app-sidebar` como alias de
  `.app-sidebar[data-open]` (o clavear solo data-open y que shell lo setee).
- `.app-header__controls .select, .app-header .select { inline-size: auto; min-inline-size: 7rem; }`
- `.hamburger { display:none } @media (max-width:899.98px){ .hamburger{display:inline-flex} }`
- `.nav-group + .nav-group { margin-block-start: var(--sp-2); padding-block-start: var(--sp-2); border-block-start: 1px solid var(--border); }`
- `.app-footer { flex-wrap: wrap; row-gap: var(--sp-1); }` y quitar `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` del footer (los pills ya son compactos); `.app-footer .disclaimer { margin:0; }`
- `.toast-region { position: fixed; inset-block-end: var(--sp-3); inset-inline-end: var(--sp-3); z-index: 1000; display:flex; flex-direction:column; gap:var(--sp-2); pointer-events:none; } .toast{pointer-events:auto}`
- Verificar rail 56px <900px: labels ocultos, iconos centrados; ≥900px 240px con labels.

## 3. Patrones canónicos → components.css (absorber y deduplicar)

- `.dialog` centrado modal (mover desde views-b.css): `position:fixed; inset:0; margin:auto; max-block-size:calc(100dvh - 2*sp-4); overflow:auto; z-index:950` + backdrop si existe.
- `.tabs` (wrapper block) + `.tabs-nav` (flex row, role tablist, scroll-x en móvil) + `.tab` (min 44px) + `.tabs-panels` + `.tab-panel` — CANÓNICO aquí; ELIMINAR los bloques equivalentes de views-a.css y views-c.css.
- `.field-error`, `.field-hint` (mover desde views-a.css).
- `.page-header { display:flex; flex-wrap:wrap; align-items:center; gap:var(--sp-2); margin-block-end:var(--sp-3); } .page-header h1 { margin:0; font-size:1.375rem; } .page-header .actions { margin-inline-start:auto; display:flex; gap:var(--sp-2); }`
- `.page-toolbar { display:flex; flex-wrap:wrap; gap:var(--sp-2); align-items:end; margin-block-end:var(--sp-3); } .page-toolbar .select,.page-toolbar .input { inline-size:auto; min-inline-size:10rem; }`
- `.form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:var(--sp-3); } .form-grid .field { margin:0; } .form-grid .span-2 { grid-column:1/-1; }`
- `.card { display:block; inline-size:auto; } .card > h2, .card > h3 { margin-block: 0 var(--sp-2); font-size:1.0625rem; } .card + .card, .stack > * + * { margin-block-start: var(--sp-3); }`
- `.grid-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:var(--sp-3); }` (listados de fichas/paneles)
- `.empty-state { display:grid; justify-items:center; gap:var(--sp-2); padding:var(--sp-5); color:var(--muted); text-align:center; }`
- Mantener tokens, badges con forma, `.num`, foco visible, 44px.

## 4. views-*.css: limpiar y alinear

- views-a.css: ELIMINAR duplicados de `.tabs*` y `.field-error/.field-hint` (ahora canónicos);
  conservar bento KPI (`.grid-bento` → usar `repeat(auto-fit,minmax(220px,1fr))`), heatmap
  (`repeat(auto-fill,minmax(110px,1fr))`, celdas ≥64px con forma+valor), sparkline, paneles de
  detalle (usar `.grid-cards`), tabs de sizing SIN redefinir patrón.
- views-b.css: ELIMINAR posicionamiento de `.dialog`; conservar mapa (svg inline-size:100%,
  block-size:auto, min-block-size:220px; nodos ≥28px; tooltip absolute dentro de contenedor
  relative), matriz RBI, semáforos; filtros usan `.page-toolbar`.
- views-c.css: ELIMINAR duplicados de `.tabs*`; conservar hoja A4 de informes
  (`.print-root { max-inline-size: 210mm; margin-inline:auto; background:var(--surface); padding:12mm; box-shadow:var(--shadow-1); }` en pantalla), dropzone, timeline recs, glosario, admin.
- Ningún view-*.css define patrones genéricos (dialog/tabs/field-error/pager): solo específicos.

## 5. Checkpoints de verificación (los ejecuta el orquestador en navegador)

1. 1366×768 light: header UNA fila (brand + controles a la derecha); sidebar 240px con icono+texto
   en línea y activo resaltado; main fluido con cards a ancho completo; footer una/dos filas sin recortes.
2. Mismas vistas en dark y en 800px (rail 56px, drawer abre con hamburger, labels ocultos).
3. RTL (ar): sidebar a la derecha, drawer desde la derecha, toasts esquina correcta, sin solapes.
4. Tablas anchas con scroll-x interno (`.table-wrap`), no columnas aplastadas.
5. Diálogos centrados con backdrop; tabs horizontales con scroll en móvil; formularios en 2 columnas ≥700px.
6. Consola limpia; `node --test` 162/162; sin `style=` inline nuevos; solo propiedades lógicas.
7. Capturas nuevas en docs/evidence/v2-*.png (dashboard, corrosion detalle, psv, mapa, apm, reports, admin; light+dark+rtl+móvil).
