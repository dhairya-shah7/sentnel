import { useEffect, useRef, useState } from 'react';
import RiskBadge from './RiskBadge';

export default function LiveFeed({ events = [], maxItems = 10 }) {
  const bottomRef = useRef(null);
  const [items, setItems] = useState(events);

  const formatIp = (value) => {
    if (!value || value === '0.0.0.0' || value === 'unknown') {
      return 'N/A';
    }
    return value;
  };

  useEffect(() => {
    setItems(events.slice(0, maxItems));
  }, [events, maxItems]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 border border-border">
        <p className="text-xs font-mono text-text-muted">Awaiting anomaly events...</p>
      </div>
    );
  }

  return (
    <div className="border border-border overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-surface-2 flex items-center gap-2">
        <span className="status-dot bg-accent animate-pulse" />
        <span className="text-xs font-mono text-text-muted uppercase tracking-wider">Live Feed</span>
        <span className="ml-auto text-xs font-mono text-text-muted">{items.length} events</span>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {items.map((event, i) => (
          <div
            key={event._id || i}
            className={`flex items-center gap-3 px-3 py-2 border-b border-border text-xs font-mono animate-fade-in ${
              event.classification === 'critical' ? 'bg-alert-dim' : ''
            }`}
          >
            <span className="text-text-muted shrink-0">
              {new Date(event.detectedAt).toLocaleTimeString('en-US', { hour12: false })}
            </span>
            <span className="text-text-secondary truncate flex-1">
              {formatIp(event.srcIp)} → {formatIp(event.dstIp)}
            </span>
            <span className="text-text-secondary truncate max-w-[120px] ml-2" title={event.datasetId?.name || 'Live Data'}>
              {event.datasetId?.name || 'Live stream'}
            </span>
            <span className="text-text-muted">{event.protocol || '?'}</span>
            {event.threatType && (
              <span className="text-text-muted uppercase tracking-wider">
                {event.threatType.replace(/_/g, ' ')}
              </span>
            )}
            <RiskBadge level={event.classification} />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
