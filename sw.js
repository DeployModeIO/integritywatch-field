/* IntegrityWatch Field — service worker
   Offline-first: precache all static assets; stale-while-revalidate for same-origin GET. */
'use strict';

// BUMP THIS VERSION ON EVERY RELEASE: node tools/bump-cache.cjs
// With cache-first, clients keep serving the previous cached assets until this string changes.
const CACHE_NAME = 'iw-v18';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/styles/tokens.css',
  './assets/styles/base.css',
  './assets/styles/layout.css',
  './assets/styles/components.css',
  './assets/styles/views-a.css',
  './assets/styles/views-b.css',
  './assets/styles/views-c.css',
  './assets/styles/print.css',
  './assets/icons/favicon.svg',
  './assets/icons/icon-app.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './src/compat/file-guard.js',
  './src/core/bus.js',
  './src/calc/units.js',
  './src/calc/remainingLife.js',
  './src/calc/reliability.js',
  './src/calc/spc.js',
  './src/calc/ffs.js',
  './src/calc/exif.js',
  './src/calc/pipelineAssessment.js',
  './src/data/materials.js',
  './src/data/fluids.js',
  './src/data/glossary.js',
  './src/data/standards.js',
  './src/data/seed.js',
  './src/i18n/locales/en.js',
  './src/i18n/locales/es.js',
  './src/i18n/locales/fr.js',
  './src/i18n/locales/zh.js',
  './src/i18n/locales/ru.js',
  './src/i18n/locales/ar.js',
  './src/i18n/locales/pt.js',
  './src/i18n/i18n.js',
  './src/core/db.js',
  './src/core/dbMemory.js',
  './src/core/store.js',
  './src/core/exportImport.js',
  './src/core/caseFile.js',
  './src/core/syncQueue.js',
  './src/security/lock.js',
  './src/calc/corrosion.js',
  './src/calc/norsok506.js',
  './src/calc/cui583.js',
  './src/calc/mic.js',
  './src/calc/psv.js',
  './src/calc/apm.js',
  './src/rules/engine.js',
  './src/rules/definitions.js',
  './src/ingest/csv.js',
  './src/ingest/witsmlLite.js',
  './src/components/icons.js',
  './src/components/ui.js',
  './src/components/signaturePad.js',
  './src/components/inspectionEvidence.js',
  './src/reports/quarterly.js',
  './src/reports/dossier.js',
  './src/reports/datasheet.js',
  './src/views/dashboard.js',
  './src/views/corrosion.js',
  './src/views/psv.js',
  './src/views/pipelines.js',
  './src/views/pipelineMap.js',
  './src/views/apm.js',
  './src/views/ingest.js',
  './src/views/recommendations.js',
  './src/views/reports.js',
  './src/views/glossary.js',
  './src/views/admin.js',
  './src/app/theme.js',
  './src/app/router.js',
  './src/app/shell.js',
  './src/app/main.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'sw:updated' });
        }
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting' || (event.data && event.data.type === 'skip-waiting')) {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
