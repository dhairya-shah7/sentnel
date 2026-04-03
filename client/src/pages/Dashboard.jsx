import { useEffect, useState } from 'react';
import PageWrapper from '../components/layout/PageWrapper';
import KPICard from '../components/ui/KPICard';
import LiveFeed from '../components/ui/LiveFeed';
import AlertBanner from '../components/ui/AlertBanner';
import TrafficChart from '../components/charts/TrafficChart';
import AnomalyChart from '../components/charts/AnomalyChart';
import ProtocolPie from '../components/charts/ProtocolPie';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAnomalyStore } from '../store/anomalyStore';
import api from '../services/api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('all');
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState('');
  const { anomalies } = useAnomalyStore();
  useWebSocket();

  const fetchStats = async (datasetId = '') => {
    try {
      const res = await api.get('/dashboard/stats', {
        params: datasetId ? { datasetId } : {},
      });
      setStats(res.data);
    } catch (err) {
      console.error('Dashboard stats error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/dataset?limit=100').then((res) => setDatasets(res.data.datasets || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchStats(selectedDataset);
    const interval = setInterval(() => fetchStats(selectedDataset), 30000);
    return () => clearInterval(interval);
  }, [selectedDataset]);

  const kpis = stats?.kpis || {};
  const liveFeedItems = stats?.recentAnomalies?.length ? stats.recentAnomalies : anomalies.slice(0, 10);
  const selectedDatasetName = selectedDataset
    ? datasets.find((d) => d._id === selectedDataset)?.name || 'Selected dataset'
    : 'All datasets';
  const timeRangeText = stats?.timeRange?.start && stats?.timeRange?.end
    ? `${new Date(stats.timeRange.start).toLocaleString('en-US', { hour12: false })} to ${new Date(stats.timeRange.end).toLocaleString('en-US', { hour12: false })}`
    : 'No CSV timestamps detected yet';

  const viewOptions = [
    { key: 'all', label: 'All Events' },
    { key: 'anomalies', label: 'Anomalies' },
    { key: 'critical', label: 'Critical Threats' },
  ];

  return (
    <PageWrapper title="/ dashboard / overview">
      <AlertBanner />
      <div className="space-y-5">
        <div className="card flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="section-title mb-1">Dataset Scope</p>
            <p className="text-xs font-mono text-text-muted">
              {selectedDataset ? `Showing metrics for ${selectedDatasetName}` : 'Showing metrics across all datasets'}
            </p>
          </div>
          <div className="w-full md:w-80">
            <label className="input-label">Dataset Filter</label>
            <select className="select" value={selectedDataset} onChange={(e) => setSelectedDataset(e.target.value)}>
              <option value="">All Datasets</option>
              {datasets.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.source})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Total Traffic Records"
            value={loading ? '...' : kpis.totalRecords?.toLocaleString()}
            icon="◈"
            color="accent"
            sublabel="Selected dataset scope"
          />
          <KPICard
            label="Active Anomalies"
            value={loading ? '...' : kpis.anomalyCount?.toLocaleString()}
            icon="⚠"
            color="warning"
            sublabel="Suspicious + Critical"
          />
          <KPICard
            label="Critical Threats"
            value={loading ? '...' : kpis.criticalCount?.toLocaleString()}
            icon="⊠"
            color="alert"
            sublabel="Risk score > 0.7"
          />
          <KPICard
            label="Detection Confidence"
            value={loading ? '...' : (kpis.detectionConfidence == null ? 'N/A' : `${kpis.detectionConfidence}`)}
            unit={kpis.detectionConfidence == null ? '' : '%'}
            icon="◎"
            color="success"
            sublabel="Average anomaly confidence"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 card">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="section-title mb-1">Traffic Volume / Anomaly Timeline</p>
                <p className="text-[11px] font-mono text-text-muted">
                  {selectedDataset ? `${selectedDatasetName} · ${timeRangeText}` : timeRangeText}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                {viewOptions.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => setViewMode(option.key)}
                    className={`px-3 py-1 text-[11px] font-mono uppercase tracking-wider border transition-colors ${
                      viewMode === option.key
                        ? 'bg-accent text-bg border-accent'
                        : 'bg-transparent text-text-secondary border-border hover:border-accent hover:text-text-primary'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <TrafficChart data={stats?.trafficTimeline || []} mode={viewMode} />
          </div>
          <div className="card">
            <p className="section-title mb-3">Protocol Distribution</p>
            <ProtocolPie data={stats?.protocolDistribution || []} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <p className="section-title mb-3">Anomaly Spikes by CSV Time Bucket</p>
            <AnomalyChart data={stats?.trafficTimeline || []} mode={viewMode} />
          </div>
          <div>
            <p className="section-title mb-3">Live Event Feed</p>
            <LiveFeed events={liveFeedItems} />
          </div>
        </div>

        <div className="card">
          <p className="section-title mb-3">System Health</p>
          <div className="flex gap-6 flex-wrap">
            {[
              { label: 'MongoDB', status: 'online' },
              { label: 'ML Service', status: 'online' },
              { label: 'API Server', status: 'online' },
              { label: 'WebSocket', status: 'online' },
            ].map((sys) => (
              <div key={sys.label} className="flex items-center gap-2">
                <span className="status-dot bg-success animate-pulse-slow" />
                <span className="text-xs font-mono text-text-secondary">{sys.label}</span>
                <span className="text-xs font-mono text-success uppercase font-bold" style={{ letterSpacing: '0.015em' }}>
                  {sys.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
