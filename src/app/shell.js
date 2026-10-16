/* IntegrityWatch Field — shell
   App chrome: header, sidebar nav, footer, toast region, SW banner and rules scheduler. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.app = root.IW.app || {};
  root.IW.app.shell = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var _root = null;
  var _repos = null;
  var _store = null;
  var _bus = null;
  var _i18n = null;
  var _timer = null;
  var _sector = null;
  var _navLinks = {};
  var _navLabels = {};
  var _settings = { rulesIntervalSec: 60, residualBandPct: 20, availabilityThresholdPct: 90, stuckSensorCount: 10, zScoreThreshold: 3 };
  var _badgeEl = null;
  var _badgeCount = null;
  var _rulesStatus = null;
  var _sectorSelect = null;
  var _localeSelect = null;
  var _themeIconSpan = null;
  var _themeBtn = null;
  var _hamburger = null;
  var _brandEl = null;
  var _brandNameEl = null;
  var _navEl = null;
  var _skipLinkEl = null;
  var _runRulesLabel = null;
  var _disclaimerEl = null;

  var SECTORS = ['upstream', 'midstream', 'downstream'];

  var NAV_GROUPS = [
    { items: [['dashboard', 'dashboard', '#/dashboard'], ['recommendations', 'recs', '#/recommendations'], ['reports', 'reports', '#/reports']] },
    { items: [['corrosion', 'corrosion', '#/corrosion'], ['psv', 'valve', '#/psv'], ['pipelines', 'pipeline', '#/pipelines'], ['apm', 'apm', '#/apm']] },
    { items: [['ingest', 'ingest', '#/ingest'], ['glossary', 'glossary', '#/glossary'], ['admin', 'admin', '#/admin']] }
  ];

  var STATIC_STANDARD_CODES = [
    'NACE/AMPP SP0775', 'MR0175/ISO 15156-2', 'ASTM G4', 'ASTM G1', 'ASTM G15', 'API 520 Pt I',
    'API 526', 'API 5L', 'ASME B31.4', 'ASME B31.8', 'ISO 55000', 'ISO 14224', 'API 580',
    'API 581', 'NACE SP0169', 'OGMP 2.0'
  ];

  function t(key) { return (_i18n && typeof _i18n.t === 'function') ? _i18n.t(key) : key; }
  function ui() { return root.IW.ui; }
  function themeApi() { return root.IW.app.theme; }

  // Keep the accessible name coherent with the visible counter (axe label-content-name-mismatch).
  function syncBadgeLabel() {
    if (!_badgeEl) { return; }
    var count = _badgeCount ? _badgeCount.textContent : '0';
    _badgeEl.setAttribute('aria-label', t('rules.title') + ' · ' + count);
  }

  function el(tag, attrs) {
    var u = ui();
    if (u && typeof u.el === 'function') { return u.el.apply(u, arguments); }
    return document.createElement(tag);
  }

  function icon(name, size) {
    var u = ui();
    if (u && typeof u.icon === 'function') {
      var n = u.icon(name, size);
      if (n && n.nodeType) { return n; }
    }
    return document.createTextNode('');
  }

  function brandMark() {
    var n = icon('brand', 28);
    if (n && n.nodeType) { n.setAttribute('class', 'app-brand__mark'); }
    return n;
  }

  function buildSectorOptions() {
    if (!_sectorSelect) { return; }
    _sectorSelect.textContent = '';
    _sectorSelect.appendChild(el('option', { attrs: { value: 'all' }, text: t('common.all') }));
    SECTORS.forEach(function (s) {
      _sectorSelect.appendChild(el('option', { attrs: { value: s }, text: t('common.' + s) }));
    });
    _sectorSelect.value = (SECTORS.indexOf(_sector) !== -1) ? _sector : 'all';
  }

  function buildHeader() {
    var header = el('header', { class: 'app-header' });

    _hamburger = el('button', {
      class: 'btn btn-ghost hamburger',
      attrs: { 'aria-expanded': 'false', 'aria-controls': 'app-nav', 'aria-label': t('a11y.openNav') },
      on: { click: toggleNav }
    }, icon('menu', 22));
    header.appendChild(_hamburger);

    _brandEl = el('a', { class: 'app-brand', attrs: { href: '#/dashboard' } },
      brandMark(),
      _brandNameEl = el('span', { class: 'app-brand__name', text: t('common.appName') }));
    header.appendChild(_brandEl);

    var controls = el('div', { class: 'app-header__controls' });

    _sectorSelect = el('select', { class: 'select', attrs: { id: 'sector-select', name: 'sector-select', 'aria-label': t('common.sector') }, on: { change: onSectorChange } });
    buildSectorOptions();
    controls.appendChild(_sectorSelect);

    _localeSelect = el('select', { class: 'select', attrs: { id: 'locale-select', name: 'locale-select', 'aria-label': t('common.language') }, on: { change: onLocaleChange } });
    var locales = (_i18n && typeof _i18n.listLocales === 'function') ? _i18n.listLocales() : [];
    locales.forEach(function (l) {
      _localeSelect.appendChild(el('option', { attrs: { value: l.code }, text: l.nativeName || l.name || l.code }));
    });
    var currentLocale = (_i18n && typeof _i18n.getLocale === 'function') ? _i18n.getLocale() : 'en';
    _localeSelect.value = currentLocale;
    controls.appendChild(_localeSelect);

    _themeIconSpan = el('span', { class: 'theme-icon', attrs: { 'aria-hidden': 'true' } });
    _themeBtn = el('button', { class: 'btn btn-ghost touch', attrs: { id: 'theme-toggle', 'aria-label': t('common.theme') }, on: { click: onThemeToggle } }, _themeIconSpan);
    controls.appendChild(_themeBtn);

    _badgeEl = el('button', { class: 'btn btn-ghost touch badge-recs', attrs: { 'aria-label': t('rules.title') }, on: { click: function () { navigateTo('#/recommendations'); } } },
      icon('alert-critical', 18),
      _badgeCount = el('span', { class: 'badge-count', text: '0' }));
    _badgeEl.hidden = true;
    controls.appendChild(_badgeEl);

    _rulesStatus = el('span', { class: 'rules-status', text: t('rules.lastRun') + ': ' + t('common.none') });
    controls.appendChild(_rulesStatus);

    _runRulesLabel = el('span', { text: t('dashboard.runRules') });
    controls.appendChild(el('button', { class: 'btn btn-primary', attrs: { id: 'run-rules' }, on: { click: function () { runRules(false); } } },
      icon('play', 18), _runRulesLabel));

    header.appendChild(controls);
    return header;
  }

  function buildNav() {
    var nav = el('nav', { class: 'app-sidebar', attrs: { id: 'app-nav', 'aria-label': t('common.appName') } });
    _navEl = nav;
    NAV_GROUPS.forEach(function (g) {
      var group = el('div', { class: 'nav-group' });
      g.items.forEach(function (item) {
        var viewId = item[0];
        var a = el('a', { class: 'app-sidebar__item', attrs: { href: item[2] }, dataset: { view: viewId } },
          el('span', { class: 'icon' }, icon(item[1], 20)),
          _navLabels[viewId] = el('span', { class: 'app-sidebar__label', text: t('nav.' + viewId) }));
        _navLinks[viewId] = a;
        group.appendChild(a);
      });
      nav.appendChild(group);
    });
    return nav;
  }

  function buildFooter() {
    var footer = el('footer', { class: 'app-footer' });
    _disclaimerEl = el('p', { class: 'disclaimer', text: t('common.disclaimer') });
    footer.appendChild(_disclaimerEl);
    var standards = (root.IW.data && root.IW.data.standards && root.IW.data.standards.standards) || STATIC_STANDARD_CODES;
    var chips = el('div', { class: 'standard-chips' });
    standards.forEach(function (s) {
      var code = typeof s === 'string' ? s : s.code;
      if (code) { chips.appendChild(el('span', { class: 'pill', text: code })); }
    });
    footer.appendChild(chips);
    return footer;
  }

  function buildShell() {
    if (!_root) { return; }
    _root.textContent = '';
    _skipLinkEl = el('a', { class: 'skip-link', attrs: { href: '#main' }, text: t('a11y.skipLink') });
    _root.appendChild(_skipLinkEl);
    _root.appendChild(buildHeader());
    _root.appendChild(buildNav());
    _root.appendChild(el('main', { class: 'app-main', attrs: { id: 'main', tabindex: '-1' } }));
    _root.appendChild(buildFooter());
    _root.appendChild(el('div', { class: 'toast-region', attrs: { id: 'toast-region', 'aria-live': 'polite' } }));
  }

  function setNavOpen(open) {
    if (!_navEl || !_hamburger) { return; }
    if (open) {
      _navEl.setAttribute('data-open', '');
      document.body.classList.add('nav-open');
    } else {
      _navEl.removeAttribute('data-open');
      document.body.classList.remove('nav-open');
    }
    _hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
    _hamburger.setAttribute('aria-label', t(open ? 'a11y.closeNav' : 'a11y.openNav'));
  }

  function toggleNav() {
    if (!_navEl) { return; }
    setNavOpen(!_navEl.hasAttribute('data-open'));
  }

  function closeNavOnEscape(ev) {
    if (ev && ev.key === 'Escape' && _navEl && _navEl.hasAttribute('data-open')) {
      setNavOpen(false);
      if (_hamburger) { _hamburger.focus(); }
    }
  }

  function closeNavOnOutside(ev) {
    if (!_navEl || !_navEl.hasAttribute('data-open')) { return; }
    if (_hamburger && _hamburger.contains(ev.target)) { return; }
    if (_navEl.contains(ev.target)) { return; }
    setNavOpen(false);
  }

  function navigateTo(hash) {
    var router = root.IW.app.router;
    if (router && typeof router.navigate === 'function') { router.navigate(hash); }
    else if (typeof location !== 'undefined') { location.hash = hash; }
  }

  function onSectorChange() {
    _sector = _sectorSelect.value;
    if (_repos && _repos.meta) {
      _repos.meta.set('sector', _sector).catch(function (err) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') { console.warn('[shell] sector meta set failed', err); }
      });
    }
    if (_bus && typeof _bus.emit === 'function') { _bus.emit('sector:changed', { sector: _sector }); }
  }

  function onLocaleChange() {
    if (_i18n && typeof _i18n.setLocale === 'function') { _i18n.setLocale(_localeSelect.value); }
  }

  function onThemeToggle() {
    var th = themeApi();
    if (th && typeof th.cycle === 'function') { th.cycle(); }
    updateThemeIcon();
  }

  function updateThemeIcon() {
    if (!_themeIconSpan) { return; }
    var th = themeApi();
    var cur = (th && typeof th.getTheme === 'function') ? th.getTheme() : 'system';
    var name = cur === 'light' ? 'sun' : cur === 'dark' ? 'moon' : 'monitor';
    _themeIconSpan.textContent = '';
    _themeIconSpan.appendChild(icon(name, 20));
  }

  function formatDateTime(iso) {
    if (_i18n && typeof _i18n.formatDate === 'function') { return _i18n.formatDate(iso, { dateStyle: 'short', timeStyle: 'short' }); }
    return iso;
  }

  // Re-render only the localized chrome texts without rebuilding the shell, so
  // sector selection, scroll position and the rules scheduler survive a locale switch.
  function refreshChrome() {
    if (_brandNameEl) { _brandNameEl.textContent = t('common.appName'); }
    if (_skipLinkEl) { _skipLinkEl.textContent = t('a11y.skipLink'); }
    Object.keys(_navLabels).forEach(function (k) {
      _navLabels[k].textContent = t('nav.' + k);
    });
    if (_sectorSelect) {
      buildSectorOptions();
      _sectorSelect.setAttribute('aria-label', t('common.sector'));
    }
    if (_localeSelect) {
      _localeSelect.setAttribute('aria-label', t('common.language'));
      _localeSelect.value = (_i18n && typeof _i18n.getLocale === 'function') ? _i18n.getLocale() : 'en';
    }
    if (_themeBtn) { _themeBtn.setAttribute('aria-label', t('common.theme')); }
    if (_hamburger) {
      var open = !!(document.body && document.body.classList.contains('nav-open'));
      _hamburger.setAttribute('aria-label', t(open ? 'a11y.closeNav' : 'a11y.openNav'));
    }
    syncBadgeLabel();
    if (_runRulesLabel) { _runRulesLabel.textContent = t('dashboard.runRules'); }
    if (_disclaimerEl) { _disclaimerEl.textContent = t('common.disclaimer'); }
    updateRulesStatus();
  }

  function refreshRecs() {
    if (!_repos || !_repos.recommendations) { return Promise.resolve({ critical: 0, warning: 0 }); }
    return _repos.recommendations.list().then(function (recs) {
      var critical = 0, warning = 0;
      (recs || []).forEach(function (r) {
        if (r.status === 'open') {
          if (r.severity === 'critical') { critical++; }
          else if (r.severity === 'warning') { warning++; }
        }
      });
      var total = critical + warning;
      if (_badgeCount) { _badgeCount.textContent = String(total); }
      if (_badgeEl) { _badgeEl.hidden = total === 0; }
      syncBadgeLabel();
      return { critical: critical, warning: warning };
    }).catch(function (err) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') { console.warn('[shell] recommendations list failed', err); }
      if (_badgeEl) { _badgeEl.hidden = true; }
      return { critical: 0, warning: 0 };
    });
  }

  function updateRulesStatus() {
    if (!_repos || !_repos.meta) { return Promise.resolve(); }
    return _repos.meta.get('lastRulesRunISO').then(function (iso) {
      if (_rulesStatus) {
        _rulesStatus.textContent = t('rules.lastRun') + ': ' + (iso ? formatDateTime(iso) : t('common.none'));
      }
    }).catch(function (err) {
      if (typeof console !== 'undefined' && typeof console.warn === 'function') { console.warn('[shell] lastRulesRun meta get failed', err); }
    });
  }

  function runRules(isAuto) {
    var engine = root.IW.rules && root.IW.rules.engine;
    if (!engine || typeof engine.sweep !== 'function') {
      return Promise.resolve({ created: 0, updated: 0, reopened: 0, criticals: 0 });
    }
    return Promise.resolve()
      .then(function () { return engine.sweep(_repos, _settings, 'local'); })
      .then(function (summary) {
        summary = summary || {};
        if (isAuto && summary.criticals > 0 && ui() && typeof ui().toast === 'function') {
          ui().toast(t('rules.newCriticalToast'), { severity: 'critical' });
        }
        updateRulesStatus();
        return refreshRecs().then(function () { return summary; });
      })
      .catch(function (err) {
        if (typeof console !== 'undefined' && typeof console.error === 'function') { console.error('rules sweep failed:', err); }
        return { created: 0, updated: 0, reopened: 0, criticals: 0 };
      });
  }

  function startScheduler() {
    stopScheduler();
    var sec = _settings.rulesIntervalSec || 60;
    _timer = setInterval(function () { runRules(true); }, sec * 1000);
  }

  function stopScheduler() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  function loadSettings() {
    if (!_repos || !_repos.meta) { startScheduler(); return refreshRecs(); }
    var keys = ['rulesIntervalSec', 'residualBandPct', 'availabilityThresholdPct', 'stuckSensorCount', 'zScoreThreshold', 'sector'];
    var jobs = keys.map(function (k) { return _repos.meta.get(k).catch(function () { return undefined; }); });
    return Promise.all(jobs).then(function (vals) {
      if (vals[0] != null) { _settings.rulesIntervalSec = vals[0]; }
      if (vals[1] != null) { _settings.residualBandPct = vals[1]; }
      if (vals[2] != null) { _settings.availabilityThresholdPct = vals[2]; }
      if (vals[3] != null) { _settings.stuckSensorCount = vals[3]; }
      if (vals[4] != null) { _settings.zScoreThreshold = vals[4]; }
      if (vals[5] != null) { _sector = vals[5]; }
      if (_sectorSelect) {
        _sectorSelect.value = (SECTORS.indexOf(_sector) !== -1) ? _sector : 'all';
      }
      startScheduler();
      updateRulesStatus();
      return refreshRecs();
    });
  }

  function bindEvents() {
    if (_bus && typeof _bus.on === 'function') {
      _bus.on('route:changed', function (data) {
        var viewId = data && data.viewId;
        Object.keys(_navLinks).forEach(function (k) {
          if (k === viewId) { _navLinks[k].setAttribute('aria-current', 'page'); }
          else { _navLinks[k].removeAttribute('aria-current'); }
        });
        setNavOpen(false);
      });
      _bus.on('theme:changed', function () { updateThemeIcon(); });
      _bus.on('locale:changed', function () { refreshChrome(); });
      _bus.on('sw:update', function () {
        if (ui() && typeof ui().toast === 'function') {
          ui().toast(t('common.updateAvailable'), {
            severity: 'info',
            timeoutMs: 0,
            action: { labelKey: 'common.reload', onClick: function () { if (typeof location !== 'undefined') { location.reload(); } } }
          });
        }
      });
    }
  }

  function bindChromeEvents() {
    if (typeof document === 'undefined') { return; }
    document.addEventListener('keydown', closeNavOnEscape);
    document.addEventListener('click', closeNavOnOutside);
  }

  function mount(opts) {
    _root = opts.root;
    _repos = opts.repos;
    _store = opts.store;
    _bus = opts.bus;
    _i18n = opts.i18n;
    buildShell();
    bindChromeEvents();
    bindEvents();
    updateThemeIcon();
    loadSettings();
    return { refreshRecs: refreshRecs, runRules: runRules, getSector: function () { return _sector; } };
  }

  return { mount: mount };
});
