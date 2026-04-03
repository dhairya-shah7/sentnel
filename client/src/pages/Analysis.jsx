import { useEffect, useState } from 'react';
import PageWrapper from '../components/layout/PageWrapper';
import ProgressRing from '../components/ui/ProgressRing';
import { useJobSocket } from '../hooks/useWebSocket';
import api from '../services/api';
import toast from 'react-hot-toast';

const JOB_STATUS_STYLE = {
  queued:   'text-text-muted',
  running:  'text-accent',
  complete: 'text-success',
  failed:   'text-alert',
};

export default function Analysis() {
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState('');
  const [modelType, setModelType] = useState('isolation_forest');
  const [contamination, setContamination] = useState(0.1);
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobProgress, setJobProgress] = useState({});
  const [latestSummary, setLatestSummary] = useState(null);

  useEffect(() => {
    api.get('/dataset?limit=100').then((res) => setDatasets(res.data.datasets?.filter(d => d.status === 'ready') || []));
  }, []);

  useJobSocket(
    activeJobId,
    (data) => setJobProgress(p => ({ ...p, [data.jobId]: data })),
    (data) => {
      setJobProgress(p => ({ ...p, [data.jobId]: { ...p[data.jobId], percent: 100, status: 'complete' } }));
      setLatestSummary(data);
      toast.success(`Analysis complete: ${data.resultCount?.toLocaleString()} records, ${data.criticalCount} critical`);
    }
  );

  useEffect(() => {
    if (!activeJobId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.get(`/analysis/${activeJobId}/status`);
        if (cancelled) return;
        const job = res.data.job || {};
        setJobProgress((p) => ({ ...p, [activeJobId]: { ...p[activeJobId], ...job } }));
        if (job.status === 'complete' && job.result) {
          setLatestSummary(job.result);
        }
        if (job.status === 'failed') {
          toast.error(job.stage || job.message || 'Analysis failed');
        }
      } catch {
        // ignore polling hiccups; websocket may still deliver updates
      }
    };

    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeJobId]);

  const runAnalysis = async () => {
    if (!selectedDataset) return toast.error('Select a dataset');
    setSubmitting(true);
    try {
      const res = await api.post(`/analysis/run/${selectedDataset}`, { modelType, contamination: parseFloat(contamination) });
      const jobId = res.data.jobId;
      setActiveJobId(jobId);
      setJobs(j => [{ jobId, status: 'queued', datasetId: selectedDataset, modelType, startedAt: new Date().toISOString() }, ...j]);
      setJobProgress(p => ({ ...p, [jobId]: { percent: 0, stage: 'Queued', status: 'queued' } }));
      toast.success('Analysis job started');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start analysis');
    } finally {
      setSubmitting(false);
    }
  };

  const getDatasetName = (id) => datasets.find(d => d._id === id)?.name || id;

  return (
    <PageWrapper title="/ analysis / configure">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Config panel */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card corner-accent">
            <p className="section-title mb-4">Model Configuration</p>

            <div className="space-y-4">
              <div>
                <label className="input-label">Target Dataset</label>
                <select className="select" value={selectedDataset} onChange={(e) => setSelectedDataset(e.target.value)}>
                  <option value="">— Select Dataset —</option>
                  {datasets.map((d) => (
                    <option key={d._id} value={d._id}>{d.name} ({d.source})</option>
                  ))}
                </select>
                {datasets.length === 0 && <p className="text-xs font-mono text-text-muted mt-1">No ready datasets found. Upload one first.</p>}
              </div>

              <div>
                <label className="input-label">Detection Model</label>
                <select className="select" value={modelType} onChange={(e) => setModelType(e.target.value)}>
                  <option value="isolation_forest">Isolation Forest (Recommended)</option>
                  <option value="one_class_svm">One-Class SVM</option>
                </select>
              </div>

              <div>
                <label className="input-label">
                  Contamination Factor — <span className="text-accent">{(contamination * 100).toFixed(1)}%</span>
                </label>
                <input
                  type="range" min="0.01" max="0.5" step="0.01"
                  value={contamination}
                  onChange={(e) => setContamination(e.target.value)}
                  className="w-full accent-accent"
                />
                <div className="flex justify-between text-xs font-mono text-text-muted mt-1">
                  <span>1%</span><span>50%</span>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Expected proportion of anomalies in the dataset
                </p>
              </div>

              <button
                onClick={runAnalysis}
                disabled={submitting || !selectedDataset}
                className="btn btn-primary w-full justify-center"
              >
                {submitting ? '⟳ Starting...' : '▶ Run Analysis'}
              </button>
            </div>
          </div>

          {/* Model info */}
          <div className="card">
            <p className="section-title mb-3">About the Model</p>
            {modelType === 'isolation_forest' ? (
              <div className="space-y-2 text-xs text-text-muted font-mono">
                <p><span className="text-accent">Algorithm:</span> Isolation Forest</p>
                <p><span className="text-accent">Type:</span> Unsupervised</p>
                <p><span className="text-accent">Speed:</span> Fast (recommended)</p>
                <p><span className="text-accent">Best for:</span> Large datasets, high-dimensional data</p>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-text-muted font-mono">
                <p><span className="text-accent">Algorithm:</span> One-Class SVM</p>
                <p><span className="text-accent">Type:</span> Semi-supervised</p>
                <p><span className="text-accent">Speed:</span> Slower on large data</p>
                <p><span className="text-accent">Best for:</span> Smaller, high-quality datasets</p>
              </div>
            )}
          </div>
        </div>

        {latestSummary && (
          <div className="lg:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <p className="section-title mb-3">Executive Summary</p>
              <p className="text-sm leading-6 text-text-secondary">
                {latestSummary.executiveSummary || 'No executive summary available for this run.'}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-xs font-mono">
                <div className="border border-border p-3">
                  <p className="text-text-muted uppercase tracking-wider">Anomalies</p>
                  <p className="text-text-primary mt-1">{latestSummary.anomalyCount?.toLocaleString() || latestSummary.resultCount?.toLocaleString() || '0'}</p>
                </div>
                <div className="border border-border p-3">
                  <p className="text-text-muted uppercase tracking-wider">Critical</p>
                  <p className="text-text-primary mt-1">{latestSummary.criticalCount?.toLocaleString() || '0'}</p>
                </div>
                <div className="border border-border p-3">
                  <p className="text-text-muted uppercase tracking-wider">Confidence</p>
                  <p className="text-text-primary mt-1">{latestSummary.accuracyEstimate != null ? `${latestSummary.accuracyEstimate}%` : 'N/A'}</p>
                </div>
              </div>
            </div>
            <div className="card">
              <p className="section-title mb-3">Technical Summary</p>
              <p className="text-sm leading-6 text-text-secondary">
                {latestSummary.technicalSummary?.summary || latestSummary.technicalSummary?.notes || 'No technical summary available for this run.'}
              </p>
              <div className="mt-4 space-y-2">
                {(latestSummary.technicalSummary?.topSignals || []).length ? (
                  latestSummary.technicalSummary.topSignals.map((signal) => (
                    <div key={signal.signal} className="flex items-center justify-between text-xs font-mono border-b border-border pb-2">
                      <span className="text-text-muted uppercase tracking-wider">{signal.signal}</span>
                      <span className="text-text-primary">{signal.count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs font-mono text-text-muted">No repeated technical signals captured.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Job queue */}
        <div className="lg:col-span-2 card">
          <p className="section-title mb-4">Job Queue ({jobs.length})</p>
          {jobs.length === 0 ? (
            <div className="flex items-center justify-center h-40 border border-dashed border-border">
              <p className="text-xs font-mono text-text-muted">No jobs yet — configure and run an analysis</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => {
                const prog = jobProgress[job.jobId] || {};
                const pct = prog.percent || 0;
                const status = prog.status || job.status;
                return (
                  <div key={job.jobId} className={`p-4 border ${status === 'failed' ? 'border-alert/30' : 'border-border'} bg-surface-2`}>
                    <div className="flex items-start gap-4">
                      <ProgressRing percent={pct} size={56} strokeWidth={4}
                        color={status === 'complete' ? '#485935' : status === 'failed' ? '#9A4F3D' : '#7A3D2C'} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-mono uppercase font-bold ${JOB_STATUS_STYLE[status] || 'text-text-muted'}`}>
                            {status}
                          </span>
                          <span className="text-xs font-mono text-text-muted">·</span>
                          <span className="text-xs font-mono text-text-muted">{job.modelType}</span>
                        </div>
                        <p className="text-sm text-text-secondary truncate">{getDatasetName(job.datasetId)}</p>
                        <p className="text-xs font-mono text-text-muted mt-1">{prog.stage || 'Waiting...'}</p>
                        {/* Progress bar */}
                        <div className="mt-2 h-1 bg-surface-3 w-full">
                          <div
                            className="h-1 bg-accent transition-all duration-500"
                            style={{ width: `${pct}%`, background: status === 'failed' ? '#9A4F3D' : status === 'complete' ? '#485935' : '#7A3D2C' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
