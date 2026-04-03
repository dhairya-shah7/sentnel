import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

export default function TrafficChart({ data = [], mode = 'all' }) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 border border-dashed border-border">
        <p className="text-xs font-mono text-text-muted">No traffic data</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
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
          <Line
            type="monotone"
            dataKey="anomalies"
            stroke="#7A3D2C"
            strokeWidth={1.8}
            dot={false}
            name="Anomalies"
            activeDot={{ r: 4, fill: '#7A3D2C' }}
          />
        )}
        {mode !== 'anomalies' && (
          <Line
            type="monotone"
            dataKey="critical"
            stroke="#485935"
            strokeWidth={1.8}
            dot={false}
            name="Critical"
            activeDot={{ r: 4, fill: '#485935' }}
          />
        )}
        {mode === 'all' && (
          <Line
            type="monotone"
            dataKey="total"
            stroke="#A26A2D"
            strokeWidth={1.2}
            dot={false}
            name="Total"
            activeDot={{ r: 4, fill: '#A26A2D' }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
