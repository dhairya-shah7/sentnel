const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const Dataset = require('../models/Dataset');
const AnomalyResult = require('../models/AnomalyResult');
const TrafficRecord = require('../models/TrafficRecord');
const { createError } = require('../middleware/errorHandler');
const mlClient = require('../utils/mlClient');
const { jobQueue, updateJob, getJob } = require('../utils/jobQueue');
const { emitToAll, emitAnalysisProgress, emitAnomalyNew } = require('../utils/socketManager');
const { invalidateDashboardCache } = require('./dashboardController');

// POST /api/analysis/run/:datasetId
exports.runAnalysis = async (req, res, next) => {
  try {
    const { datasetId } = req.params;
    const { modelType = 'isolation_forest', contamination = 0.1 } = req.body;

    const dataset = await Dataset.findById(datasetId);
    if (!dataset) throw createError(404, 'Dataset not found', 'DATASET_NOT_FOUND');
    if (dataset.status !== 'ready') {
      throw createError(409, `Dataset status is '${dataset.status}'. Only 'ready' datasets can be analyzed.`, 'DATASET_NOT_READY');
    }
    if (!dataset.filePath) {
      throw createError(400, 'Dataset has no file path', 'NO_FILE');
    }

    const jobId = uuidv4();
    jobQueue.set(jobId, {
      jobId,
      status: 'queued',
      percent: 0,
      stage: 'Queued',
      datasetId: datasetId.toString(),
      modelType,
      contamination,
      startedAt: new Date(),
      resultCount: 0,
      criticalCount: 0,
    });

    res.status(202).json({ jobId, status: 'queued', message: 'Analysis job queued' });

    // Fire and forget — run in background
    runAnalysisJob(jobId, dataset, modelType, contamination, req.user._id).catch((err) => {
      console.error(`[Analysis] Job ${jobId} failed:`, err.message);
      updateJob(jobId, { status: 'failed', stage: err.message });
      emitAnalysisProgress(jobId, 0, `Failed: ${err.message}`, 'failed');
    });
  } catch (err) {
    next(err);
  }
};

async function runAnalysisJob(jobId, dataset, modelType, contamination, userId) {
  const { default: FormData } = await import('form-data');

  updateJob(jobId, { status: 'running', percent: 5, stage: 'Sending to ML service' });
  emitAnalysisProgress(jobId, 5, 'Sending to ML service');

  const form = buildCsvForm(FormData, dataset.filePath);

  updateJob(jobId, { percent: 15, stage: 'Training model' });
  emitAnalysisProgress(jobId, 15, 'Training model');

  // Submit to ML service
  const trainResp = await requestWithRetry(
    () => mlClient.post('/ml/train', form, {
      headers: form.getHeaders(),
      params: {
        dataset_source: dataset.source,
        model_type: modelType,
        contamination,
        dataset_id: dataset._id.toString(),
      },
      timeout: 1800000, // 30 min
    }),
    'training'
  );

  const mlJobId = trainResp.data.job_id;
  updateJob(jobId, { percent: 25, stage: 'Waiting for ML training', mlJobId });

  // Poll ML service for completion
  let mlResult = null;
  for (let attempt = 0; attempt < 180; attempt++) {
    await sleep(2000);
    let statusResp;
    try {
      statusResp = await mlClient.get(`/ml/train/${mlJobId}/status`);
    } catch (err) {
      const statusCode = err?.response?.status;
      if (statusCode === 404) {
        console.warn(`[Analysis] ML job ${mlJobId} status not found yet; retrying`);
        continue;
      }
      throw err;
    }

    const { status, progress, result } = statusResp.data;

    const mapped = 25 + Math.round((progress || 0) * 0.6);
    updateJob(jobId, { percent: mapped, stage: `ML: ${status}` });
    emitAnalysisProgress(jobId, mapped, `ML training: ${status}`);

    if (status === 'complete') {
      mlResult = result;
      break;
    }
    if (status === 'failed') {
      throw createError(500, statusResp.data.message || 'ML training failed', 'ML_FAILED');
    }
  }

  if (!mlResult) throw createError(504, 'ML training timed out', 'ML_TIMEOUT');

  updateJob(jobId, { percent: 88, stage: 'Starting prediction job' });
  emitAnalysisProgress(jobId, 88, 'Starting prediction job');

  const predictForm = buildCsvForm(FormData, dataset.filePath);
  updateJob(jobId, { percent: 90, stage: 'Submitting prediction job' });
  emitAnalysisProgress(jobId, 90, 'Submitting prediction job');
  const predictStartResp = await requestWithRetry(
    () => mlClient.post('/ml/predict', predictForm, {
      headers: predictForm.getHeaders(),
      params: {
        model_id: mlResult.model_id,
        dataset_source: dataset.source,
        dataset_id: dataset._id.toString(),
      },
      timeout: 600000,
    }),
    'prediction'
  );

  const predictJobId = predictStartResp.data.job_id;
  updateJob(jobId, { percent: 92, stage: 'Waiting for prediction results', predictJobId });
  emitAnalysisProgress(jobId, 92, 'Waiting for prediction results');

  let predictResult = null;
  for (let attempt = 0; attempt < 540; attempt++) {
    await sleep(2000);
    let statusResp;
    try {
      statusResp = await mlClient.get(`/ml/predict/${predictJobId}/status`);
    } catch (err) {
      const statusCode = err?.response?.status;
      if (statusCode === 404) {
        console.warn(`[Analysis] ML prediction job ${predictJobId} status not found yet; retrying`);
        continue;
      }
      if (err?.code === 'ML_SERVICE_RESET' || err?.code === 'ECONNRESET') {
        console.warn(`[Analysis] ML prediction job ${predictJobId} temporarily reset; retrying`);
        continue;
      }
      throw err;
    }

    const { status, progress, result, message } = statusResp.data;
    const mapped = 92 + Math.round((progress || 0) * 0.08);
    updateJob(jobId, { percent: Math.min(mapped, 99), stage: `Prediction: ${status}${message ? ` · ${message}` : ''}` });
    emitAnalysisProgress(jobId, Math.min(mapped, 99), `Prediction: ${status}`);

    if (status === 'complete') {
      predictResult = result;
      break;
    }
    if (status === 'failed') {
      throw createError(500, statusResp.data.message || 'ML prediction failed', 'ML_PREDICT_FAILED');
    }
  }

  if (!predictResult) throw createError(504, 'ML prediction timed out', 'ML_PREDICT_TIMEOUT');

  updateJob(jobId, { percent: 94, stage: 'Processing scored anomalies' });
  emitAnalysisProgress(jobId, 94, 'Processing scored anomalies');

  const scoredRows = predictResult.anomalies || predictResult.results || [];
  const anomalyDocs = scoredRows
    .filter((row) => row.is_anomaly)
    .map((row) => ({
      datasetId: dataset._id,
      jobId,
      modelId: mlResult.model_id,
      riskScore: row.risk_score,
      classification: row.classification,
      threatType: normalizeThreatType(row.threat_type),
      confidence: Math.max(0, 1 - Number(row.risk_score || 0)),
      isAnomaly: true,
      srcIp: row.src_ip,
      dstIp: row.dst_ip,
      protocol: row.protocol,
      packetSize: row.packet_size,
      duration: row.duration,
      byteRate: row.byte_rate,
      eventTimestamp: parseTimestamp(row.event_timestamp),
      rowIndex: row.index,
      status: 'new',
      explanation: normalizeExplanation(row.explanation),
    }));

  updateJob(jobId, { percent: 96, stage: 'Linking source records' });
  emitAnalysisProgress(jobId, 96, 'Linking source records');
  const enrichedAnomalyDocs = await enrichAnomalyDocsWithTraffic(dataset._id, anomalyDocs);

  updateJob(jobId, { percent: 98, stage: 'Persisting anomalies' });
  emitAnalysisProgress(jobId, 98, 'Persisting anomalies');
  if (enrichedAnomalyDocs.length) {
    await AnomalyResult.insertMany(enrichedAnomalyDocs, { ordered: false });
  }

  // Update dataset analysis count
  await Dataset.findByIdAndUpdate(dataset._id, {
    $inc: { analysisCount: 1 },
    $set: { lastAnalyzedAt: new Date() },
  });
  invalidateDashboardCache();

  const finalResult = {
    resultCount: predictResult.total_records,
    anomalyCount: predictResult.anomaly_count,
    criticalCount: predictResult.critical_count,
    suspiciousCount: predictResult.suspicious_count,
    normalCount: predictResult.normal_count,
    modelId: predictResult.model_id || mlResult.model_id,
    accuracyEstimate: predictResult.accuracy_estimate,
    threatBreakdown: countThreatTypes(enrichedAnomalyDocs),
    executiveSummary: predictResult.executive_summary || buildExecutiveSummary(predictResult, enrichedAnomalyDocs.length),
    technicalSummary: predictResult.technical_summary || buildTechnicalSummary(enrichedAnomalyDocs),
  };

  updateJob(jobId, {
    status: 'complete',
    percent: 100,
    stage: 'Complete',
    result: finalResult,
    completedAt: new Date(),
    resultCount: predictResult.total_records,
    criticalCount: predictResult.critical_count,
  });

  emitToAll('analysis:complete', { jobId, ...finalResult });
  if (predictResult.critical_count > 0) {
    const firstCritical = enrichedAnomalyDocs.find((doc) => doc.classification === 'critical') || enrichedAnomalyDocs[0];
    emitToAll('system:alert', {
      level: 'critical',
      message: `Analysis complete: ${predictResult.critical_count} critical anomalies detected in dataset "${dataset.name}"`,
    });
    if (firstCritical) {
      emitAnomalyNew(firstCritical);
    }
  }
}

// GET /api/analysis/:jobId/status
exports.getJobStatus = (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
  res.json({ job });
};

// GET /api/analysis/:jobId/results
exports.getJobResults = async (req, res, next) => {
  try {
    const job = getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found', code: 'JOB_NOT_FOUND' });

    const anomalies = await AnomalyResult.find({ jobId: req.params.jobId }).sort({ riskScore: -1 }).limit(200);

    res.json({ job, anomalies });
  } catch (err) {
    next(err);
  }
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function requestWithRetry(requestFn, label, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestFn();
    } catch (err) {
      lastError = err;
      const reset = err?.code === 'ML_SERVICE_RESET' || err?.code === 'ECONNRESET';
      if (!reset || attempt === attempts) {
        throw err;
      }
      console.warn(`[Analysis] ${label} request reset by ML service; retrying (${attempt}/${attempts})`);
      await sleep(1500 * attempt);
    }
  }
  throw lastError;
}

function buildCsvForm(FormDataCtor, filePath) {
  const form = new FormDataCtor();
  form.append('file', fs.createReadStream(filePath), {
    filename: 'dataset.csv',
    contentType: 'text/csv',
  });
  return form;
}

function parseTimestamp(value) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function enrichAnomalyDocsWithTraffic(datasetId, anomalyDocs = []) {
  const lookupRows = anomalyDocs
    .map((doc) => doc.rowIndex)
    .filter((rowIndex) => Number.isInteger(rowIndex));

  if (!lookupRows.length) {
    return anomalyDocs;
  }

  const lookupRowIndexes = [...new Set(
    lookupRows.flatMap((rowIndex) => [
      rowIndex,
      rowIndex + 1,
      rowIndex - 1,
    ].filter((value) => Number.isInteger(value) && value >= 0))
  )];

  const trafficRows = await TrafficRecord.find({
    $or: buildDatasetIdClause(datasetId),
    rowIndex: { $in: lookupRowIndexes },
  })
    .select('rowIndex srcIp dstIp protocol packetSize duration byteRate eventTimestamp flags connectionState')
    .lean();

  const trafficMap = new Map(trafficRows.map((row) => [row.rowIndex, row]));

  return anomalyDocs.map((doc) => {
    const traffic = trafficMap.get(doc.rowIndex)
      || trafficMap.get(doc.rowIndex + 1)
      || trafficMap.get(doc.rowIndex - 1);
    if (!traffic) return doc;

    const threatType = doc.threatType !== 'unknown'
      ? doc.threatType
      : inferThreatType({
        srcIp: doc.srcIp || traffic.srcIp,
        dstIp: doc.dstIp || traffic.dstIp,
        protocol: doc.protocol || traffic.protocol,
        packetSize: doc.packetSize || traffic.packetSize,
        duration: doc.duration || traffic.duration,
        byteRate: doc.byteRate || traffic.byteRate,
        flags: doc.flags || traffic.flags,
        connectionState: traffic.connectionState,
        classification: doc.classification,
        riskScore: doc.riskScore,
      });

    return {
      ...doc,
      srcIp: doc.srcIp || traffic.srcIp,
      dstIp: doc.dstIp || traffic.dstIp,
      protocol: doc.protocol || traffic.protocol,
      packetSize: doc.packetSize ?? traffic.packetSize,
      duration: doc.duration ?? traffic.duration,
      byteRate: doc.byteRate ?? traffic.byteRate,
      flags: doc.flags || traffic.flags,
      eventTimestamp: doc.eventTimestamp || traffic.eventTimestamp,
      threatType,
    };
  });
}

function countThreatTypes(docs = []) {
  return docs.reduce((acc, doc) => {
    const key = normalizeThreatType(doc.threatType);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function inferThreatType(row = {}) {
  const srcIp = normalizeText(row.srcIp);
  const dstIp = normalizeText(row.dstIp);
  const protocol = normalizeText(row.protocol);
  const flags = normalizeText(row.flags);
  const state = normalizeText(row.connectionState);
  const packetSize = Number(row.packetSize || 0);
  const duration = Number(row.duration || 0);
  const byteRate = Number(row.byteRate || 0);
  const riskScore = Number(row.riskScore || 0);
  const classification = normalizeThreatType(row.classification);

  const invalidIp = isMissingIp(srcIp) || isMissingIp(dstIp) || (srcIp && dstIp && srcIp === dstIp);
  const bursty = duration <= 1 && (packetSize <= 128 || byteRate >= 1000);
  const flood = packetSize >= 5000 || byteRate >= 5000;
  const isUdpIcmp = ['udp', 'icmp', '17', '1'].includes(protocol);
  const synLike = /syn/i.test(flags) || /syn/i.test(state);

  if (invalidIp) return 'spoofing';
  if (isUdpIcmp && (bursty || flood)) return 'jamming';
  if (synLike || classification === 'critical' || riskScore > 0.7) return 'intrusion_attempt';
  return 'suspicious_activity';
}

function normalizeThreatType(value) {
  const threat = normalizeText(value).replace(/\s+/g, '_');
  if (['jamming', 'spoofing', 'intrusion_attempt', 'suspicious_activity', 'unknown'].includes(threat)) {
    return threat;
  }
  return threat ? threat : 'unknown';
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function isMissingIp(value) {
  const text = normalizeText(value);
  return !text || ['0.0.0.0', 'unknown', 'null', 'nan', '-'].includes(text);
}

function normalizeExplanation(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    summary: String(value.summary || ''),
    signals: Array.isArray(value.signals) ? value.signals.map((signal) => String(signal)) : [],
    riskScore: Number(value.risk_score || value.riskScore || 0),
    classification: String(value.classification || ''),
    threatType: normalizeThreatType(value.threat_type || value.threatType),
  };
}

function buildExecutiveSummary(mlResult, anomalyCount) {
  const total = Number(mlResult.total_records || 0);
  const percent = total ? ((anomalyCount / total) * 100).toFixed(2) : '0.00';
  return `This run processed ${total} records and flagged ${anomalyCount} anomalies (${percent}%). Critical cases: ${Number(mlResult.critical_count || 0)}.`;
}

function buildDatasetIdClause(datasetId) {
  const id = String(datasetId);
  if (mongoose.Types.ObjectId.isValid(datasetId)) {
    return [{ datasetId: new mongoose.Types.ObjectId(datasetId) }, { datasetId: id }];
  }
  return [{ datasetId: id }];
}

function buildTechnicalSummary(anomalyDocs = []) {
  const signalCounts = {};
  anomalyDocs.forEach((doc) => {
    (doc.explanation?.signals || []).forEach((signal) => {
      signalCounts[signal] = (signalCounts[signal] || 0) + 1;
    });
  });

  const topSignals = Object.entries(signalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([signal, count]) => ({ signal, count }));

  return {
    anomalyRows: anomalyDocs.length,
    topSignals,
    summary: anomalyDocs.length
      ? 'Technical summary generated from repeated signals across the anomalous rows.'
      : 'No anomalous rows were available for technical summary generation.',
  };
}
