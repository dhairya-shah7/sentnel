const mongoose = require('mongoose');
const Dataset = require('../models/Dataset');
const AnomalyResult = require('../models/AnomalyResult');
const TrafficRecord = require('../models/TrafficRecord');

const dashboardCache = new Map();
const DASHBOARD_CACHE_TTL_MS = 30 * 1000;

exports.invalidateDashboardCache = () => {
  dashboardCache.clear();
};

// GET /api/dashboard/stats
exports.getStats = async (req, res, next) => {
  try {
    const datasetFilter = buildDatasetFilter(req.query.datasetId);
    const cacheKey = datasetFilter.key;
    const now = Date.now();
    const cached = dashboardCache.get(cacheKey);
    if (cached && now - cached.cachedAt < DASHBOARD_CACHE_TTL_MS) {
      return res.json({ ...cached.payload, cached: true });
    }

    const [
      totalDatasets,
      totalAnomalies,
      criticalCount,
      suspiciousCount,
      recentAnomalies,
      trafficCount,
      trafficBounds,
      protocolDist,
      confidenceAgg,
      threatBreakdownAgg,
      threatBounds,
    ] = await Promise.all([
      Dataset.countDocuments({ status: 'ready' }),
      AnomalyResult.countDocuments(datasetFilter.anomalyFilter),
      AnomalyResult.countDocuments({ ...datasetFilter.anomalyFilter, classification: 'critical' }),
      AnomalyResult.countDocuments({ ...datasetFilter.anomalyFilter, classification: 'suspicious' }),
      AnomalyResult.find({ ...datasetFilter.anomalyFilter, isAnomaly: true })
        .sort({ eventTimestamp: -1, detectedAt: -1 })
        .limit(10)
        .populate('datasetId', 'name source')
        .lean(),
      TrafficRecord.countDocuments(datasetFilter.trafficFilter),
      TrafficRecord.aggregate([
        { $match: datasetFilter.trafficFilter },
        {
          $group: {
            _id: null,
            start: { $min: { $ifNull: ['$eventTimestamp', '$createdAt'] } },
            end: { $max: { $ifNull: ['$eventTimestamp', '$createdAt'] } },
          },
        },
      ]),
      TrafficRecord.aggregate([
        { $match: datasetFilter.trafficFilter },
        { $group: { _id: '$protocol', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      AnomalyResult.aggregate([
        { $match: { ...datasetFilter.anomalyFilter, confidence: { $ne: null } } },
        {
          $group: {
            _id: null,
            avgConfidence: { $avg: '$confidence' },
          },
        },
      ]),
      AnomalyResult.aggregate([
        { $match: datasetFilter.anomalyFilter },
        { $group: { _id: '$threatType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AnomalyResult.aggregate([
        { $match: datasetFilter.anomalyFilter },
        {
          $group: {
            _id: null,
            start: { $min: { $ifNull: ['$eventTimestamp', '$detectedAt'] } },
            end: { $max: { $ifNull: ['$eventTimestamp', '$detectedAt'] } },
          },
        },
      ]),
    ]);

    const trafficTimeline = await buildTrafficTimeline(
      datasetFilter.trafficFilter,
      trafficBounds[0],
      datasetFilter.anomalyFilter
    );
    const threatTimeline = await buildThreatTimeline(datasetFilter.anomalyFilter, threatBounds[0] || trafficBounds[0]);
    const timeRange = trafficTimeline.length
      ? {
          start: trafficTimeline[0].timestamp,
          end: trafficTimeline[trafficTimeline.length - 1].timestamp,
          bucketMinutes: trafficTimeline[0].bucketMinutes,
        }
      : null;
    const threatTimeRange = threatTimeline.length
      ? {
          start: threatTimeline[0].timestamp,
          end: threatTimeline[threatTimeline.length - 1].timestamp,
          bucketMinutes: threatTimeline[0].bucketMinutes,
        }
      : null;

    const payload = {
      kpis: {
        totalDatasets,
        totalRecords: trafficCount,
        anomalyCount: totalAnomalies,
        criticalCount,
        suspiciousCount,
        normalCount: Math.max(0, trafficCount - totalAnomalies),
        detectionConfidence: confidenceAgg[0]?.avgConfidence != null
          ? Math.round(confidenceAgg[0].avgConfidence * 100)
          : null,
      },
      recentAnomalies,
      trafficTimeline,
      threatTimeline,
      threatBreakdown: threatBreakdownAgg.map((item) => ({
        name: item._id || 'unknown',
        value: item.count,
      })),
      timeRange,
      threatTimeRange,
      protocolDistribution: protocolDist.map((p) => ({
        name: p._id || 'unknown',
        value: p.count,
      })),
      systemHealth: {
        database: 'online',
        mlService: 'checking',
        api: 'online',
      },
      selectedDatasetId: datasetFilter.datasetId ? String(datasetFilter.datasetId) : null,
    };

    dashboardCache.set(cacheKey, { cachedAt: now, payload });
    res.json(payload);
  } catch (err) {
    const datasetFilter = buildDatasetFilter(req.query.datasetId);
    const cached = dashboardCache.get(datasetFilter.key);
    if (cached) {
      return res.json({ ...cached.payload, cached: true, stale: true });
    }
    next(err);
  }
};

async function buildTrafficTimeline(matchFilter, bounds, anomalyFilter = {}) {
  if (!bounds?.start || !bounds?.end) return [];

  const spanMs = Math.max(1, new Date(bounds.end).getTime() - new Date(bounds.start).getTime());
  const bucketMinutes = pickBucketMinutes(spanMs);

  const [trafficBuckets, anomalyBuckets] = await Promise.all([
    TrafficRecord.aggregate([
      { $match: matchFilter },
      {
        $addFields: {
          effectiveTimestamp: { $ifNull: ['$eventTimestamp', '$createdAt'] },
        },
    },
    {
      $match: {
        effectiveTimestamp: { $ne: null },
      },
    },
    {
      $group: {
        _id: {
          $dateTrunc: {
            date: '$effectiveTimestamp',
            unit: 'minute',
            binSize: bucketMinutes,
          },
        },
        total: { $sum: 1 },
        anomalies: { $sum: { $cond: [{ $eq: ['$label', 'anomaly'] }, 1, 0] } },
        critical: { $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]).allowDiskUse(true),
    AnomalyResult.aggregate([
      { $match: anomalyFilter },
      {
        $addFields: {
          effectiveTimestamp: { $ifNull: ['$eventTimestamp', '$detectedAt'] },
        },
      },
      {
        $match: {
          effectiveTimestamp: { $ne: null },
        },
      },
      {
        $group: {
          _id: {
            $dateTrunc: {
              date: '$effectiveTimestamp',
              unit: 'minute',
              binSize: bucketMinutes,
            },
          },
          anomalies: { $sum: 1 },
          critical: { $sum: { $cond: [{ $eq: ['$classification', 'critical'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]).allowDiskUse(true),
  ]);

  const anomalyMap = new Map(
    anomalyBuckets.map((bucket) => [
      new Date(bucket._id).toISOString(),
      bucket,
    ])
  );

  return trafficBuckets.map((bucket) => {
    const bucketDate = new Date(bucket._id);
    const anomalyBucket = anomalyMap.get(bucketDate.toISOString()) || {};
    return {
      timestamp: bucketDate.toISOString(),
      label: formatBucketLabel(bucketDate, bucketMinutes),
      total: bucket.total,
      anomalies: anomalyBucket.anomalies ?? bucket.anomalies,
      critical: anomalyBucket.critical ?? bucket.critical,
      bucketMinutes,
    };
  });
}

async function buildThreatTimeline(matchFilter, bounds) {
  if (!bounds?.start || !bounds?.end) return [];

  const spanMs = Math.max(1, new Date(bounds.end).getTime() - new Date(bounds.start).getTime());
  const bucketMinutes = pickBucketMinutes(spanMs);

  const buckets = await AnomalyResult.aggregate([
    { $match: matchFilter },
    {
      $addFields: {
        effectiveTimestamp: { $ifNull: ['$eventTimestamp', '$detectedAt'] },
      },
    },
    {
      $match: {
        effectiveTimestamp: { $ne: null },
      },
    },
    {
      $group: {
        _id: {
          $dateTrunc: {
            date: '$effectiveTimestamp',
            unit: 'minute',
            binSize: bucketMinutes,
          },
        },
        jamming: { $sum: { $cond: [{ $eq: ['$threatType', 'jamming'] }, 1, 0] } },
        spoofing: { $sum: { $cond: [{ $eq: ['$threatType', 'spoofing'] }, 1, 0] } },
        intrusion_attempt: { $sum: { $cond: [{ $eq: ['$threatType', 'intrusion_attempt'] }, 1, 0] } },
        suspicious_activity: { $sum: { $cond: [{ $eq: ['$threatType', 'suspicious_activity'] }, 1, 0] } },
        unknown: { $sum: { $cond: [{ $eq: ['$threatType', 'unknown'] }, 1, 0] } },
        total: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]).allowDiskUse(true);

  return buckets.map((bucket) => {
    const bucketDate = new Date(bucket._id);
    return {
      timestamp: bucketDate.toISOString(),
      label: formatBucketLabel(bucketDate, bucketMinutes),
      jamming: bucket.jamming,
      spoofing: bucket.spoofing,
      intrusion_attempt: bucket.intrusion_attempt,
      suspicious_activity: bucket.suspicious_activity,
      unknown: bucket.unknown,
      total: bucket.total,
      bucketMinutes,
    };
  });
}

function buildDatasetFilter(datasetId) {
  if (!datasetId) {
    return { key: 'all', datasetId: null, trafficFilter: {}, anomalyFilter: {} };
  }

  const id = mongoose.Types.ObjectId.isValid(datasetId)
    ? new mongoose.Types.ObjectId(datasetId)
    : datasetId;
  const idString = String(datasetId);
  const datasetClause = mongoose.Types.ObjectId.isValid(datasetId)
    ? [{ datasetId: id }, { datasetId: idString }]
    : [{ datasetId: idString }];

  return {
    key: String(id),
    datasetId: id,
    trafficFilter: { $or: datasetClause },
    anomalyFilter: { $or: datasetClause },
  };
}

function pickBucketMinutes(spanMs) {
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  if (spanMs <= 2 * hour) return 5;
  if (spanMs <= 12 * hour) return 15;
  if (spanMs <= 3 * day) return 60;
  if (spanMs <= 14 * day) return 180;
  return 1440;
}

function formatBucketLabel(date, bucketMinutes) {
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  if (bucketMinutes < 60) return `${hour}:${minute}`;
  if (bucketMinutes < 1440) {
    return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hour}:00`;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
