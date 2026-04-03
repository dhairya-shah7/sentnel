const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    username: { type: String },
    action: {
      type: String,
      required: true,
      index: true,
    },
    resource: { type: String }, // e.g. 'dataset', 'anomaly', 'user'
    resourceId: { type: String },
    ipAddress: { type: String },
    origin: { type: String },
    userAgent: { type: String },
    method: { type: String },
    path: { type: String },
    statusCode: { type: Number },
    metadata: { type: mongoose.Schema.Types.Mixed },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false, // We manage timestamp manually
  }
);

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.set('toJSON', { versionKey: false });

module.exports = mongoose.model('AuditLog', auditLogSchema);
