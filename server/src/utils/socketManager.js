const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;

const getAllowedOrigins = () => {
  const explicitOrigins = [
    process.env.CLIENT_URL,
    process.env.CLIENT_URLS,
    process.env.FRONTEND_URL,
  ]
    .filter(Boolean)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set([
    ...explicitOrigins,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ]);
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  if (process.env.NODE_ENV !== 'production') {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }

  return getAllowedOrigins().has(origin);
};

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // JWT auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[WS] User connected: ${socket.user?.email} (${socket.id})`);

    // Join personal room
    socket.join(`user:${socket.user.id}`);

    // Subscribe to dashboard feed
    socket.on('subscribe:dashboard', () => {
      socket.join('dashboard');
      socket.emit('subscribed', { room: 'dashboard' });
    });

    // Subscribe to specific analysis job
    socket.on('subscribe:job', (jobId) => {
      if (typeof jobId === 'string' && jobId.length < 100) {
        socket.join(`job:${jobId}`);
        socket.emit('subscribed', { room: `job:${jobId}` });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[WS] User disconnected: ${socket.user?.email} — ${reason}`);
    });

    socket.on('error', (err) => {
      console.error(`[WS] Socket error (${socket.id}):`, err.message);
    });
  });

  console.log('[WS] Socket.IO initialized');
  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

const emitToAll = (event, data) => {
  if (io) io.emit(event, data);
};

const emitToDashboard = (event, data) => {
  if (io) io.to('dashboard').emit(event, data);
};

const emitAnalysisProgress = (jobId, percent, stage, status = 'running') => {
  if (io) {
    const payload = { jobId, percent, stage, status };
    io.to(`job:${jobId}`).emit('analysis:progress', payload);
    io.to('dashboard').emit('analysis:progress', payload);
  }
};

const emitAnomalyNew = (anomaly) => {
  if (io) {
    io.to('dashboard').emit('anomaly:new', anomaly);
    io.emit('anomaly:new', anomaly);
  }
};

module.exports = {
  initSocket,
  getIO,
  emitToAll,
  emitToDashboard,
  emitAnalysisProgress,
  emitAnomalyNew,
};
