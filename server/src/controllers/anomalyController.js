const mongoose = require('mongoose');
const Dataset = require('../models/Dataset');
const AnomalyResult = require('../models/AnomalyResult');
const TrafficRecord = require('../models/TrafficRecord');
const { createError } = require('../middleware/errorHandler');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const readline = require('readline');

// GET /api/anomalies
exports.listAnomalies = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      risk,
      protocol,
      srcIp,
      dstIp,
      datasetId,
      status,
      from,
      to,
      sortBy = 'eventTimestamp',
      order = 'desc',
    } = req.query;

    const filter = {};
    const andClauses = [];
    if (risk) {
      const normalizedRisk = String(risk).toLowerCase();
      if (normalizedRisk === 'anomaly' || normalizedRisk === 'anomalies') {
        filter.classification = { $in: ['suspicious', 'critical'] };
      } else if (normalizedRisk === 'all') {
        // no-op
      } else {
        filter.classification = normalizedRisk;
      }
    }
    if (protocol) filter.protocol = new RegExp(protocol, 'i');
    if (srcIp) filter.srcIp = new RegExp(srcIp);
    if (dstIp) filter.dstIp = new RegExp(dstIp);
    if (datasetId) andClauses.push({ $or: buildDatasetIdClause(datasetId) });
    if (status) filter.status = status;
    if (from || to) {
      andClauses.push({
        $or: [
        buildTimeRangeClause('eventTimestamp', from, to),
        buildTimeRangeClause('detectedAt', from, to),
        ].filter(Boolean),
      });
    }

    if (andClauses.length) {
      filter.$and = andClauses;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [anomalies, total] = await Promise.all([
      AnomalyResult.find(filter)
        .populate('flaggedBy', 'username')
        .populate('datasetId', 'name source filePath')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      AnomalyResult.countDocuments(filter),
    ]);

    const enriched = await enrichAnomaliesWithTrafficRecords(anomalies);

    res.json({
      anomalies: enriched,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      pages: Math.ceil(total / parseInt(limit, 10)),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/anomalies/export
exports.exportAnomalies = async (req, res, next) => {
  try {
    const filter = {};
    const andClauses = [];
    if (req.query.risk) {
      const normalizedRisk = String(req.query.risk).toLowerCase();
      if (normalizedRisk === 'anomaly' || normalizedRisk === 'anomalies') {
        filter.classification = { $in: ['suspicious', 'critical'] };
      } else if (normalizedRisk === 'all') {
        // no-op
      } else {
        filter.classification = normalizedRisk;
      }
    }
    if (req.query.datasetId) andClauses.push({ $or: buildDatasetIdClause(req.query.datasetId) });
    if (andClauses.length) {
      filter.$and = andClauses;
    }

    const anomalies = await AnomalyResult.find(filter)
      .sort({ eventTimestamp: -1, detectedAt: -1 })
      .limit(10000)
      .lean();
    const enriched = await enrichAnomaliesWithTrafficRecords(anomalies);

    const tmpFile = path.join(os.tmpdir(), `anomalies_${Date.now()}.csv`);
    const writer = createObjectCsvWriter({
      path: tmpFile,
      header: [
        { id: '_id', title: 'ID' },
        { id: 'eventTimestamp', title: 'Event Time' },
        { id: 'detectedAt', title: 'Detected At' },
        { id: 'srcIp', title: 'Src IP' },
        { id: 'dstIp', title: 'Dst IP' },
        { id: 'protocol', title: 'Protocol' },
        { id: 'riskScore', title: 'Risk Score' },
        { id: 'classification', title: 'Classification' },
        { id: 'status', title: 'Status' },
        { id: 'analystNote', title: 'Analyst Note' },
      ],
    });

    await writer.writeRecords(enriched);

    res.download(tmpFile, 'anomaly_export.csv', () => {
      fs.unlink(tmpFile, () => {});
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/anomalies/:id
exports.getById = async (req, res, next) => {
  try {
    const anomaly = await AnomalyResult.findById(req.params.id)
      .populate('flaggedBy', 'username email')
      .populate('datasetId', 'name source filePath')
      .lean();
    if (!anomaly) throw createError(404, 'Anomaly not found', 'NOT_FOUND');

    const [enriched] = await enrichAnomaliesWithTrafficRecords([anomaly]);
    res.json({ anomaly: enriched || anomaly });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/anomalies/:id/flag
exports.flagAnomaly = async (req, res, next) => {
  try {
    const { analystNote, status } = req.body;
    const validStatuses = ['new', 'reviewed', 'suspicious', 'confirmed', 'false_positive', 'escalated'];
    if (status && !validStatuses.includes(status)) {
      throw createError(400, `Invalid status. Choose from: ${validStatuses.join(', ')}`, 'INVALID_STATUS');
    }

    const anomaly = await AnomalyResult.findByIdAndUpdate(
      req.params.id,
      {
        ...(analystNote !== undefined && { analystNote }),
        ...(status && { status }),
        flaggedBy: req.user._id,
      },
      { new: true, runValidators: true }
    ).populate('flaggedBy', 'username');

    if (!anomaly) throw createError(404, 'Anomaly not found', 'NOT_FOUND');
    res.json({ anomaly });
  } catch (err) {
    next(err);
  }
};

function buildTimeRangeClause(field, from, to) {
  if (!from && !to) return null;
  const clause = {};
  clause[field] = {};
  if (from) {
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    clause[field].$gte = start;
  }
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    clause[field].$lte = end;
  }
  return clause;
}

function buildDatasetIdClause(datasetId) {
  const id = String(datasetId);
  if (mongoose.Types.ObjectId.isValid(datasetId)) {
    return [{ datasetId: new mongoose.Types.ObjectId(datasetId) }, { datasetId: id }];
  }
  return [{ datasetId: id }];
}

async function enrichAnomaliesWithTrafficRecords(anomalies = []) {
  const needsLookup = anomalies.filter((anomaly) => {
    const srcIp = normalizeIp(anomaly.srcIp);
    const dstIp = normalizeIp(anomaly.dstIp);
    return !srcIp || !dstIp;
  });

  if (!needsLookup.length) {
    return anomalies.map((anomaly) => ({
      ...anomaly,
      srcIp: normalizeIp(anomaly.srcIp),
      dstIp: normalizeIp(anomaly.dstIp),
    }));
  }

  const lookupPairs = needsLookup
    .map((anomaly) => ({
      datasetId: anomaly.datasetId?._id || anomaly.datasetId,
      rowIndex: anomaly.rowIndex,
    }))
    .filter((entry) => entry.datasetId && Number.isInteger(entry.rowIndex));

  if (!lookupPairs.length) {
    return anomalies.map((anomaly) => ({
      ...anomaly,
      srcIp: normalizeIp(anomaly.srcIp),
      dstIp: normalizeIp(anomaly.dstIp),
    }));
  }

  const datasetIds = [...new Set(lookupPairs.map((entry) => String(entry.datasetId)))];
  const rowIndexes = [...new Set(lookupPairs.flatMap((entry) => [
    entry.rowIndex,
    entry.rowIndex + 1,
    entry.rowIndex - 1,
  ].filter((value) => Number.isInteger(value) && value >= 0)))];

  const trafficRows = await TrafficRecord.find({
    $or: datasetIds.flatMap((datasetId) => buildDatasetIdClause(datasetId)),
    rowIndex: { $in: rowIndexes },
  })
    .select('datasetId rowIndex srcIp dstIp')
    .lean();

  const trafficMap = new Map(
    trafficRows.map((row) => [`${String(row.datasetId)}:${row.rowIndex}`, row])
  );

  const datasets = await Dataset.find({ _id: { $in: datasetIds } })
    .select('filePath')
    .lean();
  const datasetMap = new Map(datasets.map((dataset) => [String(dataset._id), dataset]));
  const fileRowCache = new Map();

  const fileLookupTargets = new Map();
  for (const anomaly of anomalies) {
    const datasetKey = String(anomaly.datasetId?._id || anomaly.datasetId);
    const dataset = datasetMap.get(datasetKey);
    if (!dataset?.filePath) continue;

    const currentKey = `${datasetKey}:${anomaly.rowIndex}`;
    const traffic = trafficMap.get(currentKey)
      || trafficMap.get(`${datasetKey}:${anomaly.rowIndex + 1}`)
      || trafficMap.get(`${datasetKey}:${anomaly.rowIndex - 1}`);
    if (normalizeIp(anomaly.srcIp || traffic?.srcIp) && normalizeIp(anomaly.dstIp || traffic?.dstIp)) {
      continue;
    }

    const wanted = fileLookupTargets.get(datasetKey) || new Set();
    [anomaly.rowIndex, anomaly.rowIndex + 1, anomaly.rowIndex - 1]
      .filter((value) => Number.isInteger(value) && value >= 0)
      .forEach((value) => wanted.add(value));
    fileLookupTargets.set(datasetKey, wanted);
  }

  await Promise.all([...fileLookupTargets.entries()].map(async ([datasetKey, wanted]) => {
    const dataset = datasetMap.get(datasetKey);
    if (!dataset?.filePath) return;

    const rows = await loadCsvRowsByIndex(dataset.filePath, [...wanted]);
    for (const [rowIndex, row] of rows.entries()) {
      fileRowCache.set(`${datasetKey}:${rowIndex}`, row);
    }
  }));

  return anomalies.map((anomaly) => {
    const key = `${String(anomaly.datasetId?._id || anomaly.datasetId)}:${anomaly.rowIndex}`;
    const traffic = trafficMap.get(key)
      || trafficMap.get(`${String(anomaly.datasetId?._id || anomaly.datasetId)}:${anomaly.rowIndex + 1}`)
      || trafficMap.get(`${String(anomaly.datasetId?._id || anomaly.datasetId)}:${anomaly.rowIndex - 1}`);
    const datasetKey = String(anomaly.datasetId?._id || anomaly.datasetId);
    const dataset = datasetMap.get(datasetKey);
    const fileRow = dataset?.filePath
      ? fileRowCache.get(`${datasetKey}:${anomaly.rowIndex}`)
        || fileRowCache.get(`${datasetKey}:${anomaly.rowIndex + 1}`)
        || fileRowCache.get(`${datasetKey}:${anomaly.rowIndex - 1}`)
      : null;
    return {
      ...anomaly,
      srcIp: normalizeIp(anomaly.srcIp || traffic?.srcIp || extractIpFromRow(fileRow, SRC_IP_KEYS)),
      dstIp: normalizeIp(anomaly.dstIp || traffic?.dstIp || extractIpFromRow(fileRow, DST_IP_KEYS)),
    };
  });
}

function normalizeIp(value) {
  if (!value || value === '0.0.0.0' || value === 'unknown') return null;
  return value;
}

function extractIpFromRow(row, keys = []) {
  if (!row) return '';
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text && text.toLowerCase() !== 'nan') {
      return text;
    }
  }
  return '';
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

function normalizeHeader(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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

async function loadCsvRowsByIndex(filePath, targetIndexes = []) {
  const desired = new Set(targetIndexes.filter((value) => Number.isInteger(value) && value >= 0));
  const rows = new Map();
  if (!desired.size || !filePath || !fs.existsSync(filePath)) {
    return rows;
  }

  return new Promise((resolve) => {
    let headers = null;
    let delimiter = ',';
    let dataIndex = -1;
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (!headers) {
        delimiter = detectDelimiter(trimmed);
        headers = parseDelimitedLine(trimmed.replace(/^\uFEFF/, ''), delimiter).map((h) => normalizeHeader(h));
        return;
      }

      dataIndex += 1;
      if (!desired.has(dataIndex)) return;

      const values = parseDelimitedLine(line, delimiter);
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
      rows.set(dataIndex, row);

      if (rows.size >= desired.size) {
        rl.close();
      }
    });

    rl.on('close', () => resolve(rows));
    rl.on('error', () => resolve(rows));
  });
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
