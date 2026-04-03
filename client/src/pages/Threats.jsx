import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import PageWrapper from '../components/layout/PageWrapper';
import KPICard from '../components/ui/KPICard';
import DataTable from '../components/ui/DataTable';
import RiskBadge from '../components/ui/RiskBadge';
import api from '../services/api';

const THREATS = [
  { key: 'jamming', label: 'Jamming', color: '#485935', sublabel: 'Burst / flood patterns' },
  { key: 'spoofing', label: 'Spoofing', color: '#7A3D2C', sublabel: 'Invalid IP behavior' },
  { key: 'intrusion_attempt', label: 'Intrusion Attempts', color: '#9A4F3D', sublabel: 'Critical / SYN-like activity' },
  { key: 'suspicious_activity', label: 'Suspicious Activity', color: '#A26A2D', sublabel: 'Other flagged behavior' },
];

const CHART_COLORS = THREATS.reduce((acc, threat) => {
  acc[threat.key] = threat.color;
  return acc;
}, {});

function formatIp(value) {
  if (!value || value === '0.0.0.0' || value === 'unknown') return 'N/A';
  return value;
}

function formatThreat(value) {
  return String(value || 'unknown').replace(/_/g, ' ');
}

function prettyDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-US', { hour12: false });
}

function ThreatTimelineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload || {};
  return (
    <div className="bg-surface border border-border p-3 text-xs font-mono shadow-2xl text-text-primary">
      <p className="text-text-muted mb-1">{point.timestamp ? prettyDate(point.timestamp) : label}</p>
      {payload
        .filter((entry) => entry.value > 0)
        .map((entry) => (
          <p key={entry.dataKey} style={{ color: entry.color }}>
            {formatThreat(entry.dataKey)}: {entry.value}
          </p>
        ))}
      {!payload.some((entry) => entry.value > 0) && (
        <p className="text-text-muted">No threat events in this bucket</p>
      )}
    </div>
  );
}

function ThreatShareTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const color = payload[0].payload.color || payload[0].color || '#7A3D2C';
  return (
    <div className="bg-surface border border-border p-3 text-xs font-mono text-text-primary shadow-2xl">
      <p style={{ color }}>{payload[0].name}: {payload[0].value}</p>
    </div>
  );
}

export default function Threats() {
  const [stats, setStats] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState('');
  const [recentThreats, setRecentThreats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(true);

  const loadThreatData = async (datasetId = '') => {
    setLoading(true);
    setTableLoading(true);
    try {
      const params = datasetId ? { datasetId } : undefined;
      const [statsRes, anomaliesRes] = await Promise.all([
        api.get('/dashboard/stats', { params }),
        api.get('/anomalies', {
          params: {
            ...(datasetId ? { datasetId } : {}),
            risk: 'anomaly',
            limit: 10,
            sortBy: 'eventTimestamp',
            order: 'desc',
          },
        }),
      ]);
      setStats(statsRes.data);
      setRecentThreats(anomaliesRes.data.anomalies || []);
    } catch (err) {
      console.error('Threat page load error:', err);
    } finally {
      setLoading(false);
      setTableLoading(false);
    }
  };

  useEffect(() => {
    api.get('/dataset?limit=100').then((res) => setDatasets(res.data.datasets || [])).catch((err) => {
      console.error('Dataset load error:', err);
    });
  }, []);

  useEffect(() => {
    loadThreatData(selectedDataset);
  }, [selectedDataset]);

  const selectedDatasetName = selectedDataset
    ? datasets.find((d) => d._id === selectedDataset)?.name || 'Selected dataset'
    : 'All datasets';

  const threatBreakdown = useMemo(() => {
    const breakdown = stats?.threatBreakdown || [];
    const map = Object.fromEntries(breakdown.map((item) => [item.name, item.value]));
    return THREATS.map((threat) => ({
      ...threat,
      value: map[threat.key] || 0,
    }));
  }, [stats]);

  const totalThreats = threatBreakdown.reduce((sum, item) => sum + item.value, 0) || 1;

  const recentColumns = [
    {
      key: 'eventTimestamp',
      label: 'Event Time',
      render: (v, row) => prettyDate(v || row.detectedAt),
    },
    { key: 'srcIp', label: 'Src IP', render: (v) => <span className="font-mono">{formatIp(v)}</span> },
    { key: 'dstIp', label: 'Dst IP', render: (v) => <span className="font-mono">{formatIp(v)}</span> },
    {
      key: 'threatType',
      label: 'Threat Type',
      render: (v) => <span className="text-xs font-mono uppercase text-accent">{formatThreat(v)}</span>,
    },
    {
      key: 'riskScore',
      label: 'Risk Score',
      render: (v) => <span className="font-mono">{v?.toFixed(3) || '—'}</span>,
    },
    {
      key: 'datasetId',
      label: 'Dataset',
      render: (v) => <span>{v?.name || '—'}</span>,
    },
    { key: 'classification', label: 'Classification', render: (v) => <RiskBadge level={v} /> },
    {
      key: 'status',
      label: 'Status',
      render: (v) => <span className="text-xs font-mono uppercase text-text-muted">{v || '—'}</span>,
    },
  ];

  const threatTimeline = stats?.threatTimeline || [];
  const threatTimeRange = stats?.threatTimeRange;

  return (
    <PageWrapper title="/ threats / analytics">
      <div className="space-y-5">
        <div className="card flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="section-title mb-1">Threat Scope</p>
            <p className="text-xs font-mono text-text-muted">
              {selectedDataset ? `Showing threat intelligence for ${selectedDatasetName}` : 'Showing threat intelligence across all datasets'}
            </p>
          </div>
          <div className="w-full md:w-80">
            <label className="input-label">Dataset Filter</label>
            <select className="select" value={selectedDataset} onChange={(e) => setSelectedDataset(e.target.value)}>
              <option value="">All Datasets</option>
              {datasets.map((dataset) => (
                <option key={dataset._id} value={dataset._id}>
                  {dataset.name} ({dataset.source})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {THREATS.map((threat) => (
            <KPICard
              key={threat.key}
              label={threat.label}
              value={loading ? '…' : threatBreakdown.find((item) => item.key === threat.key)?.value?.toLocaleString() || '0'}
              color={threat.key === 'spoofing' ? 'warning' : threat.key === 'jamming' ? 'success' : threat.key === 'intrusion_attempt' ? 'alert' : 'accent'}
              sublabel={`${Math.round(((threatBreakdown.find((item) => item.key === threat.key)?.value || 0) / totalThreats) * 100)}% of threat volume`}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 card">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="section-title mb-1">Threat Timeline</p>
                <p className="text-[11px] font-mono text-text-muted">
                  {threatTimeRange
                    ? `${prettyDate(threatTimeRange.start)} to ${prettyDate(threatTimeRange.end)}`
                    : 'No threat timestamps available yet'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-end text-[11px] font-mono uppercase tracking-wider text-text-muted">
                {THREATS.map((threat) => (
                  <span key={threat.key} className="inline-flex items-center gap-1 border border-border px-2 py-1">
                    <span className="w-2 h-2" style={{ backgroundColor: threat.color }} />
                    {threat.label}
                  </span>
                ))}
              </div>
            </div>

            {threatTimeline.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={threatTimeline} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(122,61,44,0.10)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#7A3D2C', fontSize: 10, fontFamily: 'Montserrat' }}
                    axisLine={{ stroke: 'rgba(122,61,44,0.14)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#7A3D2C', fontSize: 10, fontFamily: 'Montserrat' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ThreatTimelineTooltip />} />
                  <Legend
                    formatter={(value) => <span className="text-xs font-mono text-text-secondary uppercase">{formatThreat(value)}</span>}
                    iconType="square"
                    iconSize={8}
                  />
                  {THREATS.map((threat) => (
                    <Area
                      key={threat.key}
                      type="monotone"
                      dataKey={threat.key}
                      stackId="1"
                      stroke={CHART_COLORS[threat.key]}
                      fill={CHART_COLORS[threat.key]}
                      fillOpacity={0.45}
                      name={threat.key}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-56 border border-dashed border-border">
                <p className="text-xs font-mono text-text-muted">No threat timeline available</p>
              </div>
            )}
          </div>

          <div className="card">
            <p className="section-title mb-3">Threat Distribution</p>
            {threatBreakdown.some((item) => item.value > 0) ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={threatBreakdown.filter((item) => item.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="label"
                  >
                    {threatBreakdown
                      .filter((item) => item.value > 0)
                      .map((item) => (
                        <Cell key={item.key} fill={item.color} opacity={0.88} />
                      ))}
                  </Pie>
                  <Tooltip content={<ThreatShareTooltip />} />
                  <Legend
                    formatter={(value) => <span className="text-xs font-mono text-text-secondary uppercase">{value}</span>}
                    iconType="square"
                    iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-56 border border-dashed border-border">
                <p className="text-xs font-mono text-text-muted">No threat distribution available</p>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="section-title mb-1">Recent Threats</p>
              <p className="text-[11px] font-mono text-text-muted">
                Latest anomalous records with inferred jamming, spoofing, and intrusion labels
              </p>
            </div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
              {recentThreats.length} records
            </span>
          </div>

          <DataTable
            columns={recentColumns}
            data={recentThreats}
            loading={tableLoading}
            emptyMessage="No threat records match current filters"
          />
        </div>
      </div>
    </PageWrapper>
  );
}
