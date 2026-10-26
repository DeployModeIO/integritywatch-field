(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.app = root.IW.app || {};
  root.IW.app.assistantEngine = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var api = {
    ASSISTANT_ENDPOINTS: { qdrant: 'http://127.0.0.1:6333', llm: 'http://127.0.0.1:8081', embed: 'http://127.0.0.1:5106', collection: 'integritywatch_rag', model: 'qwen3-4b-instruct' },
    parseCitations: function(hits) {
      if (!hits || hits.length === 0) return [];
      var validHits = [];
      for (var i = 0; i < hits.length; i++) {
        if (hits[i].payload && hits[i].payload.source) {
          validHits.push(hits[i]);
        }
      }
      return validHits.map(function(hit, index) {
        return { n: index + 1, source: hit.payload.source, section: hit.payload.section };
      });
    },
    buildPrompt: function(question, hits) {
      var system = "Responde SOLO con el contexto proporcionado. Si no hay contexto suficiente, indica que no hay información relevante. Cita fuentes usando [número].";
      var user = question;
      var context = [];
      var chars = 0;
      var citations = this.parseCitations(hits);
      var n = 1;
      for (var i = 0; i < hits.length; i++) {
        var hit = hits[i];
        if (!hit.payload || !hit.payload.source) continue;
        var text = hit.payload.text;
        var chunk = "[" + n + "] (" + hit.payload.source + ": " + hit.payload.section + ")\n" + text;
        if (chars + chunk.length > 6000) break;
        context.push(chunk);
        chars += chunk.length;
        n++;
      }
      user += "\n\n" + context.join("\n");
      return { system: system, user: user, contextChars: chars };
    },
    friendlyError: function(err, status) {
      if (err && err instanceof TypeError && (err.message.indexOf('fetch failed') !== -1 || err.message.indexOf('network') !== -1)) return 'E_OFFLINE';
      if (status >= 500) return 'E_LLM';
      if (status >= 400 && status < 500) return 'E_QDRANT';
      return 'E_UNKNOWN';
    }
  };
  return api;
});
