const express = require('express');
const path = require('path');
const {
  validateTarget,
  validatePortsSpec,
  clampNumber,
  readJsonFile,
} = require('./utils');

function isLoopback(ip) {
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('::ffff:127.')) return true;
  return false;
}

function createApiRouter({ jobQueue }) {
  const router = express.Router();

  router.use((req, res, next) => {
    const remoteAddress = req.ip || req.connection?.remoteAddress;
    if (!isLoopback(remoteAddress)) {
      return res.status(403).json({
        error: 'Acceso restringido a localhost por defecto.',
      });
    }
    return next();
  });

  router.post('/scan', (req, res) => {
    const { target, ports, timeout, maxWorkers } = req.body || {};

    const targetValidation = validateTarget(target);
    if (!targetValidation.valid) {
      return res.status(400).json({ error: targetValidation.message });
    }

    const portsValidation = validatePortsSpec(ports);
    if (!portsValidation.valid) {
      return res.status(400).json({ error: portsValidation.message });
    }

    const safeTimeout = clampNumber(Number(timeout) || 0, {
      min: 5,
      max: 900,
      defaultValue: 300,
    });

    const safeMaxWorkers = clampNumber(Number(maxWorkers) || 0, {
      min: 1,
      max: 512,
      defaultValue: 32,
    });

    const job = jobQueue.enqueue({
      target: targetValidation.value,
      ports: portsValidation.value,
      timeout: safeTimeout,
      maxWorkers: safeMaxWorkers,
    });

    return res.status(201).json({
      scan_id: job.id,
      status: job.status,
      queuedAt: job.createdAt,
    });
  });

  router.get('/scan/:id', (req, res) => {
    const { id } = req.params;
    const job = jobQueue.getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Escaneo no encontrado.' });
    }

    if (job.status === 'done' && !job.result) {
      job.result = readJsonFile(job.filePath);
    }

    return res.json(jobQueue.serializeJob(job));
  });

  router.get('/scan/:id/download', (req, res) => {
    const { id } = req.params;
    const job = jobQueue.getJob(id);
    if (!job) {
      return res.status(404).json({ error: 'Escaneo no encontrado.' });
    }

    if (job.status !== 'done') {
      return res.status(409).json({ error: 'El escaneo aún no ha finalizado.' });
    }

    const absolutePath = path.resolve(job.filePath);
    return res.download(absolutePath, `${id}.json`, (err) => {
      if (err) {
        if (!res.headersSent) {
          res.status(500).json({ error: 'No se pudo descargar el archivo.' });
        }
      }
    });
  });

  return router;
}

module.exports = {
  createApiRouter,
};
