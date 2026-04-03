export default function KPICard({ label, value, delta, unit, color = 'accent', icon, sublabel }) {
  const colorMap = {
    accent:  'text-accent border-accent/20 bg-accent-dim',
    alert:   'text-alert  border-alert/20  bg-alert-dim',
    warning: 'text-warning border-warning/20 bg-warning-dim',
    success: 'text-success border-success/20 bg-success-dim',
    muted:   'text-text-secondary border-border bg-surface-2',
  };
  const cls = colorMap[color] || colorMap.accent;

  return (
    <div className="card corner-accent relative overflow-hidden">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="section-title font-display">{label}</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-display font-bold ${cls.split(' ')[0]}`}>
              {value ?? '—'}
            </span>
            {unit && <span className="text-xs font-mono text-text-muted">{unit}</span>}
          </div>
          {sublabel && <p className="text-xs text-text-muted mt-0.5">{sublabel}</p>}
        </div>
        {icon && (
          <div className={`w-9 h-9 flex items-center justify-center text-lg border ${cls}`}>
            {icon}
          </div>
        )}
      </div>

      {delta !== undefined && (
        <div className="flex items-center gap-1">
          <span className={`text-xs font-mono ${delta >= 0 ? 'text-alert' : 'text-success'}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}
          </span>
          <span className="text-xs text-text-muted">vs last period</span>
        </div>
      )}

      {/* Subtle accent line */}
      <div className={`absolute bottom-0 left-0 h-0.5 w-full ${cls.split(' ')[0].replace('text-', 'bg-')}`} style={{ opacity: 0.3 }} />
    </div>
  );
}
