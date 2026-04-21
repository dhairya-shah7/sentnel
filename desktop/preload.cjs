const { contextBridge, ipcRenderer } = require('electron');

const normalizeOrigin = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    return new URL(raw).origin;
  } catch {
    return '';
  }
};

const runtimeConfig = {
  apiBaseUrl:
    normalizeOrigin(process.env.SENTINELOPS_API_BASE_URL) ||
    normalizeOrigin(process.env.VITE_API_BASE_URL) ||
    'http://127.0.0.1:4000',
  mlServiceUrl:
    normalizeOrigin(process.env.SENTINELOPS_ML_SERVICE_URL) ||
    normalizeOrigin(process.env.VITE_ML_SERVICE_URL) ||
    'http://127.0.0.1:8000',
  desktop: true,
  appName: 'SentinelOps',
};

contextBridge.exposeInMainWorld('SENTINELOPS_CONFIG', runtimeConfig);
contextBridge.exposeInMainWorld('SENTINELOPS_RUNTIME', runtimeConfig);
contextBridge.exposeInMainWorld('SENTINELOPS_DESKTOP', {
  isDesktop: true,
  getRuntimeConfig: () => runtimeConfig,
});

ipcRenderer.on('sentinelops:runtime', (_event, config) => {
  if (config && typeof window !== 'undefined') {
    window.SENTINELOPS_CONFIG = config;
    window.SENTINELOPS_RUNTIME = config;
  }
});
