const statusVariant = {
  queued: 'secondary',
  running: 'info',
  done: 'success',
  error: 'danger',
  archived: 'secondary',
};

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function ScanList({ scans, onSelect, selectedScanId, onClear }) {
  if (!scans.length) {
    return (
      <div className="card shadow-sm">
        <div className="card-body">
          <h2 className="card-title h5 mb-2">Historial de escaneos</h2>
          <p className="card-text text-secondary">
            Aún no has lanzado ningún escaneo. Cuando inicies uno se listará aquí.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card shadow-sm">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="card-title h5 mb-0">Historial de escaneos</h2>
          {scans.length > 0 && (
            <button
              type="button"
              className="btn btn-link text-decoration-none text-secondary p-0"
              onClick={onClear}
            >
              Limpiar
            </button>
          )}
        </div>
        <div className="list-group list-group-flush">
          {scans.map((scan) => {
            const isActive = scan.scan_id === selectedScanId;
            return (
              <button
                key={scan.scan_id}
                type="button"
                className={`list-group-item list-group-item-action d-flex justify-content-between align-items-start ${
                  isActive ? 'active' : ''
                }`}
                onClick={() => onSelect?.(scan.scan_id)}
              >
                <div className="ms-2 me-auto text-start">
                  <div className="fw-semibold">
                    {scan.target}{' '}
                    <span className="text-secondary">
                      ({scan.params?.ports || scan.requestedPorts})
                    </span>
                  </div>
                  <small className="text-secondary">
                    Actualizado: {formatDate(scan.updatedAt || scan.finishedAt)}
                  </small>
                </div>
                <span className={`badge bg-${statusVariant[scan.status] || 'secondary'} rounded-pill`}>
                  {scan.status}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
