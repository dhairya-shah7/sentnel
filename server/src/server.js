const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const { initSocket } = require('./utils/socketManager');

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sentinelops';

const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

// ─── MongoDB connection ──────────────────────────────────────
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log(`[DB] Connected to MongoDB: ${MONGO_URI}`);
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Server] Port ${PORT} is already in use. Stop the other process or change PORT in .env.`);
      } else {
        console.error('[Server] Failed to start:', err.message);
      }
      process.exit(1);
    });

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] Regiment API running on http://localhost:${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((err) => {
    console.error('[DB] MongoDB connection failed:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('[Server] MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection:', reason);
});

module.exports = server;
