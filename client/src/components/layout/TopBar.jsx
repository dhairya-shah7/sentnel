import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useAuth } from '../../hooks/useAuth';

export default function TopBar({ title }) {
  const { notifications, alerts, clearNotifications, dismissAlert } = useUIStore();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showAlerts, setShowAlerts] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center px-5 gap-4 shrink-0">
      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-sm font-display font-semibold text-text-secondary uppercase tracking-widest truncate">
          {title || 'Regiment'}
        </h1>
      </div>

      {/* System health indicators */}
      <div className="hidden md:flex items-center gap-4">
        <SystemStatus label="DB" status="online" />
        <SystemStatus label="ML" status="online" />
        <SystemStatus label="API" status="online" />
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Timestamp */}
      <span className="hidden lg:block text-xs font-mono text-text-muted">
        {now.toLocaleString('en-GB', {
          hour12: false,
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}
      </span>

      {/* Alert bell */}
      <div className="relative">
        <button
          onClick={() => { setShowAlerts(!showAlerts); clearNotifications(); setShowUser(false); }}
          className="relative p-1.5 text-text-secondary hover:text-text-primary transition-colors"
          title="Alerts"
        >
          <span className="text-base">⚠</span>
          {notifications > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-alert text-white text-xs font-mono font-bold rounded-full flex items-center justify-center leading-none">
              {notifications > 9 ? '9+' : notifications}
            </span>
          )}
        </button>

        {showAlerts && (
          <div className="absolute right-0 top-10 w-80 bg-surface border border-border z-50 shadow-2xl">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-mono text-text-secondary uppercase tracking-wider">Alerts</span>
              <button onClick={() => setShowAlerts(false)} className="text-text-muted hover:text-text-secondary text-xs">✕</button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {alerts.length === 0 ? (
                <p className="px-3 py-4 text-xs text-text-muted text-center font-mono">No alerts</p>
              ) : (
                alerts.slice(0, 10).map((a) => (
                  <div key={a.id} className={`px-3 py-2 border-b border-border flex gap-2 ${
                    a.level === 'critical' ? 'bg-alert-dim' : 'bg-warning-dim'
                  }`}>
                    <span className={`text-xs ${a.level === 'critical' ? 'text-alert' : 'text-warning'}`}>●</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-primary truncate">{a.message}</p>
                    </div>
                    <button onClick={() => dismissAlert(a.id)} className="text-text-muted hover:text-text-secondary text-xs shrink-0">✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => { setShowUser(!showUser); setShowAlerts(false); }}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <div className="w-7 h-7 bg-accent/20 flex items-center justify-center text-accent text-xs font-mono font-bold">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <span className="hidden sm:block text-xs font-mono">{user?.username}</span>
          <span className="text-xs text-text-muted">▾</span>
        </button>

        {showUser && (
          <div className="absolute right-0 top-10 w-44 bg-surface border border-border z-50 shadow-2xl">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-xs text-text-primary font-medium">{user?.username}</p>
              <p className="text-xs font-mono text-accent uppercase">{user?.role}</p>
            </div>
            <button
              onClick={() => { setShowUser(false); navigate('/settings'); }}
              className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
            >Settings</button>
            <button
              onClick={() => { setShowUser(false); logout(); }}
              className="w-full text-left px-3 py-2 text-xs text-alert hover:bg-alert-dim transition-colors"
            >Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}

function SystemStatus({ label, status }) {
  const isOnline = status === 'online';
  return (
    <div className="flex items-center gap-1.5">
      <span className={`status-dot ${isOnline ? 'bg-success animate-pulse-slow' : 'bg-alert'}`} />
      <span className="text-xs font-mono text-text-muted uppercase tracking-wider">{label}</span>
    </div>
  );
}
