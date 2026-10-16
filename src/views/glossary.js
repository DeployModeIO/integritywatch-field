/* IntegrityWatch Field — glossary view
   Searchable multilingual engineering glossary with category filter. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.glossary = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var CATEGORIES = ['corrosion', 'psv', 'pipeline', 'apm', 'standards', 'data'];

  function ui() { return root.IW.ui; }

  function el(tag, attrs) {
    var u = ui();
    return u.el.apply(u, arguments);
  }

  function localeOf() {
    var i18n = root.IW.i18n;
    return (i18n && typeof i18n.getLocale === 'function') ? i18n.getLocale() : 'en';
  }

  function localized(term, locale) {
    var entry = (term.i18n && term.i18n[locale]) || (term.i18n && term.i18n.en);
    return entry || {};
  }

  return {
    id: 'glossary',
    titleKey: 'nav.glossary',
    icon: 'glossary',
    render: function (container, ctx) {
      var t = ctx.i18n || function (k) { return k; };
      var terms = (root.IW.data && root.IW.data.glossary && root.IW.data.glossary.terms) || [];
      var locale = localeOf();

      var state = { query: '', category: 'all' };

      var view = el('div', { class: 'view view-glossary' });
      view.appendChild(el('h1', { text: t('glossary.title') }));

      var searchInput = el('input', { class: 'input', attrs: { type: 'search', placeholder: t('glossary.searchPlaceholder'), 'aria-label': t('glossary.searchPlaceholder') } });
      var catSelect = el('select', { class: 'select', attrs: { 'aria-label': t('glossary.category') } });
      catSelect.appendChild(el('option', { attrs: { value: 'all' }, text: t('common.all') }));
      CATEGORIES.forEach(function (c) {
        catSelect.appendChild(el('option', { attrs: { value: c }, text: t('glossary.categories.' + c) }));
      });

      var countEl = el('p', { class: 'results-count', attrs: { role: 'status', 'aria-live': 'polite' } });
      var listWrap = el('div', { class: 'glossary-list' });

      var debounceTimer = null;
      searchInput.addEventListener('input', function () {
        if (debounceTimer) { clearTimeout(debounceTimer); }
        debounceTimer = setTimeout(function () {
          state.query = searchInput.value.trim().toLowerCase();
          renderList();
        }, 200);
      });
      catSelect.addEventListener('change', function () {
        state.category = catSelect.value;
        renderList();
      });

      view.appendChild(el('div', { class: 'stack' },
        el('div', { class: 'row' }, searchInput, catSelect),
        countEl,
        listWrap));

      function filtered() {
        return terms.filter(function (term) {
          if (state.category !== 'all' && term.category !== state.category) { return false; }
          if (state.query) {
            var entry = localized(term, locale);
            var hay = ((entry.term || '') + ' ' + (entry.definition || '')).toLowerCase();
            if (hay.indexOf(state.query) === -1) { return false; }
          }
          return true;
        });
      }

      function renderList() {
        var list = filtered();
        countEl.textContent = list.length + ' ' + t('glossary.resultsCount');
        listWrap.textContent = '';
        if (list.length === 0) {
          listWrap.appendChild(el('p', { class: 'empty-state', text: t('glossary.noResults') }));
          return;
        }
        list.forEach(function (term) {
          var entry = localized(term, locale);
          var card = el('article', { class: 'card glossary-card' });
          card.appendChild(el('div', { class: 'row glossary-card-head' },
            el('strong', { text: entry.term || term.id }),
            el('span', { class: 'pill', text: t('glossary.categories.' + term.category) })));
          card.appendChild(el('p', { text: entry.definition || '—' }));
          if (term.standard) {
            card.appendChild(el('p', { class: 'glossary-card-ref', text: t('glossary.reference') + ': ' + term.standard }));
          }
          listWrap.appendChild(card);
        });
      }

      container.appendChild(view);
      renderList();
    }
  };
});
