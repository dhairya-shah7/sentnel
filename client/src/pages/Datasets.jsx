import { useEffect, useState } from 'react';
import PageWrapper from '../components/layout/PageWrapper';
import UploadDropzone from '../components/ui/UploadDropzone';
import DataTable from '../components/ui/DataTable';
import ConfirmModal from '../components/ui/ConfirmModal';
import api from '../services/api';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

const SOURCE_OPTIONS = ['Custom', 'UNSW-NB15', 'NSL-KDD', 'CICIDS'];
const TEMPLATE_OPTIONS = [
  { value: 'Custom', label: 'Custom' },
  { value: 'UNSW-NB15', label: 'UNSW-NB15' },
  { value: 'NSL-KDD', label: 'NSL-KDD' },
  { value: 'CICIDS', label: 'CICIDS' },
];

const STATUS_BADGE = {
  ready:      'bg-success-dim text-success border-success/20',
  processing: 'bg-warning-dim text-warning border-warning/20',
  uploading:  'bg-accent-dim text-accent border-accent/20',
  error:      'bg-alert-dim text-alert border-alert/20',
};

export default function Datasets() {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [file, setFile] = useState(null);
  const [source, setSource] = useState('Custom');
  const [template, setTemplate] = useState('Custom');
  const [name, setName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchDatasets = async () => {
    try {
      const res = await api.get('/dataset');
      setDatasets(res.data.datasets);
    } catch { toast.error('Failed to load datasets'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDatasets(); }, []);

  useEffect(() => {
    const normalized = String(source || '').trim().toLowerCase();
    const matched = TEMPLATE_OPTIONS.find((option) => option.value.toLowerCase() === normalized);
    setTemplate(matched?.value || 'Custom');
  }, [source]);

  const handleUpload = async () => {
    if (!file) return toast.error('Select a CSV file first');
    const uploadName = name || file.name;
    const previousCount = datasets.length;
    const form = new FormData();
    form.append('file', file);
    form.append('source', source);
    form.append('name', uploadName);
    setUploading(true);
    try {
      const uploadRes = await api.post('/dataset/upload', form);
      toast.success('Dataset uploaded successfully');
      setFile(null);
      setName('');
      fetchDatasets();
      if (autoAnalyze && uploadRes.data?.dataset?._id) {
        try {
          await api.post(`/analysis/run/${uploadRes.data.dataset._id}`, {
            modelType: 'isolation_forest',
            contamination: 0.1,
          });
          toast.success('Analysis started automatically');
        } catch (analysisErr) {
          toast.error(analysisErr.response?.data?.error || 'Upload saved, but analysis could not be started automatically');
        }
      }
    } catch (err) {
      const recovered = await tryRecoverSuccessfulUpload(uploadName, source, previousCount);
      if (recovered) {
        toast.success('Dataset uploaded successfully');
        setFile(null);
        setName('');
        return;
      }

      if (err.response?.status === 401) {
        toast.error('Your session expired while uploading. Please sign in again, then retry.');
        return;
      }

      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleTemplateChange = (value) => {
    setTemplate(value);
    if (value === 'Custom') return;
    setSource(value);
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/dataset/${deleteTarget._id}`);
      toast.success('Dataset deleted');
      setDeleteTarget(null);
      fetchDatasets();
    } catch { toast.error('Delete failed'); }
  };

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'source', label: 'Source', render: (v) => <span className="font-mono text-accent">{v}</span> },
    { key: 'recordCount', label: 'Records', render: (v) => v?.toLocaleString() || '—' },
    { key: 'status', label: 'Status', render: (v) => (
      <span className={`px-2 py-0.5 text-xs font-mono border ${STATUS_BADGE[v] || STATUS_BADGE.error}`}>{v}</span>
    )},
    { key: 'createdAt', label: 'Uploaded', render: (v) => v ? formatDistanceToNow(new Date(v), { addSuffix: true }) : '—' },
    { key: 'uploadedBy', label: 'By', render: (v) => v?.username || '—' },
    { key: '_id', label: '', sortable: false, render: (_, row) => (
      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }} className="btn btn-danger btn-sm">Delete</button>
    )},
  ];

  return (
    <PageWrapper title="/ datasets / manage">
      <div className="space-y-5">
        {/* Upload */}
        <div className="card corner-accent">
          <p className="section-title mb-4">Upload New Dataset</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="input-label">Dataset Template</label>
              <select
                className="select"
                value={template}
                onChange={(e) => handleTemplateChange(e.target.value)}
              >
                {TEMPLATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] font-mono text-text-muted">
                Choose a dataset type template to prefill the source label.
              </p>
            </div>
            <div>
              <label className="input-label">Dataset Source</label>
              <input
                className="input"
                list="dataset-sources"
                placeholder="e.g. Custom, UNSW-NB15, NSL-KDD, CICIDS"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
              <datalist id="dataset-sources">
                {SOURCE_OPTIONS.map((s) => <option key={s} value={s} />)}
              </datalist>
              <p className="mt-1 text-[11px] font-mono text-text-muted">
                You can still type any source name after selecting a template.
              </p>
            </div>
            <div>
              <label className="input-label">Display Name (optional)</label>
              <input className="input" placeholder="e.g. UNSW Training Set 2024" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-mono text-text-secondary mb-3">
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(e) => setAutoAnalyze(e.target.checked)}
              className="accent-accent"
            />
            Run analysis automatically after upload
          </label>
          <UploadDropzone onFile={setFile} loading={uploading} maxSizeMB={null} />
          <div className="flex justify-end mt-4">
            <button onClick={handleUpload} disabled={!file || uploading} className="btn btn-primary">
              {uploading ? '⟳ Uploading...' : '↑ Upload Dataset'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">Uploaded Datasets ({datasets.length})</p>
            <button onClick={fetchDatasets} className="btn btn-ghost btn-sm">↺ Refresh</button>
          </div>
          <DataTable
            columns={columns}
            data={datasets}
            loading={loading}
            emptyMessage="No datasets uploaded yet. Use the upload panel above."
          />
        </div>
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Dataset"
        message={`Delete "${deleteTarget?.name}"? This will remove the dataset and all associated traffic records. This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageWrapper>
  );

  async function tryRecoverSuccessfulUpload(expectedName, expectedSource, previousCountSnapshot) {
    try {
      const res = await api.get('/dataset?limit=100');
      const latestDatasets = res.data.datasets || [];
      setDatasets(latestDatasets);

      if (latestDatasets.length <= previousCountSnapshot) return false;

      const normalizedName = String(expectedName || '').trim().toLowerCase();
      const normalizedSource = String(expectedSource || '').trim().toLowerCase();

      return latestDatasets.some((dataset) => {
        const datasetName = String(dataset.name || '').trim().toLowerCase();
        const datasetSource = String(dataset.source || '').trim().toLowerCase();
        return datasetName === normalizedName && datasetSource === normalizedSource;
      });
    } catch {
      return false;
    }
  }
}
