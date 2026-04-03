import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_ORIGIN = resolveApiOrigin();

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: true, // send cookies (refresh token)
  timeout: 30000,
});

// ── Request: attach Bearer token ──────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (err) => Promise.reject(err)
);

// ── Response: handle 401 auto-refresh / 429 toast ─────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => (error ? prom.reject(error) : prom.resolve(token)));
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    if (err.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
          })
          .catch(Promise.reject.bind(Promise));
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(`${API_ORIGIN}/api/auth/refresh`, {}, { withCredentials: true });
        const newToken = res.data.accessToken;
        useAuthStore.getState().setToken(newToken);
        api.defaults.headers.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    if (err.response?.status === 429) {
      import('react-hot-toast').then(({ default: toast }) => {
        toast.error('Rate limit exceeded. Please wait a moment.');
      });
    }

    return Promise.reject(err);
  }
);

export default api;

function resolveApiOrigin() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  const currentOrigin = `${window.location.protocol}//${window.location.hostname}:4000`;

  if (!configured) return currentOrigin;

  try {
    const configuredUrl = new URL(configured);
    const currentHost = window.location.hostname;
    const configuredHost = configuredUrl.hostname;
    const isLoopback = (host) => ['localhost', '127.0.0.1', '::1'].includes(host);

    // If the app is being served from a LAN IP, prefer the current host so cookies and CORS stay aligned.
    if (isLoopback(configuredHost) && !isLoopback(currentHost)) {
      return currentOrigin;
    }

    return configured.replace(/\/$/, '');
  } catch {
    return currentOrigin;
  }
}
