const mongoose = require('mongoose');

const datasetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      required: true,
      trim: true,
      default: 'Custom',
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recordCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['uploading', 'processing', 'ready', 'error'],
      default: 'uploading',
    },
    filePath: {
      type: String,
    },
    fileSize: {
      type: Number, // bytes
    },
    errorMessage: {
      type: String,
    },
    analysisCount: {
      type: Number,
      default: 0,
    },
    lastAnalyzedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

datasetSchema.set('toJSON', { versionKey: false });

module.exports = mongoose.model('Dataset', datasetSchema);
