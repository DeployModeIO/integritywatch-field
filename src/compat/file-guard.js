/* IntegrityWatch Field — file guard
   Shows a dismissible notice when the app is opened via file:// (PWA needs a server). */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  root.IW = root.IW || {};
  root.IW.compat = root.IW.compat || {};
  root.IW.compat.fileGuard = api;
  if (typeof module === 'object' && module.exports) { module.exports = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var LANG = {
    en: {
      title: 'IntegrityWatch Field — local file mode',
      body: 'You opened the app from a local file (file://). The app works, but PWA installation and automatic updates need a local server. Use START-HERE.bat or run tools/serve.ps1 (or serve.py).',
      dismiss: 'Close'
    },
    es: {
      title: 'IntegrityWatch Field — modo archivo local',
      body: 'Abriste la app desde un archivo local (file://). La app funciona, pero la instalación PWA y las actualizaciones automáticas requieren un servidor local. Usa START-HERE.bat o ejecuta tools/serve.ps1 (o serve.py).',
      dismiss: 'Cerrar'
    },
    fr: {
      title: 'IntegrityWatch Field — mode fichier local',
      body: "Vous avez ouvert l'application depuis un fichier local (file://). L'application fonctionne, mais l'installation PWA et les mises à jour automatiques nécessitent un serveur local. Utilisez START-HERE.bat ou exécutez tools/serve.ps1 (ou serve.py).",
      dismiss: 'Fermer'
    },
    zh: {
      title: 'IntegrityWatch Field — 本地文件模式',
      body: '您从本地文件 (file://) 打开了应用。应用可以运行，但 PWA 安装和自动更新需要本地服务器。请使用 START-HERE.bat 或运行 tools/serve.ps1（或 serve.py）。',
      dismiss: '关闭'
    },
    ru: {
      title: 'IntegrityWatch Field — режим локального файла',
      body: 'Вы открыли приложение из локального файла (file://). Приложение работает, но для установки PWA и автообновлений нужен локальный сервер. Используйте START-HERE.bat или запустите tools/serve.ps1 (или serve.py).',
      dismiss: 'Закрыть'
    },
    ar: {
      title: 'IntegrityWatch Field — وضع الملف المحلي',
      body: 'لقد فتحت التطبيق من ملف محلي (file://). يعمل التطبيق، لكن تثبيت PWA والتحديثات التلقائية تتطلب خادمًا محليًا. استخدم START-HERE.bat أو شغّل tools/serve.ps1 (أو serve.py).',
      dismiss: 'إغلاق'
    },
    pt: {
      title: 'IntegrityWatch Field — modo arquivo local',
      body: 'Você abriu o app a partir de um arquivo local (file://). O app funciona, mas a instalação da PWA e as atualizações automáticas exigem um servidor local. Use START-HERE.bat ou execute tools/serve.ps1 (ou serve.py).',
      dismiss: 'Fechar'
    }
  };

  function detectLanguage() {
    if (typeof navigator !== 'undefined' && navigator.language) {
      var lang = String(navigator.language).toLowerCase();
      var code = lang.split('-')[0];
      if (LANG[code]) { return code; }
      if (LANG[lang]) { return lang; }
    }
    return 'en';
  }

  function buildBanner(lang) {
    var text = LANG[lang] || LANG.en;
    var banner = document.createElement('div');
    banner.className = 'fileguard-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', text.title);

    var titleEl = document.createElement('strong');
    titleEl.textContent = text.title;

    var bodyEl = document.createElement('span');
    bodyEl.textContent = text.body;

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-ghost';
    closeBtn.textContent = text.dismiss;
    closeBtn.setAttribute('aria-label', text.dismiss);
    closeBtn.addEventListener('click', function () {
      if (banner.parentNode) { banner.parentNode.removeChild(banner); }
    });

    banner.appendChild(titleEl);
    banner.appendChild(bodyEl);
    banner.appendChild(closeBtn);
    return banner;
  }

  function show() {
    if (typeof document === 'undefined') { return; }
    if (typeof location === 'undefined' || location.protocol !== 'file:') { return; }
    if (!document.body) { return; }
    var banner = buildBanner(detectLanguage());
    document.body.insertBefore(banner, document.body.firstChild);
  }

  function init() {
    if (typeof document === 'undefined') { return; }
    if (typeof location === 'undefined' || location.protocol !== 'file:') { return; }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', show);
    } else {
      show();
    }
  }

  init();

  return { init: init, show: show, LANG: LANG, detectLanguage: detectLanguage };
});
