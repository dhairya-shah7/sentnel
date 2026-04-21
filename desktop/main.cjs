const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

const isDev = !app.isPackaged && Boolean(process.env.ELECTRON_START_URL);
const clientDistPath = path.resolve(__dirname, '../client/dist');
const preloadPath = path.join(__dirname, 'preload.cjs');

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    case '.mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

function createStaticServer() {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(requestUrl.pathname);
    const cleanPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(clientDistPath, cleanPath);

    const isApiRequest = pathname.startsWith('/api');
    const isAssetRequest = path.extname(cleanPath) !== '';

    if (isApiRequest) {
      res.statusCode = 404;
      res.end('API is provided by your backend service.');
      return;
    }

    const serveIndex = () => {
      const indexPath = path.join(clientDistPath, 'index.html');
      if (!fs.existsSync(indexPath)) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('SentinelOps client build not found. Run npm run build:client first.');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexPath).pipe(res);
    };

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': getContentType(filePath) });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    if (isAssetRequest) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    serveIndex();
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function getRuntimeConfig() {
  const normalizeOrigin = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    try {
      return new URL(raw).origin;
    } catch {
      return '';
    }
  };

  const apiBaseUrl =
    normalizeOrigin(process.env.SENTINELOPS_API_BASE_URL) ||
    normalizeOrigin(process.env.VITE_API_BASE_URL) ||
    'http://127.0.0.1:4000';

  const mlServiceUrl =
    normalizeOrigin(process.env.SENTINELOPS_ML_SERVICE_URL) ||
    normalizeOrigin(process.env.VITE_ML_SERVICE_URL) ||
    'http://127.0.0.1:8000';

  return {
    apiBaseUrl,
    mlServiceUrl,
    desktop: true,
    appName: 'SentinelOps',
  };
}

async function createWindow() {
  const server = await createStaticServer();
  const address = server.address();
  const localUrl = `http://127.0.0.1:${address.port}`;
  const startUrl = process.env.ELECTRON_START_URL || localUrl;
  const runtimeConfig = getRuntimeConfig();

  const win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#fbf6ea',
    title: 'SentinelOps',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('sentinelops:runtime', runtimeConfig);
  });

  await win.loadURL(startUrl);

  win.on('closed', () => {
    server.close();
  });
}

app.whenReady().then(() => {
  createWindow().catch((error) => {
    console.error('[desktop] Failed to start:', error);
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      console.error('[desktop] Failed to restart:', error);
      app.quit();
    });
  }
});
