/* Release helper — IntegrityWatch Field
   Bumps the service worker cache version (iw-vN -> iw-v(N+1)).
   IMPORTANT: run this before shipping ANY asset change (js/css/html/icons),
   otherwise existing clients keep serving the previous cached version.
   Uso: node tools/bump-cache.cjs */
'use strict';
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'sw.js');
const src = fs.readFileSync(file, 'utf8');
const m = src.match(/const CACHE_NAME = 'iw-v(\d+)';/);
if (!m) {
  console.error('ERROR: no se encontró "const CACHE_NAME = \'iw-vN\';" en sw.js');
  process.exit(1);
}
const next = Number(m[1]) + 1;
fs.writeFileSync(file, src.replace(m[0], "const CACHE_NAME = 'iw-v" + next + "';"), 'utf8');
console.log('Cache bump: iw-v' + m[1] + ' -> iw-v' + next + ' (recuerda recargar en los clientes: aparecerá el aviso "Actualización disponible")');
