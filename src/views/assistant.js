/* IntegrityWatch Field — assistant view (F5)
   Offline RAG chat: embeds (:5106) -> Qdrant (integritywatch_rag) -> local LLM (:9999).
   Anti-alucinacion: el system prompt exige responder solo con el contexto y citar [n].
   Historial en localStorage (datos no criticos de demo). CSP: sin inline styles/scripts. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.views = root.IW.views || {};
  root.IW.views.assistant = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var HISTORY_KEY = 'iw.assistant.history';
  var HISTORY_MAX = 50;
  var TOP_K = 8;
  var T_EMBED_MS = 15000;
  var T_SEARCH_MS = 15000;
  var T_CHAT_MS = 120000;

  function ui() { return root.IW.ui; }
  function eng() { return root.IW.app && root.IW.app.assistantEngine; }

  function el(tag, attrs) {
    var u = ui();
    return u.el.apply(u, arguments);
  }

  function loadHistory() {
    try {
      var arr = JSON.parse(root.localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function saveHistory(history) {
    try {
      root.localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_MAX)));
    } catch (e) { /* quota: historial no critico */ }
  }

  function postJson(url, payload, timeoutMs) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) {
        var err = new Error('HTTP ' + r.status);
        err.status = r.status;
        throw err;
      }
      return r.json();
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  return {
    id: 'assistant',
    titleKey: 'nav.assistant',
    icon: 'glossary',
    render: function (container, ctx) {
      var t = ctx.i18n || function (k) { return k; };
      var E = eng();
      var state = { busy: false };

      var view = el('div', { class: 'view view-assistant' });
      view.appendChild(el('div', { class: 'page-header' }, el('h1', { text: t('assistant.title') })));
      view.appendChild(el('p', { class: 'assistant-hint', text: t('assistant.subtitle') }));

      var status = el('div', { class: 'assistant-status', attrs: { role: 'status' } });
      status.hidden = true;
      view.appendChild(status);

      var log = el('div', { class: 'assistant-log', attrs: { 'aria-live': 'polite' } });
      var emptyHint = el('div', { class: 'assistant-empty-hint', text: t('assistant.empty') });
      log.appendChild(emptyHint);
      view.appendChild(log);

      var suggestions = el('div', { class: 'assistant-suggestions' });
      ['assistant.suggest1', 'assistant.suggest2', 'assistant.suggest3'].forEach(function (k) {
        suggestions.appendChild(el('button', {
          class: 'btn btn-ghost touch',
          text: t(k),
          on: { click: function () { input.value = t(k); doSend(); } }
        }));
      });
      view.appendChild(suggestions);

      var input = el('input', {
        class: 'field-input assistant-input',
        attrs: { type: 'text', id: 'assistant-input', placeholder: t('assistant.placeholder'), 'aria-label': t('assistant.placeholder') },
        on: { keydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); doSend(); } } }
      });
      var sendBtn = el('button', { class: 'btn btn-primary', text: t('assistant.send'), on: { click: function () { doSend(); } } });
      view.appendChild(el('div', { class: 'assistant-form' }, input, sendBtn));

      var historyWrap = el('div', { class: 'assistant-history' });
      view.appendChild(historyWrap);

      if (E) {
        view.appendChild(el('div', { class: 'assistant-model-note', text: t('assistant.model') + ': ' + E.ASSISTANT_ENDPOINTS.model }));
      }

      function setStatus(msg, isError) {
        status.hidden = !msg;
        status.textContent = msg || '';
        if (isError) { status.classList.add('error'); } else { status.classList.remove('error'); }
      }

      function bubble(cls, text) {
        if (emptyHint.parentNode === log) { log.removeChild(emptyHint); }
        var b = el('div', { class: 'assistant-msg ' + cls });
        b.appendChild(el('div', { text: text }));
        log.appendChild(b);
        log.scrollTop = log.scrollHeight;
        return b;
      }

      function renderHistory() {
        historyWrap.textContent = '';
        var h = loadHistory();
        if (!h.length) { return; }
        historyWrap.appendChild(el('span', { class: 'field-label', text: t('assistant.history') }));
        h.slice(-8).reverse().forEach(function (item) {
          historyWrap.appendChild(el('button', {
            class: 'btn btn-ghost touch',
            text: item.q.length > 48 ? item.q.slice(0, 45) + '...' : item.q,
            on: { click: function () { input.value = item.q; doSend(); } }
          }));
        });
        historyWrap.appendChild(el('button', {
          class: 'btn btn-danger touch',
          text: t('assistant.clear'),
          on: { click: function () { saveHistory([]); renderHistory(); } }
        }));
      }

      function doSend() {
        var q = (input.value || '').trim();
        if (!q || state.busy) { return; }
        if (!E) { setStatus(t('assistant.offline'), true); return; }
        state.busy = true;
        sendBtn.disabled = true;
        setStatus('');
        bubble('assistant-msg-user', q);
        input.value = '';
        var answerNode = bubble('assistant-msg-bot assistant-msg-think', t('assistant.thinking'));

        var EP = E.ASSISTANT_ENDPOINTS;
        var embedUrl = EP.embed + '/v1/embeddings';
        var searchUrl = EP.qdrant + '/collections/' + EP.collection + '/points/search';
        var chatUrl = EP.llm + '/v1/chat/completions';
        var hits = [];

        postJson(embedUrl, { model: 'iw-embed', input: [q] }, T_EMBED_MS)
          .then(function (emb) {
            if (!emb || !emb.data || !emb.data.length) { throw new Error('E_EMPTY_EMBED'); }
            return postJson(searchUrl, { vector: emb.data[0].embedding, limit: TOP_K, with_payload: true }, T_SEARCH_MS);
          })
          .then(function (sr) {
            hits = (sr && sr.result) || [];
            var prompt = E.buildPrompt(q, hits);
            return postJson(chatUrl, {
              model: EP.model,
              messages: [
                { role: 'system', content: prompt.system },
                { role: 'user', content: prompt.user }
              ],
              temperature: 0.3,
              max_tokens: 400
            }, T_CHAT_MS);
          })
          .then(function (cj) {
            var msg = (cj && cj.choices && cj.choices[0] && cj.choices[0].message) || {};
            var answer = (msg.content || '').trim();
            answerNode.classList.remove('assistant-msg-think');
            answerNode.textContent = '';
            answerNode.appendChild(el('div', { text: answer || '(—)' }));
            var citations = E.parseCitations(hits);
            if (citations.length) {
              var wrap = el('div', { class: 'assistant-sources' });
              wrap.appendChild(el('span', { class: 'field-label', text: t('assistant.sources') }));
              citations.forEach(function (c) {
                wrap.appendChild(el('span', {
                  class: 'pill',
                  text: '[' + c.n + '] ' + c.source + (c.section ? ' · ' + c.section : '')
                }));
              });
              answerNode.appendChild(wrap);
            }
            log.scrollTop = log.scrollHeight;
            var h = loadHistory();
            h.push({ q: q, a: answer.slice(0, 280), at: new Date().toISOString() });
            saveHistory(h);
            renderHistory();
          })
          .catch(function (err) {
            var code = E.friendlyError(err, err && err.status);
            answerNode.classList.remove('assistant-msg-think');
            answerNode.classList.add('assistant-msg-error');
            answerNode.textContent = '';
            if (code === 'E_OFFLINE') {
              answerNode.appendChild(el('div', { text: t('assistant.offline') }));
            } else {
              answerNode.appendChild(el('div', { text: t('assistant.errorUnknown') + ' (' + code + ')' }));
            }
            log.scrollTop = log.scrollHeight;
          })
          .then(function () {
            state.busy = false;
            sendBtn.disabled = false;
          });
      }

      renderHistory();
      container.appendChild(view);
    }
  };
});
