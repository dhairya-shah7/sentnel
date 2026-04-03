const AuditLog = require('../models/AuditLog');
const { createObjectCsvWriter } = require('csv-writer');
const os = require('os');
const path = require('path');
const fs = require('fs');

// GET /api/audit/logs (admin only)
exports.getLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, userId, action, from, to } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    if (action) filter.action = new RegExp(action, 'i');
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('userId', 'username email role')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
};

// GET /api/audit/logs/export (admin only)
exports.exportLogs = async (req, res, next) => {
  try {
    const { userId, action, from, to } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    if (action) filter.action = new RegExp(action, 'i');
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = new Date(from);
      if (to) filter.timestamp.$lte = new Date(to);
    }

    const logs = await AuditLog.find(filter)
      .populate('userId', 'username email role')
      .sort({ timestamp: -1 })
      .limit(5000)
      .lean();

    if (!logs.length) {
      return res.status(404).json({ error: 'No audit logs found', code: 'NO_AUDIT_LOGS' });
    }

    const tmpFile = path.join(os.tmpdir(), `audit_logs_${Date.now()}.csv`);
    const writer = createObjectCsvWriter({
      path: tmpFile,
      header: [
        { id: 'timestamp', title: 'Timestamp' },
        { id: 'username', title: 'Username' },
        { id: 'email', title: 'Email' },
        { id: 'action', title: 'Action' },
        { id: 'resource', title: 'Resource' },
        { id: 'resourceId', title: 'Resource ID' },
        { id: 'ipAddress', title: 'IP Address' },
        { id: 'origin', title: 'Origin' },
        { id: 'userAgent', title: 'User Agent' },
        { id: 'method', title: 'Method' },
        { id: 'path', title: 'Path' },
        { id: 'statusCode', title: 'Status Code' },
      ],
    });

    await writer.writeRecords(
      logs.map((log) => ({
        timestamp: log.timestamp,
        username: log.username || log.userId?.username || '',
        email: log.userId?.email || '',
        action: log.action,
        resource: log.resource || '',
        resourceId: log.resourceId || '',
        ipAddress: log.ipAddress || '',
        origin: log.origin || '',
        userAgent: log.userAgent || '',
        method: log.method || '',
        path: log.path || '',
        statusCode: log.statusCode || '',
      }))
    );

    res.download(tmpFile, 'audit_trail.csv', () => {
      fs.unlink(tmpFile, () => {});
    });
  } catch (err) {
    next(err);
  }
};
