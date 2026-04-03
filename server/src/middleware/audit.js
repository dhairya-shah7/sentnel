const AuditLog = require('../models/AuditLog');

/**
 * Audit middleware factory.
 * Usage: audit('dataset.upload')
 * Logs the action to MongoDB after the response is sent.
 */
const audit = (action) => {
  return (req, res, next) => {
    const startAt = Date.now();
    const originalSend = res.json.bind(res);

    res.json = function (body) {
      res.locals.responseBody = body;
      return originalSend(body);
    };

    res.on('finish', async () => {
      try {
        await AuditLog.create({
          userId: req.user?._id,
          username: req.user?.username,
          action,
          resource: req.params?.id ? req.baseUrl.split('/').pop() : undefined,
          resourceId: req.params?.id,
          ipAddress: req.ip || req.connection?.remoteAddress,
          origin: req.headers.origin,
          userAgent: req.headers['user-agent'],
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          metadata: {
            durationMs: Date.now() - startAt,
            body: req.method !== 'GET' ? sanitize(req.body) : undefined,
          },
          timestamp: new Date(),
        });
      } catch (err) {
        console.error('[Audit] Failed to write audit log:', err.message);
      }
    });

    next();
  };
};

/**
 * Strip sensitive fields from audit payload.
 */
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const safe = { ...obj };
  ['password', 'passwordHash', 'token', 'refreshToken', 'secret'].forEach((k) => {
    if (k in safe) safe[k] = '[REDACTED]';
  });
  return safe;
}

module.exports = audit;
