#!/usr/bin/env node
/* tools/build-icons.cjs
 * Regenerates src/components/icons.js from vendored open-source icon sources.
 *
 * Build-time only. Sources are devDependencies and never shipped:
 *   lucide-static  (ISC)  ->  node_modules/lucide-static/icons/<name>.svg
 *   @tabler/icons   (MIT) ->  node_modules/@tabler/icons/icons/outline/<name>.svg
 *
 * The runtime stays dependency-free: every glyph is inlined as a static
 * 24x24 stroke string (CSP-safe, no inline scripts, no remote fetches).
 *
 * Run: node tools/build-icons.cjs
 * Idempotent: running it twice produces a byte-identical file.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LUCIDE_DIR = path.join(ROOT, 'node_modules', 'lucide-static', 'icons');
const TABLER_DIR = path.join(ROOT, 'node_modules', '@tabler', 'icons', 'icons', 'outline');
const OUT = path.join(ROOT, 'src', 'components', 'icons.js');

/* Normalized wrapper attributes. Kept byte-identical for every glyph. */
const WRAP_PROLOG =
  "'<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" ' +\n" +
  "      'stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\">' + inner + '</svg>'";

/* Semantic name -> [source, source-icon-file-name].
 * Source is 'lucide', 'tabler' or 'custom' (inner markup kept verbatim below).
 * Order mirrors the historical ICONS registry so diffs stay small. */
const MAP = [
  ['dashboard', 'lucide', 'layout-dashboard'],
  ['corrosion', 'lucide', 'droplets'],
  ['valve', 'custom', null],
  ['pipeline', 'tabler', 'pipeline'],
  ['apm', 'lucide', 'gauge'],
  ['ingest', 'lucide', 'database'],
  ['recs', 'lucide', 'clipboard-list'],
  ['reports', 'lucide', 'file-text'],
  ['glossary', 'lucide', 'book-open'],
  ['admin', 'lucide', 'settings'],
  ['alert-critical', 'lucide', 'octagon-alert'],
  ['alert-warning', 'lucide', 'triangle-alert'],
  ['alert-info', 'lucide', 'info'],
  ['shape-low', 'lucide', 'circle'],
  ['shape-moderate', 'lucide', 'square'],
  ['shape-high', 'lucide', 'triangle'],
  ['shape-severe', 'lucide', 'x'],
  ['sun', 'lucide', 'sun'],
  ['moon', 'lucide', 'moon'],
  ['monitor', 'lucide', 'monitor'],
  ['check', 'lucide', 'check'],
  ['x', 'lucide', 'x'],
  ['plus', 'lucide', 'plus'],
  ['search', 'lucide', 'search'],
  ['filter', 'lucide', 'funnel'],
  ['download', 'lucide', 'download'],
  ['upload', 'lucide', 'upload'],
  ['printer', 'lucide', 'printer'],
  ['clipboard', 'lucide', 'clipboard'],
  ['refresh', 'lucide', 'refresh-cw'],
  ['chevron-down', 'lucide', 'chevron-down'],
  ['chevron-right', 'lucide', 'chevron-right'],
  ['lock', 'lucide', 'lock'],
  ['unlock', 'lucide', 'unlock'],
  ['keyboard', 'lucide', 'keyboard'],
  ['close', 'lucide', 'circle-x'],
  ['edit', 'lucide', 'pencil'],
  ['trash', 'lucide', 'trash-2'],
  ['play', 'lucide', 'play'],
  ['menu', 'lucide', 'menu'],
  /* Oil & gas equipment families (see docs/VISUAL-SPEC.md §8). One glyph per
   * family, most faithful ISC/MIT source available; no third-party assets copied:
   *   pump       - API 610 / ISO 13709 centrifugal machine -> Lucide impeller
   *                (no dedicated "pump" glyph exists in either set; `fan` is the
   *                closest faithful rotary-impeller symbol at 24x24 stroke 2).
   *   engine     - ISO 8528 / IEEE 446 prime mover -> Lucide dedicated engine.
   *   fire       - NFPA 20 / BS EN 12845 / NBR 13714 -> Lucide fire-extinguisher.
   *   substation - IEC 61439 power installation -> Lucide utility-pole (no dedicated
   *                "substation" glyph exists; the pole is the closest power-infra symbol). */
  ['pump', 'lucide', 'fan'],
  ['engine', 'lucide', 'engine'],
  ['fire', 'lucide', 'fire-extinguisher'],
  ['substation', 'lucide', 'utility-pole'],
  ['brand', 'custom', null]
];

/* Custom inner markup retained because no faithful source glyph exists:
 *   valve  - industrial valve glyph (no valve icon in Lucide or Tabler).
 *   brand  - project emblem (Shield of Integrity): hexagonal shield + 270-degree
 *            gauge arc + needle. Kept in sync with assets/icons/favicon.svg.
 * Both use the same 2px stroke via the shared wrapper. */
const CUSTOM = {
  valve: '<circle cx="12" cy="12" r="7"/><path d="M5 12h14M12 12v7"/>',
  brand: '<path d="M12 2.5 L20.5 7.25 L20.5 16.75 L12 21.5 L3.5 16.75 L3.5 7.25 Z"/><path d="M9.17 16.33 A4 4 0 1 1 14.83 16.33"/><path d="M12 13.5 L13.5 10.9"/>'
};

function readSource(source, file) {
  const dir = source === 'lucide' ? LUCIDE_DIR : TABLER_DIR;
  const p = path.join(dir, file + '.svg');
  if (!fs.existsSync(p)) {
    throw new Error('source icon not found: ' + source + '/' + file + ' (' + p + ')');
  }
  return fs.readFileSync(p, 'utf8');
}

/* Extract the inner markup of an SVG and normalize to a single-line,
 * deterministic string: strip comments/xmlns/authored width-height, drop
 * Tabler's transparent 24x24 spacer path, collapse whitespace. */
function normalize(raw) {
  let text = String(raw)
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const m = text.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  if (!m) { throw new Error('no <svg> element found in source'); }
  let inner = m[1];
  inner = inner.replace(/<path\b[^>]*\bd="M0 0h24v24H0z"[^>]*\/?>/gi, '');
  inner = inner.replace(/<path\b[^>]*\bstroke="none"[^>]*\/?>/gi, '');
  inner = inner.replace(/<path\b[^>]*\bfill="none"[^>]*\bstroke="none"[^>]*\/?>/gi, '');
  inner = inner.replace(/\s+/g, ' ').trim();
  return inner;
}

/* Escape a value for embedding inside a single-quoted JS string literal. */
function jsString(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

function buildInner() {
  const entries = MAP.map(function (row) {
    const name = row[0];
    const source = row[1];
    const file = row[2];
    let inner;
    if (source === 'custom') {
      if (!Object.prototype.hasOwnProperty.call(CUSTOM, name)) {
        throw new Error('no custom markup for ' + name);
      }
      inner = CUSTOM[name];
    } else {
      inner = normalize(readSource(source, file));
    }
    return { name: name, source: source, file: file, inner: inner };
  });
  return entries;
}

function render(entries) {
  const mappingLines = entries.map(function (e) {
    const target = e.source === 'custom' ? 'custom (maintained)' : e.source + ':' + e.file;
    return ' *   ' + (e.name + '                    ').slice(0, 16) + '<- ' + target;
  }).join('\n');

  const iconLines = entries.map(function (e) {
    return '    ' + jsString(e.name) + ': wrap(' + jsString(e.inner) + ')';
  }).join(',\n');

  return [
    '// AUTO-GENERATED by tools/build-icons.cjs — icons from Lucide (ISC) & Tabler Icons (MIT). Regenerate: node tools/build-icons.cjs',
    '/* Mapping (semantic name <- source), see THIRD-PARTY-NOTICES.md:',
    mappingLines,
    ' */',
    '/* IntegrityWatch Field — icons',
    '   Inline 24px stroke SVG set plus severity shape mapping and Node-safe svg builder. */',
    '(function (root, factory) {',
    "  'use strict';",
    '  var api = factory(root);',
    '  root.IW = root.IW || {};',
    '  root.IW.ui = root.IW.ui || {};',
    '  root.IW.ui.icons = api;',
    "  if (typeof module === 'object' && module.exports) { module.exports = api; }",
    "})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {",
    "  'use strict';",
    '',
    '  function wrap(inner) {',
    '    return ' + WRAP_PROLOG + ';',
    '  }',
    '',
    '  var ICONS = {',
    iconLines,
    '  };',
    '',
    '  var SEVERITY_SHAPE = {',
    "    low: 'shape-low',",
    "    moderate: 'shape-moderate',",
    "    high: 'shape-high',",
    "    severe: 'shape-severe'",
    '  };',
    '',
    '  function svg(name) {',
    '    return ICONS[name];',
    '  }',
    '',
    '  function severity(level) {',
    '    var name = SEVERITY_SHAPE[level];',
    '    return name ? ICONS[name] : undefined;',
    '  }',
    '',
    '  function svgNode(name, size) {',
    "    if (typeof document === 'undefined') { return null; }",
    '    var str = ICONS[name];',
    '    if (!str) { return null; }',
    "    var tpl = document.createElement('template');",
    '    tpl.innerHTML = str.trim();',
    '    var node = tpl.content.firstElementChild;',
    '    if (node && size) {',
    "      node.setAttribute('width', String(size));",
    "      node.setAttribute('height', String(size));",
    '    }',
    '    return node;',
    '  }',
    '',
    '  return { ICONS: ICONS, svg: svg, severity: severity, svgNode: svgNode };',
    '});',
    ''
  ].join('\n');
}

function main() {
  const entries = buildInner();
  const out = render(entries);
  fs.writeFileSync(OUT, out, 'utf8');

  const counts = { lucide: 0, tabler: 0, custom: 0 };
  entries.forEach(function (e) { counts[e.source]++; });
  process.stdout.write(
    'icons.js regenerated: ' + entries.length + ' icons ' +
    '(lucide ' + counts.lucide + ', tabler ' + counts.tabler + ', custom ' + counts.custom + ')\n'
  );
}

main();
