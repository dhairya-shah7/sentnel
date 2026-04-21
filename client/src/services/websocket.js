import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { authService } from './auth';
import { getApiOrigin } from './runtime';

let socket = null;
let reconnectingAfterAuthError = false;
const SOCKET_ORIGIN = getApiOrigin();

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
