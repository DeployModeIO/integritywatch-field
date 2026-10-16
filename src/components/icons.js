/* IntegrityWatch Field — icons
   Inline 24px stroke SVG set plus severity shape mapping and Node-safe svg builder. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.ui = root.IW.ui || {};
  root.IW.ui.icons = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function wrap(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  var ICONS = {
    dashboard: wrap('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    corrosion: wrap('<path d="M12 3c3 4.5 6 7.5 6 10a6 6 0 0 1-12 0c0-2.5 3-5.5 6-10z"/><path d="M9 14.5c.5 1 1 1 1.5 0s1-1 1.5 0"/>'),
    valve: wrap('<circle cx="12" cy="12" r="7"/><path d="M5 12h14M12 12v7"/>'),
    pipeline: wrap('<path d="M4 12h16M4 9v6M20 9v6"/>'),
    apm: wrap('<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-4.5"/>'),
    ingest: wrap('<path d="M12 3v10M8 9l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
    recs: wrap('<path d="M5 3v18"/><path d="M5 4h11l-2 3 2 3H5"/>'),
    reports: wrap('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
    glossary: wrap('<path d="M12 6c-2-1.5-4.5-2-7-2v14c2.5 0 5 .5 7 2 2-1.5 4.5-2 7-2V4c-2.5 0-5 .5-7 2z"/><path d="M12 6v14"/>'),
    admin: wrap('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>'),
    'alert-critical': wrap('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>'),
    'alert-warning': wrap('<path d="M12 3l10 18H2z"/><path d="M12 9v5M12 17.5v.01"/>'),
    'alert-info': wrap('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>'),
    'shape-low': wrap('<circle cx="12" cy="12" r="9"/>'),
    'shape-moderate': wrap('<rect x="4" y="4" width="16" height="16" rx="1"/>'),
    'shape-high': wrap('<path d="M12 4l9 16H3z"/>'),
    'shape-severe': wrap('<path d="M5 5l14 14M19 5L5 19"/>'),
    sun: wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>'),
    moon: wrap('<path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/>'),
    monitor: wrap('<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M9 20h6M12 16v4"/>'),
    check: wrap('<path d="M4 12l5 5L20 6"/>'),
    x: wrap('<path d="M5 5l14 14M19 5L5 19"/>'),
    plus: wrap('<path d="M12 5v14M5 12h14"/>'),
    search: wrap('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>'),
    filter: wrap('<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'),
    download: wrap('<path d="M12 3v12M8 11l4 4 4-4"/><path d="M4 19h16"/>'),
    upload: wrap('<path d="M12 15V3M8 7l4-4 4 4"/><path d="M4 19h16"/>'),
    printer: wrap('<path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>'),
    clipboard: wrap('<rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 4a3 3 0 0 1 6 0"/><path d="M9 10h6M9 14h6"/>'),
    refresh: wrap('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
    'chevron-down': wrap('<path d="M6 9l6 6 6-6"/>'),
    'chevron-right': wrap('<path d="M9 6l6 6-6 6"/>'),
    lock: wrap('<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    unlock: wrap('<rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
    keyboard: wrap('<rect x="2" y="6" width="20" height="12" rx="1"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6"/>'),
    close: wrap('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
    edit: wrap('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
    trash: wrap('<path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14"/><path d="M10 11v5M14 11v5"/>'),
    play: wrap('<path d="M7 5l12 7-12 7z"/>'),
    menu: wrap('<path d="M4 6h16M4 12h16M4 18h16"/>')
  };

  var SEVERITY_SHAPE = {
    low: 'shape-low',
    moderate: 'shape-moderate',
    high: 'shape-high',
    severe: 'shape-severe'
  };

  function svg(name) {
    return ICONS[name];
  }

  function severity(level) {
    var name = SEVERITY_SHAPE[level];
    return name ? ICONS[name] : undefined;
  }

  function svgNode(name, size) {
    if (typeof document === 'undefined') { return null; }
    var str = ICONS[name];
    if (!str) { return null; }
    var tpl = document.createElement('template');
    tpl.innerHTML = str.trim();
    var node = tpl.content.firstElementChild;
    if (node && size) {
      node.setAttribute('width', String(size));
      node.setAttribute('height', String(size));
    }
    return node;
  }

  return { ICONS: ICONS, svg: svg, severity: severity, svgNode: svgNode };
});
