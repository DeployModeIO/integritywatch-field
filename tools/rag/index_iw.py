#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""index_iw.py — F5 T2 (spec docs/SPEC-F5-ASSISTANT.md)
Indexa el corpus de IntegrityWatch Field en Qdrant para el asistente offline.

  Corpus: README.md, docs/STANDARDS.md, docs/ROADMAP-ANALISIS-OFFLINE.md,
          docs/VISUAL-SPEC.md, docs/seed-assistant.json
  Embeddings: llama-server :5106 (qwen3-embedding-0.6b, 1024 dims, OpenAI-compatible)
  Qdrant: coleccion 'integritywatch_rag' en :6333 (Cosine)

Uso:
  python tools/rag/index_iw.py --repo . --dry-run
  python tools/rag/index_iw.py --repo . --push

Solo stdlib (urllib/json/re/argparse): cero dependencias.
"""
import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error

EMBED_URL = "http://127.0.0.1:5106"
QDRANT_URL = "http://127.0.0.1:6333"
COLLECTION = "integritywatch_rag"
DIM = 1024
CHUNK_CHARS = 800
SOURCES_MD = [
    "README.md",
    "docs/STANDARDS.md",
    "docs/ROADMAP-ANALISIS-OFFLINE.md",
    "docs/VISUAL-SPEC.md",
]
SOURCE_SEED = "docs/seed-assistant.json"


def http_json(method, url, payload=None, timeout=120):
    data = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body) if body else {}


def split_long(text, limit):
    """Corta un parrafo demasiado largo en trozos <= limit por frases."""
    out, buf = [], ""
    for sentence in re.split(r"(?<=[.!?:])\s+", text):
        if len(buf) + len(sentence) + 1 <= limit:
            buf = (buf + " " + sentence).strip()
        else:
            if buf:
                out.append(buf)
            while len(sentence) > limit:
                out.append(sentence[:limit])
                sentence = sentence[limit - 100:]
            buf = sentence
    if buf:
        out.append(buf)
    return out


def chunk_md(text, source):
    """Markdown -> secciones por heading -> chunks <= CHUNK_CHARS."""
    chunks = []
    section = "(intro)"
    buf = ""

    def flush():
        nonlocal buf
        if buf.strip():
            for piece in (split_long(buf.strip(), CHUNK_CHARS) if len(buf.strip()) > CHUNK_CHARS else [buf.strip()]):
                chunks.append({"source": source, "section": section, "text": piece})
        buf = ""

    for line in text.splitlines():
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            flush()
            section = m.group(2).strip()[:120]
        else:
            buf += line + "\n"
            if len(buf) >= CHUNK_CHARS:
                flush()
    flush()
    return chunks


def chunk_seed(json_path):
    """docs/seed-assistant.json -> un chunk por fact (150-300 chars).
    Un fact = un punto retrievable: preguntas de planta concreta
    (p.ej. "PSV-520-001 vencida") hallan su fact en el top-k en vez de
    diluirse en un chunk de seccion de 800 chars."""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    chunks = []
    for fact in data.get("facts", []):
        text = fact.get("text", "").strip()
        if text:
            chunks.append({"source": SOURCE_SEED, "section": fact.get("section"), "text": text})
    return chunks


def collect_chunks(repo):
    chunks = []
    for rel in SOURCES_MD:
        p = os.path.join(repo, rel)
        if not os.path.isfile(p):
            print("AVISO: no existe", rel)
            continue
        with open(p, "r", encoding="utf-8") as f:
            chunks.extend(chunk_md(f.read(), rel))
    seed_path = os.path.join(repo, SOURCE_SEED)
    if os.path.isfile(seed_path):
        chunks.extend(chunk_seed(seed_path))
    else:
        print("AVISO: falta", SOURCE_SEED, "- ejecuta antes tools/rag/gen-seed-assistant.mjs")
    return chunks


def embed_all(texts):
    models = http_json("GET", EMBED_URL + "/v1/models")
    model_id = models["data"][0]["id"]
    print("Embeddings via", EMBED_URL, "modelo:", model_id)
    vectors = []
    batch = 16
    for i in range(0, len(texts), batch):
        part = texts[i:i + batch]
        resp = http_json("POST", EMBED_URL + "/v1/embeddings", {"model": model_id, "input": part})
        got = [d["embedding"] for d in resp["data"]]
        if len(got) != len(part):
            raise RuntimeError("embeddings devolvio %d de %d" % (len(got), len(part)))
        for v in got:
            if len(v) != DIM:
                raise RuntimeError("dim esperada %d, recibida %d" % (DIM, len(v)))
        vectors.extend(got)
        print("  embed %d/%d" % (min(i + batch, len(texts)), len(texts)))
    return vectors


def push_qdrant(chunks, vectors):
    try:
        http_json("DELETE", QDRANT_URL + "/collections/" + COLLECTION)
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
    http_json("PUT", QDRANT_URL + "/collections/" + COLLECTION,
              {"vectors": {"size": DIM, "distance": "Cosine"}})
    points = [{"id": i, "vector": vectors[i],
               "payload": {"source": chunks[i]["source"], "section": chunks[i]["section"],
                           "text": chunks[i]["text"]}}
              for i in range(len(chunks))]
    batch = 64
    for i in range(0, len(points), batch):
        http_json("PUT", QDRANT_URL + "/collections/" + COLLECTION + "/points?wait=true",
                  {"points": points[i:i + batch]})
        print("  push %d/%d" % (min(i + batch, len(points)), len(points)))
    info = http_json("GET", QDRANT_URL + "/collections/" + COLLECTION)
    return info["result"]["points_count"]


def main():
    ap = argparse.ArgumentParser(description="Indexa el corpus IW en Qdrant (asistente F5)")
    ap.add_argument("--repo", default=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                    help="raiz del repo (default: auto)")
    ap.add_argument("--dry-run", action="store_true", help="solo contar chunks (es el default sin --push)")
    ap.add_argument("--push", action="store_true", help="embed + push a Qdrant (sin esto, solo dry-run)")
    args = ap.parse_args()

    chunks = collect_chunks(args.repo)
    if not chunks:
        print("SIN CHUNKS: revisa fuentes.")
        sys.exit(1)
    per_source = {}
    for c in chunks:
        per_source[c["source"]] = per_source.get(c["source"], 0) + 1
    chars = sum(len(c["text"]) for c in chunks)
    print("CHUNKS TOTALES:", len(chunks), "| caracteres:", chars)
    for k in sorted(per_source):
        print("  %-36s %3d chunks" % (k, per_source[k]))

    if not args.push:
        print("DRY-RUN: nada enviado. Anade --push para indexar.")
        return
    vectors = embed_all([c["text"] for c in chunks])
    count = push_qdrant(chunks, vectors)
    print("OK coleccion", COLLECTION, "con", count, "puntos en", QDRANT_URL)


if __name__ == "__main__":
    main()
