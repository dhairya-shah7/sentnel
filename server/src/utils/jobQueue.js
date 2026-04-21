/**
 * In-memory job queue.
 * For production, replace with Redis/Bull.
 */
const jobQueue = new Map();

const updateJob = (jobId, updates) => {
  const existing = jobQueue.get(jobId);
  if (existing) {
    jobQueue.set(jobId, { ...existing, ...updates });
  }
};

const getJob = (jobId) => jobQueue.get(jobId) || null;

const getAllJobs = () => Array.from(jobQueue.values());

const cleanOldJobs = (maxAgeMs = 24 * 60 * 60 * 1000) => {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, job] of jobQueue.entries()) {
    if (job.startedAt && new Date(job.startedAt).getTime() < cutoff) {
      jobQueue.delete(id);
    }
  }
};

// Clean old jobs every hour
const cleanupTimer = setInterval(cleanOldJobs, 60 * 60 * 1000);
cleanupTimer.unref?.();

module.exports = { jobQueue, updateJob, getJob, getAllJobs };
