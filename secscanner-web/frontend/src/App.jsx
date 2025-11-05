import { useEffect, useMemo, useRef, useState } from 'react';
import ScanForm from './components/ScanForm.jsx';
import ScanList from './components/ScanList.jsx';
import ResultView from './components/ResultView.jsx';
import { startScan, fetchScan, subscribeToScan } from './api.js';

const STORAGE_KEY = 'secscanner-web:scans';

function loadInitialScans() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export default function App() {
  const [scans, setScans] = useState(loadInitialScans);
  const [selectedScanId, setSelectedScanId] = useState(() => {
    const ids = Object.keys(loadInitialScans());
    return ids.length ? ids[0] : null;
  });
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const unsubscribeRefs = useRef({});

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scans));
  }, [scans]);

  useEffect(
    () => () => {
      Object.values(unsubscribeRefs.current).forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch (error) {
          console.warn('Error al limpiar la suscripción', error);
        }
      });
    },
    [],
  );

  const scansAsArray = useMemo(() => {
    return Object.values(scans).sort((a, b) => {
      const dateA = new Date(a.createdAt || a.startedAt || 0).getTime();
      const dateB = new Date(b.createdAt || b.startedAt || 0).getTime();
      return dateB - dateA;
    });
  }, [scans]);

  const currentScan = selectedScanId ? scans[selectedScanId] : null;

  const updateScan = (scanId, updater) => {
    setScans((prev) => {
      const existing = prev[scanId] || {
        scan_id: scanId,
        progress: [],
        result: null,
        status: 'queued',
      };
      const nextValue = typeof updater === 'function' ? updater(existing) : updater;
      return {
        ...prev,
        [scanId]: {
          ...existing,
          ...nextValue,
        },
      };
    });
  };

  const attachSubscription = (scanId) => {
    if (unsubscribeRefs.current[scanId]) {
      return;
    }

    const unsubscribe = subscribeToScan(scanId, {
      onProgress: (payload) => {
        updateScan(scanId, (existing) => {
          const progress = [...(existing.progress || []), payload];
          if (progress.length > 200) {
            progress.splice(0, progress.length - 200);
          }
          return {
            ...existing,
            status: existing.status === 'queued' ? 'running' : existing.status,
            progress,
            updatedAt: payload.timestamp,
          };
        });
      },
      onStatus: (payload) => {
        if (!payload) return;
        updateScan(scanId, (existing) => ({
          ...existing,
          ...payload,
          status: payload.status || existing.status,
          progress: payload.progress || existing.progress,
          result: payload.result || existing.result,
        }));
      },
      onDone: (payload) => {
        updateScan(scanId, (existing) => ({
          ...existing,
          status: 'done',
          result: payload.result,
          finishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
      },
      onError: (payload) => {
        updateScan(scanId, (existing) => {
          const errorMessage = payload?.error || 'Fallo desconocido';
          const isNotFound = errorMessage.toLowerCase().includes('no encontrado');
          if (isNotFound && existing.result) {
            return {
              ...existing,
              status: 'archived',
              error: {
                message:
                  'Escaneo no encontrado en el backend (probablemente reiniciado). Los datos locales siguen disponibles.',
              },
              updatedAt: new Date().toISOString(),
            };
          }
          return {
            ...existing,
            status: 'error',
            error: { message: errorMessage },
            updatedAt: new Date().toISOString(),
          };
        });
      },
    });

    unsubscribeRefs.current[scanId] = unsubscribe;
    fetchScan(scanId)
      .then((data) => {
        updateScan(scanId, (existing) => ({
          ...existing,
          ...data,
          target: data.params?.target || existing.target,
          requestedPorts: data.params?.ports || existing.requestedPorts,
        }));
      })
      .catch((error) => {
        console.warn('No se pudo sincronizar el estado del escaneo', error);
      });
  };

  const handleCreateScan = async (payload) => {
    setIsSubmitting(true);
    setFormError(null);
    try {
      const response = await startScan(payload);
      const scanId = response.scan_id;
      updateScan(scanId, {
        scan_id: scanId,
        status: response.status || 'queued',
        params: {
          target: payload.target,
          ports: payload.ports,
          timeout: payload.timeout,
          maxWorkers: payload.maxWorkers,
        },
        target: payload.target,
        requestedPorts: payload.ports,
        createdAt: response.queuedAt || new Date().toISOString(),
        updatedAt: response.queuedAt || new Date().toISOString(),
        progress: [],
        result: null,
      });
      setSelectedScanId(scanId);
      attachSubscription(scanId);
    } catch (error) {
      setFormError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectScan = (scanId) => {
    setSelectedScanId(scanId);
    if (scanId) {
      attachSubscription(scanId);
    }
  };

  const handleClearHistory = () => {
    Object.values(unsubscribeRefs.current).forEach((unsubscribe) => {
      try {
        unsubscribe?.();
      } catch (error) {
        console.warn('Error al limpiar la suscripción', error);
      }
    });
    unsubscribeRefs.current = {};
    setScans({});
    setSelectedScanId(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  useEffect(() => {
    scansAsArray.slice(0, 5).forEach((scan) => {
      attachSubscription(scan.scan_id);
    });
    // Queremos ejecutar esto solo en el montaje inicial para rehidratar suscripciones recientes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-container container-fluid">
      <header className="mb-4">
        <h1 className="display-6 fw-bold">secscanner-web</h1>
        <p className="lead text-secondary">
          UI en React + backend Express para coordinar escaneos multihilo con el binario{' '}
          <code>secscanner</code>. Progreso en tiempo real vía Socket.IO.
        </p>
      </header>

      <ScanForm onSubmit={handleCreateScan} isSubmitting={isSubmitting} error={formError} />

      <div className="row g-4">
        <div className="col-lg-4">
          <ScanList
            scans={scansAsArray}
            onSelect={handleSelectScan}
            selectedScanId={selectedScanId}
            onClear={handleClearHistory}
          />
        </div>
        <div className="col-lg-8">
          <ResultView scan={currentScan} />
        </div>
      </div>
    </div>
  );
}
