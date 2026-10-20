#!/bin/bash
# IntegrityWatch Field — arranque en Linux
cd "$(dirname "$0")" || exit 1
PORT=8419
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
sleep 1
URL="http://127.0.0.1:$PORT/index.html"
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; else echo "Abre $URL en tu navegador"; fi
echo "Servidor activo en http://127.0.0.1:$PORT — Ctrl+C para detener"
wait $SERVER_PID
