import { useState } from 'react';

const DEFAULT_VALUES = {
  target: 'scanme.nmap.org',
  ports: '22,80,443',
  timeout: 300,
  maxWorkers: 32,
};

export default function ScanForm({ onSubmit, isSubmitting, error }) {
  const [formValues, setFormValues] = useState(DEFAULT_VALUES);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({
      ...prev,
      [name]: name === 'target' || name === 'ports' ? value : Number(value),
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (typeof onSubmit === 'function') {
      onSubmit(formValues);
    }
  };

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-body">
        <h2 className="card-title h4 mb-3">Nuevo escaneo</h2>
        <p className="card-text text-secondary">
          Define el objetivo y la lista de puertos. El backend ejecutará el binario{' '}
          <code>secscanner</code> y enviará el progreso en tiempo real.
        </p>
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="row g-3">
          <div className="col-md-6">
            <label htmlFor="target" className="form-label">
              Objetivo (hostname o IPv4)
            </label>
            <input
              id="target"
              name="target"
              type="text"
              className="form-control"
              value={formValues.target}
              onChange={handleChange}
              required
              minLength={3}
            />
          </div>
          <div className="col-md-6">
            <label htmlFor="ports" className="form-label">
              Puertos (lista/rangos)
            </label>
            <input
              id="ports"
              name="ports"
              type="text"
              className="form-control"
              value={formValues.ports}
              onChange={handleChange}
              required
              placeholder="22,80,443,8000-8080"
            />
          </div>
          <div className="col-md-6">
            <label htmlFor="timeout" className="form-label">
              Timeout (segundos)
            </label>
            <input
              id="timeout"
              name="timeout"
              type="number"
              className="form-control"
              value={formValues.timeout}
              onChange={handleChange}
              min={5}
              max={900}
              step={5}
              required
            />
          </div>
          <div className="col-md-6">
            <label htmlFor="maxWorkers" className="form-label">
              Máx. workers internos
            </label>
            <input
              id="maxWorkers"
              name="maxWorkers"
              type="number"
              className="form-control"
              value={formValues.maxWorkers}
              onChange={handleChange}
              min={1}
              max={512}
              required
            />
          </div>
          <div className="col-12 d-flex justify-content-end">
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Iniciando…' : 'Iniciar escaneo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
