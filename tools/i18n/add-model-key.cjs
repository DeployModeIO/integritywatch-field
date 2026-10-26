/* add-model-key.cjs — inserta assistant.model en los 7 locales (Unicode-safe). */
'use strict';
const fs = require('fs');
const path = require('path');
const V = {
  en: ["'", 'Model'],
  es: ["'", 'Modelo'],
  fr: ['"', 'Modèle'],
  pt: ["'", 'Modelo'],
  zh: ['"', '模型'],
  ru: ['"', 'Модель'],
  ar: ['"', 'النموذج']
};
const dir = path.join('src', 'i18n', 'locales');
for (const [l, [q, v]] of Object.entries(V)) {
  const f = path.join(dir, l + '.js');
  let s = fs.readFileSync(f, 'utf8');
  if (/    assistant: \{\n      model:/.test(s)) { console.log(l + ': ya tiene model'); continue; }
  const m = s.match(/\n    assistant: \{\n/);
  if (!m) { console.error(l + ': no encuentro bloque assistant'); process.exit(1); }
  s = s.replace(m[0], '\n    assistant: {\n      model: ' + q + v + q + ',\n');
  fs.writeFileSync(f, s, 'utf8');
  console.log(l + ': model añadido');
}
