export default function FilterPanel({ filters, setFilter, resetFilters, datasets = [] }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <p className="section-title">Filters</p>
        <button onClick={resetFilters} className="text-xs font-mono text-text-muted hover:text-accent transition-colors">
          ↺ Reset
        </button>
      </div>

      <div>
        <label className="input-label">Threat View</label>
        <select className="select" value={filters.risk} onChange={(e) => setFilter('risk', e.target.value)}>
          <option value="">All Records</option>
          <option value="anomaly">Anomalies</option>
          <option value="suspicious">Suspicious</option>
          <option value="critical">Critical Threats</option>
        </select>
      </div>

      <div>
        <label className="input-label">Protocol</label>
        <input className="input" placeholder="tcp, udp, http..." value={filters.protocol} onChange={(e) => setFilter('protocol', e.target.value)} />
      </div>

      <div>
        <label className="input-label">Source IP</label>
        <input className="input font-mono" placeholder="192.168.x.x" value={filters.srcIp} onChange={(e) => setFilter('srcIp', e.target.value)} />
      </div>

      <div>
        <label className="input-label">Destination IP</label>
        <input className="input font-mono" placeholder="10.0.x.x" value={filters.dstIp} onChange={(e) => setFilter('dstIp', e.target.value)} />
      </div>

      <div>
        <label className="input-label">Status</label>
        <select className="select" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">All</option>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="suspicious">Suspicious</option>
          <option value="confirmed">Confirmed</option>
          <option value="false_positive">False Positive</option>
          <option value="escalated">Escalated</option>
        </select>
      </div>

      {datasets.length > 0 && (
        <div>
          <label className="input-label">Dataset</label>
          <select className="select" value={filters.datasetId} onChange={(e) => setFilter('datasetId', e.target.value)}>
            <option value="">All Datasets</option>
            {datasets.map((d) => (
              <option key={d._id} value={d._id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="input-label">From Event Time</label>
        <input type="date" className="input" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
      </div>
      <div>
        <label className="input-label">To Event Time</label>
        <input type="date" className="input" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
      </div>
    </div>
  );
}
