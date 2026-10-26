/* rag-prompt-para-turno.cjs — arma un prompt RAG real (embed+search) y lo salva a fichero
   para pasarlo a hermes-turno con Qwen3.5-9B. Uso: node tools/i18n/rag-prompt-para-turno.cjs <pregunta> */
'use strict';
const fs = require('fs');
const path = require('path');
const engine = require(path.join(__dirname, '..', '..', 'src', 'app', 'assistant-engine.js'));

const q = process.argv[2] || '¿Qué anomalías ILI tiene SYS-NORTE-16?';
(async function () {
  const emb = await fetch('http://127.0.0.1:5106/v1/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: [q] }) }).then(r => r.json());
  const sr = await fetch('http://127.0.0.1:6333/collections/integritywatch_rag/points/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vector: emb.data[0].embedding, limit: 8, with_payload: true }) }).then(r => r.json());
  const p = engine.buildPrompt(q, sr.result);
  const out = 'SYSTEM: ' + p.system + '\n\nUSUARIO:\n' + p.user;
  fs.writeFileSync(path.join(process.env.TEMP || 'C:\\Users\\Deploy\\AppData\\Local\\Temp\\kilo', 'qwen35-rag-prompt.txt'), out, 'utf8');
  console.log('Prompt listo: ' + out.length + ' chars, ' + sr.result.length + ' hits, contexto ' + p.contextChars + ' chars');
})().catch(e => { console.error('ERROR', e); process.exit(1); });
