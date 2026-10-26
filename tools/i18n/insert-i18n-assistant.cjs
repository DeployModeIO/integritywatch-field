/* insert-i18n-assistant.cjs — F5 T3: inserta nav.assistant + bloque assistant.*
   en los 7 locales, Unicode-safe. Idempotente. */
'use strict';
const fs = require('fs');
const path = require('path');

const LOCALES = {
  en: { q: "'", nav: 'Assistant', t: {
    title: 'Offline Assistant',
    subtitle: 'Answers from your standards and plant data with cited sources [n]. Runs fully offline on this machine.',
    placeholder: 'Ask about standards, assets, procedures...',
    send: 'Send',
    thinking: 'Consulting context and thinking...',
    sources: 'Sources',
    offline: 'Assistant unavailable: the local stack (chat or database) is not responding.',
    empty: 'Ask something to start. Suggestions:',
    suggest1: 'What does MIC High mean and what do I do?',
    suggest2: 'Which PSV has an overdue inspection?',
    suggest3: 'How is the CO2 corrosion rate calculated?',
    history: 'Recent',
    clear: 'Clear',
    errorUnknown: 'Unexpected error consulting the local stack.'
  } },
  es: { q: "'", nav: 'Asistente', t: {
    title: 'Asistente offline',
    subtitle: 'Responde con tus estándares y datos de planta citando fuentes [n]. Funciona 100% offline en esta máquina.',
    placeholder: 'Pregunta por estándares, activos, procedimientos...',
    send: 'Enviar',
    thinking: 'Consultando contexto y pensando...',
    sources: 'Fuentes',
    offline: 'Asistente no disponible: la pila local (chat o base de datos) no responde.',
    empty: 'Pregunta algo para empezar. Sugerencias:',
    suggest1: '¿Qué significa MIC High y qué hago?',
    suggest2: '¿Qué PSV tiene inspección vencida?',
    suggest3: '¿Cómo se calcula la tasa de corrosión por CO2?',
    history: 'Recientes',
    clear: 'Limpiar',
    errorUnknown: 'Error inesperado consultando la pila local.'
  } },
  fr: { q: '"', nav: 'Assistant', t: {
    title: "Assistant hors ligne",
    subtitle: "Répond à partir de vos normes et données d'installation en citant les sources [n]. Fonctionne 100% hors ligne sur cette machine.",
    placeholder: "Posez une question sur les normes, les équipements, les procédures...",
    send: "Envoyer",
    thinking: "Consultation du contexte et réflexion...",
    sources: "Sources",
    offline: "Assistant indisponible : la pile locale (chat ou base de données) ne répond pas.",
    empty: "Posez une question pour commencer. Suggestions :",
    suggest1: "Que signifie MIC High et que faire ?",
    suggest2: "Quelle PSV a une inspection en retard ?",
    suggest3: "Comment calcule-t-on la vitesse de corrosion par CO2 ?",
    history: "Récentes",
    clear: "Effacer",
    errorUnknown: "Erreur inattendue de la pile locale."
  } },
  pt: { q: "'", nav: 'Assistente', t: {
    title: 'Assistente offline',
    subtitle: 'Responde com seus padrões e dados de planta citando fontes [n]. Funciona 100% offline nesta máquina.',
    placeholder: 'Pergunte sobre padrões, ativos, procedimentos...',
    send: 'Enviar',
    thinking: 'Consultando o contexto e pensando...',
    sources: 'Fontes',
    offline: 'Assistente indisponível: a pilha local (chat ou banco de dados) não responde.',
    empty: 'Pergunte algo para começar. Sugestões:',
    suggest1: 'O que significa MIC High e o que fazer?',
    suggest2: 'Qual PSV tem inspeção vencida?',
    suggest3: 'Como se calcula a taxa de corrosão por CO2?',
    history: 'Recentes',
    clear: 'Limpar',
    errorUnknown: 'Erro inesperado na pilha local.'
  } },
  zh: { q: '"', nav: '助手', t: {
    title: "离线助手",
    subtitle: "基于您的标准与设施数据回答问题，并引用来源 [n]。完全在本机离线运行。",
    placeholder: "询问标准、资产、规程...",
    send: "发送",
    thinking: "正在检索上下文并思考...",
    sources: "来源",
    offline: "助手不可用：本地服务（聊天或数据库）未响应。",
    empty: "开始提问吧。建议：",
    suggest1: "MIC High 意味着什么？该如何处理？",
    suggest2: "哪台安全阀检验逾期？",
    suggest3: "CO2 腐蚀速率如何计算？",
    history: "最近",
    clear: "清空",
    errorUnknown: "调用本地服务时出现意外错误。"
  } },
  ru: { q: '"', nav: 'Ассистент', t: {
    title: "Офлайн-ассистент",
    subtitle: "Отвечает по вашим стандартам и данным установки со ссылками на источники [n]. Полностью офлайн на этой машине.",
    placeholder: "Спросите о стандартах, оборудовании, процедурах...",
    send: "Отправить",
    thinking: "Ищу контекст и думаю...",
    sources: "Источники",
    offline: "Ассистент недоступен: локальный стек (чат или база данных) не отвечает.",
    empty: "Задайте вопрос для начала. Подсказки:",
    suggest1: "Что означает MIC High и что делать?",
    suggest2: "У какого предохранительного клапана просрочена проверка?",
    suggest3: "Как рассчитывается скорость коррозии от CO2?",
    history: "Недавние",
    clear: "Очистить",
    errorUnknown: "Неожиданная ошибка локального стека."
  } },
  ar: { q: '"', nav: 'المساعد', t: {
    title: "المساعد دون اتصال",
    subtitle: "يجيب من معاييرك وبيانات المنشأة مع الاستشهاد بالمصادر [n]. يعمل دون اتصال بالكامل على هذه الآلة.",
    placeholder: "اسأل عن المعايير والأصول والإجراءات...",
    send: "إرسال",
    thinking: "يجري البحث في السياق والتفكير...",
    sources: "المصادر",
    offline: "المساعد غير متاح: الخدمة المحلية (الدردشة أو قاعدة البيانات) لا تستجيب.",
    empty: "اطرح سؤالاً للبدء. اقتراحات:",
    suggest1: "ماذا يعني MIC High وماذا أفعل؟",
    suggest2: "أي صمام أمان لديه فحص متأخر؟",
    suggest3: "كيف يُحسب معدل التآكل بفعل ثاني أكسيد الكربون؟",
    history: "الأحدث",
    clear: "مسح",
    errorUnknown: "خطأ غير متوقع في الخدمة المحلية."
  } }
};

const dir = path.join(__dirname, '..', '..', 'src', 'i18n', 'locales');
let changed = 0;
for (const [loc, cfg] of Object.entries(LOCALES)) {
  const file = path.join(dir, loc + '.js');
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('assistant: {')) { console.log(loc + ': ya tiene el bloque, saltado'); continue; }
  const q = cfg.q;
  const navLine = `      assistant: ${q}${cfg.nav}${q},`;
  const blockLines = Object.entries(cfg.t).map(([k, v]) => `      ${k}: ${q}${v}${q},`).join('\n');
  const block = `    assistant: {\n${blockLines}\n    },`;
  // 1) nav.assistant como PRIMERA propiedad del objeto nav (evita el problema
  //    de coma ausente tras la ultima propiedad original)
  const navOpen = src.indexOf('    nav: {');
  if (navOpen < 0) { console.error(loc + ': no encuentro nav: {'); process.exit(1); }
  const insertAt = navOpen + '    nav: {'.length;
  src = src.slice(0, insertAt) + '\n' + navLine.replace(/,$/, '') + ',' + src.slice(insertAt);
  // 2) bloque assistant antes de severity
  const sevIdx = src.indexOf('    severity: {');
  if (sevIdx < 0) { console.error(loc + ': no encuentro severity: {'); process.exit(1); }
  src = src.slice(0, sevIdx) + block + '\n\n' + src.slice(sevIdx);
  fs.writeFileSync(file, src, 'utf8');
  changed++;
  console.log(loc + ': insertado nav.assistant + assistant.* (' + Object.keys(cfg.t).length + ' claves)');
}
console.log('LOCALES ACTUALIZADOS:', changed);
