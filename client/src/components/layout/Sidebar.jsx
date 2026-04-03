import { NavLink, useLocation } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useAuth } from '../../hooks/useAuth';

const NAV = [
  { to: '/',          label: 'Dashboard',   icon: '◈', roles: ['admin','analyst','viewer'] },
  { to: '/datasets',  label: 'Datasets',    icon: '⊟', roles: ['admin','analyst','viewer'] },
  { to: '/analysis',  label: 'Analysis',    icon: '⊕', roles: ['admin','analyst'] },
  { to: '/anomalies', label: 'Anomalies',   icon: '⚠', roles: ['admin','analyst','viewer'] },
  { to: '/threats',   label: 'Threats',     icon: 'T', roles: ['admin','analyst','viewer'] },
  { to: '/audit',     label: 'Audit Logs',  icon: '▣', roles: ['admin'] },
  { to: '/settings',  label: 'Settings',    icon: '⊞', roles: ['admin'] },
];

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { user, hasRole } = useAuth();
  const location = useLocation();

  return (
    <aside
      className={`flex flex-col bg-surface border-r border-border transition-all duration-200 ${
        sidebarCollapsed ? 'w-14' : 'w-56'
      } min-h-screen shrink-0`}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 h-14 px-4 border-b border-border">
        <span className="text-accent text-lg font-mono font-bold shrink-0">⬡</span>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <div className="text-text-primary font-display font-bold text-sm tracking-widest uppercase">Regiment</div>
            <div className="text-accent font-mono text-xs tracking-widest">OPS</div>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="ml-auto text-text-muted hover:text-text-secondary transition-colors shrink-0"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? '▶' : '◀'}
        </button>
      </div>

      {/* System status */}
      {!sidebarCollapsed && (
        <div className="px-4 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="status-dot bg-success animate-pulse-slow" />
            <span className="text-xs font-mono text-text-muted uppercase tracking-wider">Sys Online</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {NAV.filter((item) => hasRole(...item.roles)).map((item) => {
          const active = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-2 py-2 text-sm transition-all duration-100 group ${
                active
                  ? 'bg-accent-dim text-accent border-l-2 border-accent pl-2'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2 border-l-2 border-transparent'
              }`}
            >
              <span className={`font-mono shrink-0 ${active ? 'text-accent' : 'text-text-muted group-hover:text-text-secondary'}`}>
                {item.icon}
              </span>
              {!sidebarCollapsed && (
                <span className="font-display text-xs uppercase tracking-wider truncate">{item.label}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User */}
      <div className={`border-t border-border p-3 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
        {sidebarCollapsed ? (
          <div className="w-7 h-7 rounded-none bg-accent/20 flex items-center justify-center text-accent text-xs font-mono font-bold">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 shrink-0 bg-accent/20 flex items-center justify-center text-accent text-xs font-mono font-bold">
              {user?.username?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-text-primary truncate">{user?.username || 'Unknown'}</div>
              <div className="text-xs font-mono text-accent uppercase tracking-wider">{user?.role || 'viewer'}</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
