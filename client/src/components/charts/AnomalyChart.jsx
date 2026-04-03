import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload || {};
  return (
    <div className="bg-surface border border-border p-3 text-xs font-mono shadow-2xl text-text-primary">
      <p className="text-text-muted mb-1">{point.timestamp ? new Date(point.timestamp).toLocaleString('en-US', { hour12: false }) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

export default function AnomalyChart({ data = [], mode = 'all' }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 border border-dashed border-border">
        <p className="text-xs font-mono text-text-muted">No anomaly spike data</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: '#7A3D2C', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          axisLine={{ stroke: 'rgba(122,61,44,0.14)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#7A3D2C', fontSize: 10, fontFamily: 'JetBrains Mono' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        {mode !== 'critical' && (
          <Bar dataKey="anomalies" fill="#7A3D2C" name="Anomalies" radius={[1, 1, 0, 0]} maxBarSize={20} opacity={0.85} />
        )}
        {mode !== 'anomalies' && (
          <Bar dataKey="critical" fill="#485935" name="Critical" radius={[1, 1, 0, 0]} maxBarSize={20} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
