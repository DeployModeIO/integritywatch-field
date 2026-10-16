/* IntegrityWatch Field — Electron shell (main process)
   Serves the project root over a local HTTP server so the service worker and
   PWA features work (the SW cannot register on file://, only on http(s)).
   No runtime dependencies: Node core http + fs + path only. */
'use strict';

const { app, BrowserWindow, nativeImage } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8'
};

function resolveAppRoot() {
  const candidates = [
    path.join(__dirname, '..'),
    path.join(process.resourcesPath || '', 'app-root')
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'index.html'))) { return dir; }
    } catch (err) { /* ignore and try next */ }
  }
  return path.join(__dirname, '..');
}

const APP_ROOT = resolveAppRoot();

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === '/' || pathname === '') { pathname = '/index.html'; }

        const relative = pathname.replace(/^\/+/, '');
        const filePath = path.resolve(APP_ROOT, relative);
        const withinRoot = filePath === APP_ROOT || filePath.startsWith(APP_ROOT + path.sep);

        if (!withinRoot || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME[ext] || 'application/octet-stream';
        const body = fs.readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache'
        });
        res.end(body);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal Server Error');
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

function windowIcon() {
  try {
    const iconPath = path.join(APP_ROOT, 'assets', 'icons', 'icon-192.png');
    if (fs.existsSync(iconPath)) { return nativeImage.createFromPath(iconPath); }
  } catch (err) { /* fall through */ }
  return undefined;
}

let mainWindow = null;

async function createWindow() {
  const { port } = await startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    autoHideMenuBar: true,
    icon: windowIcon(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // The page inherits the strict CSP declared in index.html. The service worker
  // registers because the origin is http://127.0.0.1 (not file://).
  await mainWindow.loadURL('http://127.0.0.1:' + port + '/index.html');

  mainWindow.on('closed', () => { mainWindow = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) { mainWindow.restore(); }
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow).catch((err) => {
    console.error('Electron startup failed:', err);
    app.quit();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
