# Plan F5 — Asistente IA local offline

Spec: `docs/SPEC-F5-ASSISTANT.md` (aprobada 25-10-2026). Orden de módulos: rag-corpus → assistant-view → assistant-evals.

## Tareas (orden de dependencia)

- [ ] T1 (rag-corpus): `src/app/assistant-engine.js` — helpers puros UMD (`IW.app.assistantEngine`): `ASSISTANT_ENDPOINTS` (const :6333/:9999), `buildPrompt(question, hits)` (recorta contexto a ~6000 chars, prompt anti-alucinación es-ES), `parseCitations(hits)` (descarta sin `payload.source`), `friendlyError(err)` (mapea TypeError red → código de banner). TDD: crear primero `tests/assistant-engine.test.js` (≥8 tests, RED→GREEN).
  - Acceptance: `node --test` verde (512→520+); estilo UMD/var del repo; sin dependencias.
  - Verify: `node --test tests/assistant-engine.test.js`.
  - Files: 2.

- [ ] T2 (rag-corpus): `tools/rag/index_iw.py` — Python stdlib only (urllib/json): chunker ~800 chars overlap 100 con metadatos `{source, section}`; corpus = README.md, docs/STANDARDS.md, docs/ROADMAP-ANALISIS-OFFLINE.md, docs/VISUAL-SPEC.md, docs/seed-assistant.json; embeddings POST `:5106/v1/embeddings` (id de modelo descubierto vía GET /v1/models); push Qdrant `PUT :6333/collections/integritywatch_rag` (dim 1024, Cosine) + `PUT /collections/integritywatch_rag/points?wait=true`; flags `--dry-run` / `--push` / `--repo`.
  - Acceptance: `--dry-run` imprime nº de chunks por fuente; `python -m py_compile` OK; con `--push` la colección tiene ≥60 puntos.
  - Verify: `GET :6333/collections/integritywatch_rag` (lo ejecuta el orquestador).
  - Files: 1. (Generación de `docs/seed-assistant.json` también T2, script node one-shot `tools/rag/gen-seed-assistant.mjs` que lee `src/data/seed.js`.)

- [ ] T3 (assistant-view): `src/views/assistant.js` + registro en router/nav (`shell.js` NAV_GROUPS grupo Ops o Data — decidir: grupo Ops) + i18n `assistant.*` ×7 locales (comillas: en/es/pt simples; fr/zh/ru/ar dobles; revisión manual ar/ru) + `sw.js` bump `iw-v18`→`iw-v19` + index.html script tag.
  - Acceptance: vista monta en `#/assistant`, chat funciona contra stack vivo, banner amable si caído, fuentes citadas visibles, historial en keyValueTable (máx 50), CSP sin inline, UI Experion ISA-101 (usa clases CSS existentes; si falta alguna, añadir a assets/styles/ sin inline).
  - Verify: navegador (orquestador): pregunta dorada con cita; consola limpia; purga SW siempre.
  - Files: ~11 (7 locales + 3 nuevos + sw/index/shell).

- [ ] T4 (assistant-evals): `tools/evals/assistant-evals.mjs` — 10 Q/A doradas; para cada una: búsqueda en `integritywatch_rag` → buildPrompt → chat `qwen3-4b-instruct` → juez local (¿la respuesta cita la fuente esperada y no contradice el contexto?); resultado JSON + resumen consola; aprobado ≥7/10.
  - Acceptance: script corre end-to-end offline; guarda `tools/evals/results/assistant-<fecha>.json`.
  - Verify: ejecución por el orquestador.

- [ ] T5 (cierre): e2e check `assistant` en `tools/tests/e2e-core.mjs` (13 checks) + capturas `assistant-light-es.png` / `assistant-dark-es.png` en `capture-evidence.mjs` (26) + README sección asistente + puertas completas + commit/push.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| llama-swap descarga el modelo por TTL → primera respuesta lenta | El banner muestra "cargando modelo"; e2e con timeout holgado |
| Chunker rompe tablas markdown | Chunker respeta cortes por línea en blanco; evals detectan pérdida |
| Clonación de keys i18n entre 7 ficheros | Paridad verificada por quality.mjs (rawKeys=0) + script de parity existente |
| CORS: verificado OK en spike 25-10 | Re-verificar tras cambios de puertos (ask first) |
