# Spec: F5 — Asistente IA local offline (RAG + chat)

Estado: PROPUESTA (gate de aprobación del Arquitecto) · Fecha: 25-10-2026
Origen: roadmap `docs/ROADMAP-ANALISIS-OFFLINE.md` M-siguiente · Plan aprobado por el usuario.

## Capability Map (módulos y orden)

| Módulo id | Responsabilidad | Depende de |
|---|---|---|
| `rag-corpus` | Script de indexación offline: docs del repo + resúmenes de datos seed → embeddings `:5106` (qwen3-embedding, 1024 dims) → Qdrant colección **nueva** `integritywatch_rag` | — |
| `assistant-view` | Vista PWA `#/assistant` (vanilla, CSP sin inline): chat → búsqueda RAG en Qdrant `:6333` → LLM en llama-swap `:9999` → respuesta con citas de fuentes | `rag-corpus` |
| `assistant-evals` | 10 preguntas doradas + juez local (`qwen3-4b-instruct`) | `rag-corpus`, `assistant-view` |

Build order: `rag-corpus` → `assistant-view` → `assistant-evals` (lineal, sin ciclos).

## Evidencia del spike (25-10-2026)

- CORS verificado desde página servida en `127.0.0.1:8419`: `GET :6333/collections` → 200, `GET :9999/v1/models` → 200, `POST :9999/v1/chat/completions` (qwen3-4b-instruct) → 200 con respuesta. **No se necesita proxy.**
- Modelos vivos en :9999: gemma3-4b, lfm2.5-8b-a1b, qwen3-4b-instruct, qwen3-8b-instruct.
- Qdrant :6333: colecciones arquitecto_domain, deepchicken_rag, museo_obras (no tocarlas).

## Objetivo

Operador de campo pregunta en lenguaje natural sobre estándares aplicados (NORSOK, API 583, NACE), estado de sus activos (MP/PSV/pipelines seed) y procedimientos del propio repo; el asistente responde **offline** citando fuentes. Usuario: técnico de integridad sin conexión. Éxito: 3 preguntas doradas respondidas con cita correcta en <30 s, sin red.

## Decisiones de diseño

1. Colección Qdrant nueva `integritywatch_rag` (dim 1024, distancia Cosine). `deepchicken_rag` NO se toca.
2. Corpus fase 1: `README.md`, `docs/STANDARDS.md`, `docs/ROADMAP-ANALISIS-OFFLINE.md`, `docs/VISUAL-SPEC.md` + `docs/seed-assistant.json` (resúmenes legibles generados de los datos seed: MPs, lecturas, PSVs, pipelines, recomendaciones abiertas).
3. Chunking: reutilizar `tools/rag/rag.py` (MiniLM→cambiar a endpoint `:5106`, dim 1024). Chunks ~800 chars con overlap 100, metadatos `{source, section}`.
4. Vista `#/assistant`: historial local (keyValueTable `assistant.history`, máx 50 mensajes), 3 preguntas sugeridas, tarjeta de fuentes bajo cada respuesta, banner "asistente no disponible" si :9999 o :6333 no responden (sin crash, sin errores crudos).
5. Prompt de sistema: responder SOLO con contexto recuperado; si no hay contexto suficiente, decirlo explícitamente (anti-alucinación).
6. `sw.js` bump `iw-v18` → `iw-v19` (v18 ya está publicada en master).
7. i18n: ~25 claves nuevas (`assistant.*`) × 7 locales; comillas: en/es/pt simples, fr/zh/ru/ar dobles; revisión manual ar/ru.
8. Fetch targets constantes de config en `src/app/config.js` (no hardcodear URLs dispersas).

## Commands

```powershell
# Corpus (dry-run y push)
python tools/rag/index_iw.py --repo . --dry-run
python tools/rag/index_iw.py --repo . --push
# Tests
node --test
node tools/tests/e2e-core.mjs
node tools/tests/quality.mjs
# Evals del asistente
node tools/evals/assistant-evals.mjs
```

## Project Structure (nuevo en F5)

```
tools/rag/index_iw.py        → indexador (chunker + push a :5106/:6333)
docs/seed-assistant.json     → resúmenes de datos seed para el corpus
src/views/assistant.js       → vista chat (vanilla, UI Experion ISA-101)
src/app/assistant-engine.js  → helpers puros: buildPrompt, parseCitations, fetchSafe
tests/assistant-engine.test.js
tools/evals/assistant-evals.mjs
docs/SPEC-F5-ASSISTANT.md    → esta spec
```

## Code Style

Igual que el repo: módulos UMD (`function(){...}()` + registro `IW.*`), `var` + funciones nombradas, sin frameworks, sin inline styles (CSP), strings UI SIEMPRE vía `h.t('assistant.*')`. Ejemplo:

```js
function parseCitations(hits) {
  return (hits || []).map(function (h) {
    return { source: h.payload && h.payload.source, section: h.payload && h.payload.section };
  }).filter(function (c) { return c.source; });
}
```

## Testing Strategy

- `tests/assistant-engine.test.js`: helpers puros en node --test (buildPrompt trunca contexto, parseCitations descarta hits sin source, formato de mensajes).
- e2e: nuevo chequeo `assistant` (vista monta, banner de no-disponible correcto si se simula caída, pregunta dorada con stack vivo).
- Puertas existentes: 512+ tests, quality 0, e2e verde, 24+ capturas (añadir 2: assistant-light-es, assistant-dark-es).
- Evals: 10 Q/A (corrosión NORSOK, CUI API 583, MIC, FFS API 579, B31G, PSV API 520, seed data); juez `qwen3-4b-instruct` local; aprobado si ≥7/10.

## Boundaries

- **Always**: tests antes de commit · CSP sin inline · purga SW (unregister+caches+reload) en verificación de navegador · backup previo (DEC-005) · sintaxis post-edición.
- **Ask first**: tocar colecciones Qdrant existentes · añadir dependencias · cambiar puertos/modelos por defecto · cambiar el prompt de sistema tras calibrar evals.
- **Never**: secretos en código · desactivar checks que fallan para "arreglar" puertas · inline styles/JS.

## Success Criteria (testables)

1. `GET :6333/collections/integritywatch_rag` devuelve ≥60 puntos tras `index_iw.py --push` (docs 4 + seed, estimado 60-120 chunks).
2. `#/assistant` responde las 3 preguntas doradas citando la fuente correcta, offline, <30 s por respuesta.
3. `node --test` verde con los nuevos tests (512 → ≥518).
4. e2e verde con el chequeo `assistant` añadido (13 checks).
5. quality 0 fallos; capturas 24 → 26.
6. Evals ≥7/10 con juez local.
7. Sin errores de consola en la vista.

## Open Questions (ninguno bloqueante)

- Modelo chat por defecto: `qwen3-4b-instruct` (elegido por VRAM y latencia verificada); `qwen3-8b-instruct` como opción manual si la calidad lo exige (ask first).
- Streaming de tokens: NO en F5 (respuesta completa; local y rápido).
