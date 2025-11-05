import { useMemo, useState } from 'react';

function createCsv(ports = []) {
  const header = ['puerto', 'protocolo', 'estado', 'banner'];
  const rows = ports.map((port) => [
    port.port ?? '',
    port.protocol ?? '',
    port.state ?? '',
    port.banner ? `"${port.banner.replace(/"/g, '""')}"` : '',
  ]);
  return [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

export default function ResultView({ scan }) {
  const [showRaw, setShowRaw] = useState(false);

  const ports = useMemo(() => scan?.result?.ports || [], [scan]);
  const progress = useMemo(() => scan?.progress || [], [scan]);

  const statusBadgeClass = useMemo(() => {
    switch (scan?.status) {
      case 'done':
        return 'bg-success';
      case 'running':
        return 'bg-info';
      case 'queued':
        return 'bg-secondary';
      case 'archived':
        return 'bg-secondary';
      case 'error':
      default:
        return 'bg-danger';
    }
  }, [scan?.status]);

  const handleDownloadJson = () => {
    if (!scan?.scan_id) return;
    window.open(`/api/scan/${scan.scan_id}/download`, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadCsv = () => {
    if (!scan?.scan_id) return;
    const csvContent = createCsv(ports);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${scan.scan_id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!scan) {
    return (
      <div className="card shadow-sm h-100">
        <div className="card-body d-flex align-items-center justify-content-center">
          <p className="text-secondary mb-0">Selecciona un escaneo para ver el detalle.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card shadow-sm h-100">
      <div className="card-body d-flex flex-column">
        <div className="d-flex justify-content-between align-items-start mb-3">
          <div>
            <h2 className="card-title h4 mb-1">Detalle del escaneo</h2>
            <p className="card-text text-secondary mb-0">
              Objetivo: <strong>{scan.target || scan.params?.target}</strong> | Puertos:{' '}
              <strong>{scan.requestedPorts || scan.params?.ports}</strong>
            </p>
          </div>
          <div className="btn-group">
            <button
              type="button"
              className="btn btn-outline-light btn-sm"
              onClick={handleDownloadJson}
              disabled={scan.status !== 'done'}
              title="Descargar JSON"
            >
              JSON
            </button>
            <button
              type="button"
              className="btn btn-outline-light btn-sm"
              onClick={handleDownloadCsv}
              disabled={scan.status !== 'done'}
              title="Exportar CSV"
            >
              CSV
            </button>
            <button
              type="button"
              className="btn btn-outline-light btn-sm"
              onClick={() => setShowRaw((prev) => !prev)}
            >
              {showRaw ? 'Ocultar raw' : 'Ver raw'}
            </button>
          </div>
        </div>

        <div className="mb-3">
          <span className={`badge ${statusBadgeClass} badge-status me-2`}>{scan.status}</span>
          {scan.error?.message && (
            <span className="badge bg-danger badge-status">{scan.error.message}</span>
          )}
        </div>

        {Array.isArray(scan.result?.warnings) && scan.result.warnings.length > 0 && (
          <div className="alert alert-warning py-2 small" role="status">
            {scan.result.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        )}

        <div className="table-responsive mb-4">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th scope="col">Puerto</th>
                <th scope="col">Protocolo</th>
                <th scope="col">Estado</th>
                <th scope="col">Banner</th>
              </tr>
            </thead>
            <tbody>
              {ports.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-secondary">
                    {scan.status === 'running'
                      ? 'Esperando resultados…'
                      : 'No se detectaron puertos abiertos.'}
                  </td>
                </tr>
              )}
              {ports.map((port) => (
                <tr key={`${port.port}/${port.protocol}`}>
                  <td>{port.port}</td>
                  <td>{port.protocol}</td>
                  <td className="text-uppercase">{port.state}</td>
                  <td className="text-break">{port.banner || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-4">
          <h3 className="h6 text-uppercase text-secondary">Progreso</h3>
          <div
            className="progress-log border rounded p-3 bg-dark-subtle"
            style={{ maxHeight: 200, overflowY: 'auto' }}
          >
            {progress.length === 0 && (
              <p className="text-secondary mb-0">Sin mensajes aún.</p>
            )}
            {progress.map((entry) => (
              <div key={entry.timestamp + entry.line} className="small font-monospace">
                <span className="text-secondary me-2">
                  {new Date(entry.timestamp).toLocaleTimeString('es-ES')}
                </span>
                {entry.line}
              </div>
            ))}
          </div>
        </div>

        {showRaw && (
          <div className="bg-dark-subtle rounded p-3 font-monospace small overflow-auto">
            <pre className="mb-0">
              {JSON.stringify(scan.result ?? { message: 'Sin resultados disponibles' }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
