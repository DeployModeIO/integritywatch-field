/*
 * IntegrityWatch Field — Proprietary & Confidential — All Rights Reserved.
 * Copyright (c) 2026 DeployModeIO. Unauthorized copying, modification,
 * distribution or commercial use of this source code, via any medium,
 * is strictly prohibited. Licensed under the IntegrityWatch Field
 * Proprietary License — see the LICENSE file in the repository root.
 * Version: 1.4.1 · Enterprise / Production Release.
 */
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
