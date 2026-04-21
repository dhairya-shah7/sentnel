import { useCallback, useEffect, useState } from 'react';
import PageWrapper from '../components/layout/PageWrapper';
import { useAuth } from '../hooks/useAuth';
import { useNotificationStore, requestNotificationPermission } from '../services/notifications';
import api, { API_ORIGIN } from '../services/api';
import { getMlServiceOrigin } from '../services/runtime';
import toast from 'react-hot-toast';

export default function Settings() {
  const { user, hasRole } = useAuth();
  const [users, setUsers] = useState([]);
  const [updating, setUpdating] = useState(null);
  const [deployment, setDeployment] = useState(null);
  const mlServiceOrigin = getMlServiceOrigin();
  const { enabled, soundEnabled, criticalOnly, alertThreshold, setEnabled, setSoundEnabled, setCriticalOnly, setAlertThreshold } = useNotificationStore();

  const [notificationPermission, setNotificationPermission] = useState('default');

  const handleEnableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') {
      setEnabled(true);
      toast.success('Notifications enabled');
    } else if (permission === 'denied') {
      toast.error('Notifications blocked. Enable in browser settings.');
    }
  };

  const fetchUsers = useCallback(async () => {
    if (!hasRole('admin')) return;
    try {
      const res = await api.get('/auth/users');
      setUsers(res.data.users);
    } catch (error) {
      void error;
    }
  }, [hasRole]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    api.get('/system/deployment').then((res) => setDeployment(res.data)).catch((error) => {
      void error;
    });
  }, []);

  const updateUser = async (id, data) => {
    setUpdating(id);
    try {
      await api.patch(`/auth/users/${id}`, data);
      toast.success('User updated');
      fetchUsers();
    } catch (error) {
      void error;
      toast.error('Update failed');
    }
    finally { setUpdating(null); }
  };

  return (
    <PageWrapper title="/ settings / system">
      <div className="space-y-5 max-w-3xl">
        {/* Profile */}
        <div className="card corner-accent">
          <p className="section-title mb-4">My Profile</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              ['Username', user?.username],
              ['Email', user?.email],
              ['Role', user?.role],
              ['Clearance Level', user?.clearanceLevel],
              ['Account Created', user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="input-label">{k}</p>
                <p className={`font-mono text-sm ${k === 'Role' ? 'text-accent uppercase' : 'text-text-primary'}`}>{v || '—'}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Alert thresholds */}
        <div className="card">
          <p className="section-title mb-4">Alert Thresholds</p>
          <div className="space-y-3 text-xs font-mono">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-text-secondary">Critical threshold</span>
              <span className="text-alert">Risk Score &gt; 0.70</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-text-secondary">Suspicious threshold</span>
              <span className="text-warning">Risk Score 0.40–0.70</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-text-secondary">Normal threshold</span>
              <span className="text-success">Risk Score &lt; 0.40</span>
            </div>
          </div>
        </div>

        {/* Browser Notifications */}
        <div className="card">
          <p className="section-title mb-4">Browser Notifications</p>
          <div className="space-y-4">
            {!enabled && notificationPermission !== 'denied' && (
              <button onClick={handleEnableNotifications} className="btn btn-primary text-sm">
                Enable Browser Notifications
              </button>
            )}
            {notificationPermission === 'denied' && (
              <p className="text-xs text-alert">Notifications are blocked. Enable in browser site settings.</p>
            )}
            {enabled && (
              <>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-text-secondary">Notifications</span>
                  <button
                    onClick={() => setEnabled(!enabled)}
                    className={`w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-accent' : 'bg-surface-3'}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-text-secondary">Sound</span>
                  <button
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors ${soundEnabled ? 'bg-accent' : 'bg-surface-3'}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${soundEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <span className="text-text-secondary">Critical Only</span>
                  <button
                    onClick={() => setCriticalOnly(!criticalOnly)}
                    className={`w-10 h-5 rounded-full transition-colors ${criticalOnly ? 'bg-accent' : 'bg-surface-3'}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${criticalOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-text-secondary">Alert Threshold</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={alertThreshold}
                      onChange={(e) => setAlertThreshold(parseFloat(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-xs font-mono text-text-muted">{alertThreshold.toFixed(1)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* API info */}
        <div className="card">
          <p className="section-title mb-4">Service Endpoints</p>
          <div className="space-y-2 text-xs font-mono">
            {[
              ['Frontend', window.location.origin],
              ['API Server', `${API_ORIGIN}/api`],
              ['ML Service', mlServiceOrigin || 'Not configured'],
              ['ML Docs', mlServiceOrigin ? `${mlServiceOrigin}/docs` : 'Not configured'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 py-1.5 border-b border-border">
                <span className="text-text-muted w-28">{k}</span>
                {v === 'Not configured' ? (
                  <span className="text-text-muted">{v}</span>
                ) : (
                  <a href={v} target="_blank" rel="noreferrer" className="text-accent hover:underline">{v}</a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Deployment mode */}
        <div className="card">
          <p className="section-title mb-4">Deployment Mode</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              ['No-Cloud Mode', deployment?.noCloudMode ? 'Enabled' : 'Available'],
              ['Offline Training', deployment?.trainingMode || 'local-first'],
              ['Offline Inference', deployment?.inferenceMode || 'local-first'],
              ['Docker Support', deployment?.dockerSupport ? 'Ready' : 'Missing build files'],
              ['Kubernetes Support', deployment?.kubernetesSupport ? 'Ready' : 'Missing manifests'],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="input-label">{label}</p>
                <p className="font-mono text-sm text-text-primary">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs font-mono text-text-muted">
            {deployment?.offlineMode
              ? 'The system is configured to operate in offline / no-cloud mode.'
              : 'Offline mode is available and can be enabled through the deployment environment.'}
          </p>
        </div>

        {/* User management (admin only) */}
        {hasRole('admin') && (
          <div className="card">
            <p className="section-title mb-4">User Management</p>
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u._id} className="flex items-center gap-3 py-2 border-b border-border">
                  <div className="w-7 h-7 bg-accent/20 flex items-center justify-center text-accent text-xs font-mono font-bold shrink-0">
                    {u.username?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary">{u.username}</p>
                    <p className="text-xs text-text-muted">{u.email}</p>
                  </div>
                  <select
                    value={u.role}
                    onChange={(e) => updateUser(u._id, { role: e.target.value })}
                    disabled={updating === u._id || u._id === user?._id}
                    className="select py-1 w-28 text-xs"
                  >
                    <option value="viewer">viewer</option>
                    <option value="analyst">analyst</option>
                    <option value="admin">admin</option>
                  </select>
                  <span className={`text-xs font-mono ${u.isActive ? 'text-success' : 'text-alert'}`}>
                    {u.isActive ? 'active' : 'inactive'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
