import { useCallback, useEffect, useState } from 'react';
import PageWrapper from '../components/layout/PageWrapper';
import DataTable from '../components/ui/DataTable';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ action: '', userId: '', from: '', to: '' });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 50, ...filters };
      Object.keys(params).forEach(k => !params[k] && delete params[k]);
      const res = await api.get('/audit/logs', { params });
      setLogs(res.data.logs);
      setTotal(res.data.total);
    } catch { /* admin-only */ }
    finally { setLoading(false); }
  }, [page, filters]);

  const exportLogs = async () => {
    try {
      const params = { ...filters };
      Object.keys(params).forEach((k) => !params[k] && delete params[k]);
      const res = await api.get('/audit/logs/export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'audit_trail.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Audit trail exported');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to export audit logs');
    }
  };

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const columns = [
    { key: 'timestamp', label: 'Time', render: (v) => v ? new Date(v).toLocaleString('en-US', { hour12: false }) : '—' },
    { key: 'userId', label: 'User', render: (_, row) => <span className="font-mono text-accent">{row.username || row.userId?.username || '—'}</span> },
    { key: 'action', label: 'Action', render: (v) => <span className="font-mono text-xs uppercase text-text-primary">{v}</span> },
    { key: 'resource', label: 'Resource' },
    { key: 'path', label: 'Path' },
    { key: 'method', label: 'Method', render: (v) => (
      <span className={`font-mono text-xs ${v==='DELETE' ? 'text-alert' : v==='POST' ? 'text-accent' : 'text-text-muted'}`}>{v}</span>
    )},
    { key: 'statusCode', label: 'Status', render: (v) => (
      <span className={`font-mono text-xs ${v >= 400 ? 'text-alert' : 'text-success'}`}>{v}</span>
    )},
    { key: 'ipAddress', label: 'IP', render: (v) => <span className="font-mono text-xs text-text-muted">{v}</span> },
    { key: 'origin', label: 'Origin', render: (v) => <span className="font-mono text-xs text-text-muted">{v || '—'}</span> },
    { key: 'userAgent', label: 'User Agent', render: (v) => <span className="font-mono text-xs text-text-muted truncate max-w-56 block">{v || '—'}</span> },
  ];

  return (
    <PageWrapper title="/ audit / system logs">
      <div className="space-y-4">
        {/* Filters */}
        <div className="card">
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="input-label">Action</label>
              <input className="input w-40" placeholder="dataset.upload..." value={filters.action}
                onChange={e => setFilters(f => ({...f, action: e.target.value}))} />
            </div>
            <div>
              <label className="input-label">From</label>
              <input type="date" className="input" value={filters.from}
                onChange={e => setFilters(f => ({...f, from: e.target.value}))} />
            </div>
            <div>
              <label className="input-label">To</label>
              <input type="date" className="input" value={filters.to}
                onChange={e => setFilters(f => ({...f, to: e.target.value}))} />
            </div>
            <div className="flex items-end">
              <button onClick={() => setFilters({ action: '', userId: '', from: '', to: '' })} className="btn btn-ghost btn-sm">
                ↺ Reset
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="section-title">{total.toLocaleString()} Audit Events</p>
          <button onClick={exportLogs} className="btn btn-ghost btn-sm">Export CSV</button>
        </div>

        <DataTable columns={columns} data={logs} loading={loading} emptyMessage="No audit logs found" />

        {/* Pagination */}
        {total > 50 && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-text-muted">Page {page} · {total.toLocaleString()} total</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} className="btn btn-ghost btn-sm">← Prev</button>
              <button onClick={() => setPage(p => p+1)} disabled={page * 50 >= total} className="btn btn-ghost btn-sm">Next →</button>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
