function getBrowserOrigin() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function getInjectedConfig() {
  if (typeof window === 'undefined') return {};
  return window.__SENTINELOPS_CONFIG__ || window.__SENTINELOPS_RUNTIME__ || {};
}

function resolveConfiguredOrigin(value) {
  const configured = String(value || '').trim();
  if (!configured) return '';

  try {
    const base = getBrowserOrigin() || undefined;
    return new URL(configured, base).origin;
  } catch {
    return '';
  }
}

export function getApiOrigin() {
  const injected = resolveConfiguredOrigin(getInjectedConfig().apiBaseUrl);
  const configured = injected || resolveConfiguredOrigin(import.meta.env.VITE_API_BASE_URL);
  const fallback = getBrowserOrigin();

  if (!configured) {
    return fallback;
  }

  return configured;
}

export function getMlServiceOrigin() {
  const injected = resolveConfiguredOrigin(getInjectedConfig().mlServiceUrl);
  const configured = injected || resolveConfiguredOrigin(import.meta.env.VITE_ML_SERVICE_URL);
  if (configured) return configured;
  if (import.meta.env.DEV) return 'http://localhost:8000';
  return '';
}
