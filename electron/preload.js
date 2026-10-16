/* IntegrityWatch Field — Electron preload
   Minimal, safe bridge: exposes only the platform flag and version strings.
   No raw Node APIs are exposed to the page. */
'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('IWDesktop', {
  platform: 'electron',
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
});
