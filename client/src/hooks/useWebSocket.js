import { useEffect } from 'react';
import { connectSocket, getSocket, onEvent, offEvent } from '../services/websocket';
import { useUIStore } from '../store/uiStore';
import { useAnomalyStore } from '../store/anomalyStore';
import { playCriticalAlertSound, unlockAlertSound } from '../services/alertSound';

export const useWebSocket = () => {
  const { addAlert, incrementNotifications } = useUIStore();
  const { prependAnomaly } = useAnomalyStore();

  useEffect(() => {
    connectSocket();
    unlockAlertSound();

    const handleFirstInteraction = () => {
      unlockAlertSound();
    };
    window.addEventListener('pointerdown', handleFirstInteraction, { once: true });

    const handleAnomalyNew = (anomaly) => {
      prependAnomaly(anomaly);
      const threatLabel = anomaly.threatType ? ` (${anomaly.threatType.replace(/_/g, ' ')})` : '';
      const level = anomaly.classification === 'critical'
        ? 'critical'
        : anomaly.classification === 'suspicious'
          ? 'warning'
          : 'info';

      addAlert({
        level,
        message: `${anomaly.classification === 'critical' ? 'Critical anomaly' : 'Anomaly'}${threatLabel} detected from ${anomaly.srcIp || 'unknown source'}`,
        anomaly,
      });

      if (anomaly.classification !== 'normal') {
        playCriticalAlertSound();
        incrementNotifications();
      }
    };

    const handleSystemAlert = (data) => {
      addAlert(data);
      if (data.level === 'critical' || data.level === 'warning') {
        playCriticalAlertSound();
        incrementNotifications();
      }
    };

    const handleAnalysisComplete = (data) => {
      if ((data?.anomalyCount || data?.criticalCount || 0) > 0) {
        playCriticalAlertSound();
      }
    };

    onEvent('anomaly:new', handleAnomalyNew);
    onEvent('system:alert', handleSystemAlert);
    onEvent('analysis:complete', handleAnalysisComplete);

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      offEvent('anomaly:new', handleAnomalyNew);
      offEvent('system:alert', handleSystemAlert);
      offEvent('analysis:complete', handleAnalysisComplete);
    };
  }, [addAlert, incrementNotifications, prependAnomaly]);
};

export const useJobSocket = (jobId, onProgress, onComplete) => {
  useEffect(() => {
    if (!jobId) return;

    connectSocket();
    const socket = getSocket();
    if (socket) socket.emit('subscribe:job', jobId);

    const handleProgress = (data) => {
      if (data.jobId === jobId) onProgress?.(data);
    };
    const handleComplete = (data) => {
      if (data.jobId === jobId) onComplete?.(data);
    };

    onEvent('analysis:progress', handleProgress);
    onEvent('analysis:complete', handleComplete);

    return () => {
      offEvent('analysis:progress', handleProgress);
      offEvent('analysis:complete', handleComplete);
    };
  }, [jobId, onProgress, onComplete]);
};
