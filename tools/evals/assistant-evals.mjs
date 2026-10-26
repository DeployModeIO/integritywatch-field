/* assistant-evals.mjs — F5 T4: eval del asistente RAG offline.
   Borrador de Nexus qwen3-coder:30b, curado por el Arquitecto:
   - rutas derivadas de import.meta.url (el draft las CWD-relative -> ENOENT)
   - k de busqueda 5 -> 8 (verificado en navegador: en k=6 el hecho seed del
     PSV vencido queda fuera del contexto; recall subido, precision queda
     en manos del system prompt anti-alucinacion)
   Uso: node tools/evals/assistant-evals.mjs [--model X] [--limit N] [--max-tokens T] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const engine = require(path.join(root, 'src', 'app', 'assistant-engine.js'));

const args = process.argv.slice(2);
let model = 'qwen3-4b-instruct';
let limit = 10;
let maxTokens = 400;
let i = 0;
while (i < args.length) {
  if (args[i] === '--model') model = args[++i];
  else if (args[i] === '--limit') limit = parseInt(args[++i], 10);
  else if (args[i] === '--max-tokens') maxTokens = parseInt(args[++i], 10);
  i++;
}

const questions = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'evals', 'golden-assistant.json'), 'utf8')).slice(0, limit);
const results = [];

async function fetchWithTimeout(url, options, timeout = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

for (const q of questions) {
  const start = performance.now();
  let answer = '';
  let passed = false;
  let keywordsFound = 0;
  let hitsSources = [];

  try {
    const embedRes = await fetchWithTimeout('http://127.0.0.1:5106/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [q.q] })
    });
    const embedData = await embedRes.json();
    const vector = embedData.data[0].embedding;

    const searchRes = await fetchWithTimeout('http://127.0.0.1:6333/collections/integritywatch_rag/points/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector, limit: 8, with_payload: true })
    });
    const searchData = await searchRes.json();
    const hits = searchData.result || [];

    hitsSources = hits.map(h => h.payload.source);
    const prompt = engine.buildPrompt(q.q, hits);

    const chatRes = await fetchWithTimeout('http://127.0.0.1:8081/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user }
        ],
        temperature: 0.3,
        max_tokens: maxTokens
      })
    }, 180000);

    const chatData = await chatRes.json();
    const msg = chatData.choices[0].message;
    answer = (msg.content || (msg.reasoning_content ? msg.reasoning_content.split('\n').slice(-3).join(' ') : '')).trim();

    keywordsFound = q.keywords.filter(k => answer.toLowerCase().includes(k.toLowerCase())).length;
    const answerOk = keywordsFound >= Math.ceil(q.keywords.length / 2) && answer.length > 30;
    const sourceOk = hitsSources.some(s => s.includes(q.expectSource));
    passed = answerOk && sourceOk;
  } catch (err) {
    console.error('Error en pregunta "' + q.q + '": ' + err.message);
  }

  const seconds = ((performance.now() - start) / 1000).toFixed(2);
  const keywordsStr = keywordsFound + '/' + q.keywords.length;
  const sourceStr = hitsSources.some(s => s.includes(q.expectSource)) ? 'OK' : 'NO';
  console.log((results.length + 1) + '/' + limit + ' | ' + q.q + ' | ' + (passed ? 'PASS' : 'FAIL') + ' | kw ' + keywordsStr + ' | fuente ' + sourceStr + ' | ' + seconds + 's');
  results.push({ q: q.q, answer, hitsSources, keywordsFound, passed, seconds });
}

const now = new Date().toISOString().replace(/[:.]/g, '-');
const dir = path.join(root, 'tools', 'evals', 'results');
fs.mkdirSync(dir, { recursive: true });
const passedCount = results.filter(r => r.passed).length;
fs.writeFileSync(path.join(dir, 'assistant-' + now + '.json'), JSON.stringify({ model, startedAt: new Date().toISOString(), perQuestion: results, passed: passedCount, total: results.length }, null, 2));
const gate = Math.ceil(0.7 * limit); // 7/10 en corrida completa; proporcion en runs parciales
console.log('Pasadas ' + passedCount + '/' + limit + ' (gate >=70%) -> ' + (passedCount >= gate ? 'APROBADO' : 'SUSPENSO'));
process.exit(passedCount >= gate ? 0 : 1);
