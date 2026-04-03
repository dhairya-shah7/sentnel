const fs = require('fs');
const path = require('path');
const { createReadStream } = require('fs');
const readline = require('readline');
const Dataset = require('../models/Dataset');
const TrafficRecord = require('../models/TrafficRecord');
const User = require('../models/User');
const { createError } = require('../middleware/errorHandler');

// POST /api/dataset/upload
exports.upload = async (req, res, next) => {
  try {
    if (!req.file) {
      throw createError(400, 'No file provided', 'NO_FILE');
    }
    const source = normalizeSource(req.body.source);
    const { name } = req.body;

    // Quick row count
    const rowCount = await countCSVRows(req.file.path);

    const dataset = await Dataset.create({
      name: name || req.file.originalname,
      source,
      uploadedBy: req.user._id,
      filePath: req.file.path,
      fileSize: req.file.size,
      recordCount: Math.max(0, rowCount - 1), // exclude header
      status: 'ready',
    });

    await ingestTrafficRecords(req.file.path, dataset._id);

    res.status(201).json({
      message: 'Dataset uploaded successfully',
      dataset,
    });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    next(err);
  }
};

// GET /api/dataset
exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [datasets, total] = await Promise.all([
      Dataset.find()
        .populate('uploadedBy', 'username email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Dataset.countDocuments(),
    ]);

    res.json({ datasets, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
};

// GET /api/dataset/:id
exports.getById = async (req, res, next) => {
  try {
    const dataset = await Dataset.findById(req.params.id).populate('uploadedBy', 'username email');
    if (!dataset) throw createError(404, 'Dataset not found', 'NOT_FOUND');
    res.json({ dataset });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/dataset/:id
exports.deleteById = async (req, res, next) => {
  try {
    const dataset = await Dataset.findById(req.params.id);
    if (!dataset) throw createError(404, 'Dataset not found', 'NOT_FOUND');

    // Remove file from disk
    if (dataset.filePath && fs.existsSync(dataset.filePath)) {
      fs.unlinkSync(dataset.filePath);
    }

    // Remove associated traffic records
    await TrafficRecord.deleteMany({ datasetId: dataset._id });
    const AnomalyResult = require('../models/AnomalyResult');
    await AnomalyResult.deleteMany({ datasetId: dataset._id });
    await dataset.deleteOne();

    res.json({ message: 'Dataset deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// POST /api/dataset/sync-local
// Dev-only import helper used by the Kaggle downloader to register files already copied into uploads.
exports.syncLocal = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      throw createError(403, 'Local sync is disabled in production', 'SYNC_DISABLED');
    }

    const expectedToken = String(process.env.SYNC_LOCAL_TOKEN || '').trim();
    const providedToken = String(req.headers['x-sync-token'] || '').trim();
    if (!expectedToken || providedToken !== expectedToken) {
      throw createError(401, 'Invalid internal sync token', 'SYNC_TOKEN_INVALID');
    }

    const { fileName, source: rawSource, name } = req.body || {};
    if (!fileName) {
      throw createError(400, 'fileName is required', 'MISSING_FIELDS');
    }
    const source = normalizeSource(rawSource);

    const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');
    const fullPath = path.resolve(uploadRoot, fileName);
    if (!fullPath.startsWith(uploadRoot) || !fs.existsSync(fullPath)) {
      throw createError(404, 'Upload file not found', 'FILE_NOT_FOUND');
    }

    const existing = await Dataset.findOne({ filePath: fullPath });
    if (existing) {
      return res.json({ message: 'Dataset already synced', dataset: existing, created: false });
    }

    const owner = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 }) || await User.findOne();
    if (!owner) {
      throw createError(409, 'No user found to own the imported dataset', 'NO_OWNER');
    }

    const rowCount = await countCSVRows(fullPath);
    const dataset = await Dataset.create({
      name: name || path.basename(fileName, path.extname(fileName)),
      source,
      uploadedBy: owner._id,
      filePath: fullPath,
      fileSize: fs.statSync(fullPath).size,
      recordCount: Math.max(0, rowCount - 1),
      status: 'ready',
    });

    await ingestTrafficRecords(fullPath, dataset._id);

    res.status(201).json({ message: 'Dataset synced successfully', dataset, created: true });
  } catch (err) {
    next(err);
  }
};

// Helper: count lines in CSV
function countCSVRows(filePath) {
  return new Promise((resolve) => {
    let count = 0;
    const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    rl.on('line', () => count++);
    rl.on('close', () => resolve(count));
    rl.on('error', () => resolve(0));
  });
}

async function ingestTrafficRecords(filePath, datasetId) {
  const rows = [];
  const rl = readline.createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });

  let headers = null;
  let delimiter = ',';
  let dataIndex = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!headers) {
      delimiter = detectDelimiter(trimmed);
      headers = parseDelimitedLine(trimmed.replace(/^\uFEFF/, ''), delimiter).map((h) => normalizeHeader(h));
      continue;
    }

    const values = parseDelimitedLine(line, delimiter);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    const packetSize = toNumber(row.packet_size ?? row.src_bytes ?? row.sbytes);
    const duration = toNumber(row.duration ?? row.dur);
    const byteRate = toNumber(row.byte_rate ?? row.flow_bytes_s ?? row.sload);
    const label = normalizeLabel(row.label);
    const severity = deriveSeverity(label, packetSize, byteRate, duration);
    const eventTimestamp = parseTimestamp(
      row.timestamp ?? row.event_timestamp ?? row.time ?? row.detectedat ?? row.detected_at
    );
    const srcIp = pickFirstValue(row, SRC_IP_KEYS) || '0.0.0.0';
    const dstIp = pickFirstValue(row, DST_IP_KEYS) || '0.0.0.0';

    rows.push({
      datasetId,
      srcIp,
      dstIp,
      protocol: row.protocol ?? row.proto ?? 'unknown',
      packetSize,
      duration,
      flags: row.tcp_flags ?? row.flags ?? '',
      byteRate,
      connectionState: row.connection_state ?? row.state ?? 'unknown',
      eventTimestamp,
      severity,
      label,
      rowIndex: dataIndex,
    });
    dataIndex += 1;

    if (rows.length >= 500) {
      await TrafficRecord.insertMany(rows, { ordered: false });
      rows.length = 0;
    }
  }

  if (rows.length) {
    await TrafficRecord.insertMany(rows, { ordered: false });
  }
}

function parseDelimitedLine(line, delimiter = ',') {
  const cells = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((value) => value.trim());
}

function detectDelimiter(line = '') {
  const delimiters = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;

  for (const delimiter of delimiters) {
    const count = (line.match(new RegExp(escapeRegExp(delimiter), 'g')) || []).length;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }

  return best;
}

function normalizeHeader(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeLabel(value = '') {
  const normalized = String(value).trim().toLowerCase();
  if (['0', 'normal', 'benign', ''].includes(normalized)) return 'normal';
  return 'anomaly';
}

function deriveSeverity(label, packetSize, byteRate, duration) {
  if (label !== 'anomaly') return 'normal';
  if (packetSize >= 5000 || byteRate >= 5000 || duration <= 0.05) return 'critical';
  return 'anomaly';
}

function parseTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickFirstValue(row, keys = []) {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text && text.toLowerCase() !== 'nan') return text;
  }
  return '';
}

function normalizeSource(source) {
  const value = String(source || '').trim();
  return value || 'Custom';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SRC_IP_KEYS = [
  'src_ip',
  'srcip',
  'src',
  'src_ip_address',
  'src_ipaddr',
  'source_ip',
  'sourceip',
  'source_ip_address',
  'source_ip_addr',
  'source_ipaddr',
  'sourceaddress',
  'source_address',
  'source_addr',
  'source_addr_ip',
  'sourcehost',
  'source_host',
  'source',
  'src_addr',
  'saddr',
  'ip_src',
  'ipsrc',
  'origin_ip',
  'origin',
  'orig_h',
  'src_host',
  'src_host_ip',
  'src_address',
  'ip_source_address',
  'ip_source',
];

const DST_IP_KEYS = [
  'dst_ip',
  'dstip',
  'dst',
  'dst_ip_address',
  'dst_ipaddr',
  'destination_ip',
  'destinationip',
  'destination_ip_address',
  'destination_ip_addr',
  'destination_ipaddr',
  'destinationaddress',
  'destination_address',
  'destination_addr',
  'destination_addr_ip',
  'destinationhost',
  'destination_host',
  'destination',
  'dst_addr',
  'daddr',
  'ip_dst',
  'ipdst',
  'response_ip',
  'resp_h',
  'dst_host',
  'dst_host_ip',
  'dst_address',
  'ip_destination_address',
  'ip_destination',
];
