import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { connectSocket } from './services/websocket';
import Sidebar from './components/layout/Sidebar';
import AlertBanner from './components/ui/AlertBanner';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Datasets from './pages/Datasets';
import Analysis from './pages/Analysis';
import Anomalies from './pages/Anomalies';
import Threats from './pages/Threats';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';

function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function AppShell({ children }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AlertBanner />
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      connectSocket();
    }
  }, [isAuthenticated]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />

        {/* Protected */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell><Dashboard /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/datasets"
          element={
            <ProtectedRoute>
              <AppShell><Datasets /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/analysis"
          element={
            <ProtectedRoute>
              <AppShell><Analysis /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/anomalies"
          element={
            <ProtectedRoute>
              <AppShell><Anomalies /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/threats"
          element={
            <ProtectedRoute>
              <AppShell><Threats /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute adminOnly>
              <AppShell><AuditLogs /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <AppShell><Settings /></AppShell>
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
