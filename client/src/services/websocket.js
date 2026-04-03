import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { authService } from './auth';

let socket = null;
let reconnectingAfterAuthError = false;
const SOCKET_ORIGIN = resolveSocketOrigin();

export const connectSocket = () => {
  const token = useAuthStore.getState().accessToken;
  if (!token || socket?.connected) return;

  socket = io(SOCKET_ORIGIN, {
    auth: { token },
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[WS] Connected:', socket.id);
    socket.emit('subscribe:dashboard');
  });

  socket.on('connect_error', (err) => {
    console.warn('[WS] Connection error:', err.message);
    if (!reconnectingAfterAuthError && /token/i.test(err.message || '')) {
      reconnectingAfterAuthError = true;
      authService.refresh()
        .then((res) => {
          useAuthStore.getState().setToken(res.data.accessToken);
          if (socket) {
            socket.auth = { token: res.data.accessToken };
            socket.disconnect();
            socket.connect();
          }
        })
        .catch((refreshErr) => {
          console.warn('[WS] Refresh failed:', refreshErr.message);
        })
        .finally(() => {
          reconnectingAfterAuthError = false;
        });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('[WS] Disconnected:', reason);
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;

export const subscribeToJob = (jobId) => {
  if (socket) socket.emit('subscribe:job', jobId);
};

export const onEvent = (event, handler) => {
  if (socket) socket.on(event, handler);
};

export const offEvent = (event, handler) => {
  if (socket) socket.off(event, handler);
};

function resolveSocketOrigin() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || '').trim();
  const currentOrigin = `${window.location.protocol}//${window.location.hostname}:4000`;

  if (!configured) return currentOrigin;

  try {
    const configuredUrl = new URL(configured);
    const currentHost = window.location.hostname;
    const configuredHost = configuredUrl.hostname;
    const isLoopback = (host) => ['localhost', '127.0.0.1', '::1'].includes(host);

    if (isLoopback(configuredHost) && !isLoopback(currentHost)) {
      return currentOrigin;
    }

    return configured.replace(/\/$/, '');
  } catch {
    return currentOrigin;
  }
}
