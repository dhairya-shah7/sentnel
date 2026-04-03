const mongoose = require('mongoose');

const anomalyResultSchema = new mongoose.Schema(
  {
    recordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TrafficRecord',
    },
    datasetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
      index: true,
    },
    jobId: { type: String, index: true },
    modelId: { type: String },
    // ML outputs
    riskScore: {
      type: Number,
      min: 0,
      max: 1,
      required: true,
    },
    classification: {
      type: String,
      enum: ['normal', 'suspicious', 'critical'],
      required: true,
      index: true,
    },
    threatType: {
      type: String,
      enum: ['jamming', 'spoofing', 'intrusion_attempt', 'suspicious_activity', 'unknown'],
      default: 'unknown',
      index: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    isAnomaly: { type: Boolean, default: false },
    // Traffic snapshot
    srcIp: { type: String },
    dstIp: { type: String },
    protocol: { type: String },
    packetSize: { type: Number },
    duration: { type: Number },
    byteRate: { type: Number },
    flags: { type: String },
    explanation: { type: mongoose.Schema.Types.Mixed },
    eventTimestamp: {
      type: Date,
      index: true,
    },
    rowIndex: {
      type: Number,
      index: true,
    },
    // Analyst
    flaggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    analystNote: { type: String, maxlength: 1000 },
    status: {
      type: String,
      enum: ['new', 'reviewed', 'suspicious', 'confirmed', 'false_positive', 'escalated'],
      default: 'new',
      index: true,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

anomalyResultSchema.index({ riskScore: -1 });
anomalyResultSchema.index({ detectedAt: -1 });
anomalyResultSchema.index({ eventTimestamp: -1 });
anomalyResultSchema.set('toJSON', { versionKey: false });

module.exports = mongoose.model('AnomalyResult', anomalyResultSchema);
