const mongoose = require('mongoose');

const trafficRecordSchema = new mongoose.Schema(
  {
    datasetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
      required: true,
      index: true,
    },
    srcIp: { type: String, default: '0.0.0.0' },
    dstIp: { type: String, default: '0.0.0.0' },
    protocol: { type: String, default: 'unknown' },
    packetSize: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    flags: { type: String, default: '' },
    byteRate: { type: Number, default: 0 },
    connectionState: { type: String, default: 'unknown' },
    eventTimestamp: { type: Date, index: true },
    severity: {
      type: String,
      enum: ['normal', 'anomaly', 'critical'],
      default: 'normal',
      index: true,
    },
    label: {
      type: String,
      enum: ['normal', 'anomaly', 'unknown'],
      default: 'unknown',
    },
    rowIndex: { type: Number }, // original CSV row index
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

trafficRecordSchema.index({ datasetId: 1, label: 1 });
trafficRecordSchema.index({ datasetId: 1, severity: 1 });
trafficRecordSchema.set('toJSON', { versionKey: false });

module.exports = mongoose.model('TrafficRecord', trafficRecordSchema);
